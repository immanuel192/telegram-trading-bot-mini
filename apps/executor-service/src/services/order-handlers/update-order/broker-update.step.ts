import {
  IPipelineStep,
  NextFunction,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  UpdateOrderExecutionState,
  ExecutionContext,
} from '../execution-context';

/**
 * Purpose: Execute cancellations and replacements on the broker.
 */
export class BrokerUpdateStep implements IPipelineStep<
  ExecutionContext<UpdateOrderExecutionState>
> {
  public readonly name = 'BrokerUpdate';

  public async execute(
    ctx: ExecutionContext<UpdateOrderExecutionState>,
    next: NextFunction,
  ): Promise<void> {
    const { adapter, state, payload, logger } = ctx;
    const { order } = state;

    if (!adapter) throw new Error('Adapter not resolved');
    if (!order) throw new Error('Order not found in state');

    const traceToken = payload.traceToken;
    const symbol = payload.symbol;

    // --- Execute Stop Loss Update ---
    if (state.shouldUpdateSl && state.stopLoss?.price) {
      const startTime = Date.now();
      try {
        // 1. Cancel existing SL
        if (order.sl?.slOrderId) {
          await adapter
            .cancelOrder({
              orderId: order.sl.slOrderId,
              symbol,
              traceToken,
            })
            .catch((err) => {
              logger.warn(
                { orderId: order.orderId, slOrderId: order.sl?.slOrderId, err },
                'Failed to cancel old SL order',
              );
            });
        }

        // 2. Place new SL
        const result = await adapter.setStopLoss({
          orderId: order.entry!.entryOrderId!,
          symbol,
          price: state.stopLoss.price,
          traceToken,
        });

        ctx.state.newSlOrderId = result.slOrderId;
        ctx.state.updates?.push({
          field: 'sl',
          oldOrderId: order.sl?.slOrderId,
          newOrderId: result.slOrderId,
          price: state.stopLoss.price,
        });

        adapter.emitMetric(
          'setStopLoss',
          Date.now() - startTime,
          symbol,
          'success',
        );
      } catch (error) {
        adapter.emitMetric(
          'setStopLoss',
          Date.now() - startTime,
          symbol,
          'error',
        );
        throw error;
      }
    }

    // --- Execute Take Profit Update ---
    if (state.shouldUpdateTp && state.takeProfits?.[0]?.price) {
      const startTime = Date.now();
      const tpPrice = state.takeProfits[0].price;
      try {
        // 1. Cancel existing TP1
        if (order.tp?.tp1OrderId) {
          await adapter
            .cancelOrder({
              orderId: order.tp.tp1OrderId,
              symbol,
              traceToken,
            })
            .catch((err) => {
              logger.warn(
                {
                  orderId: order.orderId,
                  tp1OrderId: order.tp?.tp1OrderId,
                  err,
                },
                'Failed to cancel old TP1 order',
              );
            });
        }

        // 2. Place new TP1
        const result = await adapter.setTakeProfit({
          orderId: order.entry!.entryOrderId!,
          symbol,
          price: tpPrice,
          traceToken,
        });

        ctx.state.newTp1OrderId = result.tpOrderId;
        ctx.state.updates?.push({
          field: 'tp1',
          oldOrderId: order.tp?.tp1OrderId,
          newOrderId: result.tpOrderId,
          price: tpPrice,
        });

        adapter.emitMetric(
          'setTakeProfit',
          Date.now() - startTime,
          symbol,
          'success',
        );
      } catch (error) {
        adapter.emitMetric(
          'setTakeProfit',
          Date.now() - startTime,
          symbol,
          'error',
        );
        throw error;
      }
    }

    return await next();
  }
}
