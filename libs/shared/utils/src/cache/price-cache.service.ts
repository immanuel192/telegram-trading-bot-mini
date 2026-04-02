/**
 * Price Cache Service
 *
 * Purpose:
 * Manages real-time price data caching in Redis with exchange-scoped keys.
 * Enables fast price lookups for market orders without entry price.
 *
 * Exports:
 * - PriceData interface
 * - PriceCacheService class
 *
 * Core Flow:
 * 1. Background jobs fetch prices from brokers
 * 2. Prices stored in Redis with universal symbol format
 * 3. Order executor fetches cached prices for market orders
 * 4. TTL validation performed at read time by consumers
 */

import Redis from 'ioredis';

/**
 * Price data structure stored in Redis
 * Contains bid/ask prices and timestamp for TTL validation
 */
export interface PriceData {
  /** Bid price (buy price) */
  bid: number;
  /** Ask price (sell price) */
  ask: number;
  /** Unix timestamp in milliseconds when price was cached */
  ts: number;
}

/**
 * Service for caching real-time price data in Redis
 *
 * Cache Key Format: `price:${exchangeCode}:${universalSymbol}`
 * - exchangeCode: Broker exchange code (e.g., "oanda", "mock")
 * - universalSymbol: Universal symbol format (e.g., "XAUUSD", not "XAU_USD")
 *
 * Example:
 * ```typescript
 * const priceCache = new PriceCacheService('oanda', redis);
 * await priceCache.setPrice('XAUUSD', 2650.5, 2651.0);
 * const price = await priceCache.getPrice('XAUUSD');
 * // price = { bid: 2650.5, ask: 2651.0, ts: 1736640000000 }
 * ```
 */
export class PriceCacheService {
  constructor(
    private readonly exchangeCode: string,
    private readonly redis: Redis
  ) {}

  /**
   * Get cached price for a symbol from this exchange
   *
   * **Note:** This method does NOT validate price freshness. Callers should check
   * the `ts` field and validate against their TTL requirements, or use the
   * `isValidPrice()` helper method.
   *
   * @param symbol Universal symbol format (e.g., "XAUUSD")
   * @returns Price data or null if not cached
   */
  async getPrice(symbol: string): Promise<PriceData | null> {
    const key = this.getCacheKey(symbol);
    const data = await this.redis.get(key);

    if (!data) {
      return null;
    }

    return JSON.parse(data) as PriceData;
  }

  /**
   * Get cached price for a symbol from ANY exchange
   *
   * **Purpose:**
   * Provides flexible price lookup when exchange-specific price is not available.
   * Useful for validation scenarios where any valid price is better than no price.
   *
   * **How It Works:**
   * 1. Scans all Redis keys matching pattern `price:*:${symbol}`
   * 2. For each key found, fetches and validates the price
   * 3. Returns first valid (non-null, non-expired) price found
   * 4. Returns null if no valid prices exist for the symbol
   *
   * **TTL Validation:**
   * - If `maxAgeMs` is provided: Only returns prices within TTL
   * - If `maxAgeMs` is undefined: Returns any price (no TTL check)
   *
   * @param symbol Universal symbol format (e.g., "XAUUSD")
   * @param maxAgeMs Optional maximum age in milliseconds (TTL validation)
   * @returns First valid price found from any exchange, or null if none found
   */
  async getPriceFromAnyExchange(
    symbol: string,
    maxAgeMs?: number
  ): Promise<PriceData | null> {
    try {
      // Scan for all keys matching pattern: price:*:${symbol}
      const pattern = `price:*:${symbol}`;
      const keys: string[] = [];

      // Use SCAN to find all matching keys (non-blocking)
      let cursor = '0';
      do {
        const [nextCursor, matchedKeys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100
        );
        cursor = nextCursor;
        keys.push(...matchedKeys);
      } while (cursor !== '0');

      // No keys found for this symbol
      if (keys.length === 0) {
        return null;
      }

      // Fetch and validate prices from all exchanges
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (!data) {
          continue;
        }

        const price = JSON.parse(data) as PriceData;

        // Validate price (non-null and within TTL if maxAgeMs provided)
        if (this.isValidPrice(price, maxAgeMs)) {
          return price;
        }
      }

      // No valid prices found
      return null;
    } catch (error) {
      // Log error but don't throw - graceful degradation
      console.error(
        `Error fetching price from any exchange for ${symbol}:`,
        error
      );
      return null;
    }
  }

  /**
   * Validate if a price is non-null and within TTL
   *
   * **Purpose:**
   * Helper method to check price validity based on TTL requirements.
   * Useful for callers who fetch prices and need to validate freshness.
   *
   * **Validation Rules:**
   * 1. Price must be non-null
   * 2. If `maxAgeMs` provided: `Date.now() - price.ts <= maxAgeMs`
   * 3. If `maxAgeMs` undefined: Only check non-null (no TTL validation)
   *
   * @param price Price data to validate (can be null)
   * @param maxAgeMs Optional maximum age in milliseconds
   * @returns True if price is valid and within TTL, false otherwise
   */
  isValidPrice(price: PriceData | null, maxAgeMs?: number): boolean {
    // Check if price is non-null
    if (!price) {
      return false;
    }

    // If maxAgeMs not provided, only check non-null
    if (maxAgeMs === undefined) {
      return true;
    }

    // Check TTL: price must be within maxAgeMs
    const ageMs = Date.now() - price.ts;
    return ageMs <= maxAgeMs;
  }

  /**
   * Set cached price for a symbol
   * Automatically adds current timestamp
   *
   * @param symbol Universal symbol format (e.g., "XAUUSD")
   * @param bid Bid price
   * @param ask Ask price
   */
  async setPrice(symbol: string, bid: number, ask: number): Promise<void> {
    const key = this.getCacheKey(symbol);
    const data: PriceData = {
      bid,
      ask,
      ts: Date.now(),
    };

    await this.redis.set(key, JSON.stringify(data));
  }

  /**
   * Generate Redis cache key for a symbol
   *
   * @param symbol Universal symbol format
   * @returns Cache key in format: price:${exchangeCode}:${symbol}
   */
  private getCacheKey(symbol: string): string {
    return `price:${this.exchangeCode}:${symbol}`;
  }
}
