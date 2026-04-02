import {
  IPipelineStep,
  NextFunction,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  ExecutionContext,
  BaseCloseExecutionState,
} from '../execution-context';
import { OrderHistoryStatus } from '@dal';

/**
 * Step to validate the partial close amount against the remaining lot size.
 * Safety check to avoid over-closure race conditions.
 */
export class ValidateClosePartialStep implements IPipelineStep<
  ExecutionContext<BaseCloseExecutionState>
> {
  public readonly name = 'ValidateClosePartial';

  public async execute(
    ctx: ExecutionContext<BaseCloseExecutionState>,
    next: NextFunction,
  ): Promise<void> {
    const { order } = ctx.state;
    const { lotSize } = ctx.payload;

    if (!order) {
      throw new Error('Order must be resolved before ValidateClosePartialStep');
    }

    const lotSizeRemaining = order.lotSizeRemaining ?? order.lotSize;

    if (lotSizeRemaining <= 0) {
      ctx.logger.warn({ orderId: order.orderId }, 'Order already fully closed');
      // We can either return (skip closure) or throw.
      // Returning is safer for preventing duplicate close errors.
      return;
    }

    if (lotSize && lotSize > lotSizeRemaining) {
      ctx.logger.warn(
        {
          orderId: order.orderId,
          requested: lotSize,
          remaining: lotSizeRemaining,
        },
        'Requested partial close amount exceeds remaining lot size. Capping.',
      );

      // Cap the amount to what is actually left
      ctx.payload.lotSize = lotSizeRemaining;

      // Log to history that we capped it
      await ctx.addOrderHistory(OrderHistoryStatus.INFO, {
        reason: 'Partial close amount capped to lotSizeRemaining',
        originalRequested: lotSize,
        cappedTo: lotSizeRemaining,
      });
    }

    return await next();
  }
}
