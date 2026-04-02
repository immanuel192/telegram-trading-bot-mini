/**
 * Purpose: Resolve leverage for trading symbols
 * Exports: LeverageResolverService class
 * Core Flow: Receives symbol and account → resolves leverage with priority rules → validates against max leverage
 *
 * This service handles:
 * 1. Symbol-specific leverage resolution
 * 2. Account default leverage fallback
 * 3. Max leverage validation
 * 4. Setting leverage on exchange via broker adapter
 */

import { Account } from '@dal';
import { LoggerInstance } from '@telegram-trading-bot-mini/shared/utils';
import { IBrokerAdapter } from '../../adapters/interfaces';

export class LeverageResolverService {
  constructor(private logger: LoggerInstance) {}

  /**
   * Resolve leverage for a symbol
   * Priority: symbol config > account default > fallback to 1 (no leverage)
   *
   * @param symbol - Trading symbol
   * @param account - Account configuration
   * @returns Resolved leverage value (minimum 1)
   */
  resolveLeverage(symbol: string, account: Account): number {
    // 1. Check symbol-specific leverage (for crypto exchanges)
    const symbolLeverage = account.symbols?.[symbol]?.leverage;
    if (symbolLeverage) {
      const clamped = account.configs?.maxLeverage
        ? Math.min(symbolLeverage, account.configs.maxLeverage)
        : symbolLeverage;

      this.logger.debug(
        {
          accountId: account.accountId,
          symbol,
          symbolLeverage,
          maxLeverage: account.configs?.maxLeverage,
          resolvedLeverage: clamped,
        },
        'Using symbol-specific leverage',
      );

      return clamped;
    }

    // 2. Use account default leverage
    const defaultLeverage = account.configs?.defaultLeverage;
    if (defaultLeverage) {
      const clamped = account.configs?.maxLeverage
        ? Math.min(defaultLeverage, account.configs.maxLeverage)
        : defaultLeverage;

      this.logger.debug(
        {
          accountId: account.accountId,
          symbol,
          defaultLeverage,
          maxLeverage: account.configs?.maxLeverage,
          resolvedLeverage: clamped,
        },
        'Using account default leverage',
      );

      return clamped;
    }

    // 3. Fallback to 1 (no leverage)
    this.logger.debug(
      {
        accountId: account.accountId,
        symbol,
      },
      'No leverage configured, using fallback leverage = 1',
    );

    return 1;
  }

  /**
   * Set leverage on exchange if configured
   * Uses adapter's in-memory cache to avoid redundant API calls
   *
   * @param adapter - Broker adapter
   * @param symbol - Trading symbol
   * @param leverage - Leverage to set
   * @param account - Account configuration
   */
  async setLeverageIfNeeded(
    adapter: IBrokerAdapter,
    symbol: string,
    leverage: number,
    account: Account,
  ): Promise<void> {
    // Only set leverage if it's configured (> 1)
    if (leverage <= 1) {
      this.logger.debug(
        {
          accountId: account.accountId,
          symbol,
          leverage,
        },
        'Leverage not configured or = 1, skipping setLeverage',
      );
      return;
    }

    // Set leverage on exchange (adapter handles caching internally)
    try {
      await adapter.setLeverage(symbol, leverage);

      this.logger.info(
        {
          accountId: account.accountId,
          symbol,
          leverage,
        },
        'Leverage set on exchange',
      );
    } catch (error) {
      this.logger.warn(
        {
          accountId: account.accountId,
          symbol,
          leverage,
          error,
        },
        'Failed to set leverage on exchange, continuing with order',
      );
      // Don't throw - some brokers don't support leverage setting
      // The order will still be placed with broker's default leverage
    }
  }
}
