import {
  IPipelineStep,
  NextFunction,
} from '@telegram-trading-bot-mini/shared/utils';
import { ExecutionContext, BaseExecutionState } from '../execution-context';

/**
 * Step to set default order parameters from the event payload into execution state.
 * This ensures the state is initialized with entry, stopLoss, and takeProfits
 * before other steps potentially modify them.
 */
export const SetDefaultOrderParamsStep: IPipelineStep<
  ExecutionContext<BaseExecutionState>
> = {
  name: 'SetDefaultOrderParams',
  execute: async (ctx, next) => {
    const { entry, stopLoss, takeProfits } = ctx.payload;

    // Initialize state with payload values
    ctx.state.entryPrice = entry;
    ctx.state.stopLoss = stopLoss;
    ctx.state.takeProfits = takeProfits;

    return await next();
  },
};
