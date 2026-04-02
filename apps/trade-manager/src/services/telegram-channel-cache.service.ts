/**
 * Purpose: In-memory cache service for Telegram channel code lookups
 * Exports: TelegramChannelCacheService class
 * Core Flow: Check cache → if miss/expired → query DB → update cache → return result
 *
 * This service provides fast channel code lookups by caching MongoDB results in memory.
 * Cache entries expire after 5 minutes to balance performance and data freshness.
 */

import { TelegramChannelRepository } from '../../../../libs/dal/src/repositories/telegram-channel.repository';

/**
 * Cache entry structure
 */
interface CacheEntry {
  channelCode: string;
  timestamp: number;
}

/**
 * In-memory cache service for Telegram channel code lookups
 * Reduces database queries by caching channel code mappings
 */
export class TelegramChannelCacheService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly telegramChannelRepository: TelegramChannelRepository
  ) {}

  /**
   * Get channel code by channel ID
   * Checks cache first, falls back to database on miss/expiration
   *
   * @param channelId - Telegram channel ID (e.g., '-1001234567890')
   * @returns Channel code or null if not found
   */
  async getChannelCodeById(channelId: string): Promise<string | null> {
    try {
      // Check cache first
      const cached = this.cache.get(channelId);

      if (cached && this.isValid(cached)) {
        return cached.channelCode;
      }

      // Cache miss or expired - query database
      const channel = await this.telegramChannelRepository.findByChannelId(
        channelId
      );

      if (!channel) {
        return null;
      }

      // Update cache
      this.cache.set(channelId, {
        channelCode: channel.channelCode,
        timestamp: Date.now(),
      });

      return channel.channelCode;
    } catch (error) {
      // On error, return null and let caller handle
      // Don't cache errors to allow retry on next request
      throw error;
    }
  }

  /**
   * Invalidate cache entry for a specific channel ID
   * Useful when channel data is updated
   *
   * @param channelId - Telegram channel ID to invalidate
   */
  invalidate(channelId: string): void {
    this.cache.delete(channelId);
  }

  /**
   * Clear entire cache
   * Useful for testing or manual cache refresh
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Check if cache entry is still valid (not expired)
   *
   * @param entry - Cache entry to check
   * @returns true if entry is within TTL, false otherwise
   */
  private isValid(entry: CacheEntry): boolean {
    const age = Date.now() - entry.timestamp;
    return age < this.TTL_MS;
  }

  /**
   * Clean up expired cache entries
   * Optional method for periodic cleanup to prevent memory growth
   * Can be called periodically or on-demand
   */
  cleanupExpired(): void {
    const now = Date.now();

    for (const [channelId, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= this.TTL_MS) {
        this.cache.delete(channelId);
      }
    }
  }

  /**
   * Get cache statistics for monitoring
   * Useful for debugging and performance monitoring
   */
  getStats(): {
    size: number;
    entries: Array<{ channelId: string; age: number }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(
      ([channelId, entry]) => ({
        channelId,
        age: now - entry.timestamp,
      })
    );

    return {
      size: this.cache.size,
      entries,
    };
  }
}
