import {
  IPipelineStep,
  NextFunction,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  UpdateOrderExecutionState,
  ExecutionContext,
} from '../execution-context';
import { StopLossCalculatorService } from '../../calculations/stop-loss-calculator.service';

/**
 * Purpose: Compare requested TP/SL with existing ones and prepare update flags.
 * Includes: Applying broker SL adjustment.
 */
export class CalculateUpdateStep implements IPipelineStep<
  ExecutionContext<UpdateOrderExecutionState>
> {
  public readonly name = 'CalculateUpdate';

  public async execute(
    ctx: ExecutionContext<UpdateOrderExecutionState>,
    next: NextFunction,
  ): Promise<void> {
    const { state, account, payload, logger } = ctx;
    const { order } = state;

    if (!order) {
      throw new Error('Order not found in state for CalculateUpdateStep');
    }

    if (!order.entry?.entryOrderId) {
      throw new Error(`Order ${order.orderId} does not have an entry order ID`);
    }

    // Initialize updates array
    ctx.state.updates = [];

    // --- Stop Loss Calculation ---
    if (state.stopLoss?.price) {
      let finalSlPrice = state.stopLoss.price;

      // Apply broker adjustment if not skipped
      if (!payload.meta?.executionInstructions?.skipBrokerPriceAdjustment) {
        const entry = state.entryPrice;
        if (entry) {
          const stopLossCalculator = new StopLossCalculatorService(logger);
          const adjustment = stopLossCalculator.applyBrokerPriceAdjustment({
            stopLoss: { price: finalSlPrice },
            entry,
            side: order.side,
            symbol: payload.symbol,
            account,
          });

          if (adjustment.adjusted) {
            finalSlPrice = adjustment.adjusted.price!;
            ctx.state.brokerSlAdjustment = adjustment.adjustmentInfo;
          }
        }
      }

      // Check if SL update is actually needed
      if (order.sl?.slPrice === finalSlPrice) {
        logger.info(
          { orderId: order.orderId, price: finalSlPrice },
          'Stop Loss price is identical, skipping SL update',
        );
      } else {
        ctx.state.shouldUpdateSl = true;
        ctx.state.stopLoss.price = finalSlPrice; // Update state with final adjusted price
      }
    }

    // --- Take Profit Calculation ---
    if (
      state.takeProfits &&
      state.takeProfits.length > 0 &&
      state.takeProfits[0].price
    ) {
      const targetTpPrice = state.takeProfits[0].price;

      if (order.tp?.tp1Price === targetTpPrice) {
        logger.info(
          { orderId: order.orderId, price: targetTpPrice },
          'Take Profit price is identical, skipping TP update',
        );
      } else {
        ctx.state.shouldUpdateTp = true;
      }
    }

    return await next();
  }
}
