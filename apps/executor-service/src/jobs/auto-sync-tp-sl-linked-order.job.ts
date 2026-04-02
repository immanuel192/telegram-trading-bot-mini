/**
 * Purpose: Auto-sync TP/SL values to linked orders or update specific order values from source
 * Exports: AutoSyncTpSlLinkedOrderJob class
 * Core Flow: Validates order → Adds history entry → Calls handleUpdateTakeProfitStopLoss
 *
 * This job handles two scenarios:
 * 1. Syncing TP/SL to linked orders when one order's TP/SL is updated (Primary)
 * 2. Updating TP/SL values for an order based on a source event
 */

import {
  BaseJob,
  ExecuteOrderRequestPayload,
  RegisterJob,
  ServiceName,
} from '@telegram-trading-bot-mini/shared/utils';
import { Container } from '../interfaces';
import { OrderStatus, OrderHistoryStatus } from '@dal';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';
import { ObjectId } from 'mongodb';

/**
 * Job parameters for auto-sync TP/SL linked order job
 */
interface AutoSyncTpSlParams {
  /**
   * Account ID for the order
   */
  accountId: string;

  /**
   * Order ID to update TP/SL for
   */
  orderId: string;

  /**
   * Stop loss configuration (optional)
   */
  sl?: {
    price?: number;
  };

  /**
   * Take profit configuration (optional)
   */
  tp?: {
    price?: number;
    tiers?: { price: number; isUsed?: boolean }[];
  };

  /**
   * Source order ID that triggered this sync (optional)
   * - If same as orderId: deferred SL update
   * - If different: linked order sync
   */
  sourceOrderId?: string;
}

/**
 * Auto-Sync TP/SL Linked Order Job
 * Manual-trigger-only job that syncs TP/SL across linked orders
 * or updates deferred stop loss for market orders
 *
 * Note: This job does not have a cronExpression and can only be triggered manually
 */
@RegisterJob(ServiceName.AUTO_SYNC_TP_SL_LINKED_ORDER_JOB)
export class AutoSyncTpSlLinkedOrderJob extends BaseJob<
  Container,
  AutoSyncTpSlParams
> {
  override async init(): Promise<void> {
    // force delete
    delete this.jobConfig.config.cronExpression;
    super.init();
  }

  /**
   * Execute the job
   * Validates order, adds history entry, and updates TP/SL
   */
  protected async onTick(
    params?: AutoSyncTpSlParams,
    traceToken?: string,
  ): Promise<void> {
    // Validate required parameters
    if (!params?.accountId || !params?.orderId) {
      throw new Error(
        'Missing required parameters: accountId and orderId are required',
      );
    }

    const { accountId, orderId, sl, tp, sourceOrderId } = params;

    this.logger.info(
      {
        accountId,
        orderId,
        sourceOrderId,
        hasSl: !!sl,
        hasTp: !!tp,
        traceToken,
      },
      'Auto-sync TP/SL job executing',
    );

    try {
      // Fetch order from repository to verify it exists and get its state
      // Use small retry loop to handle potential race conditions if job is triggered
      // immediately after order creation before DB write is fully consistent
      let order = await this.container.orderRepository.findOne({ orderId });

      if (!order) {
        this.logger.debug(
          { orderId },
          'Order not found initially, retrying...',
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
        order = await this.container.orderRepository.findOne({ orderId });
      }

      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      // Only support OPEN status for now, PENDING is out of scope
      if (order.status !== OrderStatus.OPEN) {
        this.logger.warn(
          { orderId, status: order.status },
          'Order is not in OPEN status, skipping TP/SL sync',
        );
        return;
      }

      // Determine the reason for this job execution
      const reason =
        sourceOrderId === orderId ? 'deferred-sl-update' : 'linked-order-sync';

      // Add history entry to order indicating job execution
      // This provides audit trail and distinguishes job-triggered updates from user commands
      await this.container.orderRepository.updateOne({ orderId }, {
        $push: {
          history: {
            _id: new ObjectId(),
            status: OrderHistoryStatus.UPDATE,
            service: 'auto-sync-tp-sl-linked-order-job',
            ts: new Date(),
            traceToken: traceToken || 'unknown',
            messageId: order.messageId,
            channelId: order.channelId,
            command: CommandEnum.NONE, // Automated action, not user command
            info: {
              sourceOrderId,
              sl,
              tp,
              reason,
            },
          },
        },
      } as any);

      this.logger.debug(
        { orderId, reason, sourceOrderId },
        'Added history entry for job execution',
      );

      // Build ExecuteOrderRequestPayload with skipLinkedOrderSync flag
      // This prevents endless recursion when updating linked orders
      const payload: ExecuteOrderRequestPayload = {
        orderId,
        messageId: order.messageId,
        channelId: order.channelId,
        accountId,
        traceToken: traceToken || 'auto-sync-job',
        symbol: order.symbol,
        command: CommandEnum.SET_TP_SL,
        lotSize: order.lotSize,
        stopLoss: sl,
        isImmediate: true,
        takeProfits: tp?.price ? [{ price: tp.price }] : undefined,
        meta: {
          executionInstructions: {
            skipLinkedOrderSync: true, // Prevent recursion
            skipBrokerPriceAdjustment: true, // Prevent re-adjusting already adjusted SL
            takeProfitTiers: tp?.tiers,
          },
        },
        timestamp: Date.now(),
      };

      // Call the public API to update TP/SL
      await this.container.pipelineExecutor.executeOrder(payload);

      this.logger.info(
        { orderId, accountId, reason, traceToken },
        'Auto-sync TP/SL job completed successfully',
      );
    } catch (error: any) {
      this.logger.error(
        {
          orderId,
          accountId,
          error: error.message || error,
          stack: error.stack,
          traceToken,
        },
        'Auto-sync TP/SL job failed',
      );

      // Capture error in Sentry
      this.container.errorCapture.captureException(error as Error, {
        extra: {
          jobName: 'auto-sync-tp-sl-linked-order',
          orderId,
          accountId,
          sourceOrderId,
          traceToken,
        },
      });

      throw error;
    }
  }
}
