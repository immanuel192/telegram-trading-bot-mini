import {
  IPipelineStep,
  PriceCacheService,
} from '@telegram-trading-bot-mini/shared/utils';
import { OrderHistoryStatus } from '@dal';
import { ExecutionContext, BaseExecutionState } from '../execution-context';
import { config } from '../../../config';

/**
 * Step to resolve the entry price for the order execution.
 * - Defaults to payload.entry if provided
 * - For market orders without entry, attempts to use cached live price
 * - Records history when cached price is used
 */
export const EntryPriceResolverStep: IPipelineStep<
  ExecutionContext<BaseExecutionState>
> = {
  name: 'PriceResolver',
  execute: async (ctx, next) => {
    const { payload, adapter, logger } = ctx;
    const { symbol, entry, traceToken, orderId } = payload;

    if (!adapter) {
      throw new Error('Adapter must be resolved before PriceResolverStep');
    }

    // Default to payload entry
    ctx.state.entryPrice = entry;

    // If no entry provided, try to get cached price for market orders
    if (!entry) {
      try {
        const priceCache = new PriceCacheService(
          adapter.exchangeCode,
          ctx.container.redis,
        );
        const cachedPrice = await priceCache.getPrice(symbol);

        if (cachedPrice) {
          const cacheAgeSeconds = (Date.now() - cachedPrice.ts) / 1000;
          const ttl = config('PRICE_CACHE_TTL_SECONDS');

          if (cacheAgeSeconds <= ttl) {
            const midPrice = (cachedPrice.bid + cachedPrice.ask) / 2;
            ctx.state.entryPrice = midPrice;

            logger.info(
              {
                symbol,
                bid: cachedPrice.bid,
                ask: cachedPrice.ask,
                midPrice,
                cacheAgeSeconds: Math.round(cacheAgeSeconds),
                ttl,
                traceToken,
              },
              'Using cached live price as entry for market order',
            );

            // Record history when using cached price
            await ctx.addOrderHistory(OrderHistoryStatus.INFO, {
              message: 'Used cached live price as entry for market order',
              cachedPrice: midPrice,
              bid: cachedPrice.bid,
              ask: cachedPrice.ask,
              cacheAgeSeconds: Math.round(cacheAgeSeconds),
              symbol,
            });
          } else {
            logger.warn(
              {
                symbol,
                cacheAgeSeconds: Math.round(cacheAgeSeconds),
                ttl,
                traceToken,
              },
              'Cached price too old, proceeding without entry',
            );
          }
        } else {
          logger.debug(
            { symbol, traceToken },
            'No cached price available, proceeding without entry',
          );
        }
      } catch (error) {
        logger.warn(
          { symbol, error, traceToken },
          'Failed to fetch price cache',
        );
      }
    }

    return await next();
  },
};
