/**
 * Purpose: Integration tests for AccountRepository operations.
 * Prerequisites: MongoDB running (via 'npm run stack:up').
 * Core Flow: Test account CRUD operations → Test active account filtering → Test account status updates → Cleanup.
 */

import { accountRepository } from '../../src/repositories/account.repository';
import { Account, AccountType } from '../../src/models/account.model';
import {
  suiteName,
  setupDb,
  teardownDb,
  cleanupDb,
  COLLECTIONS,
} from '@telegram-trading-bot-mini/shared/test-utils';

describe(suiteName(__filename), () => {
  beforeAll(async () => {
    await setupDb();
  });

  afterAll(async () => {
    await teardownDb();
  });

  afterEach(async () => {
    await cleanupDb(null, [COLLECTIONS.ACCOUNT]);
  });

  describe('findByChannelCode', () => {
    it('should return accounts that link to given channelCode', async () => {
      const activeAccount1: Account = {
        accountId: 'active-account-001',
        description: 'Active Account 1',
        isActive: true,
        telegramChannelCode: 'channel-1',
        accountType: AccountType.API,
        promptId: 'prompt-1',
      };

      const activeAccount2: Account = {
        accountId: 'active-account-002',
        description: 'Active Account 2',
        isActive: true,
        telegramChannelCode: 'channel-1',
        accountType: AccountType.MT5,
        promptId: 'prompt-1',
      };

      const activeAccount3: Account = {
        accountId: 'inactive-account-001',
        description: 'Inactive Account',
        isActive: true,
        telegramChannelCode: 'channel-3',
        accountType: AccountType.API,
        promptId: 'prompt-2',
      };

      await Promise.all([
        accountRepository.create(activeAccount1),
        accountRepository.create(activeAccount2),
        accountRepository.create(activeAccount3),
      ]);

      const accounts = await accountRepository.findByChannelCode('channel-1');

      expect(accounts).toHaveLength(2);
      expect(accounts.every((acc) => acc.isActive)).toBe(true);
      expect(accounts.map((acc) => acc.accountId)).toContain(
        'active-account-001',
      );
      expect(accounts.map((acc) => acc.accountId)).toContain(
        'active-account-002',
      );
    });

    it('should return empty array when no matching channelCode', async () => {
      const inactiveAccount: Account = {
        accountId: 'inactive-account-002',
        description: 'Inactive Account',
        isActive: true,
        telegramChannelCode: 'channel-4',
        accountType: AccountType.MT5,
        promptId: 'prompt-1',
      };

      await accountRepository.create(inactiveAccount);

      const accounts =
        await accountRepository.findByChannelCode('fake-channel');

      expect(accounts).toHaveLength(0);
    });
  });

  describe('findByAccountId', () => {
    it('should find an account by accountId', async () => {
      const account: Account = {
        accountId: 'test-account-001',
        description: 'Test Account',
        isActive: true,
        telegramChannelCode: 'test-channel',
        accountType: AccountType.API,
        promptId: 'prompt-1',
      };

      await accountRepository.create(account);
      const found = await accountRepository.findByAccountId('test-account-001');

      expect(found).toBeDefined();
      expect(found?.accountId).toBe('test-account-001');
      expect(found?.description).toBe('Test Account');
      expect(found?.accountType).toBe(AccountType.API);
    });

    it('should return null if accountId not found', async () => {
      const found = await accountRepository.findByAccountId('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('findAllActive', () => {
    it('should return only active accounts', async () => {
      const activeAccount1: Account = {
        accountId: 'active-account-001',
        description: 'Active Account 1',
        isActive: true,
        telegramChannelCode: 'channel-1',
        accountType: AccountType.API,
        promptId: 'prompt-1',
      };

      const activeAccount2: Account = {
        accountId: 'active-account-002',
        description: 'Active Account 2',
        isActive: true,
        telegramChannelCode: 'channel-2',
        accountType: AccountType.MT5,
        promptId: 'prompt-1',
      };

      const inactiveAccount: Account = {
        accountId: 'inactive-account-001',
        description: 'Inactive Account',
        isActive: false,
        telegramChannelCode: 'channel-3',
        accountType: AccountType.API,
        promptId: 'prompt-2',
      };

      await Promise.all([
        accountRepository.create(activeAccount1),
        accountRepository.create(activeAccount2),
        accountRepository.create(inactiveAccount),
      ]);

      const activeAccounts = await accountRepository.findAllActive();

      expect(activeAccounts).toHaveLength(2);
      expect(activeAccounts.every((acc) => acc.isActive)).toBe(true);
      expect(activeAccounts.map((acc) => acc.accountId)).toContain(
        'active-account-001',
      );
      expect(activeAccounts.map((acc) => acc.accountId)).toContain(
        'active-account-002',
      );
      expect(activeAccounts.map((acc) => acc.accountId)).not.toContain(
        'inactive-account-001',
      );
    });

    it('should return empty array when no active accounts exist', async () => {
      const inactiveAccount: Account = {
        accountId: 'inactive-account-002',
        description: 'Inactive Account',
        isActive: false,
        telegramChannelCode: 'channel-4',
        accountType: AccountType.MT5,
        promptId: 'prompt-1',
      };

      await accountRepository.create(inactiveAccount);

      const activeAccounts = await accountRepository.findAllActive();

      expect(activeAccounts).toHaveLength(0);
    });
  });

  describe('findActiveByChannelCode', () => {
    it('should return only active accounts for specific channel', async () => {
      const activeAccount1: Account = {
        accountId: 'active-channel-account-001',
        description: 'Active Account 1 in Channel 1',
        isActive: true,
        telegramChannelCode: 'channel-active-1',
        accountType: AccountType.API,
        promptId: 'prompt-1',
      };

      const activeAccount2: Account = {
        accountId: 'active-channel-account-002',
        description: 'Active Account 2 in Channel 1',
        isActive: true,
        telegramChannelCode: 'channel-active-1',
        accountType: AccountType.MT5,
        promptId: 'prompt-2',
      };

      const inactiveAccount: Account = {
        accountId: 'inactive-channel-account-001',
        description: 'Inactive Account in Channel 1',
        isActive: false,
        telegramChannelCode: 'channel-active-1',
        accountType: AccountType.API,
        promptId: 'prompt-1',
      };

      const activeAccountOtherChannel: Account = {
        accountId: 'active-channel-account-003',
        description: 'Active Account in Different Channel',
        isActive: true,
        telegramChannelCode: 'channel-active-2',
        accountType: AccountType.API,
        promptId: 'prompt-1',
      };

      await Promise.all([
        accountRepository.create(activeAccount1),
        accountRepository.create(activeAccount2),
        accountRepository.create(inactiveAccount),
        accountRepository.create(activeAccountOtherChannel),
      ]);

      const accounts =
        await accountRepository.findActiveByChannelCode('channel-active-1');

      expect(accounts).toHaveLength(2);
      expect(accounts.every((acc) => acc.isActive)).toBe(true);
      expect(
        accounts.every((acc) => acc.telegramChannelCode === 'channel-active-1'),
      ).toBe(true);
      expect(accounts.map((acc) => acc.accountId)).toContain(
        'active-channel-account-001',
      );
      expect(accounts.map((acc) => acc.accountId)).toContain(
        'active-channel-account-002',
      );
      expect(accounts.map((acc) => acc.accountId)).not.toContain(
        'inactive-channel-account-001',
      );
      expect(accounts.map((acc) => acc.accountId)).not.toContain(
        'active-channel-account-003',
      );
    });

    it('should exclude inactive accounts from results', async () => {
      const activeAccount: Account = {
        accountId: 'active-exclude-test-001',
        description: 'Active Account',
        isActive: true,
        telegramChannelCode: 'channel-exclude-test',
        accountType: AccountType.API,
        promptId: 'prompt-1',
      };

      const inactiveAccount1: Account = {
        accountId: 'inactive-exclude-test-001',
        description: 'Inactive Account 1',
        isActive: false,
        telegramChannelCode: 'channel-exclude-test',
        accountType: AccountType.MT5,
        promptId: 'prompt-1',
      };

      const inactiveAccount2: Account = {
        accountId: 'inactive-exclude-test-002',
        description: 'Inactive Account 2',
        isActive: false,
        telegramChannelCode: 'channel-exclude-test',
        accountType: AccountType.API,
        promptId: 'prompt-2',
      };

      await Promise.all([
        accountRepository.create(activeAccount),
        accountRepository.create(inactiveAccount1),
        accountRepository.create(inactiveAccount2),
      ]);

      const accounts = await accountRepository.findActiveByChannelCode(
        'channel-exclude-test',
      );

      expect(accounts).toHaveLength(1);
      expect(accounts[0].accountId).toBe('active-exclude-test-001');
      expect(accounts[0].isActive).toBe(true);
    });

    it('should return empty array when no active accounts exist for channel', async () => {
      const inactiveAccount: Account = {
        accountId: 'inactive-only-account-001',
        description: 'Inactive Account',
        isActive: false,
        telegramChannelCode: 'channel-inactive-only',
        accountType: AccountType.API,
        promptId: 'prompt-1',
      };

      await accountRepository.create(inactiveAccount);

      const accounts = await accountRepository.findActiveByChannelCode(
        'channel-inactive-only',
      );

      expect(accounts).toHaveLength(0);
    });

    it('should return empty array when channel does not exist', async () => {
      const accounts = await accountRepository.findActiveByChannelCode(
        'non-existent-channel',
      );

      expect(accounts).toHaveLength(0);
    });

    it('should filter by channel correctly (not return other channels)', async () => {
      const account1: Account = {
        accountId: 'filter-test-account-001',
        description: 'Active Account in Channel A',
        isActive: true,
        telegramChannelCode: 'channel-a',
        accountType: AccountType.API,
        promptId: 'prompt-1',
      };

      const account2: Account = {
        accountId: 'filter-test-account-002',
        description: 'Active Account in Channel B',
        isActive: true,
        telegramChannelCode: 'channel-b',
        accountType: AccountType.MT5,
        promptId: 'prompt-1',
      };

      await Promise.all([
        accountRepository.create(account1),
        accountRepository.create(account2),
      ]);

      const accountsA =
        await accountRepository.findActiveByChannelCode('channel-a');
      const accountsB =
        await accountRepository.findActiveByChannelCode('channel-b');

      expect(accountsA).toHaveLength(1);
      expect(accountsA[0].accountId).toBe('filter-test-account-001');
      expect(accountsA[0].telegramChannelCode).toBe('channel-a');

      expect(accountsB).toHaveLength(1);
      expect(accountsB[0].accountId).toBe('filter-test-account-002');
      expect(accountsB[0].telegramChannelCode).toBe('channel-b');
    });
  });

  describe('setActiveStatus', () => {
    it('should toggle account active status to false', async () => {
      const account: Account = {
        accountId: 'toggle-account-001',
        description: 'Toggle Account',
        isActive: true,
        telegramChannelCode: 'channel-5',
        accountType: AccountType.API,
        promptId: 'prompt-1',
      };

      await accountRepository.create(account);
      const updated = await accountRepository.setActiveStatus(
        'toggle-account-001',
        false,
      );

      expect(updated).toBe(true);

      const found =
        await accountRepository.findByAccountId('toggle-account-001');
      expect(found?.isActive).toBe(false);
    });

    it('should toggle account active status to true', async () => {
      const account: Account = {
        accountId: 'toggle-account-002',
        description: 'Toggle Account 2',
        isActive: false,
        telegramChannelCode: 'channel-6',
        accountType: AccountType.MT5,
        promptId: 'prompt-1',
      };

      await accountRepository.create(account);
      const updated = await accountRepository.setActiveStatus(
        'toggle-account-002',
        true,
      );

      expect(updated).toBe(true);

      const found =
        await accountRepository.findByAccountId('toggle-account-002');
      expect(found?.isActive).toBe(true);
    });

    it('should return false if accountId not found', async () => {
      const updated = await accountRepository.setActiveStatus(
        'non-existent',
        true,
      );
      expect(updated).toBe(false);
    });
  });

  describe('BaseRepository methods', () => {
    it('should support findById', async () => {
      const account: Account = {
        accountId: 'find-by-id-account',
        description: 'Find By ID Account',
        isActive: true,
        telegramChannelCode: 'channel-7',
        accountType: AccountType.API,
        promptId: 'prompt-1',
      };

      const created = await accountRepository.create(account);
      const found = await accountRepository.findById(created._id!.toString());

      expect(found).toBeDefined();
      expect(found?.accountId).toBe('find-by-id-account');
    });

    it('should support findAll', async () => {
      await accountRepository.create({
        accountId: 'account-001',
        description: 'Account 1',
        isActive: true,
        telegramChannelCode: 'channel-8',
        accountType: AccountType.API,
        promptId: 'prompt-1',
      });

      await accountRepository.create({
        accountId: 'account-002',
        description: 'Account 2',
        isActive: false,
        telegramChannelCode: 'channel-9',
        accountType: AccountType.MT5,
        promptId: 'prompt-2',
      });

      const all = await accountRepository.findAll();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    it('should support update', async () => {
      const account: Account = {
        accountId: 'update-account',
        description: 'Update Account',
        isActive: true,
        telegramChannelCode: 'channel-10',
        accountType: AccountType.API,
        promptId: 'prompt-1',
      };

      const created = await accountRepository.create(account);
      const updated = await accountRepository.update(created._id!.toString(), {
        description: 'Updated Description',
        isActive: false,
      });

      expect(updated).toBe(true);

      const found = await accountRepository.findByAccountId('update-account');
      expect(found?.description).toBe('Updated Description');
      expect(found?.isActive).toBe(false);
    });

    it('should support delete', async () => {
      const account: Account = {
        accountId: 'delete-account',
        description: 'Delete Account',
        isActive: true,
        telegramChannelCode: 'channel-11',
        accountType: AccountType.MT5,
        promptId: 'prompt-1',
      };

      const created = await accountRepository.create(account);
      const deleted = await accountRepository.delete(created._id!.toString());

      expect(deleted).toBe(true);

      const found = await accountRepository.findByAccountId('delete-account');
      expect(found).toBeNull();
    });
  });

  describe('findByPromptId', () => {
    it('should return all accounts with matching promptId', async () => {
      const account1: Account = {
        accountId: 'prompt-account-001',
        description: 'Account 1 with Prompt 1',
        isActive: true,
        telegramChannelCode: 'channel-1',
        accountType: AccountType.API,
        promptId: 'prompt-1',
      };

      const account2: Account = {
        accountId: 'prompt-account-002',
        description: 'Account 2 with Prompt 1',
        isActive: true,
        telegramChannelCode: 'channel-2',
        accountType: AccountType.MT5,
        promptId: 'prompt-1',
      };

      const account3: Account = {
        accountId: 'prompt-account-003',
        description: 'Account 3 with Prompt 2',
        isActive: true,
        telegramChannelCode: 'channel-3',
        accountType: AccountType.API,
        promptId: 'prompt-2',
      };

      await Promise.all([
        accountRepository.create(account1),
        accountRepository.create(account2),
        accountRepository.create(account3),
      ]);

      const accounts = await accountRepository.findByPromptId('prompt-1');

      expect(accounts).toHaveLength(2);
      expect(accounts.map((acc) => acc.accountId)).toContain(
        'prompt-account-001',
      );
      expect(accounts.map((acc) => acc.accountId)).toContain(
        'prompt-account-002',
      );
      expect(accounts.map((acc) => acc.accountId)).not.toContain(
        'prompt-account-003',
      );
    });

    it('should return empty array when no accounts match promptId', async () => {
      const account: Account = {
        accountId: 'prompt-account-004',
        description: 'Account with Prompt 1',
        isActive: true,
        telegramChannelCode: 'channel-4',
        accountType: AccountType.API,
        promptId: 'prompt-1',
      };

      await accountRepository.create(account);

      const accounts = await accountRepository.findByPromptId('non-existent');

      expect(accounts).toHaveLength(0);
    });
  });

  describe('findDistinctPromptIdsByChannelCode', () => {
    it('should return unique promptIds for active accounts in channel', async () => {
      const account1: Account = {
        accountId: 'distinct-account-001',
        description: 'Account 1 with Prompt 1',
        isActive: true,
        telegramChannelCode: 'channel-distinct',
        accountType: AccountType.API,
        promptId: 'prompt-1',
      };

      const account2: Account = {
        accountId: 'distinct-account-002',
        description: 'Account 2 with Prompt 1 (duplicate)',
        isActive: true,
        telegramChannelCode: 'channel-distinct',
        accountType: AccountType.MT5,
        promptId: 'prompt-1', // Same promptId as account1
      };

      const account3: Account = {
        accountId: 'distinct-account-003',
        description: 'Account 3 with Prompt 2',
        isActive: true,
        telegramChannelCode: 'channel-distinct',
        accountType: AccountType.API,
        promptId: 'prompt-2',
      };

      await Promise.all([
        accountRepository.create(account1),
        accountRepository.create(account2),
        accountRepository.create(account3),
      ]);

      const promptIds =
        await accountRepository.findDistinctPromptIdsByChannelCode(
          'channel-distinct',
        );

      // Should return only 2 unique promptIds (prompt-1 and prompt-2)
      expect(promptIds).toHaveLength(2);
      expect(promptIds).toContain('prompt-1');
      expect(promptIds).toContain('prompt-2');
    });

    it('should exclude inactive accounts from distinct promptIds', async () => {
      const activeAccount: Account = {
        accountId: 'distinct-active-001',
        description: 'Active Account with Prompt 1',
        isActive: true,
        telegramChannelCode: 'channel-distinct-2',
        accountType: AccountType.API,
        promptId: 'prompt-1',
      };

      const inactiveAccount: Account = {
        accountId: 'distinct-inactive-001',
        description: 'Inactive Account with Prompt 2',
        isActive: false,
        telegramChannelCode: 'channel-distinct-2',
        accountType: AccountType.MT5,
        promptId: 'prompt-2',
      };

      await Promise.all([
        accountRepository.create(activeAccount),
        accountRepository.create(inactiveAccount),
      ]);

      const promptIds =
        await accountRepository.findDistinctPromptIdsByChannelCode(
          'channel-distinct-2',
        );

      // Should only return prompt-1 (from active account)
      expect(promptIds).toHaveLength(1);
      expect(promptIds).toContain('prompt-1');
      expect(promptIds).not.toContain('prompt-2');
    });

    it('should filter by channel code correctly', async () => {
      const accountChannelA: Account = {
        accountId: 'distinct-channel-a-001',
        description: 'Account in Channel A',
        isActive: true,
        telegramChannelCode: 'channel-a',
        accountType: AccountType.API,
        promptId: 'prompt-a',
      };

      const accountChannelB: Account = {
        accountId: 'distinct-channel-b-001',
        description: 'Account in Channel B',
        isActive: true,
        telegramChannelCode: 'channel-b',
        accountType: AccountType.MT5,
        promptId: 'prompt-b',
      };

      await Promise.all([
        accountRepository.create(accountChannelA),
        accountRepository.create(accountChannelB),
      ]);

      const promptIdsA =
        await accountRepository.findDistinctPromptIdsByChannelCode('channel-a');
      const promptIdsB =
        await accountRepository.findDistinctPromptIdsByChannelCode('channel-b');

      expect(promptIdsA).toHaveLength(1);
      expect(promptIdsA).toContain('prompt-a');
      expect(promptIdsA).not.toContain('prompt-b');

      expect(promptIdsB).toHaveLength(1);
      expect(promptIdsB).toContain('prompt-b');
      expect(promptIdsB).not.toContain('prompt-a');
    });

    it('should return empty array when no active accounts exist for channel', async () => {
      const inactiveAccount: Account = {
        accountId: 'distinct-inactive-only-001',
        description: 'Inactive Account',
        isActive: false,
        telegramChannelCode: 'channel-inactive-distinct',
        accountType: AccountType.API,
        promptId: 'prompt-1',
      };

      await accountRepository.create(inactiveAccount);

      const promptIds =
        await accountRepository.findDistinctPromptIdsByChannelCode(
          'channel-inactive-distinct',
        );

      expect(promptIds).toHaveLength(0);
    });

    it('should return empty array when channel does not exist', async () => {
      const promptIds =
        await accountRepository.findDistinctPromptIdsByChannelCode(
          'non-existent-channel',
        );

      expect(promptIds).toHaveLength(0);
    });

    it('should handle multiple accounts with same promptId efficiently', async () => {
      // Create 5 accounts with same promptId
      const accounts: Account[] = Array.from({ length: 5 }, (_, i) => ({
        accountId: `distinct-same-prompt-${i + 1}`,
        description: `Account ${i + 1} with same prompt`,
        isActive: true,
        telegramChannelCode: 'channel-same-prompt',
        accountType: AccountType.API,
        promptId: 'shared-prompt',
      }));

      await Promise.all(accounts.map((acc) => accountRepository.create(acc)));

      const promptIds =
        await accountRepository.findDistinctPromptIdsByChannelCode(
          'channel-same-prompt',
        );

      // Should return only 1 unique promptId despite 5 accounts
      expect(promptIds).toHaveLength(1);
      expect(promptIds).toContain('shared-prompt');
    });
  });
});
