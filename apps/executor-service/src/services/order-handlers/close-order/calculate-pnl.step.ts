import {
  IPipelineStep,
  NextFunction,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  BaseCloseExecutionState,
  ExecutionContext,
} from '../execution-context';
import { calculateOrderPnl } from './close-order.helper';

/**
 * Step to calculate the PNL for the order being closed.
 * Requires ctx.state.order and ctx.state.closeResult.
 */
export class CalculatePnlAfterCloseOrderStep implements IPipelineStep<
  ExecutionContext<BaseCloseExecutionState>
> {
  public readonly name = 'CalculatePnl';

  public async execute(
    ctx: ExecutionContext<BaseCloseExecutionState>,
    next: NextFunction,
  ): Promise<void> {
    const { order, closeResult, isOrderNotFound } = ctx.state;
    // If order not found on exchange, we can't calculate PNL accurately or don't need to
    if (!order || !closeResult || isOrderNotFound) {
      return await next();
    }

    const pnl = calculateOrderPnl(
      order,
      closeResult.closedPrice,
      closeResult.closedLots,
    );

    ctx.state.pnlValue = pnl;

    return await next();
  }
}
