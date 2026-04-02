/**
 * Purpose: Integration tests for PromptCacheService.
 * Tests: Interaction with real MongoDB and cache behavior verification.
 * Core Flow: Setup test prompts in DB → Test cache miss/hit → Test invalidation → Cleanup.
 */

import {
  suiteName,
  setupDb,
  teardownDb,
  cleanupDb,
  fakeLogger,
} from '@telegram-trading-bot-mini/shared/test-utils';
import { PromptCacheService } from '../../src/services/prompt-cache.service';
import { PromptRuleRepository } from '@dal';
import { PromptRule } from '@dal/models/prompt-rule.model';

describe(suiteName(__filename), () => {
  let service: PromptCacheService;
  let promptRuleRepository: PromptRuleRepository;

  // Test data
  const prompt1: Partial<PromptRule> = {
    promptId: 'test-prompt-1',
    name: 'Test Prompt 1',
    description: 'Description 1',
    systemPrompt: 'Classify 1\n\nExtract 1',
  };

  const prompt2: Partial<PromptRule> = {
    promptId: 'test-prompt-2',
    name: 'Test Prompt 2',
    description: 'Description 2',
    systemPrompt: 'Classify 2\n\nExtract 2',
  };

  beforeAll(async () => {
    await setupDb();
    promptRuleRepository = new PromptRuleRepository();
    // Initialize service with 60s TTL for tests
    service = new PromptCacheService(promptRuleRepository, fakeLogger, 60);
  });

  afterAll(async () => {
    await teardownDb();
  });

  beforeEach(async () => {
    await cleanupDb();
    service.clearCache();

    // Insert test prompts (create copies to avoid _id mutation issues)
    await promptRuleRepository.create({ ...prompt1 } as PromptRule);
    await promptRuleRepository.create({ ...prompt2 } as PromptRule);
  });

  describe('Cache Behavior', () => {
    it('should fetch from database on cache miss and cache the result', async () => {
      // Verify cache is empty initially
      let stats = service.getCacheStats();
      expect(stats.size).toBe(0);

      // First fetch - should go to DB
      const result = await service.getPrompt(prompt1.promptId!);

      expect(result).toEqual({
        systemPrompt: prompt1.systemPrompt,
        hash: expect.any(String),
      });
      expect(result?.hash).toHaveLength(8); // Hash should be 8 chars

      // Verify it's now in cache
      stats = service.getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.entries[0].promptId).toBe(`${prompt1.promptId}:no-schema`);
    });

    it('should serve from cache on subsequent requests', async () => {
      // First fetch to populate cache
      await service.getPrompt(prompt1.promptId!);

      // Get stats to capture expiration time
      const statsBefore = service.getCacheStats();
      const expiresAt = statsBefore.entries[0].expiresAt.getTime();

      // Second fetch
      const result = await service.getPrompt(prompt1.promptId!);

      expect(result).toEqual({
        systemPrompt: prompt1.systemPrompt,
        hash: expect.any(String),
      });

      // Verify cache didn't change (same expiration means it wasn't re-fetched/re-set)
      const statsAfter = service.getCacheStats();
      expect(statsAfter.entries[0].expiresAt.getTime()).toBe(expiresAt);
    });

    it('should handle multiple prompts correctly', async () => {
      // Fetch first prompt
      await service.getPrompt(prompt1.promptId!);
      let stats = service.getCacheStats();
      expect(stats.size).toBe(1);

      // Fetch second prompt
      await service.getPrompt(prompt2.promptId!);
      stats = service.getCacheStats();
      expect(stats.size).toBe(2);

      const cachedIds = stats.entries.map((e) => e.promptId).sort();
      expect(cachedIds).toEqual(
        [
          `${prompt1.promptId}:no-schema`,
          `${prompt2.promptId}:no-schema`,
        ].sort(),
      );
    });

    it('should throw error for non-existent prompt', async () => {
      await expect(service.getPrompt('non-existent-id')).rejects.toThrow(
        /not found/,
      );

      // Cache should remain empty
      const stats = service.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('Cache Invalidation', () => {
    it('should clear specific prompt from cache', async () => {
      // Populate cache with both prompts
      await service.getPrompt(prompt1.promptId!);
      await service.getPrompt(prompt2.promptId!);

      expect(service.getCacheStats().size).toBe(2);

      // Clear one
      service.clearCache(prompt1.promptId);

      const stats = service.getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.entries[0].promptId).toBe(`${prompt2.promptId}:no-schema`);
    });

    it('should clear entire cache', async () => {
      // Populate cache with both prompts
      await service.getPrompt(prompt1.promptId!);
      await service.getPrompt(prompt2.promptId!);

      expect(service.getCacheStats().size).toBe(2);

      // Clear all
      service.clearCache();

      const stats = service.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });
});
