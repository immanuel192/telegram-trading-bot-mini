/**
 * Integration tests for PriceCacheService
 * These tests require a running Redis instance (use npm run stack:up)
 */

import Redis from 'ioredis';
import { getTestRedisUrl } from '@telegram-trading-bot-mini/shared/test-utils';
import {
  PriceCacheService,
  PriceData,
} from '../../src/cache/price-cache.service';

const REDIS_URL = getTestRedisUrl();

describe('PriceCacheService', () => {
  let redis: Redis;
  let priceCache: PriceCacheService;
  const exchangeCode = 'test-exchange';
  const testSymbol = 'XAUUSD';

  beforeAll(async () => {
    redis = new Redis(REDIS_URL);
  });

  beforeEach(async () => {
    priceCache = new PriceCacheService(exchangeCode, redis);

    // Clean up test keys
    const keys = await redis.keys(`price:${exchangeCode}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterAll(async () => {
    await redis.quit();
  });

  describe('setPrice', () => {
    it('should store price data in Redis with correct key format', async () => {
      const bid = 2650.5;
      const ask = 2651.0;

      await priceCache.setPrice(testSymbol, bid, ask);

      // Verify key format
      const key = `price:${exchangeCode}:${testSymbol}`;
      const exists = await redis.exists(key);
      expect(exists).toBe(1);

      // Verify data structure
      const rawData = await redis.get(key);
      expect(rawData).toBeDefined();

      const data = JSON.parse(rawData!) as PriceData;
      expect(data.bid).toBe(bid);
      expect(data.ask).toBe(ask);
      expect(data.ts).toBeDefined();
      expect(typeof data.ts).toBe('number');
    });

    it('should auto-add timestamp in Unix milliseconds', async () => {
      const beforeTimestamp = Date.now();

      await priceCache.setPrice(testSymbol, 2650.5, 2651.0);

      const afterTimestamp = Date.now();

      const price = await priceCache.getPrice(testSymbol);
      expect(price).toBeDefined();
      expect(price!.ts).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(price!.ts).toBeLessThanOrEqual(afterTimestamp);
    });

    it('should use universal symbol format in keys', async () => {
      await priceCache.setPrice('XAUUSD', 2650.5, 2651.0);
      await priceCache.setPrice('EURUSD', 1.095, 1.0951);

      const keys = await redis.keys(`price:${exchangeCode}:*`);
      expect(keys).toContain(`price:${exchangeCode}:XAUUSD`);
      expect(keys).toContain(`price:${exchangeCode}:EURUSD`);
      expect(keys).not.toContain(`price:${exchangeCode}:XAU_USD`); // Not broker-specific format
    });

    it('should overwrite existing price data', async () => {
      // Set initial price
      await priceCache.setPrice(testSymbol, 2650.0, 2651.0);
      const firstPrice = await priceCache.getPrice(testSymbol);

      // Wait a bit to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Update price
      await priceCache.setPrice(testSymbol, 2655.0, 2656.0);
      const secondPrice = await priceCache.getPrice(testSymbol);

      expect(secondPrice!.bid).toBe(2655.0);
      expect(secondPrice!.ask).toBe(2656.0);
      expect(secondPrice!.ts).toBeGreaterThan(firstPrice!.ts);
    });
  });

  describe('getPrice', () => {
    it('should retrieve price data correctly', async () => {
      const bid = 2650.5;
      const ask = 2651.0;

      await priceCache.setPrice(testSymbol, bid, ask);
      const price = await priceCache.getPrice(testSymbol);

      expect(price).toBeDefined();
      expect(price!.bid).toBe(bid);
      expect(price!.ask).toBe(ask);
      expect(price!.ts).toBeDefined();
    });

    it('should return null for missing keys', async () => {
      const price = await priceCache.getPrice('NONEXISTENT');
      expect(price).toBeNull();
    });

    it('should parse all numeric values correctly from JSON', async () => {
      await priceCache.setPrice(testSymbol, 2650.123456, 2651.654321);
      const price = await priceCache.getPrice(testSymbol);

      expect(price).toBeDefined();
      expect(typeof price!.bid).toBe('number');
      expect(typeof price!.ask).toBe('number');
      expect(typeof price!.ts).toBe('number');
      expect(price!.bid).toBe(2650.123456);
      expect(price!.ask).toBe(2651.654321);
    });
  });

  describe('cache key isolation', () => {
    it('should isolate prices by exchange code', async () => {
      const oandaCache = new PriceCacheService('oanda', redis);
      const mockCache = new PriceCacheService('mock', redis);

      await oandaCache.setPrice(testSymbol, 2650.0, 2651.0);
      await mockCache.setPrice(testSymbol, 2655.0, 2656.0);

      const oandaPrice = await oandaCache.getPrice(testSymbol);
      const mockPrice = await mockCache.getPrice(testSymbol);

      expect(oandaPrice!.bid).toBe(2650.0);
      expect(mockPrice!.bid).toBe(2655.0);

      // Verify separate keys exist
      const oandaKey = await redis.exists(`price:oanda:${testSymbol}`);
      const mockKey = await redis.exists(`price:mock:${testSymbol}`);
      expect(oandaKey).toBe(1);
      expect(mockKey).toBe(1);

      // Cleanup
      await redis.del(`price:oanda:${testSymbol}`, `price:mock:${testSymbol}`);
    });
  });

  describe('getPriceFromAnyExchange', () => {
    it('should return price from first available exchange', async () => {
      // Setup: Create prices from multiple exchanges
      const oandaCache = new PriceCacheService('oanda', redis);
      const mockCache = new PriceCacheService('mock', redis);

      await oandaCache.setPrice(testSymbol, 2650.0, 2651.0);
      await mockCache.setPrice(testSymbol, 2655.0, 2656.0);

      // Test: Get price from any exchange
      const price = await priceCache.getPriceFromAnyExchange(testSymbol);

      expect(price).toBeDefined();
      expect(price!.bid).toBeGreaterThan(0);
      expect(price!.ask).toBeGreaterThan(0);

      // Should be one of the cached prices
      const isOandaPrice = price!.bid === 2650.0 && price!.ask === 2651.0;
      const isMockPrice = price!.bid === 2655.0 && price!.ask === 2656.0;
      expect(isOandaPrice || isMockPrice).toBe(true);

      // Cleanup
      await redis.del(`price:oanda:${testSymbol}`, `price:mock:${testSymbol}`);
    });

    it('should return null when no prices exist', async () => {
      const price = await priceCache.getPriceFromAnyExchange('NONEXISTENT');
      expect(price).toBeNull();
    });

    it('should handle Redis errors gracefully', async () => {
      // Create a disconnected Redis instance
      const disconnectedRedis = new Redis({
        host: 'invalid-host',
        port: 9999,
        retryStrategy: () => null,
        lazyConnect: true,
      });

      const failingCache = new PriceCacheService(
        exchangeCode,
        disconnectedRedis,
      );

      // Should return null instead of throwing
      const price = await failingCache.getPriceFromAnyExchange(testSymbol);
      expect(price).toBeNull();

      disconnectedRedis.disconnect();
    });

    it('should skip expired prices and return next valid one', async () => {
      // Setup: Create one expired price and one fresh price
      const oandaCache = new PriceCacheService('oanda', redis);
      const mockCache = new PriceCacheService('mock', redis);

      // Set expired price (manually set old timestamp)
      const expiredPrice: PriceData = {
        bid: 2650.0,
        ask: 2651.0,
        ts: Date.now() - 10000, // 10 seconds ago
      };
      await redis.set('price:oanda:XAUUSD', JSON.stringify(expiredPrice));

      // Set fresh price
      await mockCache.setPrice('XAUUSD', 2655.0, 2656.0);

      // Test: Get price with 5 second TTL
      const price = await priceCache.getPriceFromAnyExchange('XAUUSD', 5000);

      expect(price).toBeDefined();
      // Should get the fresh price, not the expired one
      expect(price!.bid).toBe(2655.0);
      expect(price!.ask).toBe(2656.0);

      // Cleanup
      await redis.del('price:oanda:XAUUSD', 'price:mock:XAUUSD');
    });

    it('should return price with maxAgeMs=5000 when price is within 5 seconds', async () => {
      const oandaCache = new PriceCacheService('oanda', redis);
      await oandaCache.setPrice(testSymbol, 2650.0, 2651.0);

      const price = await priceCache.getPriceFromAnyExchange(testSymbol, 5000);

      expect(price).toBeDefined();
      expect(price!.bid).toBe(2650.0);
      expect(price!.ask).toBe(2651.0);

      // Cleanup
      await redis.del(`price:oanda:${testSymbol}`);
    });

    it('should return any price without maxAgeMs (no TTL check)', async () => {
      // Setup: Create an old price
      const oldPrice: PriceData = {
        bid: 2650.0,
        ask: 2651.0,
        ts: Date.now() - 60000, // 60 seconds ago
      };
      await redis.set(`price:oanda:${testSymbol}`, JSON.stringify(oldPrice));

      // Test: Get price without TTL check
      const price = await priceCache.getPriceFromAnyExchange(testSymbol);

      expect(price).toBeDefined();
      expect(price!.bid).toBe(2650.0);
      expect(price!.ask).toBe(2651.0);

      // Cleanup
      await redis.del(`price:oanda:${testSymbol}`);
    });

    it('should return null when all prices are expired', async () => {
      // Setup: Create multiple expired prices
      const expiredPrice1: PriceData = {
        bid: 2650.0,
        ask: 2651.0,
        ts: Date.now() - 10000, // 10 seconds ago
      };
      const expiredPrice2: PriceData = {
        bid: 2655.0,
        ask: 2656.0,
        ts: Date.now() - 15000, // 15 seconds ago
      };

      await redis.set('price:oanda:XAUUSD', JSON.stringify(expiredPrice1));
      await redis.set('price:mock:XAUUSD', JSON.stringify(expiredPrice2));

      // Test: Get price with 5 second TTL
      const price = await priceCache.getPriceFromAnyExchange('XAUUSD', 5000);

      expect(price).toBeNull();

      // Cleanup
      await redis.del('price:oanda:XAUUSD', 'price:mock:XAUUSD');
    });
  });

  describe('isValidPrice', () => {
    it('should correctly validate non-null and non-expired prices', async () => {
      const freshPrice: PriceData = {
        bid: 2650.0,
        ask: 2651.0,
        ts: Date.now(),
      };

      const isValid = priceCache.isValidPrice(freshPrice, 5000);
      expect(isValid).toBe(true);
    });

    it('should return false for null price', () => {
      const isValid = priceCache.isValidPrice(null, 5000);
      expect(isValid).toBe(false);
    });

    it('should return false for expired price', () => {
      const expiredPrice: PriceData = {
        bid: 2650.0,
        ask: 2651.0,
        ts: Date.now() - 10000, // 10 seconds ago
      };

      const isValid = priceCache.isValidPrice(expiredPrice, 5000);
      expect(isValid).toBe(false);
    });

    it('should return true for any non-null price when maxAgeMs is undefined', () => {
      const oldPrice: PriceData = {
        bid: 2650.0,
        ask: 2651.0,
        ts: Date.now() - 60000, // 60 seconds ago
      };

      const isValid = priceCache.isValidPrice(oldPrice);
      expect(isValid).toBe(true);
    });

    it('should return false for null price even without maxAgeMs', () => {
      const isValid = priceCache.isValidPrice(null);
      expect(isValid).toBe(false);
    });

    it('should validate price exactly at TTL boundary', () => {
      const maxAgeMs = 5000;
      const boundaryPrice: PriceData = {
        bid: 2650.0,
        ask: 2651.0,
        ts: Date.now() - maxAgeMs, // Exactly at boundary
      };

      const isValid = priceCache.isValidPrice(boundaryPrice, maxAgeMs);
      expect(isValid).toBe(true);
    });

    it('should invalidate price just beyond TTL boundary', () => {
      const maxAgeMs = 5000;
      const justExpiredPrice: PriceData = {
        bid: 2650.0,
        ask: 2651.0,
        ts: Date.now() - maxAgeMs - 1, // Just beyond boundary
      };

      const isValid = priceCache.isValidPrice(justExpiredPrice, maxAgeMs);
      expect(isValid).toBe(false);
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

      const failingCache = new PriceCacheService(
        exchangeCode,
        disconnectedRedis,
      );

      // Should throw error on operations
      await expect(failingCache.getPrice(testSymbol)).rejects.toThrow();
      await expect(
        failingCache.setPrice(testSymbol, 2650.0, 2651.0),
      ).rejects.toThrow();

      // Don't call quit() on disconnected instance - it will throw
      disconnectedRedis.disconnect();
    });
  });
});
