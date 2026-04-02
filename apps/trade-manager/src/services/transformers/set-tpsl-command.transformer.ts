/**
 * Set TP/SL command transformer
 * Transforms SET_TP_SL commands to update take profit and stop loss
 */

import {
  CommandSide,
  ExecuteOrderRequestPayload,
} from '@telegram-trading-bot-mini/shared/utils';
import { Order, OrderSide } from '@dal';
import { BaseTransformer } from './base.transformer';
import { TransformContext, TranslateMessageResultCommand } from './types';

/**
 * Transform SET_TP_SL command
 * Finds orders by message context and creates SET_TP_SL requests for each
 *
 * This command updates TP/SL for existing orders related to the message context.
 *
 * Validation Rules:
 * - Stop Loss (price): Allows positive SL, but enforces one-way movement
 *   - LONG: new SL >= existing SL (can only move up)
 *   - SHORT: new SL <= existing SL (can only move down)
 * - Stop Loss (pips): Only allowed when order has no SL yet
 * - Take Profit (price): Must be in profit direction (validated against entry)
 * - Take Profit (pips): Only allowed when order has no TP yet
 */
export class SetTPSLCommandTransformer extends BaseTransformer {
  async transform(
    command: TranslateMessageResultCommand,
    context: TransformContext,
  ): Promise<ExecuteOrderRequestPayload[] | null> {
    const extraction = command.extraction;
    if (!extraction) {
      this.logValidationFailure(
        'SET_TP_SL command missing extraction',
        command.command,
        context,
      );
      return null;
    }

    // Validate that at least stopLoss or takeProfits is provided
    if (!extraction.stopLoss && !extraction.takeProfits) {
      this.logValidationFailure(
        'SET_TP_SL requires at least stopLoss or takeProfits',
        command.command,
        context,
      );
      return null;
    }

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
        'SET_TP_SL: No orders found for message context',
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
      'SET_TP_SL: Found orders for message context',
    );

    // Create SET_TP_SL payload for each order
    const payloads: ExecuteOrderRequestPayload[] = [];

    for (const order of orders) {
      // Get entry price for TP validation
      const entryPrice =
        order.entry?.actualEntryPrice || order.entry?.entryPrice;

      // Validate and transform Stop Loss
      let stopLoss: ExecuteOrderRequestPayload['stopLoss'];
      if (extraction.stopLoss) {
        stopLoss = this.validateAndTransformStopLossForUpdate(
          extraction.stopLoss,
          order.sl?.slPrice,
          order.side,
          context,
        );

        if (!stopLoss) {
          this.logger?.warn(
            {
              orderId: order.orderId,
              side: order.side,
              existingSL: order.sl?.slPrice,
              requestedSL: extraction.stopLoss,
              traceToken: context.traceToken,
            },
            'SET_TP_SL: Stop loss validation failed',
          );
        }
      }

      // Validate and transform Take Profit
      let takeProfits: ExecuteOrderRequestPayload['takeProfits'];
      if (extraction.takeProfits && extraction.takeProfits.length > 0) {
        // Convert OrderSide to CommandSide for validation
        const commandSide =
          order.side === OrderSide.LONG ? CommandSide.BUY : CommandSide.SELL;

        takeProfits = this.validateAndTransformTakeProfitsForUpdate(
          extraction.takeProfits,
          entryPrice,
          commandSide,
          order.tp,
          context,
        );

        if (!takeProfits) {
          this.logger?.warn(
            {
              orderId: order.orderId,
              side: order.side,
              entryPrice,
              hasExistingTP: !!order.tp,
              requestedTP: extraction.takeProfits,
              traceToken: context.traceToken,
            },
            'SET_TP_SL: Take profit validation failed',
          );
        }
      }

      // Skip if both stopLoss and takeProfits are invalid/undefined after validation
      if (!stopLoss && !takeProfits) {
        this.logger?.warn(
          {
            orderId: order.orderId,
            symbol: order.symbol,
            traceToken: context.traceToken,
          },
          'SET_TP_SL: Skipping order - no valid SL or TP after validation',
        );
        continue;
      }

      this.logger?.debug(
        {
          orderId: order.orderId,
          side: order.side,
          symbol: order.symbol,
          entryPrice,
          stopLoss,
          takeProfits,
          traceToken: context.traceToken,
        },
        'SET_TP_SL: Generated TP/SL update for order',
      );

      payloads.push({
        orderId: order.orderId, // Use existing order ID
        messageId: context.messageId,
        channelId: context.channelId,
        accountId: context.accountId,
        traceToken: context.traceToken,
        symbol: order.symbol,
        command: command.command,
        stopLoss,
        takeProfits,
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
        'SET_TP_SL: No valid orders after validation',
      );
      return null;
    }

    return payloads;
  }

