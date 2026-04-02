/**
 * Purpose: Automatically synchronize order statuses with the broker
 * Exports: AutoUpdateOrderStatusJob class
 * Core Flow: Fetch OPEN orders → Group by account → Fetch transactions → Update status/PNL
 */

import {
  BaseJob,
  RegisterJob,
  ServiceName,
} from '@telegram-trading-bot-mini/shared/utils';
import { Container } from '../interfaces';
import {
  OrderStatus,
  OrderHistoryStatus,
  Order,
  withMongoTransaction,
} from '@dal';
import { TransactionStatus } from '../adapters/interfaces';
import { ObjectId } from 'mongodb';

/**
 * Job to automatically update order statuses by polling broker transactions.
 * Essential for capturing orders closed externally (TP/SL, manual closure).
 *
 * Recommended schedule: '30 * * * * *' (Every minute at 30th second)
 */
@RegisterJob(ServiceName.AUTO_UPDATE_ORDER_STATUS_JOB)
export class AutoUpdateOrderStatusJob extends BaseJob<Container> {
  protected async onTick(params?: any, traceToken?: string): Promise<void> {
    const { orderRepository, brokerFactory, logger, errorCapture } =
      this.container;
    const batchLimit = this.jobConfig.meta?.batchLimit || 50;

    try {
      // 1. Fetch OPEN orders sorted by _id ASC using the specialized repository method
      const openOrders =
        await orderRepository.findOpenOrdersBatched(batchLimit);

      if (openOrders.length === 0) {
        return;
      }

      this.logger.info(
        { count: openOrders.length, traceToken },
        'Found open orders to sync status',
      );

      // 2. Group by accountId
      const ordersByAccount = openOrders.reduce(
        (acc, order) => {
          if (!acc[order.accountId]) {
            acc[order.accountId] = [];
          }
          acc[order.accountId].push(order);
          return acc;
        },
        {} as Record<string, Order[]>,
      );

      // 3. Process each account group
      for (const [accountId, orders] of Object.entries(ordersByAccount)) {
        try {
          const adapter = await brokerFactory.getAdapter(accountId);

          /**
           * For brokers like Oanda, using the entryOrderId of the oldest order
           * in the batch as the starting point for transaction history.
           */
          const oldestOrder = orders[0];
          const fromId = oldestOrder.entry?.entryOrderId;

          if (!fromId) {
            this.logger.warn(
              { accountId, orderId: oldestOrder.orderId, traceToken },
              'Oldest order in batch missing entryOrderId, skipping account group',
            );
            continue;
          }

          const transactions = await adapter.getTransactions({
            fromId,
            from: new Date(oldestOrder.createdAt.getTime() - 60000), // 1 min buffer for latency
            to: new Date(),
          });

          if (transactions.length === 0) {
            continue;
          }

          // 4. Map transactions to orders and update
          // We process updates per-order within individual transactions.
          // This ensures that if one order update fails (e.g., concurrent modification),
          // the rest of the batch still proceeds and synchronizes correctly.
          for (const item of transactions) {
            if (item.status === TransactionStatus.CLOSED) {
              // Find matching order in our batch for this account
              // Match by entryOrderId, slOrderId, or tp1OrderId
              const matchedOrder = orders.find(
                (o) =>
                  o.entry?.entryOrderId === item.orderId ||
                  o.sl?.slOrderId === item.orderId ||
                  o.tp?.tp1OrderId === item.orderId,
              );

              if (matchedOrder) {
                await this.updateOrderStatus(
                  matchedOrder.orderId,
                  item,
                  traceToken,
                );
              }
            }
          }
        } catch (error) {
          logger.error(
            { accountId, error: (error as Error).message, traceToken },
            'Failed to sync order statuses for account',
          );
          errorCapture.captureException(error);
        }
      }
    } catch (error) {
      logger.error(
        { error: (error as Error).message, traceToken },
        'AutoUpdateOrderStatusJob failed during execution',
      );
      errorCapture.captureException(error);
    }
  }

  /**
   * Update a single order's status and records PNL/exit details
   */
  private async updateOrderStatus(
    orderId: string,
    item: any,
    traceToken?: string,
  ): Promise<void> {
    const { orderRepository } = this.container;

    try {
      const historyStatus = this.mapCloseReasonToHistoryStatus(
        item.closeReason,
      );
      const reason = item.closeReason || 'CLOSED';

      // Perform update within a transaction to ensure history and status consistency
      await withMongoTransaction(async (session) => {
        await orderRepository.updateOne(
          { orderId },
          {
            $set: {
              status: OrderStatus.CLOSED,
              'exit.actualExitPrice': item.closedPrice,
              'pnl.pnl': item.pnl,
              closedAt: item.closeTime || new Date(),
            },
            $push: {
              history: {
                _id: new ObjectId(),
                status: historyStatus,
                service: ServiceName.EXECUTOR_SERVICE,
                ts: new Date(),
                traceToken,
                info: {
                  message: `Auto closed due to ${reason}`,
                  closeReason: reason,
                  closedPrice: item.closedPrice,
                  pnl: item.pnl,
                  brokerOrderId: item.orderId,
                },
              },
            } as any,
          },
          session,
        );
      });

      this.logger.info(
        {
          orderId,
          reason,
          closedPrice: item.closedPrice,
          pnl: item.pnl,
          traceToken,
        },
        'Order automatically closed and synchronized with broker data',
      );
    } catch (error) {
      this.logger.error(
        { orderId, error: (error as Error).message, traceToken },
        'Failed to perform atomic update for synchronized order status',
      );
      throw error;
    }
  }

  /**
   * Map broker-normalized close reason to internal OrderHistoryStatus
   */
  private mapCloseReasonToHistoryStatus(reason?: string): OrderHistoryStatus {
    switch (reason) {
      case 'tp':
        return OrderHistoryStatus.TAKE_PROFIT;
      case 'sl':
        return OrderHistoryStatus.STOP_LOSS;
      default:
        return OrderHistoryStatus.CLOSED;
    }
  }
}
