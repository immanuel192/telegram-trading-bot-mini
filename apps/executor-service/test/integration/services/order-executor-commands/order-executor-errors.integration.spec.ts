/**
 * Integration tests for OrderExecutorService error handling
 * Tests error scenarios and edge cases
 */

import {
  suiteName,
  cleanupDb,
  COLLECTIONS,
} from '@telegram-trading-bot-mini/shared/test-utils';
import { mongoDb } from '@dal';
import { ExecuteOrderRequestPayload } from '@telegram-trading-bot-mini/shared/utils';
import { ServerContext, startServer, stopServer } from '../../../../src/server';
import { createMockAccount } from '../../test-helpers';

describe(suiteName(__filename), () => {
  let serverContext: ServerContext | null = null;

  beforeAll(async () => {
    serverContext = await startServer();
  });

  beforeEach(async () => {
    await cleanupDb(mongoDb, [COLLECTIONS.ACCOUNT, COLLECTIONS.ORDERS]);
  });

  afterAll(async () => {
    if (serverContext) {
      await stopServer(serverContext);
      serverContext = null;
    }
  });

  describe('Error Handling', () => {
    it('should handle unsupported command', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'test-order',
        messageId: 115,
        channelId: 'channel-1',
        command: 'INVALID_COMMAND' as any,
        symbol: 'BTCUSD',
        traceToken: 'trace-16',
        timestamp: Date.now(),
      };

      await expect(pipelineExecutor.executeOrder(payload)).rejects.toThrow(
        'Unsupported command: INVALID_COMMAND',
      );
    });
  });
});
