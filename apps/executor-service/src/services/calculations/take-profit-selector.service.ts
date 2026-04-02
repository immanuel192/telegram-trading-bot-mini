/**
 * Purpose: Select appropriate take profit levels based on account configuration
 * Exports: TakeProfitSelectorService class
 * Core Flow: Receives TP array and account config → sorts by profitability → selects based on index
 *
 * This service handles:
 * 1. Filtering valid take profit levels
 * 2. Sorting by highest profit first (direction-aware)
 * 3. Selecting TP based on takeProfitIndex configuration
 * 4. Handling forceNoTakeProfit flag
 */

import { Account, OrderSide } from '@dal';
import {
  CommandEnum,
  LoggerInstance,
} from '@telegram-trading-bot-mini/shared/utils';

export class TakeProfitSelectorService {
  constructor(private logger: LoggerInstance) {}

  /**
   * Normalise take profit levels:
   * 1. Filters out TPs without price
   * 2. Sorts by profitability (direction-aware)
   *
   * @param takeProfits - Array of take profit levels from trading signal
   * @param command - Order command (LONG or SHORT) to determine sort order
   * @param side - Optional order side (takes precedence over command for sorting)
   * @returns Array of normalised TPs
   */
  async normaliseTakeProfits(
    takeProfits: { price?: number; pips?: number }[] | undefined,
    command: CommandEnum,
    side?: OrderSide,
  ): Promise<{ price?: number; pips?: number }[]> {
    if (!takeProfits || takeProfits.length === 0) {
      return [];
    }

    // Filter out TPs without price (we don't support pips yet)
    const validTPs = takeProfits.filter((tp) => tp.price !== undefined);

    if (validTPs.length === 0) {
      return [];
    }

    // Sort takeProfits by highest profit first
    // LONG: highest price first (descending)
    // SHORT: lowest price first (ascending)
    return [...validTPs].sort((a, b) => {
      const priceA = a.price!;
      const priceB = b.price!;

      const isLong = side
        ? side === OrderSide.LONG
        : command === CommandEnum.LONG;

      if (isLong) {
        // LONG: lowest price = least profit = Tier 1
        return priceA - priceB; // Ascending
      } else {
        // SHORT: highest price = least profit = Tier 1
        return priceB - priceA; // Descending
      }
    });
  }

  /**
   * Select appropriate take profit based on account configuration
   * Picks based on takeProfitIndex from already normalised TPs
   *
   * **Returns up to 2 TP levels** for linked order optimization:
   * - Element [0]: TP for current order (based on takeProfitIndex)
   * - Element [1]: Optimized TP for linked order (average of index and index+1), if available
   *
   * @param normalisedTPs - Array of normalised take profit levels
   * @param account - Account instance with configs
   * @returns Array with 1-2 selected TPs (undefined if forceNoTakeProfit is true or no TPs available)
   */
  async selectTakeProfit(
    normalisedTPs: { price?: number; pips?: number }[] | undefined,
    account: Account,
  ): Promise<{ price?: number; pips?: number }[] | undefined> {
    // If no normalisedTPs provided or empty, return undefined
    if (!normalisedTPs || normalisedTPs.length === 0) {
      return undefined;
    }

    // Check if forceNoTakeProfit is enabled
    if (account.configs?.forceNoTakeProfit === true) {
      this.logger.info(
        { accountId: account.accountId },
        'forceNoTakeProfit is enabled, ignoring all takeProfits',
      );
      return undefined;
    }

    // Get takeProfitIndex from config (default to 0)
    const takeProfitIndex = account.configs?.takeProfitIndex ?? 0;

    // Select TP based on index
    if (takeProfitIndex >= normalisedTPs.length) {
      this.logger.warn(
        {
          accountId: account.accountId,
          takeProfitIndex,
          availableTPs: normalisedTPs.length,
        },
        'takeProfitIndex out of range, using last available TP',
      );
      // Use the last available TP if index is out of range
      return [normalisedTPs[normalisedTPs.length - 1]];
    }

    // Select primary TP and next TP (for linked order optimization)
    const selectedTP = normalisedTPs[takeProfitIndex];
    const nextTP = normalisedTPs[takeProfitIndex + 1];

    // Build result array (1 or 2 elements)
    // If nextTP exists, calculate the average price for optimization
    let result: { price?: number; pips?: number }[];

    if (
      nextTP &&
      selectedTP.price !== undefined &&
      nextTP.price !== undefined
    ) {
      // Calculate averaged TP (primary TP + next TP) / 2
      const avgPrice = (selectedTP.price + nextTP.price) / 2;
      // Round to 2 decimals
      const optimizedPrice = Math.round(avgPrice * 100) / 100;
      result = [selectedTP, { price: optimizedPrice }];
    } else {
      result = [selectedTP];
    }

    this.logger.debug(
      {
        accountId: account.accountId,
        takeProfitIndex,
        selectedTP,
        nextTP: nextTP || 'N/A',
        returnedCount: result.length,
        optimizedTP: result.length > 1 ? result[1] : 'N/A',
        normalisedTPs,
      },
      `Selected ${result.length} take profit level(s) based on config`,
    );

    return result;
  }
}
