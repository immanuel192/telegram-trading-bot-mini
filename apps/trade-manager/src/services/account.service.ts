/**
 * Purpose: Service layer for Account entity operations
 * Inputs: Account queries and mutations via service methods
 * Outputs: Account documents or operation results
 * Core Flow: Orchestrates AccountRepository operations with error handling and validation
 */

import * as Sentry from '@sentry/node';
import { ObjectId } from 'mongodb';
import { AccountRepository } from '@dal';
import { Account } from '@dal/models';
import { LoggerInstance } from '@telegram-trading-bot-mini/shared/utils';

/**
 * Service for managing trading accounts
 * Provides business logic layer over AccountRepository
 */
export class AccountService {
  /**
   * In-memory cache for accounts
   * accountId (business ID) -> { account, expiry }
   */
  private readonly accountCache = new Map<
    string,
    { account: Account; expiry: number }
  >();

  private readonly DEFAULT_TTL_MS = 30000; // 30 seconds

  constructor(
    private accountRepository: AccountRepository,
    private logger: LoggerInstance,
  ) {}

  /**
   * Get account by MongoDB _id
   * @param id - MongoDB ObjectId
   * @returns Account or null if not found
   */
  async getById(id: ObjectId): Promise<Account | null> {
    try {
      return await this.accountRepository.findById(id.toString());
    } catch (error) {
      this.logger.error(
        { error, id: id.toString() },
        'Failed to get account by id',
      );
      Sentry.captureException(error, {
        extra: { accountId: id.toString() },
      });
      throw error;
    }
  }

  /**
   * Get account by business accountId with in-memory caching
   * @param accountId - Business account identifier
   * @param ttlMs - Optional TTL in milliseconds (defaults to 30s)
   * @returns Account or null if not found
   */
  async getAccountByIdWithCache(
    accountId: string,
    ttlMs: number = this.DEFAULT_TTL_MS,
  ): Promise<Account | null> {
    const cached = this.accountCache.get(accountId);
    const now = Date.now();

    if (cached && cached.expiry > now) {
      return cached.account;
    }

    const account = await this.getByAccountId(accountId);
    if (account) {
      this.accountCache.set(accountId, {
        account,
        expiry: now + ttlMs,
      });
    }

    return account;
  }

  /**
   * Get account by business accountId
   * @param accountId - Business account identifier
   * @returns Account or null if not found
   */
  async getByAccountId(accountId: string): Promise<Account | null> {
    try {
      return await this.accountRepository.findByAccountId(accountId);
    } catch (error) {
      this.logger.error(
        { error, accountId },
        'Failed to get account by accountId',
      );
      Sentry.captureException(error, {
        extra: { accountId },
      });
      throw error;
    }
  }

  /**
   * Get all active accounts
   * @returns Array of active accounts
   */
  async getAllActive(): Promise<Account[]> {
    try {
      return await this.accountRepository.findAllActive();
    } catch (error) {
      this.logger.error({ error }, 'Failed to get all active accounts');
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Create a new account
   * @param accountData - Account data to create
   * @returns Created account with _id
   */
  async create(accountData: Omit<Account, '_id'>): Promise<Account> {
    try {
      // Validate required fields
      if (!accountData.accountId) {
        throw new Error('accountId is required');
      }
      if (accountData.isActive === undefined || accountData.isActive === null) {
        throw new Error('isActive is required');
      }
      if (!accountData.telegramChannelCode) {
        throw new Error('telegramChannelCode is required');
      }
      if (!accountData.accountType) {
        throw new Error('accountType is required');
      }

      this.logger.info(
        { accountId: accountData.accountId },
        'Creating new account',
      );

      return await this.accountRepository.create(accountData as Account);
    } catch (error) {
      this.logger.error(
        { error, accountId: accountData.accountId },
        'Failed to create account',
      );
      Sentry.captureException(error, {
        extra: { accountData },
      });
      throw error;
    }
  }

  /**
   * Update an existing account
   * @param accountId - Business account identifier
   * @param updateData - Partial account data to update
   * @returns Updated account or null if not found
   */
  async update(
    accountId: string,
    updateData: Partial<Omit<Account, '_id' | 'accountId'>>,
  ): Promise<Account | null> {
    try {
      const account = await this.accountRepository.findByAccountId(accountId);
      if (!account) {
        this.logger.warn({ accountId }, 'Account not found for update');
        return null;
      }

      this.logger.info({ accountId }, 'Updating account');

      const wasUpdated = await this.accountRepository.update(
        account._id!.toString(),
        updateData,
      );
      if (!wasUpdated) {
        this.logger.warn({ accountId }, 'Account update failed');
        return null;
      }

      // Refetch the updated account
      return await this.accountRepository.findByAccountId(accountId);
    } catch (error) {
      this.logger.error({ error, accountId }, 'Failed to update account');
      Sentry.captureException(error, {
        extra: { accountId, updateData },
      });
      throw error;
    }
  }

  /**
   * Set active status for an account
   * @param accountId - Business account identifier
   * @param isActive - New active status
   * @returns True if updated successfully, false if account not found
   */
  async setActiveStatus(
    accountId: string,
    isActive: boolean,
  ): Promise<boolean> {
    try {
      this.logger.info(
        { accountId, isActive },
        'Setting account active status',
      );
      return await this.accountRepository.setActiveStatus(accountId, isActive);
    } catch (error) {
      this.logger.error(
        { error, accountId, isActive },
        'Failed to set account active status',
      );
      Sentry.captureException(error, {
        extra: { accountId, isActive },
      });
      throw error;
    }
  }
}
