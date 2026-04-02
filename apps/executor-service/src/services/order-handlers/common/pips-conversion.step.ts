import {
  IPipelineStep,
  CommandEnum,
} from '@telegram-trading-bot-mini/shared/utils';
import { OrderHistoryStatus, OrderSide } from '@dal';
import {
  ExecutionContext,
  BaseExecutionState,
  UpdateOrderExecutionState,
} from '../execution-context';

/**
 * Step to convert pips to prices for stop loss and take profits.
 * This step reads from ctx.state.entryPrice, stopLoss, and takeProfits,
 * performs conversions if needed, and updates the state with adjusted values.
 */
export const PipsConversionStep: IPipelineStep<
  ExecutionContext<BaseExecutionState | UpdateOrderExecutionState>
> = {
  name: 'PipsConversion',
  execute: async (ctx, next) => {
    const { account, payload, logger } = ctx;
    const { symbol, orderId, traceToken, command } = payload;

    const entryPrice = ctx.state.entryPrice;
    const stopLoss = ctx.state.stopLoss;
    const takeProfits = ctx.state.takeProfits;

    // Skip if no entry price available
    if (!entryPrice) {
      return await next();
    }

    // Get pip value with validation
    let pipValue = account.symbols?.[symbol]?.pipValue ?? 0.1;

    if (pipValue <= 0) {
      logger.error(
        { symbol, pipValue, orderId, traceToken },
        'Invalid pip value - using default 0.1',
      );
      pipValue = 0.1;
    }

    /**
     * When MOVE_SL or SET_TP_SL, we use the side from the order which has been preloaded into the state
     */
    const side =
      (ctx.state as UpdateOrderExecutionState).side ||
      (command === CommandEnum.LONG ? OrderSide.LONG : OrderSide.SHORT);

    // Common logging context to reduce repetition
    const logContext = {
      orderId,
      symbol,
      side,
      entryPrice,
      pipValue,
      traceToken,
    };

    const conversions: Array<{
      type: string;
      pips: number;
      price: number;
      pipValue: number;
      entry: number;
    }> = [];

    // Convert SL pips to price
    if (stopLoss?.pips && !stopLoss?.price) {
      const slPrice = calculatePriceFromPips(
        entryPrice,
        stopLoss.pips,
        pipValue,
        side,
        'SL',
      );

      ctx.state.stopLoss = { price: slPrice };
      conversions.push({
        type: 'SL',
        pips: stopLoss.pips,
        price: slPrice,
        pipValue,
        entry: entryPrice,
      });

      logger.info(
        {
          ...logContext,
          slPips: stopLoss.pips,
          slPrice,
        },
        'Converted SL pips to price for new order',
      );
    }

    // Convert TP pips to price
    if (takeProfits && takeProfits.length > 0) {
      ctx.state.takeProfits = takeProfits.map((tp, index) => {
        if (tp.pips && !tp.price) {
          const tpPrice = calculatePriceFromPips(
            entryPrice,
            tp.pips,
            pipValue,
            side,
            'TP',
          );

          conversions.push({
            type: `TP${index + 1}`,
            pips: tp.pips,
            price: tpPrice,
            pipValue,
            entry: entryPrice,
          });

          logger.info(
            {
              ...logContext,
              tpIndex: index,
              tpPips: tp.pips,
              tpPrice,
            },
            'Converted TP pips to price for new order',
          );

          return { price: tpPrice };
        }
        return tp;
      });
    }

    // Add history entry if any conversions were made
    if (conversions.length > 0) {
      await ctx.addOrderHistory(OrderHistoryStatus.INFO, {
        action: 'pips_to_price_conversion',
        conversions,
      });

      logger.info(
        {
          orderId,
          conversions,
          traceToken,
        },
        'Added pips conversion history entry for new order',
      );
    }

    return await next();
  },
};

/**
 * Calculate price from pips based on entry price and order side
 * Common logic for both SL and TP conversions
 *
 * @param entryPrice - Entry price of the order
 * @param pips - Number of pips
 * @param pipValue - Pip value for the symbol
 * @param side - Order side (LONG or SHORT)
 * @param type - Type of conversion (SL or TP)
 * @returns Calculated price
 */
function calculatePriceFromPips(
  entryPrice: number,
  pips: number,
  pipValue: number,
  side: OrderSide,
  type: 'SL' | 'TP',
): number {
  const distance = pips * pipValue;

  // For LONG: SL is below entry, TP is above entry
  // For SHORT: SL is above entry, TP is below entry
  if (side === OrderSide.LONG) {
    return type === 'SL' ? entryPrice - distance : entryPrice + distance;
  } else {
    return type === 'SL' ? entryPrice + distance : entryPrice - distance;
  }
}
