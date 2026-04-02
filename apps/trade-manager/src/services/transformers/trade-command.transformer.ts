/**
 * Trade command transformer (LONG/SHORT)
 * Transforms LONG/SHORT trade commands with full validation
 */

import {
  CommandEnum,
  CommandSide,
  ExecuteOrderRequestPayload,
} from '@telegram-trading-bot-mini/shared/utils';
import ShortUniqueId from 'short-unique-id';
import { BaseTransformer } from './base.transformer';
import { TransformContext, TranslateMessageResultCommand } from './types';

const uid = new ShortUniqueId({ length: 10 });

/**
 * Transform LONG/SHORT trade commands with full validation
 * Validates entry requirements, SL/TP prices, and applies configurations
 *
 * Note: Order creation is handled separately by the caller
 */
export class TradeCommandTransformer extends BaseTransformer {
  async transform(
    command: TranslateMessageResultCommand,
    context: TransformContext,
  ): Promise<ExecuteOrderRequestPayload[] | null> {
    const extraction = command.extraction;
    if (!extraction) {
      this.logValidationFailure(
        'Trade command missing extraction',
        command.command,
        context,
      );
      return null;
    }

    // Validate symbol
    if (!extraction.symbol || extraction.symbol.trim() === '') {
      this.logValidationFailure(
        'Missing or empty symbol',
        command.command,
        context,
      );
      return null;
    }

    const isImmediate = extraction.isImmediate ?? false;

    // Determine entry price
    let entry: number | undefined;

    if (extraction.entry) {
      // Use direct entry price if provided
      entry = extraction.entry;
    } else if (extraction.entryZone && extraction.entryZone.length > 0) {
      // Sort entryZone in ascending order
      const sortedZone = [...extraction.entryZone].sort((a, b) => a - b);

      // Only apply pickBestEntryFromZone for LIMIT orders
      if (!isImmediate && context.symbolConfig?.pickBestEntryFromZone) {
        const delta = context.symbolConfig.pickBestEntryFromZoneDelta ?? 0;

        if (extraction.side === CommandSide.BUY) {
          // LONG: pick highest price - delta (slightly below best entry)
          const highestPrice = sortedZone[sortedZone.length - 1];
          entry = highestPrice - delta;
          this.logger?.debug(
            {
              symbol: extraction.symbol,
              side: extraction.side,
              entryZone: sortedZone,
              highestPrice,
              delta,
              selectedEntry: entry,
              traceToken: context.traceToken,
            },
            'Picked best entry from zone for LONG (limit order)',
          );
        } else if (extraction.side === CommandSide.SELL) {
          // SHORT: pick lowest price + delta (slightly above best entry)
          const lowestPrice = sortedZone[0];
          entry = lowestPrice + delta;
          this.logger?.debug(
            {
              symbol: extraction.symbol,
              side: extraction.side,
              entryZone: sortedZone,
              lowestPrice,
              delta,
              selectedEntry: entry,
              traceToken: context.traceToken,
            },
            'Picked best entry from zone for SHORT (limit order)',
          );
        } else {
          // Unknown side, use first price from sorted zone
          entry = sortedZone[0];
        }
      } else {
        // For market orders OR when pickBestEntryFromZone is false:
        // Just use first price from sorted zone
        entry = sortedZone[0];

        if (isImmediate) {
          this.logger?.debug(
            {
              symbol: extraction.symbol,
              entryZone: sortedZone,
              selectedEntry: entry,
              traceToken: context.traceToken,
            },
            'Market order: using first price from entryZone for lot size calculation',
          );
        }
      }
    }

    // Validate entry for limit orders only
    if (!isImmediate && !entry) {
      this.logValidationFailure(
        'Limit order (isImmediate=false) requires entry price',
        command.command,
        context,
      );
      return null;
    }

    // Validate and transform stopLoss
    let stopLoss: ExecuteOrderRequestPayload['stopLoss'];
    if (extraction.stopLoss) {
      stopLoss = this.validateAndTransformStopLoss(
        extraction.stopLoss,
        entry,
        extraction.side,
        command.command,
        context,
      );
    }

    // NOTE: forceStopLossByPercentage is handled by executor-service, not here.
    // Trade-manager passes through the configuration, and executor-service
    // applies the forced SL when executing the order.

    // Validate and transform takeProfits
    let takeProfits: ExecuteOrderRequestPayload['takeProfits'];
    if (extraction.takeProfits && extraction.takeProfits.length > 0) {
      takeProfits = this.validateAndTransformTakeProfits(
        extraction.takeProfits,
        entry,
        extraction.side,
        command.command,
        context,
      );
    }

    // Extract meta field (reduceLotSize and adjustEntry)
    // These flags are used by executor-service to adjust execution behavior
    const meta = extraction.meta
      ? {
          reduceLotSize: extraction.meta.reduceLotSize,
          adjustEntry: extraction.meta.adjustEntry,
        }
      : undefined;

    return [
      {
        orderId: uid.rnd(),
        messageId: context.messageId,
        channelId: context.channelId,
        accountId: context.accountId,
        traceToken: context.traceToken,
        symbol: extraction.symbol,
        command: command.command,
        lotSize: 0, // 0 = signal executor to calculate based on account config
        isImmediate,
        entry,
        stopLoss,
        takeProfits,
        meta,
        timestamp: Date.now(),
      },
    ];
  }

