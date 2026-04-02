/**
 * Purpose: Cancel orders on the broker
 * Core Flow: Iterates through orderIdsToCancel → sends cancel requests to broker → tracks successful cancellations
 */

import {
  IPipelineStep,
  NextFunction,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  CancelOrderExecutionState,
  ExecutionContext,
} from '../execution-context';

/**
 * Step to cancel orders from the list fetched in the previous step.
 * This step:
 * 1. Iterates through the orderIdsToCancel list
 * 2. Sends cancel requests to the broker for each order
 * 3. Tracks successful cancellations and emits metrics
 */
export class CancelOrdersStep implements IPipelineStep<
  ExecutionContext<CancelOrderExecutionState>
> {
  public readonly name = 'CancelOrders';

  public async execute(
    ctx: ExecutionContext<CancelOrderExecutionState>,
    next: NextFunction,
  ): Promise<void> {
    const { orderIdsToCancel } = ctx.state;
    const { symbol, traceToken, orderId } = ctx.payload;

    if (!ctx.adapter) {
      throw new Error('Adapter not found in context');
    }

    // Skip if no orders to cancel
    if (!orderIdsToCancel || orderIdsToCancel.length === 0) {
      ctx.logger.info(
        { orderId, symbol },
        'No orders to cancel - skipping cancel step',
      );
      ctx.state.canceledOrderIds = [];
      await next();
      return;
    }

    const startTime = Date.now();
    const canceledIds: string[] = [];

    try {
      // Cancel all orders in parallel
      const results = await Promise.allSettled(
        orderIdsToCancel.map(async (id) => {
          try {
            await ctx.adapter!.cancelOrder({
              orderId: id,
              symbol,
              traceToken,
            });
            canceledIds.push(id);
            return { id, success: true };
          } catch (error) {
            ctx.logger.error(
              {
                orderId,
                cancelOrderId: id,
                symbol,
                traceToken,
                error,
              },
              `Failed to cancel order ${id}`,
            );
            return { id, success: false, error };
          }
        }),
      );

      // Log summary
      const successCount = results.filter(
        (r) => r.status === 'fulfilled' && r.value.success,
      ).length;
      const failureCount = results.length - successCount;

      ctx.logger.info(
        {
          orderId,
          symbol,
          totalOrders: orderIdsToCancel.length,
          successCount,
          failureCount,
          canceledIds,
        },
        'Completed cancel orders operation',
      );

      // Store canceled IDs in context
      ctx.state.canceledOrderIds = canceledIds;

      // Emit success metric
      ctx.adapter.emitMetric(
        'cancelOrder',
        Date.now() - startTime,
        symbol,
        'success',
      );
    } catch (error) {
      // Emit error metric
      ctx.adapter.emitMetric(
        'cancelOrder',
        Date.now() - startTime,
        symbol,
        'error',
      );
      throw error;
    }

    await next();
  }
}
