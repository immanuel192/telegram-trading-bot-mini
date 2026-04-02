/**
 * PipelineOrderExecutorService - Main order execution engine using Action Pipeline architecture
 *
 * IMPORTANT: MongoDB Transactions Disabled (MVP Only)
 * ===================================================
 *
 * MongoDB transactions are currently DISABLED across all pipelines due to write conflicts
 * caused by concurrent database access from multiple services (trade-manager, executor-service,
 * and background jobs).
 *
 * Root Cause:
 * - Transactions wrap long-running operations (broker API calls take 500ms-3s)
 * - During this time, other services may modify the same order documents
 * - MongoDB detects write conflicts and auto-aborts transactions
 * - This causes "Transaction has been aborted" errors and silent data loss
 *
 * Why Transactions Are Problematic:
 * 1. External broker operations cannot be rolled back (if trade executes, it's permanent)
 * 2. Long transaction lifetime increases conflict probability exponentially
 * 3. Multiple services (trade-manager, executor-service) write to same orders concurrently
 * 4. Background jobs (TP/SL sync) also update orders during execution
 *
 * Current Approach (MVP):
 * - Database updates use MongoDB's atomic operations ($set, $push) without transactions
 * - Each pipeline step performs atomic updates independently
 * - Broker operation is source of truth; DB is eventually consistent
 * - If DB update fails, broker trade is preserved (can be reconciled later)
 *
 * Trade-offs:
 * ✅ No write conflicts - operations succeed reliably
 * ✅ Broker trades always preserved (most critical)
 * ✅ Simple and fast execution
 * ⚠️ No atomicity across multiple DB operations (acceptable for MVP)
 * ⚠️ Eventual consistency instead of strong consistency
 *
 * Future Improvements (Post-MVP):
 * - Implement optimistic locking with version fields
 * - Add retry logic for transient failures
 * - Consolidate multi-step DB updates into single atomic operations
 * - Establish clear service ownership (only one service writes to order at a time)
 * - Add reconciliation job to detect and fix inconsistencies
 *
 * Related Files:
 * - open-order.step.ts: Performs atomic DB updates after broker execution
 * - update-order-database.step.ts: Updates order fields atomically
 * - execution-context.ts: Provides helper methods for atomic operations
 */

import {
  CommandEnum,
  ExecuteOrderRequestPayload,
  ActionPipeline,
  ServiceName,
} from '@telegram-trading-bot-mini/shared/utils';
import { Container } from '../../interfaces';
import {
  BaseExecutionState,
  CancelOrderExecutionState,
  CloseAllExecutionState,
  CloseBadPositionExecutionState,
  ExecutionContext,
  OpenTradeExecutionState,
  UpdateOrderExecutionState,
} from './execution-context';
import { OrderHistoryStatus } from '@dal';
import { ObjectId } from 'mongodb';
import {
  ResolveAccountStep,
  ResolveAdapterStep,
  MarketHoursStep,
  PublishResultStep,
  EntryPriceResolverStep,
  PipsConversionStep,
  NormaliseTakeProfitStep,
  SetDefaultOrderParamsStep,
  SelectTakeProfitStep,
  StopLossCalculationStep,
  ResolveBalanceStep,
  SyncLinkedOrderTpSlStep,
  SentryStartStep,
  SentryCommitStep,
  ResolveOrderStep,
  SetExecutionResultStep,
  ApplyExecutionInstructionsStep,
} from './common';
import {
  CloseOppositePositionsStep,
  BrokerCloseStep,
  CalculatePnlAfterCloseOrderStep,
  UpdateOrderHistoryAfterCloseStep,
  CheckDisableCloseBadPositionStep,
  UpdateLotSizeRemainingStep,
  ValidateClosePartialStep,
  ForceFullCloseStep,
  UpdateTpTierStatusStep,
} from './close-order';
import {
  MaxPositionsStep,
  PrepareLeverageStep,
  LotSizeCalculationStep,
  OpenOrderStep,
} from './open-order';
import {
  FetchOrdersToCancelStep,
  CancelOrdersStep,
  UpdateOrderHistoryAfterCancelStep,
} from './cancel-order';
import {
  LoadOrderParamsToStateStep,
  CalculateUpdateStep,
  BrokerUpdateStep,
  UpdateOrderDatabaseStep,
} from './update-order';

/**
 * Purpose: Order execution service using the Command Pipeline pattern.
 */
export class PipelineOrderExecutorService {
  private commandPipelines = new Map<
    CommandEnum,
    ActionPipeline<ExecutionContext<BaseExecutionState>>
  >();
  constructor(private container: Container) {
    this.initializePipelines();
  }

