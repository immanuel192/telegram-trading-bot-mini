/**
 * Purpose: Integration tests for database connection and Account repository operations.
 * Prerequisites: MongoDB running (via 'npm run stack:up').
 * Core Flow: Connect to DB → Test collection access → Test Account CRUD → Cleanup.
 */

import { init, close, COLLECTIONS, getSchema } from '../../src/infra/db';
import { accountRepository } from '../../src/repositories/account.repository';
import { Account } from '../../src/models/account.model';
import { createConfig } from '@telegram-trading-bot-mini/shared/utils';
import {
  fakeLogger,
  suiteName,
} from '@telegram-trading-bot-mini/shared/test-utils';

describe(suiteName(__filename), () => {
  beforeAll(async () => {
    // Ensure we are connected
    // Note: This assumes MongoDB is running locally via 'npm run stack:up'
    try {
      const config = createConfig();
      await init(config, fakeLogger);
    } catch (e) {
      console.error(
        'Failed to connect to MongoDB. Make sure it is running.',
        e,
      );
      throw e;
    }
  });

  afterAll(async () => {
    await close();
  });

  it('should connect to database', async () => {
    const collection = getSchema(COLLECTIONS.ACCOUNT);
    expect(collection).toBeDefined();
  });

  it('should create and find an account', async () => {
    const accountId = 'test-account-' + Date.now();
    const newAccount: Account = {
      accountId,
      description: 'Test Account',
      isActive: true,
      telegramChannelCode: 'test-channel',
      accountType: 'api' as any,
      promptId: 'test-prompt-1',
    };

    await accountRepository.create(newAccount);

    const found = await accountRepository.findByAccountId(accountId);
    expect(found).toBeDefined();
    expect(found?.accountId).toBe(accountId);

    // Cleanup
    if (found?._id) {
      await accountRepository.delete(found._id.toString());
    }
  });
});
