/**
 * Balance Cache Service
 *
 * Purpose:
 * Manages account balance data caching in Redis with exchange and account scoping.
 * Provides standardized balance information across different broker types.
 *
 * Exports:
 * - BalanceInfo interface
 * - BalanceCacheService class
 *
 * Core Flow:
 * 1. Background jobs fetch balance from brokers
 * 2. Transform broker-specific AccountInfo to standardized BalanceInfo
 * 3. Store in Redis with exchange and account scoping
 * 4. Order executor fetches cached balance for lot size calculation
 * 5. TTL validation performed at read time by consumers
 */

import Redis from 'ioredis';

/**
 * Standardized balance information across all broker types
 * Maps from broker-specific AccountInfo to consistent structure
 */
export interface BalanceInfo {
  /** Total account balance */
  balance: number;
  /** Margin currently in use */
  marginUsed: number;
  /** Available margin for new positions */
  marginAvailable: number;
  /** Account equity (balance + unrealized P&L) */
  equity: number;
  /** Unix timestamp in milliseconds when balance was cached */
  ts: number;
}

/**
 * Service for caching account balance data in Redis
 *
 * Cache Key Format: `balance:${exchangeCode}:${accountId}`
 * - exchangeCode: Broker exchange code (e.g., "oanda", "mock")
 * - accountId: Internal account identifier
 *
 * Example:
 * ```typescript
 * const balanceCache = new BalanceCacheService('oanda', redis);
 * await balanceCache.setBalance('acc-123', {
 *   balance: 10000,
 *   marginUsed: 2000,
 *   marginAvailable: 8000,
 *   equity: 10500
 * });
 * const balance = await balanceCache.getBalance('acc-123');
 * // balance = { balance: 10000, marginUsed: 2000, ..., ts: 1736640000000 }
 * ```
 */
export class BalanceCacheService {
  constructor(
    private readonly exchangeCode: string,
    private readonly redis: Redis
  ) {}

  /**
   * Get cached balance for an account
   *
   * @param accountId Internal account identifier
   * @returns Balance info or null if not cached
   */
  async getBalance(accountId: string): Promise<BalanceInfo | null> {
    const key = this.getCacheKey(accountId);
    const data = await this.redis.get(key);

    if (!data) {
      return null;
    }

    return JSON.parse(data) as BalanceInfo;
  }

  /**
   * Set cached balance for an account
   * Automatically adds current timestamp
   *
   * @param accountId Internal account identifier
   * @param info Balance information (without timestamp)
   */
  async setBalance(
    accountId: string,
    info: Omit<BalanceInfo, 'ts'>
  ): Promise<void> {
    const key = this.getCacheKey(accountId);
    const data: BalanceInfo = {
      ...info,
      ts: Date.now(),
    };

    await this.redis.set(key, JSON.stringify(data));
  }

  /**
   * Generate Redis cache key for an account
   *
   * @param accountId Internal account identifier
   * @returns Cache key in format: balance:${exchangeCode}:${accountId}
   */
  private getCacheKey(accountId: string): string {
    return `balance:${this.exchangeCode}:${accountId}`;
  }
}
