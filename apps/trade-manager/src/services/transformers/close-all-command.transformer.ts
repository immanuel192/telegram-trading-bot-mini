/**
 * Close All command transformer
 * Transforms CLOSE_ALL commands to close all active orders
 */

import { ExecuteOrderRequestPayload } from '@telegram-trading-bot-mini/shared/utils';
import * as Sentry from '@sentry/node';
import { BaseTransformer } from './base.transformer';
import { TransformContext, TranslateMessageResultCommand } from './types';

/**
 * Transform CLOSE_ALL command
 * Fetches all active orders by messageId and channelId, then creates execution payloads
 * with orderId only to indicate which orders should be closed
 */
export class CloseAllCommandTransformer extends BaseTransformer {
  async transform(
    command: TranslateMessageResultCommand,
    context: TransformContext,
  ): Promise<ExecuteOrderRequestPayload[] | null> {
    const extraction = command.extraction;
    if (!extraction) {
      this.logValidationFailure(
        'CLOSE_ALL command missing extraction',
        command.command,
        context,
      );
      return null;
    }

    if (!extraction.symbol || extraction.symbol.trim() === '') {
      this.logValidationFailure(
        'Missing or empty symbol',
        command.command,
        context,
      );
      return null;
    }

    this.logger?.debug(
      {
        command: command.command,
        symbol: extraction.symbol,
        messageId: context.messageId,
        channelId: context.channelId,
      },
      'Processing CLOSE_ALL command - fetching active orders',
    );

    // Find all active orders related to this message context
    const orders = await this.orderService.findActiveOrdersByMessageContext(
      context.messageId,
      context.channelId,
      false, // Don't need history
    );

    if (orders.length === 0) {
      this.logger?.warn(
        {
          command: command.command,
          symbol: extraction.symbol,
          messageId: context.messageId,
          channelId: context.channelId,
        },
        'No active orders found for CLOSE_ALL command',
      );
      return null;
    }

    // Filter by side if provided in extraction
    const filteredOrders = this.filterOrdersBySide(
      orders,
      extraction.side,
      command.command,
      context,
    );

    if (filteredOrders.length === 0) {
      this.logger?.error(
        {
          command: command.command,
          symbol: extraction.symbol,
          requestedSide: extraction.side,
          totalOrders: orders.length,
          messageId: context.messageId,
          channelId: context.channelId,
          traceToken: context.traceToken,
        },
        'No orders found matching requested side for CLOSE_ALL command',
      );
      // Capture in Sentry - this is a critical error indicating data inconsistency
      Sentry.captureException(
        new Error('CLOSE_ALL: No orders matching requested side'),
        {
          tags: {
            command: 'CLOSE_ALL',
            service: 'trade-manager',
          },
          extra: {
            symbol: extraction.symbol,
            requestedSide: extraction.side,
            totalOrders: orders.length,
            messageId: context.messageId,
            channelId: context.channelId,
            traceToken: context.traceToken,
          },
        },
      );
      return null;
    }

    this.logger?.info(
      {
        command: command.command,
        symbol: extraction.symbol,
        orderCount: filteredOrders.length,
        orderIds: filteredOrders.map((o) => o.orderId),
      },
      'Creating CLOSE_ALL execution payloads for active orders',
    );

    // Create one execution payload per order with orderId only
    const payloads: ExecuteOrderRequestPayload[] = filteredOrders.map(
      (order) => ({
        orderId: order.orderId,
        messageId: context.messageId,
        channelId: context.channelId,
        accountId: context.accountId,
        traceToken: context.traceToken,
        symbol: order.symbol,
        /**
         * As we use the same command CLOSE_ALL, the executor-service should determine the order status (OPEN or PENDING) to find the best way to handle the order
         */
        command: command.command,
        timestamp: Date.now(),
      }),
    );

    return payloads;
  }
}
