import {
  IPipelineStep,
  NextFunction,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  ExecutionContext,
  UpdateOrderExecutionState,
} from '../execution-context';

/**
 * Purpose: Load actual entry price and side from the fetched order into pipeline state.
 * Why: This "primes" the state so that common calculation steps (like PipsConversion)
 * can use the correct order data.
 */
export const LoadOrderParamsToStateStep: IPipelineStep<
  ExecutionContext<UpdateOrderExecutionState>
> = {
  name: 'LoadOrderParamsToState',
  execute: async (ctx, next: NextFunction) => {
    const { state, logger } = ctx;

    if (!state.order) {
      logger.warn('Order not found in state, skipping LoadOrderParamsToState');
      return await next();
    }

    const { entry, side } = state.order;

    // Use actualEntryPrice if available, fallback to entryPrice
    const entryPrice = entry?.actualEntryPrice || entry?.entryPrice;

    if (entryPrice) {
      ctx.state.entryPrice = entryPrice;
    }

    if (side) {
      ctx.state.side = side;
    }

    return await next();
  },
};
