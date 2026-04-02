/**
 * Purpose: Calculate and adjust stop loss prices for orders
 * Exports: StopLossCalculatorService class
 * Core Flow: Receives order parameters → adjusts SL based on meta flags → forces SL if configured
 *
 * This service handles:
 * 1. Adjusting existing stop loss when meta.adjustEntry is true
 * 2. Forcing stop loss when none provided and forceStopLossByPercentage is configured
 * 3. Returning original stop loss if no adjustments needed
 */

import { Account, OrderSide } from '@dal';
import {
  CommandEnum,
  LoggerInstance,
} from '@telegram-trading-bot-mini/shared/utils';

export interface CalculateStopLossParams {
  stopLoss?: { price?: number; pips?: number };
  entry?: number;
  command: CommandEnum;
  side?: OrderSide; // For MOVE_SL/SET_TP_SL scenarios where command doesn't indicate direction
  symbol: string;
  account: Account;
  meta?: {
    reduceLotSize?: boolean;
    adjustEntry?: boolean;
    executionInstructions?: {
      skipBrokerPriceAdjustment?: boolean;
    };
  };
}

export interface CalculateStopLossResult {
  result: { price?: number; pips?: number } | undefined;
  useForceStopLoss: boolean;
  brokerAdjustmentApplied?: BrokerAdjustmentInfo;
}

/**
 * Information about broker price adjustment applied to stop loss
 */
export interface BrokerAdjustmentInfo {
  original: { price?: number; pips?: number };
  adjusted: { price?: number; pips?: number };
  adjustPercent: number;
  source: 'symbol-level' | 'account-level';
}

export class StopLossCalculatorService {
  constructor(private logger: LoggerInstance) {}

  /**
   * Calculate or adjust stop loss based on account configuration
   *
   * Handles three scenarios:
   * 1. Adjust existing SL when meta.adjustEntry is true
   * 2. Force SL when none provided and forceStopLossByPercentage is configured
   * 3. Apply broker price difference adjustment (except for forced SL)
   *
   * @param params - Stop loss calculation parameters
   * @returns Adjusted stop loss with adjustment tracking
   */
  calculateStopLoss(params: CalculateStopLossParams): CalculateStopLossResult {
    const { stopLoss, entry, command, side, symbol, account, meta } = params;
    let ret: CalculateStopLossResult = {
      result: stopLoss,
      useForceStopLoss: false,
    };

    // Get symbol-specific config or fall back to account-level config
    const symbolConfig = account.symbols?.[symbol];

    // Scenario 1: Adjust existing stop loss if meta.adjustEntry is true
    if (stopLoss?.price && meta?.adjustEntry && entry) {
      const adjustPercent =
        account.configs?.addOnStopLossPercentForAdjustEntry ?? 0;

      if (adjustPercent > 0) {
        const distance = Math.abs(entry - stopLoss.price);
        const adjustedDistance = distance * (1 + adjustPercent);

        let adjustedPrice: number;
        if (command === CommandEnum.LONG) {
          // LONG: SL is below entry, move it further down
          adjustedPrice = entry - adjustedDistance;
        } else {
          // SHORT: SL is above entry, move it further up
          adjustedPrice = entry + adjustedDistance;
        }

        this.logger.debug(
          {
            accountId: account.accountId,
            symbol,
            command,
            originalSL: stopLoss.price,
            adjustedSL: adjustedPrice,
            adjustPercent,
            entry,
          },
          'Adjusted stop loss based on addOnStopLossPercentForAdjustEntry',
        );

        ret.result = { price: adjustedPrice };
      }
    }

    // Scenario 2: Force stop loss if none provided
    if (!stopLoss || (!stopLoss.price && !stopLoss.pips)) {
      // Check symbol-level config first, then fall back to account-level
      const forceSlPercent =
        symbolConfig?.forceStopLossByPercentage ??
        account.configs?.forceStopLossByPercentage;

      if (forceSlPercent && forceSlPercent > 0 && entry) {
        const slDistance = entry * forceSlPercent;
        let forcedPrice: number;

        if (command === CommandEnum.LONG) {
          // LONG: SL below entry
          forcedPrice = entry - slDistance;
        } else {
          // SHORT: SL above entry
          forcedPrice = entry + slDistance;
        }

        this.logger.info(
          {
            accountId: account.accountId,
            symbol,
            command,
            forcedSL: forcedPrice,
            forceSlPercent,
            entry,
            source: symbolConfig?.forceStopLossByPercentage
              ? 'symbol-level'
              : 'account-level',
          },
          'Forced stop loss based on forceStopLossByPercentage',
        );

        ret.result = { price: forcedPrice };
        ret.useForceStopLoss = true;
      }
    }

    // Scenario 3: Apply broker price difference adjustment
    // Only if:
    // - Not a forced SL (we don't adjust forced SLs)
    // - Not skipped via meta flag
    // - Has entry price
    // - Has a result to adjust
    if (
      !ret.useForceStopLoss &&
      !meta?.executionInstructions?.skipBrokerPriceAdjustment &&
      entry &&
      ret.result
    ) {
      const adjustmentResult = this.applyBrokerPriceAdjustment({
        stopLoss: ret.result,
        entry,
        side:
          side ||
          (command === CommandEnum.LONG ? OrderSide.LONG : OrderSide.SHORT),
        symbol,
        account,
      });

      if (adjustmentResult.adjusted) {
        ret.brokerAdjustmentApplied = adjustmentResult.adjustmentInfo;
        ret.result = adjustmentResult.adjusted;
      }
    }

    // Return original stop loss if no adjustments needed
    return ret;
  }

