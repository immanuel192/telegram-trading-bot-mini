import {
  suiteName,
  setupDb,
  cleanupDb,
  COLLECTIONS,
} from '@telegram-trading-bot-mini/shared/test-utils';
import { mongoDb } from '@dal';
import { Account, AccountType } from '@dal/models';
import { ServerContext, startServer, stopServer } from '../../../src/server';

describe(suiteName(__filename), () => {
  let serverContext: ServerContext | null = null;

  beforeAll(async () => {
    await setupDb();
    serverContext = await startServer();
  });

  beforeEach(async () => {
    // Clean up before each test to avoid duplicate key errors
    await cleanupDb(mongoDb, [COLLECTIONS.ACCOUNT]);
  });

  afterAll(async () => {
    // Clean up server components manually (without closing DB)
    if (serverContext) {
      await stopServer(serverContext);
      serverContext = null;
    }
  });

  it('should create and retrieve an account', async () => {
    const { accountService } = serverContext.container;

    const accountData: Omit<Account, '_id'> = {
      accountId: 'test-account-1',
      description: 'Test Account',
      isActive: true,
      telegramChannelCode: 'test-channel2',
      accountType: AccountType.MT5,
    } as Account;

    const created = await accountService.create(accountData);

    expect(created._id).toBeDefined();
    expect(created.accountId).toBe('test-account-1');

    const retrieved = await accountService.getByAccountId('test-account-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.accountId).toBe('test-account-1');
    expect(retrieved?.description).toBe('Test Account');
  });

  it('should get all active accounts', async () => {
    const { accountService } = serverContext.container;

    // Create multiple accounts
    await accountService.create({
      accountId: 'active-1',
      isActive: true,
      telegramChannelCode: 'channel-1',
      accountType: AccountType.MT5,
    } as Account);

    await accountService.create({
      accountId: 'active-2',
      isActive: true,
      telegramChannelCode: 'channel-2',
      accountType: AccountType.API,
    } as Account);

    await accountService.create({
      accountId: 'inactive-1',
      isActive: false,
      telegramChannelCode: 'channel-3',
      accountType: AccountType.MT5,
    } as Account);

    const activeAccounts = await accountService.getAllActive();

    expect(activeAccounts).toHaveLength(2);
    expect(activeAccounts.map((a) => a.accountId)).toEqual(
      expect.arrayContaining(['active-1', 'active-2']),
    );
  }, 30000);

  it('should update an account', async () => {
    const { accountService } = serverContext.container;

    const created = await accountService.create({
      accountId: 'update-test',
      description: 'Original',
      isActive: true,
      telegramChannelCode: 'test-channel',
      accountType: AccountType.MT5,
    } as Account);

    const updated = await accountService.update('update-test', {
      description: 'Updated',
    });

    expect(updated).not.toBeNull();
    expect(updated?.description).toBe('Updated');
    expect(updated?.accountId).toBe('update-test');
  }, 30000);

  it('should set active status', async () => {
    const { accountService } = serverContext.container;

    await accountService.create({
      accountId: 'status-test',
      isActive: true,
      telegramChannelCode: 'test-channel',
      accountType: AccountType.MT5,
    } as Account);

    const result = await accountService.setActiveStatus('status-test', false);
    expect(result).toBe(true);

    const account = await accountService.getByAccountId('status-test');
    expect(account?.isActive).toBe(false);
  }, 30000);

  it('should return null for non-existent account', async () => {
    const { accountService } = serverContext.container;

    const result = await accountService.getByAccountId('non-existent');
    expect(result).toBeNull();
  }, 30000);
});
