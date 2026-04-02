/**
 * Unit tests for AccountService
 * Tests caching behavior, TTL expiration, and cache management
 */

import { AccountService } from '../../../src/services/account.service';
import { AccountRepository } from '@dal';
import { createTestAccount } from '@telegram-trading-bot-mini/shared/test-utils';
import pino from 'pino';

describe('AccountService', () => {
  let accountService: AccountService;
  let mockAccountRepository: jest.Mocked<AccountRepository>;
  const logger = pino({ level: 'silent' });
  const cacheTtlMs = 1000; // 1 second for testing

  beforeEach(() => {
    mockAccountRepository = {
      findOne: jest.fn(),
    } as any;

    accountService = new AccountService(
      mockAccountRepository,
      cacheTtlMs,
      logger,
    );
  });

  describe('getAccountById', () => {
    it('should fetch account from database on cache miss', async () => {
      const testAccount = createTestAccount({ accountId: 'test-account-1' });
      mockAccountRepository.findOne.mockResolvedValue(testAccount as any);

      const result = await accountService.getAccountById('test-account-1');

      expect(result).toEqual(testAccount);
      expect(mockAccountRepository.findOne).toHaveBeenCalledWith({
        accountId: 'test-account-1',
      });
      expect(mockAccountRepository.findOne).toHaveBeenCalledTimes(1);
    });

    it('should return cached account on cache hit', async () => {
      const testAccount = createTestAccount({ accountId: 'test-account-2' });
      mockAccountRepository.findOne.mockResolvedValue(testAccount as any);

      // First call - cache miss
      const result1 = await accountService.getAccountById('test-account-2');
      expect(result1).toEqual(testAccount);

      // Second call - cache hit
      const result2 = await accountService.getAccountById('test-account-2');
      expect(result2).toEqual(testAccount);

      // Should only call DB once
      expect(mockAccountRepository.findOne).toHaveBeenCalledTimes(1);
    });

    it('should return null when account not found', async () => {
      mockAccountRepository.findOne.mockResolvedValue(null);

      const result = await accountService.getAccountById('non-existent');

      expect(result).toBeNull();
      expect(mockAccountRepository.findOne).toHaveBeenCalledWith({
        accountId: 'non-existent',
      });
    });

    it('should not cache null results', async () => {
      mockAccountRepository.findOne.mockResolvedValue(null);

      // First call
      await accountService.getAccountById('non-existent');

      // Second call - should query DB again
      await accountService.getAccountById('non-existent');

      expect(mockAccountRepository.findOne).toHaveBeenCalledTimes(2);
    });

    it('should fetch from DB after cache expires', async () => {
      const testAccount = createTestAccount({ accountId: 'test-account-3' });
      mockAccountRepository.findOne.mockResolvedValue(testAccount as any);

      // First call - cache miss
      await accountService.getAccountById('test-account-3');
      expect(mockAccountRepository.findOne).toHaveBeenCalledTimes(1);

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, cacheTtlMs + 100));

      // Second call - cache expired, should fetch from DB
      await accountService.getAccountById('test-account-3');
      expect(mockAccountRepository.findOne).toHaveBeenCalledTimes(2);
    });

    it('should cache multiple accounts independently', async () => {
      const account1 = createTestAccount({ accountId: 'account-1' });
      const account2 = createTestAccount({ accountId: 'account-2' });

      mockAccountRepository.findOne
        .mockResolvedValueOnce(account1 as any)
        .mockResolvedValueOnce(account2 as any);

      // Fetch both accounts
      const result1 = await accountService.getAccountById('account-1');
      const result2 = await accountService.getAccountById('account-2');

      expect(result1).toEqual(account1);
      expect(result2).toEqual(account2);

      // Fetch again - should use cache
      await accountService.getAccountById('account-1');
      await accountService.getAccountById('account-2');

      // Should only call DB twice (once per account)
      expect(mockAccountRepository.findOne).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalidateCache', () => {
    it('should remove account from cache', async () => {
      const testAccount = createTestAccount({ accountId: 'test-account-4' });
      mockAccountRepository.findOne.mockResolvedValue(testAccount as any);

      // Cache the account
      await accountService.getAccountById('test-account-4');
      expect(mockAccountRepository.findOne).toHaveBeenCalledTimes(1);

      // Invalidate cache
      accountService.invalidateCache('test-account-4');

      // Fetch again - should query DB
      await accountService.getAccountById('test-account-4');
      expect(mockAccountRepository.findOne).toHaveBeenCalledTimes(2);
    });

    it('should not throw error when invalidating non-existent cache entry', () => {
      expect(() => {
        accountService.invalidateCache('non-existent');
      }).not.toThrow();
    });
  });

  describe('clearCache', () => {
    it('should remove all cached accounts', async () => {
      const account1 = createTestAccount({ accountId: 'account-1' });
      const account2 = createTestAccount({ accountId: 'account-2' });

      mockAccountRepository.findOne
        .mockResolvedValueOnce(account1 as any)
        .mockResolvedValueOnce(account2 as any);

      // Cache both accounts
      await accountService.getAccountById('account-1');
      await accountService.getAccountById('account-2');
      expect(mockAccountRepository.findOne).toHaveBeenCalledTimes(2);

      // Clear cache
      accountService.clearCache();

      // Fetch again - should query DB for both
      await accountService.getAccountById('account-1');
      await accountService.getAccountById('account-2');
      expect(mockAccountRepository.findOne).toHaveBeenCalledTimes(4);
    });
  });

  describe('getCacheStats', () => {
    it('should return empty stats when cache is empty', () => {
      const stats = accountService.getCacheStats();

      expect(stats.size).toBe(0);
      expect(stats.entries).toEqual([]);
    });

    it('should return cache statistics', async () => {
      const account1 = createTestAccount({ accountId: 'account-1' });
      const account2 = createTestAccount({ accountId: 'account-2' });

      mockAccountRepository.findOne
        .mockResolvedValueOnce(account1 as any)
        .mockResolvedValueOnce(account2 as any);

      // Cache both accounts
      await accountService.getAccountById('account-1');
      await accountService.getAccountById('account-2');

      const stats = accountService.getCacheStats();

      expect(stats.size).toBe(2);
      expect(stats.entries).toHaveLength(2);
      expect(stats.entries[0].accountId).toBe('account-1');
      expect(stats.entries[0].isExpired).toBe(false);
      expect(stats.entries[1].accountId).toBe('account-2');
      expect(stats.entries[1].isExpired).toBe(false);
    });

    it('should mark expired entries in stats', async () => {
      const testAccount = createTestAccount({ accountId: 'test-account' });
      mockAccountRepository.findOne.mockResolvedValue(testAccount as any);

      // Cache the account
      await accountService.getAccountById('test-account');

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, cacheTtlMs + 100));

      const stats = accountService.getCacheStats();

      expect(stats.size).toBe(1);
      expect(stats.entries[0].isExpired).toBe(true);
    });
  });

  describe('cleanupExpiredEntries', () => {
    it('should remove expired entries from cache', async () => {
      const account1 = createTestAccount({ accountId: 'account-1' });
      const account2 = createTestAccount({ accountId: 'account-2' });

      mockAccountRepository.findOne
        .mockResolvedValueOnce(account1 as any)
        .mockResolvedValueOnce(account2 as any);

      // Cache first account
      await accountService.getAccountById('account-1');

      // Wait for first account to expire
      await new Promise((resolve) => setTimeout(resolve, cacheTtlMs + 100));

      // Cache second account (after first expired)
      await accountService.getAccountById('account-2');

      // Cleanup expired entries
      accountService.cleanupExpiredEntries();

      const stats = accountService.getCacheStats();

      // Only account-2 should remain
      expect(stats.size).toBe(1);
      expect(stats.entries[0].accountId).toBe('account-2');
    });

    it('should not remove non-expired entries', async () => {
      const testAccount = createTestAccount({ accountId: 'test-account' });
      mockAccountRepository.findOne.mockResolvedValue(testAccount as any);

      // Cache the account
      await accountService.getAccountById('test-account');

      // Cleanup immediately (entry not expired)
      accountService.cleanupExpiredEntries();

      const stats = accountService.getCacheStats();

      expect(stats.size).toBe(1);
      expect(stats.entries[0].accountId).toBe('test-account');
    });

    it('should handle empty cache gracefully', () => {
      expect(() => {
        accountService.cleanupExpiredEntries();
      }).not.toThrow();

      const stats = accountService.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('cache with account configs', () => {
    it('should cache account with configs correctly', async () => {
      const testAccount = createTestAccount({
        accountId: 'config-account',
        configs: {
          takeProfitIndex: 1,
          forceNoTakeProfit: false,
          defaultLotSize: 0.1,
        },
      });

      mockAccountRepository.findOne.mockResolvedValue(testAccount as any);

      // First call - cache miss
      const result1 = await accountService.getAccountById('config-account');
      expect(result1?.configs?.takeProfitIndex).toBe(1);
      expect(result1?.configs?.forceNoTakeProfit).toBe(false);

      // Second call - cache hit
      const result2 = await accountService.getAccountById('config-account');
      expect(result2?.configs?.takeProfitIndex).toBe(1);

      // Should only call DB once
      expect(mockAccountRepository.findOne).toHaveBeenCalledTimes(1);
    });
  });
});
