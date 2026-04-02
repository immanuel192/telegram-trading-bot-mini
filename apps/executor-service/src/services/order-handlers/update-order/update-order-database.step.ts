import {
  IPipelineStep,
  NextFunction,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  UpdateOrderExecutionState,
  ExecutionContext,
} from '../execution-context';
import { OrderHistoryStatus } from '@dal';
import { ObjectId } from 'mongodb';

/**
 * Purpose: Persist the updates to MongoDB and update order history.
 */
export class UpdateOrderDatabaseStep implements IPipelineStep<
  ExecutionContext<UpdateOrderExecutionState>
> {
  public readonly name = 'UpdateOrderDatabase';

  public async execute(
    ctx: ExecutionContext<UpdateOrderExecutionState>,
    next: NextFunction,
  ): Promise<void> {
    const { state, payload, container, session } = ctx;
    const { order, updates, brokerSlAdjustment } = state;

    if (!order) return await next();
    if (!updates || updates.length === 0) return await next();

    const dbUpdate: any = {
      $push: {
        history: {
          _id: new ObjectId(),
          status: OrderHistoryStatus.UPDATE,
          service: 'executor-service',
          ts: new Date(),
          traceToken: payload.traceToken,
          messageId: payload.messageId,
          channelId: payload.channelId,
          command: payload.command,
          info: {
            updates,
            brokerSlAdjustment,
          },
        },
      },
      $set: {},
    };

    // Apply specific field updates
    updates.forEach((u) => {
      if (u.field === 'sl') {
        if (u.price) dbUpdate.$set['sl.slPrice'] = u.price;
        if (u.newOrderId) dbUpdate.$set['sl.slOrderId'] = u.newOrderId;
      } else if (u.field === 'tp1') {
        if (u.price) dbUpdate.$set['tp.tp1Price'] = u.price;
        if (u.newOrderId) dbUpdate.$set['tp.tp1OrderId'] = u.newOrderId;
      }
    });

    const tiersToPersist = state.normalisedTakeProfits;

    if (tiersToPersist && tiersToPersist.length > 0) {
      dbUpdate.$set['meta.takeProfitTiers'] = tiersToPersist
        .filter((tp) => tp.price)
        .map((tp) => ({
          price: tp.price!,
          isUsed: (tp as any).isUsed || false, // Reset used status on update unless overridden
        }));
    }

    await container.orderRepository.updateOne(
      { orderId: order.orderId },
      dbUpdate,
      session,
    );

    return await next();
  }
}
