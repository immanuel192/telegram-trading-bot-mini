/**
 * Integration tests for Order Open operations (LONG/SHORT)
 * Tests opening market and limit orders with SL/TP
 */

import {
  suiteName,
  cleanupDb,
  COLLECTIONS,
  createTestAccount,
} from '@telegram-trading-bot-mini/shared/test-utils';
import { mongoDb, orderRepository } from '@dal';
import {
  CommandEnum,
  ExecuteOrderRequestPayload,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  OrderStatus,
  OrderSide,
  OrderExecutionType,
  OrderHistoryStatus,
} from '@dal/models';
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

  describe('LONG/SHORT Order Execution', () => {
    it('should execute LONG market order successfully', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'long-order-1',
        side: OrderSide.LONG,
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'long-order-1',
        messageId: 100,
        channelId: 'channel-1',
        command: CommandEnum.LONG,
        symbol: 'BTCUSD',
        lotSize: 0.1,
        isImmediate: true,
        traceToken: 'trace-1',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      // Verify order was updated
      const order = await orderRepository.findOne({ orderId: 'long-order-1' });
      expect(order).toBeDefined();
      expect(order?.status).toBe(OrderStatus.OPEN);
      expect(order?.entry?.entryOrderId).toBeDefined();
      expect(order?.entry?.actualEntryPrice).toBeGreaterThan(0);

      // Verify history was added
      expect(order?.history).toHaveLength(1);
      expect(order?.history[0].status).toBe(OrderHistoryStatus.OPEN);
      expect(order?.history[0].command).toBe(CommandEnum.LONG);
    });

    it('should execute SHORT market order successfully', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'short-order-1',
        side: OrderSide.SHORT,
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'short-order-1',
        messageId: 101,
        channelId: 'channel-1',
        command: CommandEnum.SHORT,
        symbol: 'ETHUSD',
        lotSize: 0.5,
        isImmediate: true,
        traceToken: 'trace-2',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({ orderId: 'short-order-1' });
      expect(order?.status).toBe(OrderStatus.OPEN);
      expect(order?.entry?.entryOrderId).toBeDefined();
    });

    it('should execute limit order with entry price', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'limit-order-1',
        executionType: OrderExecutionType.limit,
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'limit-order-1',
        messageId: 102,
        channelId: 'channel-1',
        command: CommandEnum.LONG,
        symbol: 'XAUUSD',
        lotSize: 1.0,
        isImmediate: false,
        entry: 2500,
        traceToken: 'trace-3',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({ orderId: 'limit-order-1' });
      expect(order?.status).toBe(OrderStatus.OPEN);
      expect(order?.entry?.actualEntryPrice).toBe(2500);
    });
  });

  describe('Stop Loss and Take Profit', () => {
    it('should store SL order ID when stop loss is provided', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'order-with-sl',
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'order-with-sl',
        messageId: 103,
        channelId: 'channel-1',
        command: CommandEnum.LONG,
        symbol: 'BTCUSD',
        lotSize: 0.1,
        isImmediate: true,
        stopLoss: { price: 49000 },
        traceToken: 'trace-4',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({ orderId: 'order-with-sl' });
      expect(order?.sl?.slOrderId).toBeDefined();
      expect(order?.sl?.slOrderId).toMatch(/^MOCK-SL-/);
      // Verify the SL price is stored correctly
      expect(order?.sl?.slPrice).toBe(49000);
    });

    it('should store TP order ID when take profit is provided', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'order-with-tp',
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'order-with-tp',
        messageId: 104,
        channelId: 'channel-1',
        command: CommandEnum.LONG,
        symbol: 'BTCUSD',
        lotSize: 0.1,
        isImmediate: true,
        takeProfits: [{ price: 51000 }],
        traceToken: 'trace-5',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({ orderId: 'order-with-tp' });
      expect(order?.tp?.tp1OrderId).toBeDefined();
      expect(order?.tp?.tp1OrderId).toMatch(/^MOCK-TP-/);
      // Verify the TP price is stored correctly
      expect(order?.tp?.tp1Price).toBe(51000);
    });
  });

  describe('Take Profit Selection Logic', () => {
    it('should select highest profit TP for LONG when takeProfitIndex=0', async () => {
      const { pipelineExecutor, accountRepository } = serverContext!.container;

      // Create account with takeProfitIndex=0 (default)
      const account = createTestAccount({
        accountId: 'tp-index-account',
        brokerConfig: {
          exchangeCode: 'mock',
          apiKey: 'test-api-key',
        },
        configs: {
          takeProfitIndex: 0,
        },
      });
      await accountRepository.create(account);

      await createOrder({
        accountId: 'tp-index-account',
        orderId: 'tp-index-long',
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'tp-index-account',
        orderId: 'tp-index-long',
        messageId: 105,
        channelId: 'channel-1',
        command: CommandEnum.LONG,
        symbol: 'BTCUSD',
        lotSize: 0.1,
        isImmediate: true,
        // Unsorted TPs - should select 52000 (highest for LONG)
        takeProfits: [{ price: 51000 }, { price: 52000 }, { price: 50500 }],
        traceToken: 'trace-6',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({ orderId: 'tp-index-long' });
      expect(order?.tp?.tp1OrderId).toBeDefined();
      // Verify the highest TP (52000) was selected for LONG
      expect(order?.tp?.tp1Price).toBe(52000);
    });

    it('should select second highest profit TP for LONG when takeProfitIndex=1', async () => {
      const { pipelineExecutor, accountRepository } = serverContext!.container;

      const account = createTestAccount({
        accountId: 'tp-index-1-account',
        brokerConfig: {
          exchangeCode: 'mock',
          apiKey: 'test-api-key',
        },
        configs: {
          takeProfitIndex: 1, // Select second highest
        },
      });
      await accountRepository.create(account);

      await createOrder({
        accountId: 'tp-index-1-account',
        orderId: 'tp-index-1-long',
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'tp-index-1-account',
        orderId: 'tp-index-1-long',
        messageId: 106,
        channelId: 'channel-1',
        command: CommandEnum.LONG,
        symbol: 'BTCUSD',
        lotSize: 0.1,
        isImmediate: true,
        takeProfits: [{ price: 51000 }, { price: 52000 }, { price: 50500 }],
        traceToken: 'trace-7',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({
        orderId: 'tp-index-1-long',
      });
      expect(order?.tp?.tp1OrderId).toBeDefined();
      // Verify the second highest TP (51000) was selected for LONG
      // Sorted desc: [52000, 51000, 50500], index 1 = 51000
      expect(order?.tp?.tp1Price).toBe(51000);
    });

    it('should select lowest price TP for SHORT when takeProfitIndex=0', async () => {
      const { pipelineExecutor, accountRepository } = serverContext!.container;

      const account = createTestAccount({
        accountId: 'tp-short-account',
        brokerConfig: {
          exchangeCode: 'mock',
          apiKey: 'test-api-key',
        },
        configs: {
          takeProfitIndex: 0,
        },
      });
      await accountRepository.create(account);

      await createOrder({
        accountId: 'tp-short-account',
        orderId: 'tp-short-order',
        side: OrderSide.SHORT,
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'tp-short-account',
        orderId: 'tp-short-order',
        messageId: 107,
        channelId: 'channel-1',
        command: CommandEnum.SHORT,
        symbol: 'BTCUSD',
        lotSize: 0.1,
        isImmediate: true,
        // For SHORT, lowest price = highest profit
        takeProfits: [{ price: 49000 }, { price: 48500 }, { price: 49500 }],
        traceToken: 'trace-8',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({
        orderId: 'tp-short-order',
      });
      expect(order?.tp?.tp1OrderId).toBeDefined();
      // Verify the lowest TP (48500) was selected for SHORT (highest profit)
      expect(order?.tp?.tp1Price).toBe(48500);
    });

    it('should ignore all TPs when forceNoTakeProfit=true', async () => {
      const { pipelineExecutor, accountRepository } = serverContext!.container;

      const account = createTestAccount({
        accountId: 'force-no-tp-account',
        brokerConfig: {
          exchangeCode: 'mock',
          apiKey: 'test-api-key',
        },
        configs: {
          forceNoTakeProfit: true,
        },
      });
      await accountRepository.create(account);

      await createOrder({
        accountId: 'force-no-tp-account',
        orderId: 'force-no-tp-order',
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'force-no-tp-account',
        orderId: 'force-no-tp-order',
        messageId: 108,
        channelId: 'channel-1',
        command: CommandEnum.LONG,
        symbol: 'BTCUSD',
        lotSize: 0.1,
        isImmediate: true,
        takeProfits: [{ price: 51000 }, { price: 52000 }],
        traceToken: 'trace-9',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({
        orderId: 'force-no-tp-order',
      });
      // Should not have TP order ID because forceNoTakeProfit=true
      expect(order?.tp?.tp1OrderId).toBeUndefined();
      expect(order?.tp?.tp1Price).toBeUndefined();
    });

    it('should use last TP when takeProfitIndex out of range', async () => {
      const { pipelineExecutor, accountRepository } = serverContext!.container;

      const account = createTestAccount({
        accountId: 'tp-out-of-range-account',
        brokerConfig: {
          exchangeCode: 'mock',
          apiKey: 'test-api-key',
        },
        configs: {
          takeProfitIndex: 10, // Out of range
        },
      });
      await accountRepository.create(account);

      await createOrder({
        accountId: 'tp-out-of-range-account',
        orderId: 'tp-out-of-range-order',
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'tp-out-of-range-account',
        orderId: 'tp-out-of-range-order',
        messageId: 109,
        channelId: 'channel-1',
        command: CommandEnum.LONG,
        symbol: 'BTCUSD',
        lotSize: 0.1,
        isImmediate: true,
        takeProfits: [{ price: 51000 }, { price: 52000 }],
        traceToken: 'trace-10',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({
        orderId: 'tp-out-of-range-order',
      });
      // Should still have TP (uses last available)
      expect(order?.tp?.tp1OrderId).toBeDefined();
      // When index is out of range, should use the last TP in sorted order
      // For LONG sorted desc: [52000, 51000], last = 51000
      expect(order?.tp?.tp1Price).toBe(51000);
    });
  });
});
