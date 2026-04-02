/**
 * Cancel command transformer
 * Transforms CANCEL commands to cancel pending orders
 */

import { ExecuteOrderRequestPayload } from '@telegram-trading-bot-mini/shared/utils';
import { OrderStatus } from '@dal';
import * as Sentry from '@sentry/node';
import { BaseTransformer } from './base.transformer';
import { TransformContext, TranslateMessageResultCommand } from './types';

/**
 * Transform CANCEL command
 * Fetches all PENDING orders by messageId and channelId, then creates execution payloads
 * with orderId only to indicate which pending orders should be canceled
 */
export class CancelCommandTransformer extends BaseTransformer {
  async transform(
    command: TranslateMessageResultCommand,
    context: TransformContext,
  ): Promise<ExecuteOrderRequestPayload[] | null> {
    const extraction = command.extraction;
    if (!extraction) {
      this.logValidationFailure(
        'CANCEL command missing extraction',
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
      'Processing CANCEL command - fetching pending orders',
    );

    // Find all active orders related to this message context
    const orders = await this.orderService.findActiveOrdersByMessageContext(
      context.messageId,
      context.channelId,
      false, // Don't need history
    );

    // Filter for PENDING orders only (CANCEL only applies to pending orders)
    const pendingOrders = orders.filter(
      (order) => order.status === OrderStatus.PENDING,
    );

    if (pendingOrders.length === 0) {
      this.logger?.warn(
        {
          command: command.command,
          symbol: extraction.symbol,
          messageId: context.messageId,
          channelId: context.channelId,
          totalOrders: orders.length,
        },
        'No pending orders found for CANCEL command',
      );
      return null;
    }

    // Filter by side if provided in extraction
    const filteredOrders = this.filterOrdersBySide(
      pendingOrders,
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
          totalPendingOrders: pendingOrders.length,
          messageId: context.messageId,
          channelId: context.channelId,
          traceToken: context.traceToken,
        },
        'No pending orders found matching requested side for CANCEL command',
      );
      // Capture in Sentry - this is a critical error indicating data inconsistency
      Sentry.captureException(
        new Error('CANCEL: No pending orders matching requested side'),
        {
          tags: {
            command: 'CANCEL',
            service: 'trade-manager',
          },
          extra: {
            symbol: extraction.symbol,
            requestedSide: extraction.side,
            totalPendingOrders: pendingOrders.length,
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
      'Creating CANCEL execution payloads for pending orders',
    );

    // Create one execution payload per pending order with orderId only
    const payloads: ExecuteOrderRequestPayload[] = filteredOrders.map(
      (order) => ({
        orderId: order.orderId,
        messageId: context.messageId,
        channelId: context.channelId,
        accountId: context.accountId,
        traceToken: context.traceToken,
        symbol: order.symbol,
        command: command.command,
        timestamp: Date.now(),
      }),
    );

    return payloads;
  }
}
