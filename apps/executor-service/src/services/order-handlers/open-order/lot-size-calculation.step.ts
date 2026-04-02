import {
  IPipelineStep,
  NextFunction,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  ExecutionContext,
  OpenTradeExecutionState,
} from '../execution-context';
import { LotSizeCalculatorService } from '../../calculations/lot-size-calculator.service';

/**
 * Step to calculate the final lot size for an order.
 * This step uses LotSizeCalculatorService to determine the appropriate lot size
 * based on risk percentage, account balance, entry price, and stop loss.
 */
export class LotSizeCalculationStep implements IPipelineStep<
  ExecutionContext<OpenTradeExecutionState>
> {
  public readonly name = 'LotSizeCalculation';
  private lotSizeCalculator?: LotSizeCalculatorService;

  /**
   * Initialize LotSizeCalculatorService if not already done
   */
  private initLotSizeCalculator(
    ctx: ExecutionContext<OpenTradeExecutionState>,
  ) {
    if (!this.lotSizeCalculator) {
      this.lotSizeCalculator = new LotSizeCalculatorService(
        ctx.container.logger,
      );
    }
  }

  public async execute(
    ctx: ExecutionContext<OpenTradeExecutionState>,
    next: NextFunction,
  ): Promise<void> {
    const { payload, account, state } = ctx;
    const { symbol, meta } = payload;
    const { entryPrice, stopLoss, leverage, balanceInfo } = state;

    this.initLotSizeCalculator(ctx);

    const calculatedLotSize = this.lotSizeCalculator!.calculateLotSize({
      lotSize: payload.lotSize || 0,
      symbol,
      account,
      accountBalanceInfo: balanceInfo,
      entry: entryPrice,
      stopLoss,
      leverage: leverage || 1,
      meta,
    });

    // Store the final calculated lot size in state
    ctx.state.lotSize = calculatedLotSize;

    ctx.logger.info(
      { lotSize: calculatedLotSize, symbol },
      'Calculated lot size for order',
    );

    return await next();
  }
}
