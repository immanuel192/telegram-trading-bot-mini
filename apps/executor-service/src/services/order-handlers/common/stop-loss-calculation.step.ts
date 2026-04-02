import { IPipelineStep } from '@telegram-trading-bot-mini/shared/utils';
import {
  ExecutionContext,
  OpenTradeExecutionState,
} from '../execution-context';
import { StopLossCalculatorService } from '../../calculations/stop-loss-calculator.service';

/**
 * Step to calculate and adjust stop loss based on account configuration.
 * This step uses StopLossCalculatorService to:
 * - Adjust existing SL when meta.adjustEntry is true
 * - Force SL when none provided and forceStopLossByPercentage is configured
 * - Apply broker price difference adjustment
 *
 * Updates ctx.state.stopLoss and ctx.state.shouldSyncTpSl.
 */
export class StopLossCalculationStep implements IPipelineStep<
  ExecutionContext<OpenTradeExecutionState>
> {
  public readonly name = 'StopLossCalculation';
  private stopLossCalculator?: StopLossCalculatorService;

  /**
   * Initialize StopLossCalculatorService if not already done
   */
  private initStopLossCalculator(
    container: ExecutionContext<OpenTradeExecutionState>['container'],
  ) {
    if (!this.stopLossCalculator) {
      this.stopLossCalculator = new StopLossCalculatorService(container.logger);
    }
  }

  public async execute(
    ctx: ExecutionContext<OpenTradeExecutionState>,
    next: () => Promise<void>,
  ): Promise<void> {
    const { account, payload } = ctx;
    const { command, symbol, meta } = payload;

    // Initialize service if needed
    this.initStopLossCalculator(ctx.container);

    // Get current values from state
    const stopLoss = ctx.state.stopLoss;
    const entryPrice = ctx.state.entryPrice;

    ctx.state.shouldSyncTpSl = true;

    // Skip if no entry price (can't calculate SL without it)
    if (!entryPrice) {
      return await next();
    }

    // Calculate/adjust stop loss
    const slCalcResult = this.stopLossCalculator!.calculateStopLoss({
      stopLoss,
      entry: entryPrice,
      command,
      symbol,
      account,
      meta,
    });

    // Update state with calculated stop loss and adjustment tracking
    ctx.state.stopLoss = slCalcResult.result;
    ctx.state.brokerSlAdjustment = slCalcResult.brokerAdjustmentApplied;

    // Determine if we should sync TP/SL
    // Don't sync if using forced SL or if SL price is invalid (<=0)
    ctx.state.shouldSyncTpSl =
      slCalcResult.useForceStopLoss === false &&
      (slCalcResult.result?.price ?? 0) > 0;

    return await next();
  }
}
