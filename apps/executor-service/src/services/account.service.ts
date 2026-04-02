/**
 * Purpose: Account service with memory caching for executor-service.
 * Exports: AccountService class.
 * Core Flow: Provides cached read-through access to account data.
 *
 * This service implements a memory cache with TTL to reduce database queries
 * for frequently accessed account data. The cache is automatically invalidated
 * after the configured TTL expires.
 */

import { Account, AccountRepository } from '@dal';
import { LoggerInstance } from '@telegram-trading-bot-mini/shared/utils';

interface CacheEntry {
  account: Account;
  expiresAt: number;
}

export class AccountService {
  private cache: Map<string, CacheEntry> = new Map();

  constructor(
    private accountRepository: AccountRepository,
    private cacheTtlMs: number,
    private logger: LoggerInstance,
  ) {}

  /**
   * Get account by ID with read-through caching
   *
   * @param accountId - Account ID to fetch
   * @returns Account or null if not found
   */
  async getAccountById(accountId: string): Promise<Account | null> {
    // Check cache first
    const cached = this.cache.get(accountId);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      this.logger.debug(
        { accountId, expiresAt: cached.expiresAt },
        'Account cache hit',
      );
      return cached.account;
    }

    // Cache miss or expired - fetch from database
    this.logger.debug({ accountId }, 'Account cache miss, fetching from DB');

    const account = await this.accountRepository.findOne({ accountId });

    if (!account) {
      this.logger.warn({ accountId }, 'Account not found');
      return null;
    }

    // Store in cache
    const expiresAt = now + this.cacheTtlMs;
    this.cache.set(accountId, {
      account,
      expiresAt,
    });

    this.logger.debug(
      { accountId, expiresAt, cacheTtlMs: this.cacheTtlMs },
      'Account cached',
    );

    return account;
  }

  /**
   * Invalidate cache for a specific account
   * Useful when account is updated externally
   *
   * @param accountId - Account ID to invalidate
   */
  invalidateCache(accountId: string): void {
    const deleted = this.cache.delete(accountId);
    if (deleted) {
      this.logger.debug({ accountId }, 'Account cache invalidated');
    }
  }

  /**
   * Clear all cached accounts
   * Useful for testing or manual cache refresh
   */
  clearCache(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.logger.info({ clearedEntries: size }, 'Account cache cleared');
  }

  /**
   * Get cache statistics
   * Useful for monitoring and debugging
   */
  getCacheStats(): {
    size: number;
    entries: Array<{
      accountId: string;
      expiresAt: number;
      isExpired: boolean;
    }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(
      ([accountId, entry]) => ({
        accountId,
        expiresAt: entry.expiresAt,
        isExpired: entry.expiresAt <= now,
      }),
    );

    return {
      size: this.cache.size,
      entries,
    };
  }

  /**
   * Clean up expired entries from cache
   * This is called periodically to prevent memory leaks
   */
  cleanupExpiredEntries(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [accountId, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(accountId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug({ cleaned }, 'Cleaned up expired cache entries');
    }
  }
}
