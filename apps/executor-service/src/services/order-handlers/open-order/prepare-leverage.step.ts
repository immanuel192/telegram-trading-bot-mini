import {
  IPipelineStep,
  NextFunction,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  ExecutionContext,
  OpenTradeExecutionState,
} from '../execution-context';
import { LeverageResolverService } from '../../calculations/leverage-resolver.service';

/**
 * Step to resolve and set leverage for the order.
 * This step uses LeverageResolverService to determine the appropriate leverage
 * and sets it on the exchange if configured.
 */
export class PrepareLeverageStep implements IPipelineStep<
  ExecutionContext<OpenTradeExecutionState>
> {
  public readonly name = 'PrepareLeverage';
  private leverageResolver?: LeverageResolverService;

  /**
   * Initialize LeverageResolverService if not already done
   */
  private initLeverageResolver(ctx: ExecutionContext<OpenTradeExecutionState>) {
    if (!this.leverageResolver) {
      this.leverageResolver = new LeverageResolverService(ctx.container.logger);
    }
  }

  public async execute(
    ctx: ExecutionContext<OpenTradeExecutionState>,
    next: NextFunction,
  ): Promise<void> {
    const { payload, account, adapter } = ctx;
    const { symbol } = payload;

    if (!adapter) {
      throw new Error('Adapter must be resolved before PrepareLeverageStep');
    }

    this.initLeverageResolver(ctx);

    // Resolve leverage for this symbol
    const resolvedLeverage = this.leverageResolver!.resolveLeverage(
      symbol,
      account,
    );

    // Store in state for later use (e.g., lot size calculation)
    ctx.state.leverage = resolvedLeverage;

    // Set leverage on exchange (if configured)
    await this.leverageResolver!.setLeverageIfNeeded(
      adapter,
      symbol,
      resolvedLeverage,
      account,
    );

    return await next();
  }
}
