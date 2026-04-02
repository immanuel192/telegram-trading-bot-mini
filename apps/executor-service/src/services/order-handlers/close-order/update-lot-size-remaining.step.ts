import {
  IPipelineStep,
  NextFunction,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  ExecutionContext,
  BaseCloseExecutionState,
} from '../execution-context';

/**
 * Step to update the remaining lot size in the database after a successful broker closure.
 * This ensures lotSizeRemaining stays accurate for future partial/full closures.
 */
export class UpdateLotSizeRemainingStep implements IPipelineStep<
  ExecutionContext<BaseCloseExecutionState>
> {
  public readonly name = 'UpdateLotSizeRemaining';

  public async execute(
    ctx: ExecutionContext<BaseCloseExecutionState>,
    next: NextFunction,
  ): Promise<void> {
    const { closeResult, error, isOrderNotFound, order } = ctx.state;
    const { orderId } = ctx.payload;

    // Only update if the broker successfully closed some units
    if (error || isOrderNotFound || !closeResult) {
      return await next();
    }

    // Calculate what remains AFTER this decrement
    const initialRemaining = order?.lotSizeRemaining ?? order?.lotSize ?? 0;
    const closedLots = closeResult.closedLots;
    const finalRemaining = Math.max(0, initialRemaining - closedLots);

    // If practically zero, mark as full close (using local calculation for immediate flag)
    if (finalRemaining < 0.00001) {
      ctx.state.isFullClose = true;
    }

    ctx.logger.info(
      {
        orderId,
        closedLots,
        finalRemaining,
        isFullClose: ctx.state.isFullClose,
      },
      'Updating lotSizeRemaining',
    );

    // 1. Atomically decrement the remaining lot size in DB
    await ctx.container.orderRepository.updateOne(
      { orderId } as any,
      {
        $inc: { lotSizeRemaining: -closedLots } as any,
      },
      ctx.session,
    );

    // Note: In-memory synchronization is handled in UpdateTpTierStatusStep

    return await next();
  }
}
