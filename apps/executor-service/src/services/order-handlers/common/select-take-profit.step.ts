import { IPipelineStep } from '@telegram-trading-bot-mini/shared/utils';
import {
  ExecutionContext,
  OpenTradeExecutionState,
  UpdateOrderExecutionState,
} from '../execution-context';
import { TakeProfitSelectorService } from '../../calculations/take-profit-selector.service';

/**
 * Step to select appropriate take profit levels based on account configuration.
 * This step uses TakeProfitSelectorService to filter, sort, and select TPs,
 * then updates ctx.state.takeProfits with the selected values.
 */
export class SelectTakeProfitStep implements IPipelineStep<
  ExecutionContext<OpenTradeExecutionState | UpdateOrderExecutionState>
> {
  public readonly name = 'SelectTakeProfit';
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
    const { account } = ctx;

    // Initialize service if needed
    this.initTakeProfitSelector(ctx.container);

    // Get normalised take profits from state
    const normalisedTPs = ctx.state.normalisedTakeProfits;

    // If this is a linked-order-sync with an explicit price, we skip selection from tiers
    // to protect the optimized price from being overwritten by the primary tier.
    if (
      ctx.payload.meta?.executionInstructions?.skipLinkedOrderSync === true &&
      ctx.payload.takeProfits &&
      ctx.payload.takeProfits.length > 0 &&
      ctx.payload.takeProfits[0].price !== undefined
    ) {
      ctx.logger.debug(
        { price: ctx.payload.takeProfits[0].price },
        'Linked order sync with explicit price: skipping selection from tiers',
      );
      ctx.state.takeProfits = ctx.payload.takeProfits;
      return await next();
    }

    // Select appropriate take profit based on account configuration
    // We reverse the array because normalisedTPs are now sorted "least profitable first" (natural order)
    // but selectTakeProfit expects "most profitable first" for index-based selection
    const selectedTakeProfit = await this.takeProfitSelector!.selectTakeProfit(
      normalisedTPs ? [...normalisedTPs].reverse() : undefined,
      account,
    );

    // Update state with selected take profit (the ones to send to broker)
    ctx.state.takeProfits = selectedTakeProfit;

    return await next();
  }
}
