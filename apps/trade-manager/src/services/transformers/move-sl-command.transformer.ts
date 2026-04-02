/**
 * Move SL command transformer
 * Transforms MOVE_SL commands to move stop loss to breakeven
 */

import { ExecuteOrderRequestPayload } from '@telegram-trading-bot-mini/shared/utils';
import { BaseTransformer } from './base.transformer';
import { TransformContext, TranslateMessageResultCommand } from './types';

/**
 * Transform MOVE_SL command
 * Finds orders by message context and creates SL move requests for each
 *
 * The SL is calculated to move to breakeven (entry price) adjusted by delta:
 * - LONG: SL = entry + delta (move SL up to lock in profit)
 * - SHORT: SL = entry - delta (move SL down to lock in profit)
 */
export class MoveSLCommandTransformer extends BaseTransformer {
  async transform(
    command: TranslateMessageResultCommand,
    context: TransformContext,
  ): Promise<ExecuteOrderRequestPayload[] | null> {
    // Find all orders related to this message context
    const orders = await this.orderService.findActiveOrdersByMessageContext(
      context.messageId,
      context.channelId,
      false, // Don't need history
    );

    if (orders.length === 0) {
      this.logger?.info(
        {
          messageId: context.messageId,
          channelId: context.channelId,
          traceToken: context.traceToken,
        },
        'MOVE_SL: No orders found for message context',
      );
      return null;
    }

    this.logger?.info(
      {
        messageId: context.messageId,
        channelId: context.channelId,
        orderCount: orders.length,
        traceToken: context.traceToken,
      },
      'MOVE_SL: Found orders for message context',
    );

    // Get delta from symbol config, default to 0
    const delta = context.symbolConfig?.pickBestEntryFromZoneDelta ?? 0;

    // Create MOVE_SL payload for each order, filtering out orders without valid entry
    const payloads: ExecuteOrderRequestPayload[] = [];

    for (const order of orders) {
      // Use actualEntryPrice if available, otherwise use entryPrice
      const entryPrice =
        order.entry?.actualEntryPrice || order.entry?.entryPrice;

      // Skip orders without valid entry price
      if (!entryPrice || entryPrice === 0) {
        this.logger?.warn(
          {
            orderId: order.orderId,
            symbol: order.symbol,
            traceToken: context.traceToken,
          },
          'MOVE_SL: Skipping order without valid entry price',
        );
        continue;
      }

      // Calculate breakeven SL based on side
      let stopLossPrice: number;

      if (order.side === 'LONG') {
        // LONG: move SL up to entry + delta
        stopLossPrice = entryPrice + delta;
      } else {
        // SHORT: move SL down to entry - delta
        stopLossPrice = entryPrice - delta;
      }

      this.logger?.debug(
        {
          orderId: order.orderId,
          side: order.side,
          entryPrice,
          delta,
          calculatedSL: stopLossPrice,
          traceToken: context.traceToken,
        },
        'MOVE_SL: Calculated breakeven SL',
      );

      payloads.push({
        orderId: order.orderId, // Use existing order ID
        messageId: context.messageId,
        channelId: context.channelId,
        accountId: context.accountId,
        traceToken: context.traceToken,
        symbol: order.symbol,
        command: command.command,
        stopLoss: { price: stopLossPrice },
        timestamp: Date.now(),
      });
    }

    // Return null if no valid payloads after filtering
    if (payloads.length === 0) {
      this.logger?.warn(
        {
          messageId: context.messageId,
          channelId: context.channelId,
          traceToken: context.traceToken,
        },
        'MOVE_SL: No valid orders with entry prices found',
      );
      return null;
    }

    return payloads;
  }
}