  /**
   * Validate and transform stopLoss based on entry price and side
   * Returns stopLoss object or undefined if validation fails
   */
  protected validateAndTransformStopLoss(
    stopLoss: { price?: number; pips?: number },
    entry: number | undefined,
    side: CommandSide | undefined,
    commandType: CommandEnum,
    context: TransformContext,
  ): { price?: number; pips?: number } | undefined {
    // If only pips provided, no validation needed
    if (!stopLoss.price && stopLoss.pips) {
      return stopLoss;
    }

    // If no entry, can't validate price
    if (!entry || !stopLoss.price) {
      return stopLoss;
    }

    // Validate SL price based on side
    const isValid =
      side === CommandSide.BUY
        ? stopLoss.price < entry
        : side === CommandSide.SELL
          ? stopLoss.price > entry
          : true; // Unknown side, skip validation

    if (!isValid) {
      this.logger?.warn(
        {
          commandType,
          side,
          entry,
          stopLossPrice: stopLoss.price,
          messageId: context.messageId,
          traceToken: context.traceToken,
        },
        'Invalid stopLoss price - excluding from order',
      );
      return undefined;
    }

    return stopLoss;
  }

  /**
   * Validate and transform takeProfits based on entry price and side
   * Filters out invalid TPs and returns valid ones
   */
  protected validateAndTransformTakeProfits(
    takeProfits: Array<{ price?: number; pips?: number }>,
    entry: number | undefined,
    side: CommandSide | undefined,
    commandType: CommandEnum,
    context: TransformContext,
  ): Array<{ price?: number; pips?: number }> | undefined {
    // If no entry, can't validate prices
    if (!entry) {
      return takeProfits;
    }

    const validTPs: Array<{ price?: number; pips?: number }> = [];
    const invalidTPs: number[] = [];

    takeProfits.forEach((tp, index) => {
      // If only pips provided, no validation needed
      if (!tp.price && tp.pips) {
        validTPs.push(tp);
        return;
      }

      if (!tp.price) {
        validTPs.push(tp);
        return;
      }

      // Validate TP price based on side
      const isValid =
        side === CommandSide.BUY
          ? tp.price > entry
          : side === CommandSide.SELL
            ? tp.price < entry
            : true; // Unknown side, skip validation

      if (isValid) {
        validTPs.push(tp);
      } else {
        invalidTPs.push(index);
      }
    });

    if (invalidTPs.length > 0) {
      this.logger?.warn(
        {
          commandType,
          side,
          entry,
          invalidTPIndexes: invalidTPs,
          messageId: context.messageId,
          traceToken: context.traceToken,
        },
        'Invalid takeProfit prices - filtered out',
      );
    }

    return validTPs.length > 0 ? validTPs : undefined;
  }
}
