/**
 * Purpose: Provide CRUD operations for the Account entity.
 * Exports: AccountRepository class and accountRepository singleton instance.
 * Core Flow: Extends BaseRepository with Account-specific query methods.
 */

import { Collection } from 'mongodb';
import { Account } from '../models/account.model';
import { COLLECTIONS, getSchema } from '../infra/db';
import { BaseRepository } from './base.repository';

export class AccountRepository extends BaseRepository<Account> {
  protected get collection(): Collection<Account> {
    return getSchema<Account>(COLLECTIONS.ACCOUNT);
  }

  /**
   * Find an account by its business accountId (not MongoDB _id)
   * @param accountId - The business account identifier
   * @returns The found account or null
   */
  async findByAccountId(accountId: string): Promise<Account | null> {
    return this.findOne({ accountId });
  }

  /**
   * Find all accounts by channel code
   * @param channelCode - The channel code
   * @returns Array of accounts
   */
  async findByChannelCode(channelCode: string): Promise<Account[]> {
    return this.findAll({ telegramChannelCode: channelCode });
  }

  /**
   * Find all active accounts by channel code
   * More efficient than findByChannelCode + in-memory filter
   * Uses database-level filtering for better performance
   * @param channelCode - The channel code
   * @returns Array of active accounts for this channel
   */
  async findActiveByChannelCode(channelCode: string): Promise<Account[]> {
    return this.findAll({
      telegramChannelCode: channelCode,
      isActive: true,
    });
  }

  /**
   * Find all active accounts
   * @returns Array of active accounts
   */
  async findAllActive(): Promise<Account[]> {
    return this.findAll({ isActive: true });
  }

  /**
   * Toggle account active status
   * @param accountId - The business account identifier
   * @param isActive - The new active status
   * @returns True if updated successfully
   */
  async setActiveStatus(
    accountId: string,
    isActive: boolean
  ): Promise<boolean> {
    const result = await this.collection.updateOne(
      { accountId },
      { $set: { isActive } }
    );
    return result.modifiedCount > 0;
  }

  /**
   * Find all accounts by promptId
   * @param promptId - The prompt rule identifier
   * @returns Array of accounts using this prompt
   */
  async findByPromptId(promptId: string): Promise<Account[]> {
    return this.findAll({ promptId });
  }

  /**
   * Find distinct promptIds for active accounts by channel code
   * More efficient than fetching all accounts and grouping in memory
   * Uses MongoDB's distinct operation for optimal performance
   * @param channelCode - The channel code
   * @returns Array of unique promptIds for active accounts in this channel
   */
  async findDistinctPromptIdsByChannelCode(
    channelCode: string
  ): Promise<string[]> {
    return this.collection.distinct('promptId', {
      telegramChannelCode: channelCode,
      isActive: true,
    });
  }
}

export const accountRepository = new AccountRepository();
