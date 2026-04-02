/**
 * Unit tests for TokenManager Service
 */

import { TokenManager } from '../../../src/services/token-manager.service';
import { AccountRepository } from '@dal';
import { IErrorCapture } from '@telegram-trading-bot-mini/shared/utils';
import pino from 'pino';

describe('TokenManager', () => {
  let tokenManager: TokenManager;
  let mockAccountRepository: jest.Mocked<AccountRepository>;
  let mockErrorCapture: jest.Mocked<IErrorCapture>;
  const logger = pino({ level: 'silent' });

  // Helper to create a mock JWT token with expiry
  const createMockJWT = (expiresInSeconds: number): string => {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + expiresInSeconds;
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64');
    const payload = Buffer.from(JSON.stringify({ exp, sub: 'test' })).toString(
      'base64',
    );
    const signature = 'mock-signature';
    return `${header}.${payload}.${signature}`;
  };

  beforeEach(() => {
    mockAccountRepository = {
      updateMany: jest.fn(),
    } as any;

    mockErrorCapture = {
      captureException: jest.fn(),
    } as any;

    tokenManager = new TokenManager(
      mockAccountRepository,
      logger,
      mockErrorCapture,
    );
  });

  afterEach(() => {
    tokenManager.clear();
  });

  describe('registerToken', () => {
    it('should register JWT token with refresh token', () => {
      const token = createMockJWT(3600); // 1 hour

      tokenManager.registerToken(
        'test-key',
        'account-1',
        token,
        'refresh-token-123',
      );

      const info = tokenManager.getTokenInfo('test-key');
      expect(info).toBeDefined();
      expect(info?.accessToken).toBe(token);
      expect(info?.refreshToken).toBe('refresh-token-123');
      expect(info?.accountId).toBe('account-1');
      expect(info?.isRefreshing).toBe(false);
      expect(info?.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should register API key token without refresh token', () => {
      tokenManager.registerToken('api-key', 'account-2', 'static-api-key');

      const info = tokenManager.getTokenInfo('api-key');
      expect(info).toBeDefined();
      expect(info?.accessToken).toBe('static-api-key');
      expect(info?.refreshToken).toBeUndefined();
      // API keys get 1 year expiry
      expect(info?.expiresAt).toBeGreaterThan(
        Date.now() + 364 * 24 * 60 * 60 * 1000,
      );
    });

    it('should parse JWT expiry correctly', () => {
      const token = createMockJWT(7200); // 2 hours

      tokenManager.registerToken('jwt-key', 'account-3', token, 'refresh');

      const info = tokenManager.getTokenInfo('jwt-key');
      const expectedExpiry = Date.now() + 7200 * 1000;

      // Allow 1 second tolerance for test execution time
      expect(info?.expiresAt).toBeGreaterThan(expectedExpiry - 1000);
      expect(info?.expiresAt).toBeLessThan(expectedExpiry + 1000);
    });

    it('should handle tokens without refresh token', () => {
      const token = createMockJWT(3600);

      tokenManager.registerToken('no-refresh-key', 'account-4', token);

      const info = tokenManager.getTokenInfo('no-refresh-key');
      expect(info?.refreshToken).toBeUndefined();
    });

    it('should skip re-registration of existing token', () => {
      const oldToken = createMockJWT(3600);
      const newToken = createMockJWT(7200);

      tokenManager.registerToken(
        'update-key',
        'account-5',
        oldToken,
        'old-refresh',
      );
      tokenManager.registerToken(
        'update-key',
        'account-5',
        newToken,
        'new-refresh',
      );

      const info = tokenManager.getTokenInfo('update-key');
      // Should still have old token (skipped re-registration)
      expect(info?.accessToken).toBe(oldToken);
      expect(info?.refreshToken).toBe('old-refresh');
    });
  });

  describe('getValidToken', () => {
    it('should return valid token without refresh', async () => {
      const token = createMockJWT(3600);
      tokenManager.registerToken('valid-key', 'account-1', token, 'refresh');

      const result = await tokenManager.getValidToken('valid-key');

      expect(result).toBe(token);
    });

    it('should return token for API key without refresh', async () => {
      tokenManager.registerToken('api-key', 'account-2', 'static-api-key');

      const result = await tokenManager.getValidToken('api-key');

      expect(result).toBe('static-api-key');
    });

    it('should throw error for unregistered token key', async () => {
      await expect(tokenManager.getValidToken('unknown-key')).rejects.toThrow(
        'Token not found for key: unknown-key',
      );
    });

    it('should refresh expired JWT token', async () => {
      const expiredToken = createMockJWT(-100); // Expired 100 seconds ago
      const newToken = createMockJWT(3600);

      tokenManager.registerToken(
        'expired-key',
        'account-1',
        expiredToken,
        'refresh-token',
      );

      const refreshFn = jest.fn().mockResolvedValue({
        accessToken: newToken,
        refreshToken: 'new-refresh-token',
      });

      mockAccountRepository.updateMany.mockResolvedValue({
        modifiedCount: 1,
      } as any);

      const result = await tokenManager.getValidToken('expired-key', refreshFn);

      expect(result).toBe(newToken);
      expect(refreshFn).toHaveBeenCalled();

      // Verify token was updated in memory
      const info = tokenManager.getTokenInfo('expired-key');
      expect(info?.accessToken).toBe(newToken);
      expect(info?.refreshToken).toBe('new-refresh-token');
    });

    it('should return expired token when no refresh function provided', async () => {
      const expiredToken = createMockJWT(-100);
      tokenManager.registerToken(
        'expired-no-fn',
        'account-1',
        expiredToken,
        'refresh',
      );

      // Should return expired token (for API keys)
      const result = await tokenManager.getValidToken('expired-no-fn');
      expect(result).toBe(expiredToken);
    });
  });

  describe('performRefresh', () => {
    it('should refresh token successfully', async () => {
      const oldToken = createMockJWT(-100);
      const newToken = createMockJWT(3600);

      tokenManager.registerToken(
        'refresh-key',
        'account-1',
        oldToken,
        'old-refresh',
      );

      const refreshFn = jest.fn().mockResolvedValue({
        accessToken: newToken,
        refreshToken: 'new-refresh',
      });

      mockAccountRepository.updateMany.mockResolvedValue({
        modifiedCount: 1,
      } as any);

      const result = await (tokenManager as any).performRefresh(
        'refresh-key',
        'account-1',
        refreshFn,
      );

      expect(result.accessToken).toBe(newToken);
      expect(result.refreshToken).toBe('new-refresh');
      expect(refreshFn).toHaveBeenCalled();
    });

    it('should persist refreshed token to database', async () => {
      const newToken = createMockJWT(3600);

      tokenManager.registerToken(
        'persist-key',
        'account-1',
        createMockJWT(-100),
        'old-refresh',
      );

      const refreshFn = jest.fn().mockResolvedValue({
        accessToken: newToken,
        refreshToken: 'new-refresh',
      });

      mockAccountRepository.updateMany.mockResolvedValue({
        modifiedCount: 1,
      } as any);

      await (tokenManager as any).performRefresh(
        'persist-key',
        'account-1',
        refreshFn,
      );

      expect(mockAccountRepository.updateMany).toHaveBeenCalledWith(
        { accountId: 'account-1' },
        {
          $set: {
            'brokerConfig.jwtToken': newToken,
            'brokerConfig.refreshToken': 'new-refresh',
          },
        },
      );
    });

    it('should retry on transient errors', async () => {
      const newToken = createMockJWT(3600);

      tokenManager.registerToken(
        'retry-key',
        'account-1',
        createMockJWT(-100),
        'refresh',
      );

      const refreshFn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          accessToken: newToken,
          refreshToken: 'new-refresh',
        });

      mockAccountRepository.updateMany.mockResolvedValue({
        modifiedCount: 1,
      } as any);

      const result = await (tokenManager as any).performRefresh(
        'retry-key',
        'account-1',
        refreshFn,
      );

      expect(result.accessToken).toBe(newToken);
      expect(refreshFn).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retries', async () => {
      tokenManager.registerToken(
        'max-retry-key',
        'account-1',
        createMockJWT(-100),
        'refresh',
      );

      const refreshFn = jest
        .fn()
        .mockRejectedValue(new Error('Persistent error'));

      await expect(
        (tokenManager as any).performRefresh(
          'max-retry-key',
          'account-1',
          refreshFn,
        ),
      ).rejects.toThrow('Persistent error');

      expect(refreshFn).toHaveBeenCalledTimes(2); // 2 attempts
    });

    it('should capture errors to Sentry', async () => {
      tokenManager.registerToken(
        'sentry-key',
        'account-1',
        createMockJWT(-100),
        'refresh',
      );

      const error = new Error('Refresh failed');
      const refreshFn = jest.fn().mockRejectedValue(error);

      await expect(
        (tokenManager as any).performRefresh(
          'sentry-key',
          'account-1',
          refreshFn,
        ),
      ).rejects.toThrow('Refresh failed');

      expect(mockErrorCapture.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          tokenKey: 'sentry-key',
          accountId: 'account-1',
          context: 'token_refresh_failed',
        }),
      );
    });
  });

  describe('race condition protection', () => {
    it('should share same refresh promise for concurrent calls', async () => {
      const expiredToken = createMockJWT(-100);
      const newToken = createMockJWT(3600);

      tokenManager.registerToken(
        'concurrent-key',
        'account-1',
        expiredToken,
        'refresh',
      );

      let refreshCallCount = 0;
      const refreshFn = jest.fn().mockImplementation(async () => {
        refreshCallCount++;
        // Simulate slow refresh
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {
          accessToken: newToken,
          refreshToken: 'new-refresh',
        };
      });

      mockAccountRepository.updateMany.mockResolvedValue({
        modifiedCount: 1,
      } as any);

      // Make 3 concurrent calls
      const [result1, result2, result3] = await Promise.all([
        tokenManager.getValidToken('concurrent-key', refreshFn),
        tokenManager.getValidToken('concurrent-key', refreshFn),
        tokenManager.getValidToken('concurrent-key', refreshFn),
      ]);

      // All should get the same new token
      expect(result1).toBe(newToken);
      expect(result2).toBe(newToken);
      expect(result3).toBe(newToken);

      // Refresh should only be called once
      expect(refreshCallCount).toBe(1);
    });

    it('should clear refresh promise after completion', async () => {
      const expiredToken = createMockJWT(-100);
      const newToken = createMockJWT(3600);

      tokenManager.registerToken(
        'clear-promise-key',
        'account-1',
        expiredToken,
        'refresh',
      );

      const refreshFn = jest.fn().mockResolvedValue({
        accessToken: newToken,
        refreshToken: 'new-refresh',
      });

      mockAccountRepository.updateMany.mockResolvedValue({
        modifiedCount: 1,
      } as any);

      await tokenManager.getValidToken('clear-promise-key', refreshFn);

      const info = tokenManager.getTokenInfo('clear-promise-key');
      expect(info?.refreshPromise).toBeUndefined();
      expect(info?.isRefreshing).toBe(false);
    });
  });

  describe('persistToken', () => {
    it('should update Account.brokerConfig with new tokens', async () => {
      const token = createMockJWT(3600);
      tokenManager.registerToken('persist-test', 'account-1', token, 'refresh');

      const metadata = tokenManager.getTokenInfo('persist-test')!;
      mockAccountRepository.updateMany.mockResolvedValue({
        modifiedCount: 1,
      } as any);

      await (tokenManager as any).persistToken('account-1', metadata);

      expect(mockAccountRepository.updateMany).toHaveBeenCalledWith(
        { accountId: 'account-1' },
        {
          $set: {
            'brokerConfig.jwtToken': token,
            'brokerConfig.refreshToken': 'refresh',
          },
        },
      );
    });

    it('should handle database errors gracefully without throwing', async () => {
      const token = createMockJWT(3600);
      tokenManager.registerToken('db-error-key', 'account-1', token, 'refresh');

      const metadata = tokenManager.getTokenInfo('db-error-key')!;
      const dbError = new Error('Database connection failed');
      mockAccountRepository.updateMany.mockRejectedValue(dbError);

      // Should not throw
      await expect(
        (tokenManager as any).persistToken('account-1', metadata),
      ).resolves.toBeUndefined();

      expect(mockErrorCapture.captureException).toHaveBeenCalledWith(
        dbError,
        expect.objectContaining({
          accountId: 'account-1',
          context: 'token_persist_failed',
        }),
      );
    });
  });

  describe('parseTokenExpiry', () => {
    it('should parse valid JWT token', () => {
      const token = createMockJWT(3600);

      const expiry = (tokenManager as any).parseTokenExpiry(token);
      const expectedExpiry = Date.now() + 3600 * 1000;

      expect(expiry).toBeGreaterThan(expectedExpiry - 1000);
      expect(expiry).toBeLessThan(expectedExpiry + 1000);
    });

    it('should return 1 year for invalid JWT', () => {
      const expiry = (tokenManager as any).parseTokenExpiry(
        'invalid.jwt.token',
      );
      const oneYearFromNow = Date.now() + 365 * 24 * 60 * 60 * 1000;

      // Should be approximately 1 year from now
      expect(expiry).toBeGreaterThan(oneYearFromNow - 1000);
      expect(expiry).toBeLessThan(oneYearFromNow + 1000);
    });

    it('should return 1 year for malformed JWT', () => {
      const expiry = (tokenManager as any).parseTokenExpiry('not-a-jwt');
      const oneYearFromNow = Date.now() + 365 * 24 * 60 * 60 * 1000;

      // Should be approximately 1 year from now
      expect(expiry).toBeGreaterThan(oneYearFromNow - 1000);
      expect(expiry).toBeLessThan(oneYearFromNow + 1000);
    });

    it('should return timestamp in milliseconds', () => {
      const token = createMockJWT(3600);

      const expiry = (tokenManager as any).parseTokenExpiry(token);

      // Should be a timestamp in milliseconds (13 digits)
      expect(expiry.toString().length).toBeGreaterThanOrEqual(13);
      expect(expiry).toBeGreaterThan(Date.now());
    });
  });

  describe('utility methods', () => {
    it('getTokenInfo should return metadata for valid key', () => {
      const token = createMockJWT(3600);
      tokenManager.registerToken('info-key', 'account-1', token, 'refresh');

      const info = tokenManager.getTokenInfo('info-key');

      expect(info).toBeDefined();
      expect(info?.accessToken).toBe(token);
      expect(info?.accountId).toBe('account-1');
    });

    it('getTokenInfo should return undefined for invalid key', () => {
      const info = tokenManager.getTokenInfo('non-existent-key');

      expect(info).toBeUndefined();
    });

    it('clear should remove all tokens from memory', () => {
      tokenManager.registerToken('key-1', 'account-1', 'token-1');
      tokenManager.registerToken('key-2', 'account-2', 'token-2');
      tokenManager.registerToken('key-3', 'account-3', 'token-3');

      expect(tokenManager.getTokenInfo('key-1')).toBeDefined();
      expect(tokenManager.getTokenInfo('key-2')).toBeDefined();
      expect(tokenManager.getTokenInfo('key-3')).toBeDefined();

      tokenManager.clear();

      expect(tokenManager.getTokenInfo('key-1')).toBeUndefined();
      expect(tokenManager.getTokenInfo('key-2')).toBeUndefined();
      expect(tokenManager.getTokenInfo('key-3')).toBeUndefined();
    });
  });
});
