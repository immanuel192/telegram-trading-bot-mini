import {
  IPipelineStep,
  NextFunction,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  ExecutionContext,
  BaseCloseExecutionState,
} from '../execution-context';

/**
 * Step to force a full close by clearing the lotSize from the payload.
 * This ensures that commands like CLOSE_ALL and CLOSE_BAD_POSITION
 * always close the entire position, even if a lotSize was accidentally provided.
 */
export class ForceFullCloseStep implements IPipelineStep<
  ExecutionContext<BaseCloseExecutionState>
> {
  public readonly name = 'ForceFullClose';

  public async execute(
    ctx: ExecutionContext<BaseCloseExecutionState>,
    next: NextFunction,
  ): Promise<void> {
    if (ctx.payload.lotSize !== undefined) {
      ctx.logger.info(
        { originalLotSize: ctx.payload.lotSize },
        'Clearing lotSize from payload to force full close',
      );
      delete ctx.payload.lotSize;
    }

    return await next();
  }
}
