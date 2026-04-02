/**
 * Unit tests for TelegramChannelCacheService
 */

import { TelegramChannelCacheService } from '../../../src/services/telegram-channel-cache.service';
import { TelegramChannelRepository } from '../../../../../libs/dal/src/repositories/telegram-channel.repository';

describe('TelegramChannelCacheService', () => {
  let service: TelegramChannelCacheService;
  let mockRepository: jest.Mocked<TelegramChannelRepository>;

  beforeEach(() => {
    // Create mock repository
    mockRepository = {
      findByChannelId: jest.fn(),
    } as any;

    service = new TelegramChannelCacheService(mockRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getChannelCodeById', () => {
    it('should return channel code from database on cache miss', async () => {
      const channelId = '-1001234567890';
      const channelCode = 'test-channel';

      mockRepository.findByChannelId.mockResolvedValue({
        channelId,
        channelCode,
      } as any);

      const result = await service.getChannelCodeById(channelId);

      expect(result).toBe(channelCode);
      expect(mockRepository.findByChannelId).toHaveBeenCalledWith(channelId);
      expect(mockRepository.findByChannelId).toHaveBeenCalledTimes(1);
    });

    it('should return channel code from cache on cache hit', async () => {
      const channelId = '-1001234567890';
      const channelCode = 'test-channel';

      mockRepository.findByChannelId.mockResolvedValue({
        channelId,
        channelCode,
      } as any);

      // First call - cache miss, queries DB
      const result1 = await service.getChannelCodeById(channelId);
      expect(result1).toBe(channelCode);
      expect(mockRepository.findByChannelId).toHaveBeenCalledTimes(1);

      // Second call - cache hit, no DB query
      const result2 = await service.getChannelCodeById(channelId);
      expect(result2).toBe(channelCode);
      expect(mockRepository.findByChannelId).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('should return null when channel not found in database', async () => {
      const channelId = '-1009999999999';

      mockRepository.findByChannelId.mockResolvedValue(null);

      const result = await service.getChannelCodeById(channelId);

      expect(result).toBeNull();
      expect(mockRepository.findByChannelId).toHaveBeenCalledWith(channelId);
    });

    it('should query database again after cache expiration', async () => {
      const channelId = '-1001234567890';
      const channelCode = 'test-channel';

      mockRepository.findByChannelId.mockResolvedValue({
        channelId,
        channelCode,
      } as any);

      // First call - cache miss
      await service.getChannelCodeById(channelId);
      expect(mockRepository.findByChannelId).toHaveBeenCalledTimes(1);

      // Mock time passing (5 minutes + 1ms)
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 5 * 60 * 1000 + 1);

      // Second call - cache expired, queries DB again
      await service.getChannelCodeById(channelId);
      expect(mockRepository.findByChannelId).toHaveBeenCalledTimes(2);

      jest.restoreAllMocks();
    });

    it('should throw error when database query fails', async () => {
      const channelId = '-1001234567890';
      const dbError = new Error('Database connection failed');

      mockRepository.findByChannelId.mockRejectedValue(dbError);

      await expect(service.getChannelCodeById(channelId)).rejects.toThrow(
        'Database connection failed'
      );
    });

    it('should not cache null results', async () => {
      const channelId = '-1009999999999';

      mockRepository.findByChannelId.mockResolvedValue(null);

      // First call
      const result1 = await service.getChannelCodeById(channelId);
      expect(result1).toBeNull();
      expect(mockRepository.findByChannelId).toHaveBeenCalledTimes(1);

      // Second call - should query DB again since null wasn't cached
      const result2 = await service.getChannelCodeById(channelId);
      expect(result2).toBeNull();
      expect(mockRepository.findByChannelId).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalidate', () => {
    it('should remove channel from cache', async () => {
      const channelId = '-1001234567890';
      const channelCode = 'test-channel';

      mockRepository.findByChannelId.mockResolvedValue({
        channelId,
        channelCode,
      } as any);

      // Populate cache
      await service.getChannelCodeById(channelId);
      expect(mockRepository.findByChannelId).toHaveBeenCalledTimes(1);

      // Invalidate cache
      service.invalidate(channelId);

      // Next call should query DB again
      await service.getChannelCodeById(channelId);
      expect(mockRepository.findByChannelId).toHaveBeenCalledTimes(2);
    });

    it('should not throw error when invalidating non-existent entry', () => {
      expect(() => service.invalidate('-1009999999999')).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should clear entire cache', async () => {
      const channels = [
        { channelId: '-1001111111111', channelCode: 'channel-1' },
        { channelId: '-1002222222222', channelCode: 'channel-2' },
        { channelId: '-1003333333333', channelCode: 'channel-3' },
      ];

      // Populate cache with multiple entries
      for (const channel of channels) {
        mockRepository.findByChannelId.mockResolvedValue(channel as any);
        await service.getChannelCodeById(channel.channelId);
      }

      expect(mockRepository.findByChannelId).toHaveBeenCalledTimes(3);

      // Clear cache
      service.clear();

      // All entries should be gone - next calls query DB
      for (const channel of channels) {
        mockRepository.findByChannelId.mockResolvedValue(channel as any);
        await service.getChannelCodeById(channel.channelId);
      }

      expect(mockRepository.findByChannelId).toHaveBeenCalledTimes(6); // 3 + 3
    });
  });

  describe('cleanupExpired', () => {
    it('should remove expired entries from cache', async () => {
      const channelId1 = '-1001111111111';
      const channelId2 = '-1002222222222';

      mockRepository.findByChannelId
        .mockResolvedValueOnce({
          channelId: channelId1,
          channelCode: 'channel-1',
        } as any)
        .mockResolvedValueOnce({
          channelId: channelId2,
          channelCode: 'channel-2',
        } as any);

      // Populate cache
      await service.getChannelCodeById(channelId1);
      await service.getChannelCodeById(channelId2);

      expect(mockRepository.findByChannelId).toHaveBeenCalledTimes(2);

      // Mock time passing (5 minutes + 1ms)
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 5 * 60 * 1000 + 1);

      // Cleanup expired entries
      service.cleanupExpired();

      // Both entries should be removed
      mockRepository.findByChannelId
        .mockResolvedValueOnce({
          channelId: channelId1,
          channelCode: 'channel-1',
        } as any)
        .mockResolvedValueOnce({
          channelId: channelId2,
          channelCode: 'channel-2',
        } as any);

      await service.getChannelCodeById(channelId1);
      await service.getChannelCodeById(channelId2);

      expect(mockRepository.findByChannelId).toHaveBeenCalledTimes(4); // 2 + 2

      jest.restoreAllMocks();
    });

    it('should not remove valid (non-expired) entries', async () => {
      const channelId = '-1001234567890';

      mockRepository.findByChannelId.mockResolvedValue({
        channelId,
        channelCode: 'test-channel',
      } as any);

      // Populate cache
      await service.getChannelCodeById(channelId);
      expect(mockRepository.findByChannelId).toHaveBeenCalledTimes(1);

      // Cleanup (no time passed, entry is still valid)
      service.cleanupExpired();

      // Entry should still be in cache
      await service.getChannelCodeById(channelId);
      expect(mockRepository.findByChannelId).toHaveBeenCalledTimes(1); // Still 1
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      const channels = [
        { channelId: '-1001111111111', channelCode: 'channel-1' },
        { channelId: '-1002222222222', channelCode: 'channel-2' },
      ];

      // Populate cache
      for (const channel of channels) {
        mockRepository.findByChannelId.mockResolvedValue(channel as any);
        await service.getChannelCodeById(channel.channelId);
      }

      const stats = service.getStats();

      expect(stats.size).toBe(2);
      expect(stats.entries).toHaveLength(2);
      expect(stats.entries[0].channelId).toBe('-1001111111111');
      expect(stats.entries[1].channelId).toBe('-1002222222222');
      expect(stats.entries[0].age).toBeGreaterThanOrEqual(0);
      expect(stats.entries[1].age).toBeGreaterThanOrEqual(0);
    });

    it('should return empty stats for empty cache', () => {
      const stats = service.getStats();

      expect(stats.size).toBe(0);
      expect(stats.entries).toHaveLength(0);
    });
  });
});
