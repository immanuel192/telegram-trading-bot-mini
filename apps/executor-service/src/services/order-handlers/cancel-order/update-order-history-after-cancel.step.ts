/**
 * Purpose: Update order history and status after cancellation
 * Core Flow: Updates database with cancellation results → marks order as CANCELED → adds history entry
 */

import {
  IPipelineStep,
  NextFunction,
  ExecuteOrderResultType,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  CancelOrderExecutionState,
  ExecutionContext,
} from '../execution-context';
import { OrderHistoryStatus, OrderStatus } from '@dal';
import { ObjectId } from 'mongodb';

/**
 * Step to update the order in the database after cancellation.
 * This step:
 * 1. Adds a history entry with cancellation details
 * 2. Updates the order status to CANCELED
 * 3. Sets the closedAt timestamp
 */
export class UpdateOrderHistoryAfterCancelStep implements IPipelineStep<
  ExecutionContext<CancelOrderExecutionState>
> {
  public readonly name = 'UpdateOrderHistoryAfterCancel';

  public async execute(
    ctx: ExecutionContext<CancelOrderExecutionState>,
    next: NextFunction,
  ): Promise<void> {
    const { order, orderIdsToCancel, canceledOrderIds } = ctx.state;
    const { orderId, messageId, channelId, command, traceToken } = ctx.payload;

    if (!order) {
      throw new Error('Order not found in context state');
    }

    const orderRepository = ctx.container.orderRepository;

    // Update Order.history and status
    await orderRepository.updateOne(
      { orderId },
      {
        $push: {
          history: {
            _id: new ObjectId(),
            status: OrderHistoryStatus.CANCELED,
            service: 'executor-service',
            ts: new Date(),
            traceToken,
            messageId,
            channelId,
            command,
            info: {
              requestedCancelOrderIds: orderIdsToCancel || [],
              actuallyCanceledOrderIds: canceledOrderIds || [],
            },
          },
        } as any,
        $set: {
          status: OrderStatus.CANCELED,
          closedAt: new Date(),
        },
      },
      ctx.session,
    );

    ctx.logger.info(
      {
        orderId,
        requestedCount: orderIdsToCancel?.length || 0,
        canceledCount: canceledOrderIds?.length || 0,
      },
      'Updated order history after cancellation',
    );

    // Set success result for publishing
    ctx.result = {
      orderId: ctx.payload.orderId,
      accountId: ctx.payload.accountId,
      traceToken: ctx.payload.traceToken,
      messageId: ctx.payload.messageId,
      channelId: ctx.payload.channelId,
      success: true,
      symbol: ctx.payload.symbol,
      type: ExecuteOrderResultType.OTHERS,
    };

    await next();
  }
}
