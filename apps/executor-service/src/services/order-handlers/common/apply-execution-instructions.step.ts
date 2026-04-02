import {
  IPipelineStep,
  NextFunction,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  ExecutionContext,
  OpenTradeExecutionState,
  UpdateOrderExecutionState,
} from '../execution-context';

/**
 * Step to apply execution instructions from payload to state.
 * Currently handles takeProfitTiers override for linked order synchronization.
 */
export class ApplyExecutionInstructionsStep implements IPipelineStep<
  ExecutionContext<OpenTradeExecutionState | UpdateOrderExecutionState>
> {
  public readonly name = 'ApplyExecutionInstructions';

  public async execute(
    ctx: ExecutionContext<OpenTradeExecutionState | UpdateOrderExecutionState>,
    next: NextFunction,
  ): Promise<void> {
    const { payload, state } = ctx;
    const instructions = payload.meta?.executionInstructions;

    if (
      instructions?.takeProfitTiers &&
      instructions.takeProfitTiers.length > 0
    ) {
      ctx.logger.info(
        { tierCount: instructions.takeProfitTiers.length },
        'Applying takeProfitTiers override from execution instructions',
      );
      state.normalisedTakeProfits = instructions.takeProfitTiers;
    }

    return await next();
  }
}
