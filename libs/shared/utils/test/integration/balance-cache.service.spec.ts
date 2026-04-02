/**
 * Integration tests for BalanceCacheService
 * These tests require a running Redis instance (use npm run stack:up)
 */

import Redis from 'ioredis';
import { getTestRedisUrl } from '@telegram-trading-bot-mini/shared/test-utils';
import {
  BalanceCacheService,
  BalanceInfo,
} from '../../src/cache/balance-cache.service';

const REDIS_URL = getTestRedisUrl();

describe('BalanceCacheService', () => {
  let redis: Redis;
  let balanceCache: BalanceCacheService;
  const exchangeCode = 'test-exchange';
  const testAccountId = 'acc-123';

  beforeAll(async () => {
    redis = new Redis(REDIS_URL);
  });

  beforeEach(async () => {
    balanceCache = new BalanceCacheService(exchangeCode, redis);

    // Clean up test keys
    const keys = await redis.keys(`balance:${exchangeCode}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterEach(async () => {
    // Clean up test keys
    const keys = await redis.keys(`balance:${exchangeCode}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterAll(async () => {
    await redis.quit();
  });

  describe('setBalance', () => {
    it('should store balance data in Redis with correct key format', async () => {
      const balanceInfo = {
        balance: 10000,
        marginUsed: 2000,
        marginAvailable: 8000,
        equity: 10500,
      };

      await balanceCache.setBalance(testAccountId, balanceInfo);

      // Verify key format
      const key = `balance:${exchangeCode}:${testAccountId}`;
      const exists = await redis.exists(key);
      expect(exists).toBe(1);

      // Verify data structure
      const rawData = await redis.get(key);
      expect(rawData).toBeDefined();

      const data = JSON.parse(rawData!) as BalanceInfo;
      expect(data.balance).toBe(balanceInfo.balance);
      expect(data.marginUsed).toBe(balanceInfo.marginUsed);
      expect(data.marginAvailable).toBe(balanceInfo.marginAvailable);
      expect(data.equity).toBe(balanceInfo.equity);
      expect(data.ts).toBeDefined();
      expect(typeof data.ts).toBe('number');
    });

    it('should auto-add timestamp in Unix milliseconds', async () => {
      const beforeTimestamp = Date.now();

      await balanceCache.setBalance(testAccountId, {
        balance: 10000,
        marginUsed: 2000,
        marginAvailable: 8000,
        equity: 10500,
      });

      const afterTimestamp = Date.now();

      const balance = await balanceCache.getBalance(testAccountId);
      expect(balance).toBeDefined();
      expect(balance!.ts).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(balance!.ts).toBeLessThanOrEqual(afterTimestamp);
    });

    it('should store all BalanceInfo fields correctly', async () => {
      const balanceInfo = {
        balance: 15000.5,
        marginUsed: 3500.25,
        marginAvailable: 11500.25,
        equity: 16200.75,
      };

      await balanceCache.setBalance(testAccountId, balanceInfo);
      const retrieved = await balanceCache.getBalance(testAccountId);

      expect(retrieved).toBeDefined();
      expect(retrieved!.balance).toBe(balanceInfo.balance);
      expect(retrieved!.marginUsed).toBe(balanceInfo.marginUsed);
      expect(retrieved!.marginAvailable).toBe(balanceInfo.marginAvailable);
      expect(retrieved!.equity).toBe(balanceInfo.equity);
      expect(retrieved!.ts).toBeDefined();
    });

    it('should overwrite existing balance data', async () => {
      // Set initial balance
      await balanceCache.setBalance(testAccountId, {
        balance: 10000,
        marginUsed: 2000,
        marginAvailable: 8000,
        equity: 10500,
      });
      const firstBalance = await balanceCache.getBalance(testAccountId);

      // Wait a bit to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Update balance
      await balanceCache.setBalance(testAccountId, {
        balance: 12000,
        marginUsed: 3000,
        marginAvailable: 9000,
        equity: 12500,
      });
      const secondBalance = await balanceCache.getBalance(testAccountId);

      expect(secondBalance!.balance).toBe(12000);
      expect(secondBalance!.marginUsed).toBe(3000);
      expect(secondBalance!.marginAvailable).toBe(9000);
      expect(secondBalance!.equity).toBe(12500);
      expect(secondBalance!.ts).toBeGreaterThan(firstBalance!.ts);
    });
  });

  describe('getBalance', () => {
    it('should retrieve balance data correctly', async () => {
      const balanceInfo = {
        balance: 10000,
        marginUsed: 2000,
        marginAvailable: 8000,
        equity: 10500,
      };

      await balanceCache.setBalance(testAccountId, balanceInfo);
      const balance = await balanceCache.getBalance(testAccountId);

      expect(balance).toBeDefined();
      expect(balance!.balance).toBe(balanceInfo.balance);
      expect(balance!.marginUsed).toBe(balanceInfo.marginUsed);
      expect(balance!.marginAvailable).toBe(balanceInfo.marginAvailable);
      expect(balance!.equity).toBe(balanceInfo.equity);
      expect(balance!.ts).toBeDefined();
    });

    it('should return null for missing keys', async () => {
      const balance = await balanceCache.getBalance('nonexistent-account');
      expect(balance).toBeNull();
    });

    it('should parse all numeric values correctly from JSON', async () => {
      await balanceCache.setBalance(testAccountId, {
        balance: 10000.123456,
        marginUsed: 2000.654321,
        marginAvailable: 8000.111111,
        equity: 10500.999999,
      });

      const balance = await balanceCache.getBalance(testAccountId);

      expect(balance).toBeDefined();
      expect(typeof balance!.balance).toBe('number');
      expect(typeof balance!.marginUsed).toBe('number');
      expect(typeof balance!.marginAvailable).toBe('number');
      expect(typeof balance!.equity).toBe('number');
      expect(typeof balance!.ts).toBe('number');
      expect(balance!.balance).toBe(10000.123456);
      expect(balance!.marginUsed).toBe(2000.654321);
      expect(balance!.marginAvailable).toBe(8000.111111);
      expect(balance!.equity).toBe(10500.999999);
    });
  });

  describe('cache key isolation', () => {
    it('should isolate balances by exchange code', async () => {
      const oandaCache = new BalanceCacheService('oanda', redis);
      const mockCache = new BalanceCacheService('mock', redis);

      await oandaCache.setBalance(testAccountId, {
        balance: 10000,
        marginUsed: 2000,
        marginAvailable: 8000,
        equity: 10500,
      });

      await mockCache.setBalance(testAccountId, {
        balance: 15000,
        marginUsed: 3000,
        marginAvailable: 12000,
        equity: 15500,
      });

      const oandaBalance = await oandaCache.getBalance(testAccountId);
      const mockBalance = await mockCache.getBalance(testAccountId);

      expect(oandaBalance!.balance).toBe(10000);
      expect(mockBalance!.balance).toBe(15000);

      // Verify separate keys exist
      const oandaKey = await redis.exists(`balance:oanda:${testAccountId}`);
      const mockKey = await redis.exists(`balance:mock:${testAccountId}`);
      expect(oandaKey).toBe(1);
      expect(mockKey).toBe(1);

      // Cleanup
      await redis.del(
        `balance:oanda:${testAccountId}`,
        `balance:mock:${testAccountId}`,
      );
    });

    it('should isolate balances by account ID', async () => {
      const account1 = 'acc-111';
      const account2 = 'acc-222';

      await balanceCache.setBalance(account1, {
        balance: 10000,
        marginUsed: 2000,
        marginAvailable: 8000,
        equity: 10500,
      });

      await balanceCache.setBalance(account2, {
        balance: 20000,
        marginUsed: 4000,
        marginAvailable: 16000,
        equity: 21000,
      });

      const balance1 = await balanceCache.getBalance(account1);
      const balance2 = await balanceCache.getBalance(account2);

      expect(balance1!.balance).toBe(10000);
      expect(balance2!.balance).toBe(20000);
    });
  });

  describe('error handling', () => {
    it('should handle Redis connection errors gracefully', async () => {
      // Create a disconnected Redis instance
      const disconnectedRedis = new Redis({
        host: 'invalid-host',
        port: 9999,
        retryStrategy: () => null, // Don't retry
        lazyConnect: true,
      });

      const failingCache = new BalanceCacheService(
        exchangeCode,
        disconnectedRedis,
      );

      // Should throw error on operations
      await expect(failingCache.getBalance(testAccountId)).rejects.toThrow();
      await expect(
        failingCache.setBalance(testAccountId, {
          balance: 10000,
          marginUsed: 2000,
          marginAvailable: 8000,
          equity: 10500,
        }),
      ).rejects.toThrow();

      // Don't call quit() on disconnected instance - it will throw
      disconnectedRedis.disconnect();
    });
  });
});
