/**
 * Pending Order Cleanup Job
 *
 * Purpose:
 * Automatically cleans up market orders that remain in PENDING status beyond a configured timeout.
 * Prevents orphaned orders from accumulating when executor-service fails to process them.
 *
 * Inputs:
 * - Job meta: timeoutMinutes (default: 1), notificationAccountIds (default: [])
 * - Container: OrderRepository, PushNotificationService
 *
 * Outputs:
 * - Closed orders with CANCELED history entry
 * - Push notifications for whitelisted accounts
 *
 * Core Flow:
 * 1. Query all PENDING orders
 * 2. Filter orders older than timeout (in-memory)
 * 3. For each stale order:
 *    - Close order in transaction (set closedAt, status=CLOSED, add CANCELED history)
 *    - Send notification if account is whitelisted
 * 4. Log summary
 */

import { BaseJob, RegisterJob } from '@telegram-trading-bot-mini/shared/utils';
import {
  OrderRepository,
  OrderStatus,
  OrderHistoryStatus,
  withMongoTransaction,
  Order,
  OrderExecutionType,
} from '@dal';
import {
  PushNotificationService,
  ServiceName,
  CommandEnum,
} from '@telegram-trading-bot-mini/shared/utils';
import { Container } from '../interfaces';
import { ObjectId } from 'mongodb';
import * as Sentry from '@sentry/node';

/**
 * Job meta configuration interface
 */
interface PendingOrderCleanupJobMeta {
  /**
   * Timeout in minutes for considering an order stale
   * @default 1
   */
  timeoutMinutes?: number;

  /**
   * Account IDs that should receive notifications when their orders are cleaned up
   * @default []
   */
  notificationAccountIds?: string[];
}

/**
 * Pending Order Cleanup Job
 * Runs periodically to clean up stale pending orders
 */
@RegisterJob('pending-order-cleanup-job')
export class PendingOrderCleanupJob extends BaseJob<Container> {
  private orderRepository: OrderRepository;
  private pushNotificationService: PushNotificationService;

  override async init(): Promise<void> {
    await super.init();

    // Get dependencies from container
    this.orderRepository = this.container.orderRepository;
    this.pushNotificationService = this.container.pushNotificationService;

    this.logger.info(
      { jobId: this.jobConfig.jobId },
      'PendingOrderCleanupJob initialized',
    );
  }

  protected async onTick(params?: any, traceToken?: string): Promise<void> {
    const timeoutMinutes = this.getTimeoutMinutes();

    this.logger.info(
      { jobId: this.jobConfig.jobId, timeoutMinutes },
      'Starting pending order cleanup job',
    );

    const staleOrders = await this.findStaleOrders(timeoutMinutes);

    if (staleOrders.length === 0) {
      this.logger.info(
        { jobId: this.jobConfig.jobId },
        'No stale orders found',
      );
      return;
    }

    this.logger.info(
      { jobId: this.jobConfig.jobId, count: staleOrders.length },
      'Found stale orders to clean up',
    );

    // Process each order
    for (const order of staleOrders) {
      await this.processStaleOrder(order);
    }

    this.logger.info(
      { jobId: this.jobConfig.jobId, processed: staleOrders.length },
      'Pending order cleanup job completed',
    );
  }

  /**
   * Get timeout configuration from job meta
   */
  private getTimeoutMinutes(): number {
    return (
      (this.jobConfig.meta as PendingOrderCleanupJobMeta)?.timeoutMinutes ?? 1
    );
  }

  /**
   * Find all stale pending orders based on timeout
   * Only queries market orders (limit orders are handled separately)
   */
  private async findStaleOrders(timeoutMinutes: number): Promise<Order[]> {
    const cutoffTime = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    // Query PENDING market orders created before cutoff time
    // Uses compound index {status: 1, executionType: 1, createdAt: 1} for efficient querying
    const staleOrders = await this.orderRepository.findAll({
      status: OrderStatus.PENDING,
      executionType: OrderExecutionType.market,
      createdAt: { $lt: cutoffTime },
    });

    return staleOrders;
  }

