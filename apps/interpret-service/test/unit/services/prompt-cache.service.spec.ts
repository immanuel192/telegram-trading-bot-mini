/**
 * Purpose: Unit tests for PromptCacheService.
 * Tests: Cache hit/miss scenarios, TTL expiration, cache invalidation, and error handling.
 * Core Flow: Mock repository responses and verify cache behavior with TTL tracking.
 */

import { PromptCacheService } from '../../../src/services/prompt-cache.service';
import { PromptRuleRepository } from '@dal';
import {
  fakeLogger,
  suiteName,
} from '@telegram-trading-bot-mini/shared/test-utils';

describe(suiteName(__filename), () => {
  let service: PromptCacheService;
  let mockRepository: jest.Mocked<PromptRuleRepository>;
  let mockLogger: any;

  const mockPromptId = 'test-prompt-1';
  const mockPromptRule = {
    promptId: mockPromptId,
    name: 'Test Prompt',
    description: 'Test prompt for unit tests',
    systemPrompt: 'Test classification prompt\n\nTest extraction prompt',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    // Create mock repository
    mockRepository = {
      findByPromptId: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as any;

    mockLogger = fakeLogger;

    // Create service with short TTL for testing (1 second)
    service = new PromptCacheService(mockRepository, mockLogger, 1);
  });

  describe('getPrompt', () => {
    it('should return cached prompt on cache hit', async () => {
      // Arrange
      mockRepository.findByPromptId.mockResolvedValue(mockPromptRule);

      // First call - cache miss
      await service.getPrompt(mockPromptId);

      // Second call - should hit cache
      const result = await service.getPrompt(mockPromptId);

      // Assert
      expect(result).toEqual({
        systemPrompt: mockPromptRule.systemPrompt,
        hash: expect.any(String),
      });
      expect(result.hash).toHaveLength(8); // First 8 chars of SHA-256

      // Repository should only be called once (first call)
      expect(mockRepository.findByPromptId).toHaveBeenCalledTimes(1);
      expect(mockRepository.findByPromptId).toHaveBeenCalledWith(mockPromptId);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        {
          promptId: mockPromptId,
          cacheKey: `${mockPromptId}:no-schema`,
          hash: expect.any(String),
        },
        'Prompt cache hit',
      );
    });

    it('should fetch from database on cache miss', async () => {
      // Arrange
      mockRepository.findByPromptId.mockResolvedValue(mockPromptRule);

      // Act
      const result = await service.getPrompt(mockPromptId);

      // Assert
      expect(result).toEqual({
        systemPrompt: mockPromptRule.systemPrompt,
        hash: expect.any(String),
      });
      expect(result.hash).toHaveLength(8);

      expect(mockRepository.findByPromptId).toHaveBeenCalledTimes(1);
      expect(mockRepository.findByPromptId).toHaveBeenCalledWith(mockPromptId);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        { promptId: mockPromptId, cacheKey: `${mockPromptId}:no-schema` },
        'Prompt cache miss - fetching from DB',
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        {
          promptId: mockPromptId,
          cacheKey: `${mockPromptId}:no-schema`,
          hash: expect.any(String),
          hasSchema: false,
          expiresAt: expect.any(Date),
        },
        'Prompt cached successfully with hash and placeholder replaced',
      );
    });

    it('should handle expired cache entries', async () => {
      // Arrange
      mockRepository.findByPromptId.mockResolvedValue(mockPromptRule);

      // First call - cache miss and populate cache
      await service.getPrompt(mockPromptId);

      // Wait for TTL to expire (1 second + small buffer)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Second call - cache expired
      const result = await service.getPrompt(mockPromptId);

      // Assert
      expect(result).toEqual({
        systemPrompt: mockPromptRule.systemPrompt,
        hash: expect.any(String),
      });

      // Repository should be called twice (once for each call due to expiration)
      expect(mockRepository.findByPromptId).toHaveBeenCalledTimes(2);
    });

    it('should compute consistent hash for same prompt content', async () => {
      // Arrange
      mockRepository.findByPromptId.mockResolvedValue(mockPromptRule);

      // Act - fetch twice
      const result1 = await service.getPrompt(mockPromptId);
      service.clearCache(); // Clear to force re-fetch
      const result2 = await service.getPrompt(mockPromptId);

      // Assert - same content should produce same hash
      expect(result1.hash).toBe(result2.hash);
    });

    it('should compute different hash for different prompt content', async () => {
      // Arrange
      const mockPromptRule2 = {
        ...mockPromptRule,
        systemPrompt: 'Different system prompt content',
      };

      mockRepository.findByPromptId
        .mockResolvedValueOnce(mockPromptRule)
        .mockResolvedValueOnce(mockPromptRule2);

      // Act
      const result1 = await service.getPrompt('prompt1');
      const result2 = await service.getPrompt('prompt2');

      // Assert - different content should produce different hash
      expect(result1.hash).not.toBe(result2.hash);
    });

    it('should throw error when prompt not found in database', async () => {
      // Arrange
      mockRepository.findByPromptId.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getPrompt(mockPromptId)).rejects.toThrow(
        `Prompt rule not found: ${mockPromptId}`,
      );

      expect(mockRepository.findByPromptId).toHaveBeenCalledWith(mockPromptId);
      expect(mockLogger.error).toHaveBeenCalledWith(
        { promptId: mockPromptId },
        'Prompt rule not found in database',
      );
    });

    it('should handle concurrent requests for same promptId', async () => {
      // Arrange
      mockRepository.findByPromptId.mockResolvedValue(mockPromptRule);

      // Act - make multiple concurrent requests
      const promises = Array.from({ length: 5 }, () =>
        service.getPrompt(mockPromptId),
      );
      const results = await Promise.all(promises);

      // Assert
      results.forEach((result) => {
        expect(result).toEqual({
          systemPrompt: mockPromptRule.systemPrompt,
          hash: expect.any(String),
        });
      });

      // Repository should be called for each concurrent request
      // Note: Current implementation doesn't deduplicate concurrent requests
      expect(mockRepository.findByPromptId).toHaveBeenCalledTimes(5);
    });
  });

  describe('clearCache', () => {
    it('should clear cache for specific promptId', async () => {
      // Arrange
      mockRepository.findByPromptId.mockResolvedValue(mockPromptRule);
      await service.getPrompt(mockPromptId); // Populate cache

      // Act
      service.clearCache(mockPromptId);

      // Verify cache is cleared by calling getPrompt again
      await service.getPrompt(mockPromptId);

      // Assert
      expect(mockRepository.findByPromptId).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        { promptId: mockPromptId, deleted: true },
        'Cleared cache for specific promptId',
      );
    });

    it('should clear entire cache when no promptId provided', async () => {
      // Arrange
      mockRepository.findByPromptId.mockResolvedValue(mockPromptRule);
      await service.getPrompt(mockPromptId); // Populate cache

      // Act
      service.clearCache(); // Clear all cache

      // Verify cache is cleared by calling getPrompt again
      await service.getPrompt(mockPromptId);

      // Assert
      expect(mockRepository.findByPromptId).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        { clearedEntries: 1 },
        'Cleared entire prompt cache',
      );
    });

    it('should handle clearing non-existent promptId', () => {
      // Act & Assert - should not throw error
      expect(() => service.clearCache('non-existent-id')).not.toThrow();

      expect(mockLogger.info).toHaveBeenCalledWith(
        { promptId: 'non-existent-id', deleted: false },
        'Cleared cache for specific promptId',
      );
    });
  });

  describe('getCacheStats', () => {
    it('should return correct cache statistics', async () => {
      // Arrange
      mockRepository.findByPromptId.mockResolvedValue(mockPromptRule);
      await service.getPrompt(mockPromptId); // Populate cache

      // Act
      const stats = service.getCacheStats();

      // Assert
      expect(stats).toEqual({
        size: 1,
        entries: [
          {
            promptId: `${mockPromptId}:no-schema`,
            expiresAt: expect.any(Date),
          },
        ],
      });
    });

    it('should return empty stats for empty cache', () => {
      // Act
      const stats = service.getCacheStats();

      // Assert
      expect(stats).toEqual({
        size: 0,
        entries: [],
      });
    });
  });

  describe('TTL behavior', () => {
    it('should use custom TTL when provided', () => {
      // Arrange
      const customTTL = 60; // 60 seconds
      const customService = new PromptCacheService(
        mockRepository,
        mockLogger,
        customTTL,
      );

      // Act & Assert
      expect(customService).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        { ttlSeconds: customTTL },
        'PromptCacheService initialized with TTL',
      );
    });

    it('should use default TTL when not provided', () => {
      // Arrange
      const defaultService = new PromptCacheService(mockRepository, mockLogger);

      // Act & Assert
      expect(defaultService).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        { ttlSeconds: 1800 },
        'PromptCacheService initialized with TTL',
      );
    });
  });
});