  /**
   * Initialize pipelines for all supported commands.
   */
  private initializePipelines(): void {
    // Open order flow (LONG/SHORT)
    const openOrderPipeline = this.createBasePipeline<OpenTradeExecutionState>()
      .use(SentryStartStep)
      .use(ResolveAccountStep)
      .use(ResolveAdapterStep)
      .use(SetDefaultOrderParamsStep)
      // .use(StartTransactionStep) // Start transaction (stays open through deferred steps) - TEMPORARILY DISABLED
      .use(new MarketHoursStep(this.container.logger))
      .use(MaxPositionsStep)
      .use(EntryPriceResolverStep)
      .use(new CloseOppositePositionsStep())
      .use(PipsConversionStep)
      .use(new NormaliseTakeProfitStep())
      .use(new ApplyExecutionInstructionsStep())
      .use(new SelectTakeProfitStep())
      .use(new StopLossCalculationStep())
      .use(new PrepareLeverageStep())
      .use(new ResolveBalanceStep())
      .use(new LotSizeCalculationStep())
      .use(new OpenOrderStep()) // Last step before commit - opens order on broker
      .use(new SyncLinkedOrderTpSlStep()) // Trigger sync jobs (within transaction)
      // .useDeferred(CommitTransactionStep) // Commit on success - TEMPORARILY DISABLED
      .useDeferred(PublishResultStep) // Publish after commit
      .useDeferred(SentryCommitStep);
    // .useErrorHandler(RollbackTransactionStep); // Rollback/cleanup on error - TEMPORARILY DISABLED

    this.commandPipelines.set(CommandEnum.LONG, openOrderPipeline);
    this.commandPipelines.set(CommandEnum.SHORT, openOrderPipeline);

    // Close all flow
    const closeAllPipeline = this.createBasePipeline<CloseAllExecutionState>()
      .use(SentryStartStep)
      .use(ResolveAccountStep)
      .use(ResolveOrderStep)
      .use(ResolveAdapterStep)
      .use(new ForceFullCloseStep())
      .use(new BrokerCloseStep())
      .use(new CalculatePnlAfterCloseOrderStep())
      .useDeferred(new UpdateOrderHistoryAfterCloseStep())
      // .useDeferred(CommitTransactionStep)
      .useDeferred(PublishResultStep)
      .useDeferred(SentryCommitStep);
    // .useErrorHandler(RollbackTransactionStep);

    this.commandPipelines.set(CommandEnum.CLOSE_ALL, closeAllPipeline);

    // Close bad position flow
    const closeBadPositionPipeline =
      this.createBasePipeline<CloseBadPositionExecutionState>()
        .use(SentryStartStep)
        .use(ResolveAccountStep)
        .use(ResolveOrderStep)
        .use(ResolveAdapterStep)
        // .use(StartTransactionStep)
        .use(new CheckDisableCloseBadPositionStep())
        .use(new ForceFullCloseStep())
        .use(new BrokerCloseStep())
        .use(new CalculatePnlAfterCloseOrderStep())
        .useDeferred(new UpdateOrderHistoryAfterCloseStep())
        // .useDeferred(CommitTransactionStep)
        .useDeferred(PublishResultStep)
        .useDeferred(SentryCommitStep);
    // .useErrorHandler(RollbackTransactionStep);

    this.commandPipelines.set(
      CommandEnum.CLOSE_BAD_POSITION,
      closeBadPositionPipeline,
    );

    // Cancel order flow
    const cancelOrderPipeline =
      this.createBasePipeline<CancelOrderExecutionState>()
        .use(SentryStartStep)
        .use(ResolveAccountStep)
        .use(ResolveOrderStep)
        .use(ResolveAdapterStep)
        // .use(StartTransactionStep)
        .use(new FetchOrdersToCancelStep())
        .use(new CancelOrdersStep())
        .useDeferred(new UpdateOrderHistoryAfterCancelStep())
        // .useDeferred(CommitTransactionStep)
        .useDeferred(PublishResultStep)
        .useDeferred(SentryCommitStep);
    // .useErrorHandler(RollbackTransactionStep);

    this.commandPipelines.set(CommandEnum.CANCEL, cancelOrderPipeline);

    // SET_TP_SL pipeline
    const setTpSlPipeline = this.createBasePipeline<UpdateOrderExecutionState>()
      .use(SentryStartStep)
      .use(ResolveAccountStep)
      .use(ResolveOrderStep)
      .use(ResolveAdapterStep)
      .use(SetDefaultOrderParamsStep)
      .use(LoadOrderParamsToStateStep)
      // .use(StartTransactionStep)
      .use(PipsConversionStep)
      .use(new NormaliseTakeProfitStep())
      .use(new ApplyExecutionInstructionsStep())
      .use(new SelectTakeProfitStep())
      .use(new CalculateUpdateStep())
      .use(new BrokerUpdateStep())
      .use(new SyncLinkedOrderTpSlStep())
      .use(new SetExecutionResultStep())
      .useDeferred(new UpdateOrderDatabaseStep())
      // .useDeferred(CommitTransactionStep)
      .useDeferred(PublishResultStep)
      .useDeferred(SentryCommitStep);
    // .useErrorHandler(RollbackTransactionStep);

    this.commandPipelines.set(CommandEnum.SET_TP_SL, setTpSlPipeline);

    // CLOSE_PARTIAL pipeline
    const closePartialPipeline =
      this.createBasePipeline<CloseAllExecutionState>()
        .use(SentryStartStep)
        .use(ResolveAccountStep)
        .use(ResolveOrderStep)
        .use(ResolveAdapterStep)
        .use(new ValidateClosePartialStep())
        .use(new BrokerCloseStep())
        .use(new CalculatePnlAfterCloseOrderStep())
        .use(new UpdateLotSizeRemainingStep())
        .use(new UpdateTpTierStatusStep())
        .useDeferred(new UpdateOrderHistoryAfterCloseStep())
        .useDeferred(PublishResultStep)
        .useDeferred(SentryCommitStep);

    this.commandPipelines.set(CommandEnum.CLOSE_PARTIAL, closePartialPipeline);

    // MOVE_SL pipeline (similar but without pips conversion)
    const moveSlPipeline = this.createBasePipeline<UpdateOrderExecutionState>()
      .use(SentryStartStep)
      .use(ResolveAccountStep)
      .use(ResolveOrderStep)
      .use(ResolveAdapterStep)
      .use(SetDefaultOrderParamsStep)
      .use(LoadOrderParamsToStateStep)
      // .use(StartTransactionStep)
      .use(new ApplyExecutionInstructionsStep())
      .use(new CalculateUpdateStep())
      .use(new BrokerUpdateStep())
      .use(new SyncLinkedOrderTpSlStep())
      .use(new SetExecutionResultStep())
      .useDeferred(new UpdateOrderDatabaseStep())
      // .useDeferred(CommitTransactionStep)
      .useDeferred(PublishResultStep)
      .useDeferred(SentryCommitStep);
    // .useErrorHandler(RollbackTransactionStep);

    this.commandPipelines.set(CommandEnum.MOVE_SL, moveSlPipeline);
  }

