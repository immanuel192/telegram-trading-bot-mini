/**
 * Integration tests for Account model with BrokerConfig
 * Tests saving and retrieving accounts with broker connection configuration
 */

import { AccountRepository } from '../../src/repositories/account.repository';
import { AccountType, BrokerConfig } from '../../src/models/account.model';
import {
  suiteName,
  setupDb,
  teardownDb,
  cleanupDb,
  COLLECTIONS,
} from '@telegram-trading-bot-mini/shared/test-utils';

describe(suiteName(__filename), () => {
  const accountRepository = new AccountRepository();

  beforeAll(async () => {
    await setupDb();
  });

  afterAll(async () => {
    await teardownDb();
  });

  beforeEach(async () => {
    // Clean up accounts collection before each test
    await cleanupDb(null, [COLLECTIONS.ACCOUNT]);
  });

  describe('BrokerConfig CRUD operations', () => {
    it('should save and retrieve account with brokerConfig for Binance', async () => {
      const brokerConfig: BrokerConfig = {
        exchangeCode: 'binanceusdm',
        apiKey: 'test-binance-key',
        apiSecret: 'test-binance-secret',
        isSandbox: true,
        unitsPerLot: 100000,
      };

      const account = await accountRepository.create({
        accountId: 'test-acc-binance-01',
        telegramChannelCode: 'test-channel',
        isActive: true,
        accountType: AccountType.API,
        promptId: 'test-prompt-01',
        brokerConfig,
      });

      expect(account.brokerConfig).toBeDefined();
      expect(account.brokerConfig?.exchangeCode).toBe('binanceusdm');
      expect(account.brokerConfig?.apiKey).toBe('test-binance-key');
      expect(account.brokerConfig?.apiSecret).toBe('test-binance-secret');
      expect(account.brokerConfig?.isSandbox).toBe(true);

      // Retrieve and verify
      const retrieved = await accountRepository.findByAccountId(
        'test-acc-binance-01',
      );
      expect(retrieved).toBeDefined();
      expect(retrieved?.brokerConfig).toBeDefined();
      expect(retrieved?.brokerConfig?.exchangeCode).toBe('binanceusdm');
      expect(retrieved?.brokerConfig?.apiKey).toBe('test-binance-key');
    });

    it('should save and retrieve account with brokerConfig for Oanda', async () => {
      const brokerConfig: BrokerConfig = {
        exchangeCode: 'oanda',
        apiKey: 'test-oanda-token',
        accountId: '001-001-1234567-001',
        isSandbox: true,
        unitsPerLot: 1, // OANDA uses units directly
      };

      const account = await accountRepository.create({
        accountId: 'test-acc-oanda-01',
        telegramChannelCode: 'test-channel',
        isActive: true,
        accountType: AccountType.API,
        promptId: 'test-prompt-01',
        brokerConfig,
      });

      expect(account.brokerConfig).toBeDefined();
      expect(account.brokerConfig?.exchangeCode).toBe('oanda');
      expect(account.brokerConfig?.accountId).toBe('001-001-1234567-001');

      // Retrieve and verify
      const retrieved =
        await accountRepository.findByAccountId('test-acc-oanda-01');
      expect(retrieved?.brokerConfig?.accountId).toBe('001-001-1234567-001');
    });

    it('should save and retrieve account with brokerConfig for mock exchange', async () => {
      const brokerConfig: BrokerConfig = {
        exchangeCode: 'mock',
        apiKey: 'mock-key',
        isSandbox: true,
        unitsPerLot: 100000,
      };

      const account = await accountRepository.create({
        accountId: 'test-acc-mock-01',
        telegramChannelCode: 'test-channel',
        isActive: true,
        accountType: AccountType.API,
        promptId: 'test-prompt-01',
        brokerConfig,
      });

      expect(account.brokerConfig).toBeDefined();
      expect(account.brokerConfig?.exchangeCode).toBe('mock');

      // Retrieve and verify
      const retrieved =
        await accountRepository.findByAccountId('test-acc-mock-01');
      expect(retrieved?.brokerConfig?.exchangeCode).toBe('mock');
    });

    it('should save account without brokerConfig (optional field)', async () => {
      const account = await accountRepository.create({
        accountId: 'test-acc-no-broker-01',
        telegramChannelCode: 'test-channel',
        isActive: true,
        accountType: AccountType.API,
        promptId: 'test-prompt-01',
      });

      expect(account.brokerConfig).toBeUndefined();

      // Retrieve and verify
      const retrieved = await accountRepository.findByAccountId(
        'test-acc-no-broker-01',
      );
      expect(retrieved?.brokerConfig).toBeUndefined();
    });

    it('should update account to add brokerConfig', async () => {
      // Create account without brokerConfig
      const created = await accountRepository.create({
        accountId: 'test-acc-update-01',
        telegramChannelCode: 'test-channel',
        isActive: true,
        accountType: AccountType.API,
        promptId: 'test-prompt-01',
      });

      // Update to add brokerConfig
      const brokerConfig: BrokerConfig = {
        exchangeCode: 'binanceusdm',
        apiKey: 'updated-key',
        apiSecret: 'updated-secret',
        isSandbox: false,
        unitsPerLot: 100000,
      };

      await accountRepository.update(created._id!.toString(), { brokerConfig });

      // Retrieve and verify
      const retrieved =
        await accountRepository.findByAccountId('test-acc-update-01');
      expect(retrieved?.brokerConfig).toBeDefined();
      expect(retrieved?.brokerConfig?.exchangeCode).toBe('binanceusdm');
      expect(retrieved?.brokerConfig?.isSandbox).toBe(false);
    });

    it('should save brokerConfig with custom serverUrl', async () => {
      const brokerConfig: BrokerConfig = {
        exchangeCode: 'xm',
        apiKey: 'xm-key',
        serverUrl: 'https://custom-xm-server.com',
        accountId: 'xm-12345678',
        jwtToken: 'test-jwt-token',
        refreshToken: 'test-refresh-token',
        unitsPerLot: 100000,
      };

      const account = await accountRepository.create({
        accountId: 'test-acc-xm-01',
        telegramChannelCode: 'test-channel',
        isActive: true,
        accountType: AccountType.API,
        promptId: 'test-prompt-01',
        brokerConfig,
      });

      expect(account.brokerConfig?.serverUrl).toBe(
        'https://custom-xm-server.com',
      );
      expect(account.brokerConfig?.accountId).toBe('xm-12345678');
      expect(account.brokerConfig?.jwtToken).toBe('test-jwt-token');
      expect(account.brokerConfig?.refreshToken).toBe('test-refresh-token');

      // Retrieve and verify
      const retrieved =
        await accountRepository.findByAccountId('test-acc-xm-01');
      expect(retrieved?.brokerConfig?.serverUrl).toBe(
        'https://custom-xm-server.com',
      );
      expect(retrieved?.brokerConfig?.accountId).toBe('xm-12345678');
    });
  });
});
