/**
 * Integration tests for Market Hours validation in pipelineExecutorService
 */

import {
  suiteName,
  cleanupDb,
  COLLECTIONS,
} from '@telegram-trading-bot-mini/shared/test-utils';
import { mongoDb, OrderHistoryStatus, OrderStatus } from '@dal';
import {
  ExecuteOrderRequestPayload,
  CommandEnum,
} from '@telegram-trading-bot-mini/shared/utils';
import { ServerContext, startServer, stopServer } from '../../../../src/server';
import { createMockAccount, createOrder } from '../../test-helpers';

describe(suiteName(__filename), () => {
  let serverContext: ServerContext | null = null;
  // A fixed Thursday for consistent testing
  const FIXED_NOW = new Date('2026-01-08T12:00:00Z');

  beforeAll(async () => {
    jest.useFakeTimers({
      doNotFake: [
        'nextTick',
        'setImmediate',
        'setTimeout',
        'setInterval',
        'clearTimeout',
        'clearInterval',
      ],
    });
    jest.setSystemTime(FIXED_NOW);
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
    jest.useRealTimers();
  });

  describe('Market Hours Validation', () => {
    it('should skip order execution when market is closed', async () => {
      const { pipelineExecutor, orderRepository } = serverContext!.container;

      // Create account with a schedule that is CLOSED today
      // Mocked time is Thursday (2026-01-08)
      // Setting Mon-Tue schedule will make it closed on Thursday
      await createMockAccount(serverContext!, 'closed-account', {
        configs: {
          operationHours: {
            timezone: 'UTC',
            schedule: 'Mon-Tue: 09:00 - 17:00',
          },
        },
      });

      await createOrder({ orderId: 'test-order', accountId: 'closed-account' });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'closed-account',
        orderId: 'test-order',
        messageId: 1001,
        channelId: 'channel-1',
        command: CommandEnum.LONG,
        symbol: 'XAUUSD',
        traceToken: 'trace-market-hours',
        timestamp: Date.now(),
        lotSize: 0.1,
      };

      // Execution should return cleanly (skipped), not throw
      await pipelineExecutor.executeOrder(payload);

      // Verify order status and history
      const order = await orderRepository.findOne({ orderId: 'test-order' });
      expect(order).toBeDefined();

      // Order status remains unchanged (PENDING) as it was never opened
      expect(order?.status).toBe(OrderStatus.PENDING);

      // History should have SKIPPED entry
      const skippedHistory = order?.history.find(
        (h) => h.status === OrderHistoryStatus.SKIPPED,
      );
      expect(skippedHistory).toBeDefined();
      expect(skippedHistory?.info?.reason).toBe('MARKET_CLOSED');
      expect(skippedHistory?.info?.schedule).toBe('Mon-Tue: 09:00 - 17:00');
    });

    it('should allow order execution when market is open', async () => {
      const { pipelineExecutor, orderRepository } = serverContext!.container;

      // Mocked time is Thursday (2026-01-08)
      // Setting Mon-Fri schedule will make it open on Thursday
      await createMockAccount(serverContext!, 'open-account', {
        configs: {
          operationHours: {
            timezone: 'UTC',
            schedule: 'Sun-Fri: 00:00 - 23:59',
          },
        },
      });

      await createOrder({
        orderId: 'test-order-open',
        accountId: 'open-account',
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'open-account',
        orderId: 'test-order-open',
        messageId: 1002,
        channelId: 'channel-1',
        command: CommandEnum.LONG,
        symbol: 'XAUUSD',
        traceToken: 'trace-market-hours-open',
        timestamp: Date.now(),
        lotSize: 0.1,
      };

      await pipelineExecutor.executeOrder(payload);

      // Verify order status is OPEN
      const order = await orderRepository.findOne({
        orderId: 'test-order-open',
      });
      expect(order?.status).toBe(OrderStatus.OPEN);

      // History should have OPEN entry, not SKIPPED
      const skippedHistory = order?.history.find(
        (h) => h.status === OrderHistoryStatus.SKIPPED,
      );
      expect(skippedHistory).toBeUndefined();

      const openHistory = order?.history.find(
        (h) => h.status === OrderHistoryStatus.OPEN,
      );
      expect(openHistory).toBeDefined();
    });
  });
});