  /**
   * Validate and transform stop loss for SET_TP_SL command
   *
   * Rules:
   * - Pips: Only allowed when order has no existing SL
   * - Price: Enforces one-way movement
   *   - LONG: new SL >= existing SL (can only move up)
   *   - SHORT: new SL <= existing SL (can only move down)
   *
   * @returns stopLoss object or undefined if validation fails
   */
  protected validateAndTransformStopLossForUpdate(
    stopLoss: { price?: number; pips?: number },
    existingSLPrice: number | undefined,
    orderSide: OrderSide,
    context: TransformContext,
  ): { price?: number; pips?: number } | undefined {
    // If pips provided
    if (stopLoss.pips !== undefined) {
      // Pips only allowed when order has no existing SL
      if (existingSLPrice) {
        this.logger?.warn(
          {
            existingSLPrice,
            requestedPips: stopLoss.pips,
            traceToken: context.traceToken,
          },
          'SET_TP_SL: SL pips not allowed - order already has SL, use price instead',
        );
        return undefined;
      }
      // No existing SL, pips is valid
      return { pips: stopLoss.pips };
    }

    // If price provided
    if (stopLoss.price !== undefined) {
      // If no existing SL, any price is valid (allows setting initial SL)
      if (!existingSLPrice) {
        return { price: stopLoss.price };
      }

      // Validate one-way movement
      const isValid =
        orderSide === OrderSide.LONG
          ? stopLoss.price >= existingSLPrice // LONG: can only move SL up
          : stopLoss.price <= existingSLPrice; // SHORT: can only move SL down

      if (!isValid) {
        this.logger?.warn(
          {
            orderSide,
            existingSLPrice,
            requestedSLPrice: stopLoss.price,
            traceToken: context.traceToken,
          },
          `SET_TP_SL: Invalid SL movement - ${orderSide} can only move SL ${
            orderSide === OrderSide.LONG ? 'up' : 'down'
          }`,
        );
        return undefined;
      }

      return { price: stopLoss.price };
    }

    // No price or pips provided
    return undefined;
  }

  /**
   * Validate and transform take profits for SET_TP_SL command
   *
   * Rules:
   * - Pips: Only allowed when order has no existing TP
   * - Price: Must be in profit direction (validated against entry)
   *
   * @returns takeProfits array or undefined if all validation fails
   */
  protected validateAndTransformTakeProfitsForUpdate(
    takeProfits: Array<{ price?: number; pips?: number }>,
    entryPrice: number | undefined,
    side: CommandSide | undefined,
    existingTP: Order['tp'] | undefined,
    context: TransformContext,
  ): Array<{ price?: number; pips?: number }> | undefined {
    const validTPs: Array<{ price?: number; pips?: number }> = [];
    const invalidTPs: Array<{ index: number; reason: string }> = [];

    takeProfits.forEach((tp, index) => {
      // If pips provided
      if (tp.pips !== undefined) {
        // Pips only allowed when order has no existing TP
        if (existingTP) {
          invalidTPs.push({
            index,
            reason:
              'pips not allowed - order already has TP, use price instead',
          });
          return;
        }
        // No existing TP, pips is valid
        validTPs.push({ pips: tp.pips });
        return;
      }

      // If price provided
      if (tp.price !== undefined) {
        // If no entry price, can't validate direction - accept it
        if (!entryPrice) {
          validTPs.push({ price: tp.price });
          return;
        }

        // Validate TP is in profit direction
        const isValid =
          side === CommandSide.BUY
            ? tp.price > entryPrice // LONG: TP must be above entry
            : side === CommandSide.SELL
              ? tp.price < entryPrice // SHORT: TP must be below entry
              : true; // Unknown side, accept it

        if (isValid) {
          validTPs.push({ price: tp.price });
        } else {
          invalidTPs.push({
            index,
            reason: `price ${tp.price} not in profit direction (entry: ${entryPrice}, side: ${side})`,
          });
        }
        return;
      }

      // No price or pips provided
      invalidTPs.push({ index, reason: 'no price or pips provided' });
    });

    if (invalidTPs.length > 0) {
      this.logger?.warn(
        {
          invalidTPs,
          traceToken: context.traceToken,
        },
        'SET_TP_SL: Some take profits filtered out',
      );
    }

    return validTPs.length > 0 ? validTPs : undefined;
  }
}
