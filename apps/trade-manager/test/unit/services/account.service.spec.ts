import { AccountService } from '../../../src/services/account.service';
import { AccountRepository } from '@dal';
import { Account, AccountType } from '@dal/models';
import { LoggerInstance } from '@telegram-trading-bot-mini/shared/utils';
import { ObjectId } from 'mongodb';

describe('AccountService', () => {
  let service: AccountService;
  let mockRepository: jest.Mocked<AccountRepository>;
  let mockLogger: LoggerInstance;

  beforeEach(() => {
    mockRepository = {
      findById: jest.fn(),
      findByAccountId: jest.fn(),
      findAllActive: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      setActiveStatus: jest.fn(),
    } as any;

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      fatal: jest.fn(),
    } as any;

    service = new AccountService(mockRepository, mockLogger);
  });

  describe('getById', () => {
    it('should get account by MongoDB id', async () => {
      const id = new ObjectId();
      const mockAccount: Account = {
        _id: id,
        accountId: 'test-account',
        isActive: true,
        telegramChannelCode: 'test-channel',
        accountType: AccountType.MT5,
      } as Account;

      mockRepository.findById.mockResolvedValue(mockAccount);

      const result = await service.getById(id);

      expect(result).toEqual(mockAccount);
      expect(mockRepository.findById).toHaveBeenCalledWith(id.toString());
    });

    it('should return null if account not found', async () => {
      const id = new ObjectId();
      mockRepository.findById.mockResolvedValue(null);

      const result = await service.getById(id);

      expect(result).toBeNull();
    });
  });

  describe('getAccountByIdWithCache', () => {
    it('should cache and return account', async () => {
      const mockAccount: Account = {
        accountId: 'cached-account',
        isActive: true,
        telegramChannelCode: 'test-channel',
        accountType: AccountType.MT5,
      } as Account;

      mockRepository.findByAccountId.mockResolvedValue(mockAccount);

      // First call - should hit DB
      const result1 = await service.getAccountByIdWithCache('cached-account');
      expect(result1).toEqual(mockAccount);
      expect(mockRepository.findByAccountId).toHaveBeenCalledTimes(1);

      // Second call - should hit cache
      const result2 = await service.getAccountByIdWithCache('cached-account');
      expect(result2).toEqual(mockAccount);
      expect(mockRepository.findByAccountId).toHaveBeenCalledTimes(1);
    });

    it('should respect TTL', async () => {
      const mockAccount: Account = {
        accountId: 'ttl-account',
        isActive: true,
        telegramChannelCode: 'test-channel',
        accountType: AccountType.MT5,
      } as Account;

      mockRepository.findByAccountId.mockResolvedValue(mockAccount);

      // Use a custom small TTL for testing
      const smallTtl = 50;

      // First call - should hit DB
      await service.getAccountByIdWithCache('ttl-account', smallTtl);
      expect(mockRepository.findByAccountId).toHaveBeenCalledTimes(1);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, smallTtl + 10));

      // Second call - should hit DB again
      await service.getAccountByIdWithCache('ttl-account');
      expect(mockRepository.findByAccountId).toHaveBeenCalledTimes(2);
    });
  });

  describe('getByAccountId', () => {
    it('should get account by business accountId', async () => {
      const mockAccount: Account = {
        accountId: 'test-account',
        isActive: true,
        telegramChannelCode: 'test-channel',
        accountType: AccountType.MT5,
      } as Account;

      mockRepository.findByAccountId.mockResolvedValue(mockAccount);

      const result = await service.getByAccountId('test-account');

      expect(result).toEqual(mockAccount);
      expect(mockRepository.findByAccountId).toHaveBeenCalledWith(
        'test-account',
      );
    });
  });

  describe('getAllActive', () => {
    it('should return all active accounts', async () => {
      const mockAccounts: Account[] = [
        {
          accountId: 'account-1',
          isActive: true,
          telegramChannelCode: 'channel-1',
          accountType: AccountType.MT5,
        } as Account,
        {
          accountId: 'account-2',
          isActive: true,
          telegramChannelCode: 'channel-2',
          accountType: AccountType.API,
        } as Account,
      ];

      mockRepository.findAllActive.mockResolvedValue(mockAccounts);

      const result = await service.getAllActive();

      expect(result).toEqual(mockAccounts);
      expect(mockRepository.findAllActive).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create a new account', async () => {
      const accountData: Omit<Account, '_id'> = {
        accountId: 'new-account',
        isActive: true,
        telegramChannelCode: 'test-channel',
        accountType: AccountType.MT5,
      } as Account;

      const createdAccount: Account = {
        ...accountData,
        _id: new ObjectId(),
      } as Account;

      mockRepository.create.mockResolvedValue(createdAccount);

      const result = await service.create(accountData);

      expect(result).toEqual(createdAccount);
      expect(mockRepository.create).toHaveBeenCalledWith(accountData);
      expect(mockLogger.info).toHaveBeenCalledWith(
        { accountId: 'new-account' },
        'Creating new account',
      );
    });

    it('should throw error if accountId is missing', async () => {
      const accountData: any = {
        isActive: true,
        telegramChannelCode: 'test-channel',
        accountType: AccountType.MT5,
      };

      await expect(service.create(accountData)).rejects.toThrow(
        'accountId is required',
      );
    });

    it('should throw error if isActive is missing', async () => {
      const accountData: any = {
        accountId: 'new-account',
        telegramChannelCode: 'test-channel',
        accountType: AccountType.MT5,
      };

      await expect(service.create(accountData)).rejects.toThrow(
        'isActive is required',
      );
    });

    it('should throw error if telegramChannelCode is missing', async () => {
      const accountData: any = {
        accountId: 'new-account',
        isActive: true,
        accountType: AccountType.MT5,
      };

      await expect(service.create(accountData)).rejects.toThrow(
        'telegramChannelCode is required',
      );
    });

    it('should throw error if accountType is missing', async () => {
      const accountData: any = {
        accountId: 'new-account',
        isActive: true,
        telegramChannelCode: 'test-channel',
      };

      await expect(service.create(accountData)).rejects.toThrow(
        'accountType is required',
      );
    });
  });

  describe('update', () => {
    it('should update an existing account', async () => {
      const existingAccount: Account = {
        _id: new ObjectId(),
        accountId: 'test-account',
        isActive: true,
        telegramChannelCode: 'test-channel',
        accountType: AccountType.MT5,
      } as Account;

      const updateData = { description: 'Updated description' };
      const updatedAccount: Account = {
        ...existingAccount,
        ...updateData,
      };

      mockRepository.findByAccountId
        .mockResolvedValueOnce(existingAccount) // First call in update
        .mockResolvedValueOnce(updatedAccount); // Second call after update
      mockRepository.update.mockResolvedValue(true);

      const result = await service.update('test-account', updateData);

      expect(result).toEqual(updatedAccount);
      expect(mockRepository.findByAccountId).toHaveBeenCalledWith(
        'test-account',
      );
      expect(mockRepository.update).toHaveBeenCalledWith(
        existingAccount._id!.toString(),
        updateData,
      );
    });

    it('should return null if account not found', async () => {
      mockRepository.findByAccountId.mockResolvedValue(null);

      const result = await service.update('non-existent', {
        description: 'test',
      });

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { accountId: 'non-existent' },
        'Account not found for update',
      );
    });
  });

  describe('setActiveStatus', () => {
    it('should set active status to true', async () => {
      mockRepository.setActiveStatus.mockResolvedValue(true);

      const result = await service.setActiveStatus('test-account', true);

      expect(result).toBe(true);
      expect(mockRepository.setActiveStatus).toHaveBeenCalledWith(
        'test-account',
        true,
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        { accountId: 'test-account', isActive: true },
        'Setting account active status',
      );
    });

    it('should set active status to false', async () => {
      mockRepository.setActiveStatus.mockResolvedValue(true);

      const result = await service.setActiveStatus('test-account', false);

      expect(result).toBe(true);
      expect(mockRepository.setActiveStatus).toHaveBeenCalledWith(
        'test-account',
        false,
      );
    });

    it('should return false if account not found', async () => {
      mockRepository.setActiveStatus.mockResolvedValue(false);

      const result = await service.setActiveStatus('non-existent', true);

      expect(result).toBe(false);
    });
  });
});
