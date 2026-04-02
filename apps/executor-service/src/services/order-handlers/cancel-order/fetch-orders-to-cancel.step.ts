/**
 * Purpose: Fetch list of order IDs to cancel from the broker
 * Core Flow: Collects potential order IDs → fetches pending orders from exchange → filters to only existing orders
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
 * Step to fetch the list of orders to cancel from the broker adapter.
 * This step:
 * 1. Collects all potential order IDs (entry, SL, TP1, TP2, TP3)
 * 2. Fetches actual pending orders from the exchange
 * 3. Filters to only include orders that exist on the exchange
 */
export class FetchOrdersToCancelStep implements IPipelineStep<
  ExecutionContext<CancelOrderExecutionState>
> {
  public readonly name = 'FetchOrdersToCancel';

  public async execute(
    ctx: ExecutionContext<CancelOrderExecutionState>,
    next: NextFunction,
  ): Promise<void> {
    const { order } = ctx.state;
    const { symbol } = ctx.payload;

    if (!order) {
      throw new Error('Order not found in context state');
    }

    if (!ctx.adapter) {
      throw new Error('Adapter not found in context');
    }

    // Collect all potential order IDs to cancel
    const potentialOrderIds = [
      order.entry?.entryOrderId,
      order.sl?.slOrderId,
      order.tp?.tp1OrderId,
      order.tp?.tp2OrderId,
      order.tp?.tp3OrderId,
    ].filter((id): id is string => !!id);

    // Fetch actual pending orders from exchange
    const pendingOrders = await ctx.adapter.fetchOpenOrders(symbol);
    const pendingOrderIds = new Set(pendingOrders.map((o) => o.id));

    // Filter to only cancel orders that actually exist on the exchange
    const ordersToCancel = potentialOrderIds.filter((id) =>
      pendingOrderIds.has(id),
    );

    ctx.logger.info(
      {
        orderId: ctx.payload.orderId,
        symbol,
        potentialOrderIds,
        pendingOrderIds: Array.from(pendingOrderIds),
        ordersToCancel,
      },
      'Fetched orders to cancel',
    );

    // Store in context state
    ctx.state.orderIdsToCancel = ordersToCancel;

    await next();
  }
}
