import {
  IPipelineStep,
  NextFunction,
  CommandEnum,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  ExecutionContext,
  BaseCloseExecutionState,
} from '../execution-context';

/**
 * Purpose: Atomically mark the NEXT unused TP tier as used in MongoDB.
 * Inputs: orderId, and successful broker close result.
 * Outputs: Updated order in database and in-memory state.
 * Core Flow:
 * 1. Checks if the current command is CLOSE_PARTIAL and execution was successful.
 * 2. Uses MongoDB positional operator ($) to find the FIRST tier where isUsed !== true.
 * 3. Atomically marks that tier as true in DB.
 * 4. Re-fetches the order from DB to ensure in-memory state is perfectly in sync.
 */
export class UpdateTpTierStatusStep implements IPipelineStep<
  ExecutionContext<BaseCloseExecutionState>
> {
  public readonly name = 'UpdateTpTierStatus';

  public async execute(
    ctx: ExecutionContext<BaseCloseExecutionState>,
    next: NextFunction,
  ): Promise<void> {
    const { closeResult, error, isOrderNotFound } = ctx.state;
    const { orderId, command } = ctx.payload;

    // Only applicable for CLOSE_PARTIAL command with successful execution
    if (
      command !== CommandEnum.CLOSE_PARTIAL ||
      error ||
      isOrderNotFound ||
      !closeResult
    ) {
      return await next();
    }

    ctx.logger.info({ orderId }, 'Marking next available TP tier as used');

    // 1. Update Database: find first where isUsed is not true and set it to true
    // Use $or to match both undefined and false values (MongoDB doesn't match undefined with $ne)
    await ctx.container.orderRepository.updateOne(
      {
        orderId: orderId as any,
        'meta.takeProfitTiers': {
          $elemMatch: {
            $or: [{ isUsed: { $exists: false } }, { isUsed: false }],
          },
        },
      },
      {
        $set: { 'meta.takeProfitTiers.$.isUsed': true } as any,
      },
      ctx.session,
    );

    // 2. Synchronize In-Memory State:
    // Re-fetch the order to ensure the source of truth is kept in sync
    const updatedOrder =
      await ctx.container.orderRepository.findByOrderId(orderId);
    if (updatedOrder) {
      ctx.state.order = updatedOrder;
    }

    return await next();
  }
}