  /**
   * Process a single stale order: cleanup and notify
   */
  private async processStaleOrder(order: Order): Promise<void> {
    let cleanupSuccess = false;
    let cleanupError: Error | null = null;

    try {
      await this.cleanupOrder(order);
      cleanupSuccess = true;

      this.logger.info(
        {
          jobId: this.jobConfig.jobId,
          orderId: order.orderId,
          accountId: order.accountId,
          symbol: order.symbol,
        },
        'Successfully cleaned up stale order',
      );
    } catch (error) {
      cleanupError = error as Error;
      cleanupSuccess = false;

      this.logger.error(
        {
          jobId: this.jobConfig.jobId,
          orderId: order.orderId,
          accountId: order.accountId,
          error: cleanupError.message,
        },
        'Failed to clean up stale order',
      );

      // Capture error in Sentry
      Sentry.captureException(cleanupError, {
        tags: {
          jobId: this.jobConfig.jobId,
          orderId: order.orderId,
          accountId: order.accountId,
        },
      });

      // Add ERROR history entry
      await this.addCleanupErrorHistory(order, cleanupError);
    } finally {
      // Always attempt to send notification regardless of cleanup success
      await this.sendNotificationIfEnabled(order, cleanupSuccess, cleanupError);
    }
  }

  /**
   * Clean up a stale order by closing it and adding history
   */
  private async cleanupOrder(order: Order): Promise<void> {
    await withMongoTransaction(async (session) => {
      const now = new Date();

      await this.orderRepository.updateOne(
        { orderId: order.orderId },
        {
          $set: {
            closedAt: now,
            status: OrderStatus.CLOSED,
          },
          $push: {
            history: {
              _id: new ObjectId(),
              status: OrderHistoryStatus.CANCELED,
              service: ServiceName.PENDING_ORDER_CLEANUP_JOB,
              ts: now,
              traceToken: '',
              messageId: order.messageId,
              channelId: order.channelId,
              command: CommandEnum.NONE,
              info: {
                reason:
                  'Order was pending for more than configured timeout and automatically cleaned up',
              },
            },
          } as any,
        },
        session,
      );
    });
  }

  /**
   * Add ERROR history entry when cleanup fails
   */
  private async addCleanupErrorHistory(
    order: Order,
    error: Error,
  ): Promise<void> {
    try {
      await this.orderRepository.updateOne(
        { orderId: order.orderId },
        {
          $push: {
            history: {
              _id: new ObjectId(),
              status: OrderHistoryStatus.ERROR,
              service: ServiceName.PENDING_ORDER_CLEANUP_JOB,
              ts: new Date(),
              traceToken: '',
              messageId: order.messageId,
              channelId: order.channelId,
              command: CommandEnum.NONE,
              info: {
                reason: 'Failed to clean up stale pending order',
                error: error.message,
              },
            },
          } as any,
        },
      );

      this.logger.info(
        {
          jobId: this.jobConfig.jobId,
          orderId: order.orderId,
        },
        'Added ERROR history entry',
      );
    } catch (historyError) {
      // Log but don't throw - we don't want to fail the entire job
      this.logger.error(
        {
          jobId: this.jobConfig.jobId,
          orderId: order.orderId,
          error: (historyError as Error).message,
        },
        'Failed to add ERROR history entry',
      );
    }
  }

  /**
   * Send push notification if account is whitelisted
   */
  private async sendNotificationIfEnabled(
    order: Order,
    success: boolean,
    error: Error | null,
  ): Promise<void> {
    const notificationAccountIds: string[] =
      (this.jobConfig.meta as PendingOrderCleanupJobMeta)
        ?.notificationAccountIds ?? [];

    // Check if this account is whitelisted for notifications
    if (!notificationAccountIds.includes(order.accountId)) {
      this.logger.debug(
        {
          jobId: this.jobConfig.jobId,
          orderId: order.orderId,
          accountId: order.accountId,
        },
        'Skipping notification - account not in whitelist',
      );
      return;
    }

    try {
      const title = success
        ? 'Stale Order Cleanup'
        : 'Stale Order Cleanup Failed';
      const message = success
        ? `Order ${order.orderId} for ${order.symbol} (Account: ${order.accountId}) was automatically cleaned up due to timeout`
        : `Failed to clean up order ${order.orderId} for ${
            order.symbol
          } (Account: ${order.accountId}). Error: ${
            error?.message || 'Unknown error'
          }`;

      await this.pushNotificationService.send({
        t: title,
        m: message,
        d: 'a', // Send to all devices
        traceToken: '',
      });

      this.logger.info(
        {
          jobId: this.jobConfig.jobId,
          orderId: order.orderId,
          accountId: order.accountId,
          success,
        },
        'Notification sent for order cleanup',
      );
    } catch (error) {
      // Log but don't throw - notification failure shouldn't stop cleanup
      this.logger.error(
        {
          jobId: this.jobConfig.jobId,
          orderId: order.orderId,
          error: (error as Error).message,
        },
        'Failed to send notification',
      );
    }
  }
}
