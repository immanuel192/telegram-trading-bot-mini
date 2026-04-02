import { IPipelineStep } from '@telegram-trading-bot-mini/shared/utils';
import {
  CancelOrderExecutionState,
  CloseAllExecutionState,
  CloseBadPositionExecutionState,
  ExecutionContext,
  UpdateOrderExecutionState,
} from '../execution-context';

type ResolvableOrderState =
  | CancelOrderExecutionState
  | CloseAllExecutionState
  | CloseBadPositionExecutionState
  | UpdateOrderExecutionState;

/**
 * Step to resolve the order from the database based on the orderId in the payload.
 * Useful for CLOSE_ALL, CANCEL, MOVE_SL, SET_TP_SL commands.
 */
export const ResolveOrderStep: IPipelineStep<
  ExecutionContext<ResolvableOrderState>
> = {
  name: 'ResolveOrder',
  execute: async (ctx, next) => {
    const { orderId } = ctx.payload;

    if (!orderId) {
      throw new Error(
        'orderId must be provided in the payload for ResolveOrderStep',
      );
    }

    const order = await ctx.container.orderRepository.findOne({ orderId });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    ctx.state.order = order;
    await next();
  },
};
