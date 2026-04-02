/**
 * Purpose: Background job to fetch and cache real-time prices for specific symbols
 * Frequency: Recommended every 15-30 seconds via cron
 *
 * Flow:
 * 1. Extract symbols to fetch from job metadata
 * 2. Group active adapters by exchangeCode
 * 3. For each exchange:
 *    a. Validate operation hours for the account
 *    b. Skip if outside operation hours
 *    c. Fetch prices for all symbols in batch
 *    d. Cache results in Redis using PriceCacheService
 * 4. Handles failures per exchange gracefully
 */

import {
  BaseJob,
  RegisterJob,
  PriceCacheService,
} from '@telegram-trading-bot-mini/shared/utils';
import { Container } from '../interfaces';
import { OperationTimeCheckerService } from '../services/calculations/operation-time-checker.service';

export interface FetchPriceJobMeta {
  /** Symbols to fetch price for (e.g., ["XAUUSD", "EURUSD"]) */
  symbols: string[];
}

@RegisterJob('fetch-price-job')
export class FetchPriceJob extends BaseJob<Container, FetchPriceJobMeta> {
  private operationTimeChecker: OperationTimeCheckerService;

  public override async init(): Promise<void> {
    await super.init();
    // Initialize operation time checker
    this.operationTimeChecker = new OperationTimeCheckerService(
      this.container.logger,
    );
  }

  /**
   * Job execution logic called on schedule
   */
  async onTick(): Promise<void> {
    const { brokerFactory, redis, logger, errorCapture, accountRepository } =
      this.container;

    // 1. Get symbols from job configuration
    const symbols = this.jobConfig.meta?.symbols;
    if (!symbols || symbols.length === 0) {
      logger.debug('No symbols configured for FetchPriceJob');
      return;
    }

    const adapters = brokerFactory.getAllAdapters();
    if (adapters.length === 0) {
      logger.debug('No active broker adapters to fetch prices');
      return;
    }

    // 2. Group adapters by exchangeCode (we only need one request per exchange)
    const exchangeGroups = new Map<string, any>();
    for (const adapter of adapters) {
      if (!exchangeGroups.has(adapter.exchangeCode)) {
        exchangeGroups.set(adapter.exchangeCode, adapter);
      }
    }

    logger.info(
      {
        exchangeCount: exchangeGroups.size,
        symbolCount: symbols.length,
        symbols,
      },
      'Starting price fetch for all exchanges',
    );

    // 3. Parallel fetch per exchange
    await Promise.all(
      Array.from(exchangeGroups.values()).map(async (adapter) => {
        const exchangeCode = adapter.exchangeCode;
        const accountId = adapter.accountId;

        try {
          // 3a. Validate operation hours
          const account = await accountRepository.findByAccountId(accountId);
          const operationHours = account?.configs?.operationHours;

          if (operationHours) {
            const isMarketOpen =
              this.operationTimeChecker!.isInside(operationHours);

            if (!isMarketOpen) {
              logger.info(
                {
                  accountId,
                  exchangeCode,
                  timezone: operationHours.timezone,
                  schedule: operationHours.schedule,
                },
                'Skipping price fetch - outside operation hours',
              );

              return; // Skip this adapter
            }
          }

          // 3b. Fetch batch prices
          const tickers = await adapter.fetchPrice(symbols);

          // 3c. Cache each ticker
          const priceCache = new PriceCacheService(exchangeCode, redis);

          await Promise.all(
            tickers.map((ticker) =>
              priceCache.setPrice(ticker.symbol, ticker.bid, ticker.ask),
            ),
          );

          logger.info(
            { exchangeCode, accountId, tickerCount: tickers.length },
            'Successfully cached prices for exchange',
          );
        } catch (error) {
          logger.error(
            { accountId, exchangeCode, error },
            'Failed to fetch prices for exchange',
          );

          errorCapture.captureException(error as Error, {
            accountId,
            exchangeCode,
            context: 'fetch_price_job',
            symbols,
          });
        }
      }),
    );
  }
}
