/**
 * Integration Test: FetchBalanceJob
 *
 * Verifies that the FetchBalanceJob can:
 * 1. Fetch account info from multiple adapters via BrokerAdapterFactory
 * 2. Standardize and cache the balance data in Redis using BalanceCacheService
 * 3. Handle adapter failures without crashing the entire job
 */

import { Redis } from 'ioredis';
import {
  BalanceCacheService,
  JobService,
} from '@telegram-trading-bot-mini/shared/utils';
import { startServer, stopServer, ServerContext } from '../../../src/server';
import { createMockAccount } from '../test-helpers';
import { FetchBalanceJob } from '../../../src/jobs/fetch-balance-job';

describe('FetchBalanceJob Integration', () => {
  let serverContext: ServerContext;
  let redis: Redis;
  let jobService: JobService<any>;

  beforeAll(async () => {
    serverContext = await startServer();
    redis = serverContext.container.redis;
    jobService = serverContext.container.jobService;
  });

  afterAll(async () => {
    await stopServer(serverContext);
  });

  beforeEach(async () => {
    await redis.flushall();
    await serverContext.container.accountRepository.deleteMany({});
  });

  it('should fetch and cache balance for all adapters', async () => {
    // 1. Setup multiple mock accounts on the SAME exchange
    await createMockAccount(serverContext, 'fb-account-1', {
      brokerConfig: { exchangeCode: 'mock', apiKey: 'key-1' },
    });

    await createMockAccount(serverContext, 'fb-account-2', {
      brokerConfig: { exchangeCode: 'mock', apiKey: 'key-2' },
    });

    await serverContext.container.brokerFactory.preloadAdapters();

    // 2. Run job
    const job = new FetchBalanceJob(
      {
        id: 'test-job',
        type: 'fetch-balance-job',
        status: 'active',
        meta: {},
      } as any,
      serverContext.container.logger,
      serverContext.container,
    );

    await job.onTick();

    // 3. Verify Redis cache - BOTH accounts should be updated
    const balanceCache = new BalanceCacheService('mock', redis);

    const b1 = await balanceCache.getBalance('fb-account-1');
    const b2 = await balanceCache.getBalance('fb-account-2');

    expect(b1).not.toBeNull();
    expect(b1?.balance).toBe(10000);
    expect(b2).not.toBeNull();
    expect(b2?.balance).toBe(10000);
  });

  it('should apply maxShareVirtualAccounts divisor when sharing balance', async () => {
    // 1. Setup an account with balance sharing
    const accountId = 'virtual-acc-1';
    await createMockAccount(serverContext, accountId, {
      brokerConfig: {
        exchangeCode: 'mock',
        apiKey: 'shared-key',
        maxShareVirtualAccounts: 2,
      },
    });

    await serverContext.container.brokerFactory.preloadAdapters();

    // 2. Run job
    const job = new FetchBalanceJob(
      {
        id: 'test-job',
        type: 'fetch-balance-job',
        status: 'active',
        meta: {},
      } as any,
      serverContext.container.logger,
      serverContext.container,
    );

    await job.onTick();

    // 3. Verify Redis cache - balance should be divided by 2
    const balanceCache = new BalanceCacheService('mock', redis);
    const balance = await balanceCache.getBalance(accountId);

    expect(balance).not.toBeNull();
    // Default mock balance is 10000, so divided by 2 should be 5000
    expect(balance?.balance).toBe(5000);
    expect(balance?.equity).toBe(5250);
  });

  it('should truncate balance values to 2 decimal places', async () => {
    // 1. Setup an account with balance sharing that results in many decimals
    const accountId = 'virtual-acc-trunc';
    await createMockAccount(serverContext, accountId, {
      brokerConfig: {
        exchangeCode: 'mock',
        apiKey: 'trunc-key',
        maxShareVirtualAccounts: 3,
      },
    });

    await serverContext.container.brokerFactory.preloadAdapters();

    // 2. Run job
    const job = new FetchBalanceJob(
      {
        id: 'test-job',
        type: 'fetch-balance-job',
        status: 'active',
        meta: {},
      } as any,
      serverContext.container.logger,
      serverContext.container,
    );

    await job.onTick();

    // 3. Verify Redis cache - balance should be truncated to 2 digits
    const balanceCache = new BalanceCacheService('mock', redis);
    const balance = await balanceCache.getBalance(accountId);

    expect(balance).not.toBeNull();
    // 10000 / 3 = 3333.333333... -> truncated to 3333.33
    expect(balance?.balance).toBe(3333.33);
    // 10500 / 3 = 3500.00
    expect(balance?.equity).toBe(3500);
    // 500 / 3 = 166.6666... -> truncated to 166.66
    expect(balance?.marginUsed).toBe(166.66);
  });

  it('should continue processing if one adapter fails', async () => {
    // Setup two accounts
    await createMockAccount(serverContext, 'fail-acc', {
      brokerConfig: { exchangeCode: 'mock', apiKey: 'fail-key' },
    });
    await createMockAccount(serverContext, 'success-acc', {
      brokerConfig: { exchangeCode: 'mock', apiKey: 'success-key' },
    });

    await serverContext.container.brokerFactory.preloadAdapters();
    const adapters = serverContext.container.brokerFactory.getAllAdapters();
    const failAdapter = adapters.find((a) => a.accountId === 'fail-acc');
    const successAdapter = adapters.find((a) => a.accountId === 'success-acc');

    if (!failAdapter || !successAdapter) throw new Error('Adapters not found');

    jest
      .spyOn(failAdapter, 'getAccountInfo')
      .mockRejectedValue(new Error('API Error'));

    const job = new FetchBalanceJob(
      {
        id: 'test-job',
        type: 'fetch-balance-job',
        status: 'active',
        meta: {},
      } as any,
      serverContext.container.logger,
      serverContext.container,
    );

    await job.onTick();

    const balanceCache = new BalanceCacheService('mock', redis);
    expect(await balanceCache.getBalance('fail-acc')).toBeNull();
    expect(await balanceCache.getBalance('success-acc')).not.toBeNull();
  });
});
