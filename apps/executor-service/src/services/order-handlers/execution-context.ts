/**
 * Purpose: Unified execution context (Data Bag) for order pipeline
 * Core Flow: Populated during initialization, mutated by pipeline steps
 */

import { Account, OrderHistoryStatus, OrderSide } from '@dal';
import { ClientSession, ObjectId } from 'mongodb';
import {
  BalanceInfo,
  ExecuteOrderRequestPayload,
  ExecuteOrderResultPayload,
  ExecuteOrderResultType,
  LoggerInstance,
  ServiceName,
} from '@telegram-trading-bot-mini/shared/utils';
import { IBrokerAdapter, CloseOrderResult } from '../../adapters/interfaces';
import { Container } from '../../interfaces';
import { Order } from '@dal';
import { BrokerAdjustmentInfo } from '../calculations/stop-loss-calculator.service';

export interface BaseExecutionState {
  isAborted: boolean;
  abortReason?: string;
  error?: Error;
  /**
   * The main entry price for this execution flow.
   * Default is the entry price from event payload but can be adjusted
   * (e.g., using cached live price for market orders).
   */
  entryPrice?: number;
  /**
   * Stop loss configuration for this execution.
   * Default is from event payload but can be adjusted by middleware steps
   * (e.g., pips conversion).
   */
  stopLoss?: { price?: number; pips?: number };
  /**
   * Take profit configurations for this execution.
   * Default is from event payload but can be adjusted by middleware steps
   * (e.g., pips conversion).
   */
  takeProfits?: Array<{ price?: number; pips?: number }>;
  /**
   * Account balance info from cache.
   */
  balanceInfo?: BalanceInfo;
  /**
   * Timestamp when Sentry tracking started (for duration metrics).
   */
  sentryStartTime?: number;
  /**
   * Fully validated and sorted take profit levels.
   * Used for multi-tier TP monitoring and selection.
   */
  normalisedTakeProfits?: Array<{ price?: number; pips?: number }>;
}

/**
 * Execution state for LONG / SHORT command
 */
export interface OpenTradeExecutionState extends BaseExecutionState {
  /**
   * Indicates if we should sync TP and SL to the broker.
   * Default is true. Set to false when using forced SL or when SL price is invalid.
   */
  shouldSyncTpSl?: boolean;
  /**
   * Resolved leverage for the symbol and account.
   */
  leverage?: number;
  /**
   * Final calculated lot size for the order.
   */
  lotSize?: number;
  /**
   * Broker price adjustment applied to the stop loss.
   */
  brokerSlAdjustment?: BrokerAdjustmentInfo;
}

/**
 * Base execution state for close-related commands
 */
export interface BaseCloseExecutionState extends BaseExecutionState {
  /**
   * Result from the broker after a close operation.
   */
  closeResult?: CloseOrderResult;
  /**
   * PNL value for the order being closed.
   */
  pnlValue?: number;
  /**
   * Flag to track if the order was found on the exchange.
   */
  isOrderNotFound?: boolean;
  /**
   * Flag to track if the position is fully closed (for partial close flow).
   */
  isFullClose?: boolean;
  /**
   * The order being processed (e.g., for CLOSE_ALL, CANCEL, MOVE_SL).
   */
  order?: Order;
}

/**
 * Execution state for CLOSE_ALL command
 */
export interface CloseAllExecutionState extends BaseCloseExecutionState {}

/**
 * Execution state for CLOSE_BAD_POSITION command
 */
export interface CloseBadPositionExecutionState extends BaseCloseExecutionState {}

/**
 * Execution state for CANCEL command
 */
export interface CancelOrderExecutionState extends BaseExecutionState {
  /**
   * List of order IDs to cancel (entry, SL, TP1, TP2, TP3).
   * Populated by FetchOrdersToCancelStep.
   */
  orderIdsToCancel?: string[];
  /**
   * List of order IDs that were actually canceled on the exchange.
   * Populated by CancelOrdersStep.
   */
  canceledOrderIds?: string[];
  /**
   * The order being processed (e.g., for CLOSE_ALL, CANCEL, MOVE_SL).
   */
  order?: Order;
}