  /**
   * Create a new ActionPipeline instance with core injection.
   */
  private createBasePipeline<
    TState extends BaseExecutionState,
  >(): ActionPipeline<ExecutionContext<TState>> {
    return new ActionPipeline<ExecutionContext<TState>>(
      this.container.logger,
      this.container.errorCapture,
    );
  }

  /**
   * Main entry point for executing an order request.
   */
  async executeOrder(payload: ExecuteOrderRequestPayload): Promise<void> {
    const { accountId, orderId, command, traceToken } = payload;

    const pipeline = this.commandPipelines.get(payload.command);

    if (!pipeline) {
      throw new Error(`Unsupported command: ${payload.command}`);
    }

    const context = new ExecutionContext({
      payload,
      container: this.container,
    });

    try {
      this.container.logger.info(
        { accountId, orderId, command, traceToken },
        'Executing order',
      );

      await pipeline.run(context);

      this.container.logger.info(
        { orderId, accountId, command, traceToken },
        'Order executed successfully',
      );
    } catch (error) {
      this.container.logger.error(
        { orderId, accountId, command, traceToken, error },
        'Order execution failed',
      );

      // when error, we force no result
      context.state.error = error;
      context.result = undefined;

      // Update Order.history with error
      await this.container.orderRepository.updateOne(
        { orderId } as any,
        {
          $push: {
            history: {
              _id: new ObjectId(),
              status: OrderHistoryStatus.ERROR,
              service: ServiceName.EXECUTOR_SERVICE,
              ts: new Date(),
              traceToken,
              messageId: payload.messageId,
              channelId: payload.channelId,
              command,
              info: {
                error: (error as Error).message,
                errorCode: this.classifyError(error as Error),
              },
            },
          },
        } as any,
      );

      await PublishResultStep.execute(context, async () => {});

      throw error;
    }
  }

  /**
   * Classify error for better error handling
   */
  private classifyError(error: Error): string {
    const message = error.message.toLowerCase();
    if (message.includes('insufficient')) return 'INSUFFICIENT_BALANCE';
    if (message.includes('invalid symbol')) return 'INVALID_SYMBOL';
    if (message.includes('not found')) return 'NOT_FOUND';
    if (message.includes('timeout')) return 'TIMEOUT';
    return 'UNKNOWN_ERROR';
  }

  /**
   * Public API: Update take profit and/or stop loss for an order.
   * This satisfies the interface expected by other services/jobs.
   */
  public async updateTakeProfitStopLoss(
    payload: ExecuteOrderRequestPayload,
  ): Promise<void> {
    return this.executeOrder(payload);
  }
}
