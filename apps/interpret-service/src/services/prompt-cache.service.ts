/**
 * Purpose: Implement in-memory prompt caching service with TTL.
 * Exports: PromptCacheService class.
 * Core Flow: Read-through cache → fetch from DB on miss → compute hash → cache with TTL → return prompt with hash.
 */

import { PromptRuleRepository } from '@dal';
import { Logger } from 'pino';
import * as crypto from 'crypto';

/**
 * Cached prompt data with hash for session invalidation
 */
export interface CachedPrompt {
  /** Combined system prompt (classification + extraction) */
  systemPrompt: string;
  /** SHA-256 hash (first 8 chars) of systemPrompt for cache invalidation */
  hash: string;
}

/**
 * Cache entry with TTL tracking
 */
interface CacheEntry {
  prompt: CachedPrompt;
  expiresAt: number;
}

/**
 * Prompt caching service with in-memory read-through cache
 * MVP Note: In-memory cache is acceptable for single instance deployment
 * When scaling to multiple instances, migrate to Redis-based caching
 */
export class PromptCacheService {
  private cache: Map<string, CacheEntry> = new Map();
  private ttlMs: number;

  constructor(
    private readonly promptRuleRepository: PromptRuleRepository,
    private readonly logger: Logger,
    ttlSeconds = 1800 // Default: 30 minutes
  ) {
    this.ttlMs = ttlSeconds * 1000;
    this.logger.info({ ttlSeconds }, 'PromptCacheService initialized with TTL');
  }

  /**
   * Get prompt with hash by promptId with read-through caching
   * Combines classification and extraction prompts into single systemPrompt
   * Computes SHA-256 hash for session cache invalidation
   *
   * Standard Placeholder: {{PROMPT_RESPONSE_SCHEMA}}
   * - If schemaDoc is provided, replaces placeholder with schemaDoc
   * - If schemaDoc is not provided, replaces placeholder with empty string
   * - The replaced prompt is cached for performance
   *
   * @param promptId - Unique prompt rule identifier
   * @param schemaDoc - Optional schema documentation to replace {{PROMPT_RESPONSE_SCHEMA}} placeholder
   * @returns CachedPrompt with systemPrompt (with placeholder replaced) and hash
   * @throws Error if prompt not found in database
   */
  async getPrompt(promptId: string, schemaDoc?: string): Promise<CachedPrompt> {
    // Create cache key that includes schemaDoc presence (different cache entries for different schemas)
    const cacheKey = schemaDoc
      ? `${promptId}:with-schema`
      : `${promptId}:no-schema`;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.debug(
        { promptId, cacheKey, hash: cached.prompt.hash },
        'Prompt cache hit'
      );
      return cached.prompt;
    }

    // Cache miss or expired - fetch from database
    this.logger.debug(
      { promptId, cacheKey },
      'Prompt cache miss - fetching from DB'
    );
    const promptRule = await this.promptRuleRepository.findByPromptId(promptId);

    if (!promptRule) {
      this.logger.error({ promptId }, 'Prompt rule not found in database');
      throw new Error(`Prompt rule not found: ${promptId}`);
    }

    // Get system prompt and replace placeholder
    let systemPrompt = promptRule.systemPrompt;

    // Replace {{PROMPT_RESPONSE_SCHEMA}} placeholder
    // - If schemaDoc provided, use it
    // - Otherwise, replace with empty string
    const replacementText = schemaDoc || '';
    systemPrompt = systemPrompt.replace(
      '{{PROMPT_RESPONSE_SCHEMA}}',
      replacementText
    );

    // Compute hash for cache invalidation (hash includes the replaced content)
    const hash = crypto
      .createHash('sha256')
      .update(systemPrompt)
      .digest('hex')
      .substring(0, 8);

    const prompt: CachedPrompt = {
      systemPrompt,
      hash,
    };

    // Cache with TTL
    const expiresAt = Date.now() + this.ttlMs;
    this.cache.set(cacheKey, { prompt, expiresAt });

    this.logger.info(
      {
        promptId,
        cacheKey,
        hash,
        hasSchema: !!schemaDoc,
        expiresAt: new Date(expiresAt),
      },
      'Prompt cached successfully with hash and placeholder replaced'
    );

    return prompt;
  }

  /**
   * Clear cache for specific promptId or all prompts
   * Clears both with-schema and no-schema variants for the promptId
   * Useful for testing and manual cache invalidation
   * @param promptId - Optional prompt ID to clear. If not provided, clears entire cache
   */
  clearCache(promptId?: string): void {
    if (promptId) {
      // Clear both cache variants for this promptId
      const deletedNoSchema = this.cache.delete(`${promptId}:no-schema`);
      const deletedWithSchema = this.cache.delete(`${promptId}:with-schema`);
      const deleted = deletedNoSchema || deletedWithSchema;

      this.logger.info(
        { promptId, deleted },
        'Cleared cache for specific promptId'
      );
    } else {
      const size = this.cache.size;
      this.cache.clear();
      this.logger.info({ clearedEntries: size }, 'Cleared entire prompt cache');
    }
  }

  /**
   * Get cache statistics for monitoring
   * @returns Cache statistics including size and entries
   */
  getCacheStats(): {
    size: number;
    entries: Array<{ promptId: string; expiresAt: Date }>;
  } {
    const entries = Array.from(this.cache.entries()).map(
      ([promptId, entry]) => ({
        promptId,
        expiresAt: new Date(entry.expiresAt),
      })
    );

    return {
      size: this.cache.size,
      entries,
    };
  }
}
