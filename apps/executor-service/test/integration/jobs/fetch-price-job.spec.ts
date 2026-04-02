/**
 * Integration Test: FetchPriceJob
 *
 * Verifies that the FetchPriceJob can:
 * 1. Fetch prices for configured symbols across multiple exchanges
 * 2. Deduplicate fetches (one per exchange)
 * 3. Cache individual symbol prices in Redis using PriceCacheService
 * 4. Handle batch symbol requests and exchange failures
 */

import { Redis } from 'ioredis';
import { PriceCacheService } from '@telegram-trading-bot-mini/shared/utils';
import { startServer, stopServer, ServerContext } from '../../../src/server';
import { createMockAccount } from '../test-helpers';
import { FetchPriceJob } from '../../../src/jobs/fetch-price-job';

describe('FetchPriceJob Integration', () => {
  let serverContext: ServerContext;
  let redis: Redis;

  beforeAll(async () => {
    serverContext = await startServer();
    redis = serverContext.container.redis;
  });

  afterAll(async () => {
    await stopServer(serverContext);
  });

  beforeEach(async () => {
    await redis.flushall();
    await serverContext.container.accountRepository.deleteMany({});
  });

  it('should fetch and cache prices for configured symbols', async () => {
    // 1. Setup accounts on mock exchange
    await createMockAccount(serverContext, 'fp-acc-1', {
      brokerConfig: { exchangeCode: 'mock', apiKey: 'key-1' },
    });

    await createMockAccount(serverContext, 'fp-acc-2', {
      brokerConfig: { exchangeCode: 'mock', apiKey: 'key-2' },
    });

    await serverContext.container.brokerFactory.preloadAdapters();

    // 2. Setup job with symbols
    const symbols = ['XAUUSD', 'EURUSD'];
    const job = new FetchPriceJob(
      {
        id: 'price-job',
        name: 'Fetch Prices',
        type: 'fetch-price-job',
        status: 'active',
        meta: { symbols },
      } as any,
      serverContext.container.logger,
      serverContext.container,
    );

    // 3. Run job
    await job.onTick();

    // 4. Verify cache
    const mockCache = new PriceCacheService('mock', redis);
    const gold = await mockCache.getPrice('XAUUSD');
    expect(gold).not.toBeNull();
    expect(gold?.bid).toBeGreaterThan(0);
    expect(gold?.ask).toBeGreaterThan(gold?.bid || 0);

    const euro = await mockCache.getPrice('EURUSD');
    expect(euro).not.toBeNull();
    expect(euro?.ts).toBeGreaterThan(0);
  });

  it('should handle exchange failures gracefully', async () => {
    await createMockAccount(serverContext, 'fp-healthy-acc', {
      brokerConfig: { exchangeCode: 'mock', apiKey: 'ok-key' },
    });

    await createMockAccount(serverContext, 'fp-broken-acc', {
      brokerConfig: { exchangeCode: 'mock', apiKey: 'broken-key' },
    });

    await serverContext.container.brokerFactory.preloadAdapters();

    // Mock failure for the 'fp-broken-acc' adapter
    const adapters = serverContext.container.brokerFactory.getAllAdapters();
    const brokenAdapter = adapters.find((a) => a.accountId === 'fp-broken-acc');
    if (brokenAdapter) {
      jest
        .spyOn(brokenAdapter, 'fetchPrice')
        .mockRejectedValue(new Error('Connection Reset'));
    }

    const job = new FetchPriceJob(
      {
        id: 'price-job',
        meta: { symbols: ['BTCUSD'] },
      } as any,
      serverContext.container.logger,
      serverContext.container,
    );

    await job.onTick();

    // Verify healthy adapter still resulted in cache (one adapter successful is enough for the exchange)
    const mockCache = new PriceCacheService('mock', redis);
    expect(await mockCache.getPrice('BTCUSD')).not.toBeNull();
  });

  it('should not fetch anything if symbols are empty', async () => {
    await createMockAccount(serverContext, 'oanda-acc', {
      brokerConfig: { exchangeCode: 'oanda' },
    });
    await serverContext.container.brokerFactory.preloadAdapters();

    const job = new FetchPriceJob(
      { id: 'job', meta: { symbols: [] } } as any,
      serverContext.container.logger,
      serverContext.container,
    );

    const loggerSpy = jest.spyOn(serverContext.container.logger, 'debug');
    await job.onTick();

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('No symbols configured'),
    );
  });
});