  /**
   * Apply broker price difference adjustment to stop loss
   * Widens SL to account for price variations across broker exchanges
   *
   * @param params - Adjustment parameters
   * @returns Adjusted stop loss and adjustment info
   */
  public applyBrokerPriceAdjustment(params: {
    stopLoss: { price?: number; pips?: number };
    entry: number;
    side: OrderSide;
    symbol: string;
    account: Account;
  }): {
    adjusted?: { price?: number; pips?: number };
    adjustmentInfo?: BrokerAdjustmentInfo;
  } {
    const { stopLoss, entry, side, account, symbol } = params;

    // Get symbol-specific config or fall back to account-level
    const symbolConfig = account.symbols?.[symbol];

    // Price-based adjustment
    if (stopLoss.price) {
      const adjustPercent =
        symbolConfig?.stopLossAdjustPricePercentage ??
        account.configs?.stopLossAdjustPricePercentage;

      if (adjustPercent && adjustPercent > 0) {
        const distance = Math.abs(entry - stopLoss.price);
        const adjustedDistance = distance * (1 + adjustPercent);

        let adjustedPrice: number;
        if (side === OrderSide.LONG) {
          // LONG: SL is below entry, move it further down
          adjustedPrice = entry - adjustedDistance;
        } else {
          // SHORT: SL is above entry, move it further up
          adjustedPrice = entry + adjustedDistance;
        }

        this.logger.info(
          {
            accountId: account.accountId,
            symbol,
            side,
            originalSL: stopLoss.price,
            adjustedSL: adjustedPrice,
            adjustPercent,
            entry,
            source: symbolConfig?.stopLossAdjustPricePercentage
              ? 'symbol-level'
              : 'account-level',
          },
          'Applied broker price adjustment (price-based)',
        );

        return {
          adjusted: { price: adjustedPrice },
          adjustmentInfo: {
            original: { price: stopLoss.price },
            adjusted: { price: adjustedPrice },
            adjustPercent,
            source: symbolConfig?.stopLossAdjustPricePercentage
              ? 'symbol-level'
              : 'account-level',
          },
        };
      }
    }

    // Pips-based adjustment
    if (stopLoss.pips) {
      const adjustPercent =
        symbolConfig?.stopLossAdjustPipsPercentage ??
        account.configs?.stopLossAdjustPipsPercentage;

      if (adjustPercent && adjustPercent > 0) {
        const adjustedPips = stopLoss.pips * (1 + adjustPercent);

        this.logger.info(
          {
            accountId: account.accountId,
            symbol,
            originalPips: stopLoss.pips,
            adjustedPips,
            adjustPercent,
            source: symbolConfig?.stopLossAdjustPipsPercentage
              ? 'symbol-level'
              : 'account-level',
          },
          'Applied broker price adjustment (pips-based)',
        );

        return {
          adjusted: { pips: adjustedPips },
          adjustmentInfo: {
            original: { pips: stopLoss.pips },
            adjusted: { pips: adjustedPips },
            adjustPercent,
            source: symbolConfig?.stopLossAdjustPipsPercentage
              ? 'symbol-level'
              : 'account-level',
          },
        };
      }
    }

    // No adjustment configured or applicable
    return {};
  }
}
