import { IPipelineStep } from '@telegram-trading-bot-mini/shared/utils';
import {
  ExecutionContext,
  OpenTradeExecutionState,
  UpdateOrderExecutionState,
} from '../execution-context';
import { TakeProfitSelectorService } from '../../calculations/take-profit-selector.service';

/**
 * Step to normalise take profit levels (filtering and sorting).
 * This step uses TakeProfitSelectorService to normalise TPs from state,
 * and stores the result in ctx.state.normalisedTakeProfits.
 */
export class NormaliseTakeProfitStep implements IPipelineStep<
  ExecutionContext<OpenTradeExecutionState | UpdateOrderExecutionState>
> {
  public readonly name = 'NormaliseTakeProfit';
  private takeProfitSelector?: TakeProfitSelectorService;

  /**
   * Initialize TakeProfitSelectorService if not already done
   */
  private initTakeProfitSelector(
    container: ExecutionContext<
      OpenTradeExecutionState | UpdateOrderExecutionState
    >['container'],
  ) {
    if (!this.takeProfitSelector) {
      this.takeProfitSelector = new TakeProfitSelectorService(container.logger);
    }
  }

  public async execute(
    ctx: ExecutionContext<OpenTradeExecutionState | UpdateOrderExecutionState>,
    next: () => Promise<void>,
  ): Promise<void> {
    const { payload } = ctx;
    const { command } = payload;

    // Initialize service if needed
    this.initTakeProfitSelector(ctx.container);

    // Get current take profits from state (payload or pips-converted)
    const takeProfits = ctx.state.takeProfits;

    // Normalise take profits (filter and sort)
    const side = (ctx.state as UpdateOrderExecutionState).side || undefined;
    const normalised = await this.takeProfitSelector!.normaliseTakeProfits(
      takeProfits,
      command,
      side,
    );

    // Store in state for monitoring and selection
    ctx.state.normalisedTakeProfits = normalised;

    return await next();
  }
}
