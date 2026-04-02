/**
 * Unit tests for BrokerAdapterFactory
 */

import { BrokerAdapterFactory } from '../../../src/adapters/factory';
import { Account, AccountRepository, BrokerConfig } from '@dal';
import { TokenManager } from '../../../src/services/token-manager.service';
import { createTestAccount } from '@telegram-trading-bot-mini/shared/test-utils';
import pino from 'pino';

describe('BrokerAdapterFactory', () => {
  let factory: BrokerAdapterFactory;
  let mockAccountRepository: jest.Mocked<AccountRepository>;
  let mockTokenManager: jest.Mocked<TokenManager>;
  const logger = pino({ level: 'silent' });

  // Shared test accounts - defined once, reused across tests
  const mockAccount = createTestAccount({
    accountId: 'acc-1',
    brokerConfig: {
      exchangeCode: 'mock',
      apiKey: 'test-key',
      accountId: 'test-broker-account',
      unitsPerLot: 100000,
    },
  }) as Account;

  // Add apiSecret manually since factory doesn't include it
  (mockAccount.brokerConfig as any).apiSecret = 'test-secret';

  const mockAccountWithJWT = createTestAccount({
    accountId: 'acc-jwt',
    brokerConfig: {
      exchangeCode: 'mock',
      jwtToken: 'test-jwt-token',
      refreshToken: 'test-refresh-token',
      unitsPerLot: 100000,
    } as any,
  }) as Account;

  const mockAccountNoConfig = {
    ...createTestAccount({ accountId: 'acc-no-config' }),
    brokerConfig: undefined,
  } as Account;

  const mockAccountNoAuth = createTestAccount({
    accountId: 'acc-no-auth',
    brokerConfig: {
      exchangeCode: 'mock',
      unitsPerLot: 100000,
      // No jwtToken, apiKey, or apiSecret
    } as any,
  }) as Account;
  // Remove apiKey that factory adds by default
  delete (mockAccountNoAuth.brokerConfig as any).apiKey;
  delete (mockAccountNoAuth.brokerConfig as any).accountId;

  beforeEach(() => {
    mockAccountRepository = {
      findAllActive: jest.fn(),
      findByAccountId: jest.fn(),
    } as any;

    mockTokenManager = {
      registerToken: jest.fn(),
    } as any;

    factory = new BrokerAdapterFactory(
      mockAccountRepository,
      mockTokenManager,
      logger,
    );
  });

  afterEach(async () => {
    await factory.closeAll();
  });

  describe('getAdapter', () => {
    it('should create and cache adapters by accountId', async () => {
      mockAccountRepository.findByAccountId.mockResolvedValue(mockAccount);

      const adapter1 = await factory.getAdapter('acc-1');
      const adapter2 = await factory.getAdapter('acc-1');

      expect(adapter1).toBe(adapter2); // Same instance
      expect(adapter1.ready()).toBe(true);
      expect(factory.getAdapterCount()).toBe(1);
      expect(mockAccountRepository.findByAccountId).toHaveBeenCalledTimes(1); // Only called once, then cached
    });

    it('should create separate adapters for different accounts', async () => {
      const account1 = createTestAccount({
        accountId: 'acc-1',
        brokerConfig: { exchangeCode: 'mock' },
      }) as Account;
      const account2 = createTestAccount({
        accountId: 'acc-2',
        brokerConfig: { exchangeCode: 'mock' },
      }) as Account;

      mockAccountRepository.findByAccountId.mockImplementation((id) => {
        if (id === 'acc-1') return Promise.resolve(account1);
        if (id === 'acc-2') return Promise.resolve(account2);
        return Promise.resolve(null);
      });

      const adapter1 = await factory.getAdapter('acc-1');
      const adapter2 = await factory.getAdapter('acc-2');

      expect(adapter1).not.toBe(adapter2);
      expect(factory.getAdapterCount()).toBe(2);
    });

    it('should throw error when account not found', async () => {
      mockAccountRepository.findByAccountId.mockResolvedValue(null);

      await expect(factory.getAdapter('acc-1')).rejects.toThrow(
        'Account not found: acc-1',
      );
    });

    it('should throw error when account has no broker config', async () => {
      mockAccountRepository.findByAccountId.mockResolvedValue(
        mockAccountNoConfig,
      );

      await expect(factory.getAdapter('acc-no-config')).rejects.toThrow(
        'No broker config for account acc-no-config',
      );
    });

    it('should throw error for unsupported exchange', async () => {
      const accountWithUnknownExchange = createTestAccount({
        accountId: 'acc-unknown',
        brokerConfig: { exchangeCode: 'unknown-exchange' },
      }) as Account;

      mockAccountRepository.findByAccountId.mockResolvedValue(
        accountWithUnknownExchange,
      );

      await expect(factory.getAdapter('acc-unknown')).rejects.toThrow(
        'Unsupported exchange: unknown-exchange',
      );
    });
  });

  describe('preloadAdapters', () => {
    it('should pre-load all active account adapters without extra DB queries', async () => {
      const accounts = [
        createTestAccount({
          accountId: 'acc-1',
          brokerConfig: { exchangeCode: 'mock' },
        }),
        createTestAccount({
          accountId: 'acc-2',
          brokerConfig: { exchangeCode: 'mock' },
        }),
        createTestAccount({
          accountId: 'acc-3',
          brokerConfig: { exchangeCode: 'mock' },
        }),
      ] as Account[];

      mockAccountRepository.findAllActive.mockResolvedValue(accounts);

      await factory.preloadAdapters();

      expect(mockAccountRepository.findAllActive).toHaveBeenCalledTimes(1);
      expect(mockAccountRepository.findByAccountId).not.toHaveBeenCalled(); // Should NOT query DB again
      expect(factory.getAdapterCount()).toBe(3);
    });

    it('should continue pre-loading even if some adapters fail', async () => {
      const accounts = [
        createTestAccount({
          accountId: 'acc-1',
          brokerConfig: { exchangeCode: 'mock' },
        }),
        createTestAccount({
          accountId: 'acc-2',
          brokerConfig: { exchangeCode: 'unknown' }, // This will fail
        }),
        createTestAccount({
          accountId: 'acc-3',
          brokerConfig: { exchangeCode: 'mock' },
        }),
      ] as Account[];

      mockAccountRepository.findAllActive.mockResolvedValue(accounts);

      await factory.preloadAdapters();

      // Should have loaded acc-1 and acc-3, skipped acc-2
      expect(factory.getAdapterCount()).toBe(2);
    });

    it('should handle empty account list', async () => {
      mockAccountRepository.findAllActive.mockResolvedValue([]);

      await factory.preloadAdapters();

      expect(factory.getAdapterCount()).toBe(0);
    });
  });

  describe('closeAll', () => {
    it('should close all adapters and clear cache', async () => {
      const account1 = createTestAccount({
        accountId: 'acc-1',
        brokerConfig: { exchangeCode: 'mock' },
      }) as Account;
      const account2 = createTestAccount({
        accountId: 'acc-2',
        brokerConfig: { exchangeCode: 'mock' },
      }) as Account;

      mockAccountRepository.findByAccountId.mockImplementation((id) => {
        if (id === 'acc-1') return Promise.resolve(account1);
        if (id === 'acc-2') return Promise.resolve(account2);
        return Promise.resolve(null);
      });

      const adapter1 = await factory.getAdapter('acc-1');
      const adapter2 = await factory.getAdapter('acc-2');

      expect(adapter1.ready()).toBe(true);
      expect(adapter2.ready()).toBe(true);
      expect(factory.getAdapterCount()).toBe(2);

      await factory.closeAll();

      expect(adapter1.ready()).toBe(false);
      expect(adapter2.ready()).toBe(false);
      expect(factory.getAdapterCount()).toBe(0);
    });
  });

  describe('getAdapterCount', () => {
    it('should return correct adapter count', async () => {
      mockAccountRepository.findByAccountId.mockImplementation((id) => {
        return Promise.resolve(
          createTestAccount({
            accountId: id,
            brokerConfig: { exchangeCode: 'mock' },
          }) as Account,
        );
      });

      expect(factory.getAdapterCount()).toBe(0);

      await factory.getAdapter('acc-1');
      expect(factory.getAdapterCount()).toBe(1);

      await factory.getAdapter('acc-2');
      expect(factory.getAdapterCount()).toBe(2);

      await factory.closeAll();
      expect(factory.getAdapterCount()).toBe(0);
    });
  });

  describe('registerAdapterToken', () => {
    it('should register JWT token with TokenManager', async () => {
      mockAccountRepository.findByAccountId.mockResolvedValue(
        mockAccountWithJWT,
      );

      await factory.getAdapter('acc-jwt');

      expect(mockTokenManager.registerToken).toHaveBeenCalledWith(
        'mock:acc-jwt',
        'acc-jwt',
        'test-jwt-token',
        'test-refresh-token',
      );
    });

    it('should register API key with TokenManager', async () => {
      mockAccountRepository.findByAccountId.mockResolvedValue(mockAccount);

      await factory.getAdapter('acc-1');

      expect(mockTokenManager.registerToken).toHaveBeenCalledWith(
        'mock:acc-1',
        'acc-1',
        'test-key',
        'test-secret',
      );
    });

    it('should not register token when brokerConfig is missing', async () => {
      mockAccountRepository.findByAccountId.mockResolvedValue(
        mockAccountNoConfig,
      );

      await expect(factory.getAdapter('acc-no-config')).rejects.toThrow(
        'No broker config for account acc-no-config',
      );

      expect(mockTokenManager.registerToken).not.toHaveBeenCalled();
    });

    it('should not register token when neither JWT nor API key is present', async () => {
      mockAccountRepository.findByAccountId.mockResolvedValue(
        mockAccountNoAuth,
      );

      await factory.getAdapter('acc-no-auth');

      // Should still create adapter but not register token
      expect(factory.getAdapterCount()).toBe(1);
      expect(mockTokenManager.registerToken).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should throw error when adapter.init() fails', async () => {
      // Mock validateConfig to throw an error
      const originalMockAdapter =
        require('../../../src/adapters/mock/mock.adapter').MockAdapter;
      const validateConfigSpy = jest
        .spyOn(originalMockAdapter.prototype, 'validateConfig')
        .mockImplementation(() => {
          throw new Error('Invalid configuration');
        });

      mockAccountRepository.findByAccountId.mockResolvedValue(mockAccount);

      // Adapter.init() will fail due to validation error
      await expect(factory.getAdapter('acc-1')).rejects.toThrow(
        'Invalid configuration',
      );

      // Adapter should not be cached if init fails
      expect(factory.getAdapterCount()).toBe(0);

      validateConfigSpy.mockRestore();
    });

    it('should not cache adapter when initialization fails', async () => {
      // Mock validateConfig to throw an error
      const originalMockAdapter =
        require('../../../src/adapters/mock/mock.adapter').MockAdapter;
      const validateConfigSpy = jest
        .spyOn(originalMockAdapter.prototype, 'validateConfig')
        .mockImplementation(() => {
          throw new Error('Invalid configuration');
        });

      mockAccountRepository.findByAccountId.mockResolvedValue(mockAccount);

      // First attempt should fail
      await expect(factory.getAdapter('acc-1')).rejects.toThrow(
        'Invalid configuration',
      );
      expect(factory.getAdapterCount()).toBe(0);

      // Second attempt should also fail (not using cached failed adapter)
      await expect(factory.getAdapter('acc-1')).rejects.toThrow(
        'Invalid configuration',
      );
      expect(factory.getAdapterCount()).toBe(0);
      expect(mockAccountRepository.findByAccountId).toHaveBeenCalledTimes(2);

      validateConfigSpy.mockRestore();
    });

    it('should handle database errors gracefully', async () => {
      mockAccountRepository.findByAccountId.mockRejectedValue(
        new Error('Database connection failed'),
      );

      await expect(factory.getAdapter('acc-db-error')).rejects.toThrow(
        'Database connection failed',
      );

      expect(factory.getAdapterCount()).toBe(0);
    });
  });
});
