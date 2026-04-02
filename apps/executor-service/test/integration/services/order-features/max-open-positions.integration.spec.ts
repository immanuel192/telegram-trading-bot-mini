/**
 * Integration tests for maxOpenPositions enforcement
 */

import {
  suiteName,
  cleanupDb,
  COLLECTIONS,
  createTestAccount,
} from '@telegram-trading-bot-mini/shared/test-utils';
import { mongoDb, orderRepository, accountRepository } from '@dal';
import {
  CommandEnum,
  ExecuteOrderRequestPayload,
} from '@telegram-trading-bot-mini/shared/utils';
import { OrderStatus, OrderSide, OrderHistoryStatus } from '@dal/models';
import { ServerContext, startServer, stopServer } from '../../../../src/server';
import { createOrder } from '../../test-helpers';

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

  describe('maxOpenPositions Enforcement', () => {
    it('should skip order if maxOpenPositions limit is reached', async () => {
      const { pipelineExecutor } = serverContext!.container;
      const accountId = 'test-account-max-pos';

      // 1. Create account with maxOpenPositions = 1
      const account = createTestAccount({
        accountId,
        brokerConfig: {
          exchangeCode: 'mock',
          apiKey: 'test-api-key',
        },
        configs: {
          maxOpenPositions: 1,
        },
      });
      await accountRepository.create(account);

      // 2. Create one OPEN order for this account
      await createOrder({
        accountId,
        orderId: 'existing-open-order',
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
      });

      // 3. Create a new PENDING order that we want to execute
      const newOrderId = 'new-order-to-skip';
      await createOrder({
        accountId,
        orderId: newOrderId,
        status: OrderStatus.PENDING,
        side: OrderSide.LONG,
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId,
        orderId: newOrderId,
        messageId: 200,
        channelId: 'channel-1',
        command: CommandEnum.LONG,
        symbol: 'BTCUSD',
        lotSize: 0.1,
        isImmediate: true,
        traceToken: 'trace-limit',
        timestamp: Date.now(),
      };

      // 4. Execute order
      await pipelineExecutor.executeOrder(payload);

      // 5. Verify the order was skipped
      const order = await orderRepository.findByOrderId(newOrderId);
      expect(order).toBeDefined();
      expect(order?.status).toBe(OrderStatus.PENDING); // Status shouldn't change to OPEN

      // 6. Verify history entry
      const skippedHistory = order?.history.find(
        (h) => h.status === OrderHistoryStatus.SKIPPED,
      );
      expect(skippedHistory).toBeDefined();
      expect(skippedHistory?.info?.reason).toBe('EXCEED_MAX_OPEN_POSITIONS');
      expect(skippedHistory?.info?.currentOpenPositions).toBe(1);
      expect(skippedHistory?.info?.maxOpenPositions).toBe(1);
    });

    it('should NOT skip order if maxOpenPositions limit is NOT reached', async () => {
      const { pipelineExecutor } = serverContext!.container;
      const accountId = 'test-account-under-limit';

      // 1. Create account with maxOpenPositions = 2
      const account = createTestAccount({
        accountId,
        brokerConfig: {
          exchangeCode: 'mock',
          apiKey: 'test-api-key',
        },
        configs: {
          maxOpenPositions: 2,
        },
      });
      await accountRepository.create(account);

      // 2. Create one OPEN order for this account
      await createOrder({
        accountId,
        orderId: 'existing-open-order-2',
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
      });

      // 3. Create a new PENDING order that we want to execute
      const newOrderId = 'new-order-to-open';
      await createOrder({
        accountId,
        orderId: newOrderId,
        status: OrderStatus.PENDING,
        side: OrderSide.LONG,
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId,
        orderId: newOrderId,
        messageId: 201,
        channelId: 'channel-1',
        command: CommandEnum.LONG,
        symbol: 'BTCUSD',
        lotSize: 0.1,
        isImmediate: true,
        traceToken: 'trace-no-limit',
        timestamp: Date.now(),
      };

      // 4. Execute order
      await pipelineExecutor.executeOrder(payload);

      // 5. Verify the order was OPENED
      const order = await orderRepository.findByOrderId(newOrderId);
      expect(order).toBeDefined();
      expect(order?.status).toBe(OrderStatus.OPEN);

      // 6. Verify history has OPEN entry, NOT SKIPPED
      const openHistory = order?.history.find(
        (h) => h.status === OrderHistoryStatus.OPEN,
      );
      expect(openHistory).toBeDefined();
      const skippedHistory = order?.history.find(
        (h) => h.status === OrderHistoryStatus.SKIPPED,
      );
      expect(skippedHistory).toBeUndefined();
    });

    it('should ignore maxOpenPositions if set to 0', async () => {
      const { pipelineExecutor } = serverContext!.container;
      const accountId = 'test-account-zero-limit';

      // 1. Create account with maxOpenPositions = 0 (disabled)
      const account = createTestAccount({
        accountId,
        brokerConfig: {
          exchangeCode: 'mock',
          apiKey: 'test-api-key',
        },
        configs: {
          maxOpenPositions: 0,
        },
      });
      await accountRepository.create(account);

      // 2. Create multiple OPEN orders
      await createOrder({
        accountId,
        orderId: 'open-1',
        status: OrderStatus.OPEN,
      });
      await createOrder({
        accountId,
        orderId: 'open-2',
        status: OrderStatus.OPEN,
      });

      // 3. Execute new order
      const newOrderId = 'new-order-bypass';
      await createOrder({
        accountId,
        orderId: newOrderId,
        status: OrderStatus.PENDING,
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId,
        orderId: newOrderId,
        messageId: 202,
        channelId: 'channel-1',
        command: CommandEnum.LONG,
        symbol: 'BTCUSD',
        lotSize: 0.1,
        traceToken: 'trace-zero',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findByOrderId(newOrderId);
      expect(order?.status).toBe(OrderStatus.OPEN);
    });
  });
});