/**
 * Execution state for MOVE_SL and SET_TP_SL commands
 */
export interface UpdateOrderExecutionState extends BaseExecutionState {
  /**
   * The order being processed (e.g., for CLOSE_ALL, CANCEL, MOVE_SL).
   */
  order?: Order;
  /**
   * The side of the order (LONG/SHORT).
   */
  side?: OrderSide;
  /**
   * Indicates if we should sync TP and SL to linked orders.
   * Default is true.
   */
  shouldSyncTpSl?: boolean;
  /**
   * Flag to track if SL update is required after comparison.
   */
  shouldUpdateSl?: boolean;
  /**
   * Flag to track if TP update is required after comparison.
   */
  shouldUpdateTp?: boolean;
  /**
   * New SL order ID after update.
   */
  newSlOrderId?: string;
  /**
   * New TP1 order ID after update.
   */
  newTp1OrderId?: string;
  /**
   * Broker price adjustment applied to the stop loss.
   */
  brokerSlAdjustment?: BrokerAdjustmentInfo;
  /**
   * List of updates performed for history logging.
   */
  updates?: Array<{
    field: string;
    oldOrderId?: string;
    newOrderId?: string;
    price?: number;
  }>;
}

export class ExecutionContext<TState extends BaseExecutionState> {
  // Read-only Inputs
  public readonly payload: ExecuteOrderRequestPayload;
  public readonly container: Container;
  public readonly logger: LoggerInstance;

  // Mutable State (The Data Bag)
  public adapter?: IBrokerAdapter; // To be resolved by a Pipeline Step
  /**
   * We should resolve account, otherwise middleware might fail
   */
  public account: Account;
  /**
   * We should resolve session, otherwise middleware might fail
   */
  public session: ClientSession; // To be set by MongoTransactionStep
  public result?: ExecuteOrderResultPayload; // To be set by logic and published by deferred step

  public state: TState = {
    isAborted: false,
  } as unknown as TState;

  constructor(params: {
    payload: ExecuteOrderRequestPayload;
    container: Container;
  }) {
    this.payload = params.payload;
    this.container = params.container;
    this.logger = params.container.logger.child({
      traceToken: params.payload.traceToken,
      command: params.payload.command,
      orderId: params.payload.orderId,
      accountId: params.payload.accountId,
    });
  }

  /**
   * Abort the pipeline execution with a reason
   */
  abort(reason: string): void {
    this.state.isAborted = true;
    this.state.abortReason = reason;
    this.logger.info({ abortReason: reason }, 'Execution aborted');
  }

  /**
   * Record an error that occurred during execution
   */
  setError(error: Error): void {
    this.state.error = error;
    this.logger.error({ error }, 'Execution failed with error');
  }

  /**
   * Set a failure result payload pre-filled with context data
   */
  setFailureResult(errorCode: string, errorMessage: string): void {
    this.result = {
      orderId: this.payload.orderId,
      messageId: this.payload.messageId,
      channelId: this.payload.channelId,
      accountId: this.payload.accountId,
      traceToken: this.payload.traceToken,
      success: false,
      symbol: this.payload.symbol,
      type: ExecuteOrderResultType.OTHERS,
      error: errorMessage,
      errorCode,
    };
  }

  /**
   * Push a history entry to the current order
   */
  async addOrderHistory(
    status: OrderHistoryStatus,
    info: any = {},
  ): Promise<void> {
    await this.container.orderRepository.updateOne(
      { orderId: this.payload.orderId } as any,
      {
        $push: {
          history: {
            _id: new ObjectId(),
            status,
            service: ServiceName.EXECUTOR_SERVICE,
            ts: new Date(),
            traceToken: this.payload.traceToken,
            messageId: this.payload.messageId,
            channelId: this.payload.channelId,
            command: this.payload.command,
            info,
          },
        },
      } as any,
      this.session,
    );
  }
}
