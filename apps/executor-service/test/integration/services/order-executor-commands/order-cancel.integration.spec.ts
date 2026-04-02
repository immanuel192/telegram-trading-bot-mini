/**
 * Integration tests for Order Cancel operations
 * Tests canceling pending orders
 */

import {
  suiteName,
  cleanupDb,
  COLLECTIONS,
} from '@telegram-trading-bot-mini/shared/test-utils';
import { mongoDb, orderRepository } from '@dal';
import {
  CommandEnum,
  ExecuteOrderRequestPayload,
} from '@telegram-trading-bot-mini/shared/utils';
import { OrderStatus, OrderHistoryStatus } from '@dal/models';
import { ServerContext, startServer, stopServer } from '../../../../src/server';
import { createMockAccount, createOrder } from '../../test-helpers';

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

  describe('Cancel Order Operations', () => {
    it('should cancel pending order successfully', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'cancel-order-1',
        status: OrderStatus.PENDING,
        entry: {
          entryPrice: 50000,
          entryOrderId: 'MOCK-126',
        },
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'cancel-order-1',
        messageId: 108,
        channelId: 'channel-1',
        command: CommandEnum.CANCEL,
        symbol: 'BTCUSD',
        traceToken: 'trace-9',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({
        orderId: 'cancel-order-1',
      });
      expect(order?.status).toBe(OrderStatus.CANCELED);
      expect(order?.closedAt).toBeDefined();

      // Verify history
      expect(order?.history).toHaveLength(1);
      expect(order?.history[0].status).toBe(OrderHistoryStatus.CANCELED);
    });

    it('should handle orders with no pending orders gracefully', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'cancel-order-2',
        status: OrderStatus.PENDING,
        // No entry order ID - nothing to cancel
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'cancel-order-2',
        messageId: 109,
        channelId: 'channel-1',
        command: CommandEnum.CANCEL,
        symbol: 'BTCUSD',
        traceToken: 'trace-10',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({
        orderId: 'cancel-order-2',
      });
      expect(order?.status).toBe(OrderStatus.CANCELED);
    });
  });
});
