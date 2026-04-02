/**
 * Integration tests for Order Update operations (MOVE_SL/SET_TP_SL)
 * Tests updating stop loss and take profit levels
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
import { OrderStatus, OrderHistoryStatus, OrderSide } from '@dal/models';
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

  describe('Update TP/SL Operations', () => {
    it('should update stop loss successfully', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'update-sl-1',
        status: OrderStatus.OPEN,
        entry: {
          entryPrice: 50000,
          entryOrderId: 'MOCK-127',
          actualEntryPrice: 50000,
        },
        sl: {
          slPrice: 49000,
          slOrderId: 'MOCK-SL-OLD',
        },
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'update-sl-1',
        messageId: 110,
        channelId: 'channel-1',
        command: CommandEnum.MOVE_SL,
        symbol: 'BTCUSD',
        stopLoss: { price: 49500 },
        traceToken: 'trace-11',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({ orderId: 'update-sl-1' });

      // Verify the SL price was updated
      expect(order?.sl?.slPrice).toBe(49500);

      // Verify a new SL order ID was generated (MockAdapter format: MOCK-SL-{timestamp}-{random})
      expect(order?.sl?.slOrderId).toBeDefined();
      expect(order?.sl?.slOrderId).toMatch(/^MOCK-SL-\d+-[a-z0-9]+$/);
      expect(order?.sl?.slOrderId).not.toBe('MOCK-SL-OLD');

      // Verify history
      expect(order?.history).toHaveLength(1);
      expect(order?.history[0].status).toBe(OrderHistoryStatus.UPDATE);
      expect(order?.history[0].command).toBe(CommandEnum.MOVE_SL);
    });

    it('should update take profit successfully', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'update-tp-1',
        status: OrderStatus.OPEN,
        entry: {
          entryPrice: 50000,
          entryOrderId: 'MOCK-128',
          actualEntryPrice: 50000,
        },
        tp: {
          tp1Price: 51000,
          tp1OrderId: 'MOCK-TP-OLD',
        },
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'update-tp-1',
        messageId: 111,
        channelId: 'channel-1',
        command: CommandEnum.SET_TP_SL,
        symbol: 'BTCUSD',
        takeProfits: [{ price: 51500 }],
        traceToken: 'trace-12',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({ orderId: 'update-tp-1' });

      // Verify the TP price was updated
      expect(order?.tp?.tp1Price).toBe(51500);

      // Verify a new TP order ID was generated (MockAdapter format: MOCK-TP-{timestamp}-{random})
      expect(order?.tp?.tp1OrderId).toBeDefined();
      expect(order?.tp?.tp1OrderId).toMatch(/^MOCK-TP-\d+-[a-z0-9]+$/);
      expect(order?.tp?.tp1OrderId).not.toBe('MOCK-TP-OLD');

      // Verify history
      expect(order?.history).toHaveLength(1);
      expect(order?.history[0].status).toBe(OrderHistoryStatus.UPDATE);
      expect(order?.history[0].command).toBe(CommandEnum.SET_TP_SL);
    });

    it('should update both SL and TP together', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'update-both-1',
        status: OrderStatus.OPEN,
        entry: {
          entryPrice: 50000,
          entryOrderId: 'MOCK-129',
          actualEntryPrice: 50000,
        },
        sl: {
          slPrice: 48000,
          slOrderId: 'MOCK-SL-OLD-BOTH',
        },
        tp: {
          tp1Price: 50500,
          tp1OrderId: 'MOCK-TP-OLD-BOTH',
        },
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'update-both-1',
        messageId: 112,
        channelId: 'channel-1',
        command: CommandEnum.SET_TP_SL,
        symbol: 'BTCUSD',
        stopLoss: { price: 49000 },
        takeProfits: [{ price: 52000 }],
        traceToken: 'trace-13',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({ orderId: 'update-both-1' });

      // Verify both SL and TP prices were updated
      expect(order?.sl?.slPrice).toBe(49000);
      expect(order?.tp?.tp1Price).toBe(52000);

      // Verify new SL order ID was generated
      expect(order?.sl?.slOrderId).toBeDefined();
      expect(order?.sl?.slOrderId).toMatch(/^MOCK-SL-\d+-[a-z0-9]+$/);
      expect(order?.sl?.slOrderId).not.toBe('MOCK-SL-OLD-BOTH');

      // Verify new TP order ID was generated
      expect(order?.tp?.tp1OrderId).toBeDefined();
      expect(order?.tp?.tp1OrderId).toMatch(/^MOCK-TP-\d+-[a-z0-9]+$/);
      expect(order?.tp?.tp1OrderId).not.toBe('MOCK-TP-OLD-BOTH');

      // Verify history
      expect(order?.history).toHaveLength(1);
      expect(order?.history[0].status).toBe(OrderHistoryStatus.UPDATE);
    });

    it('should throw error when order not found', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'non-existent-order',
        messageId: 113,
        channelId: 'channel-1',
        command: CommandEnum.MOVE_SL,
        symbol: 'BTCUSD',
        stopLoss: { price: 49000 },
        traceToken: 'trace-14',
        timestamp: Date.now(),
      };

      await expect(pipelineExecutor.executeOrder(payload)).rejects.toThrow(
        'Order non-existent-order not found',
      );
    });

    it('should throw error when order has no entry order ID', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'no-entry-id',
        status: OrderStatus.PENDING,
        // No entry order ID
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'no-entry-id',
        messageId: 114,
        channelId: 'channel-1',
        command: CommandEnum.MOVE_SL,
        symbol: 'BTCUSD',
        stopLoss: { price: 49000 },
        traceToken: 'trace-15',
        timestamp: Date.now(),
      };

      await expect(pipelineExecutor.executeOrder(payload)).rejects.toThrow(
        'Order no-entry-id does not have an entry order ID',
      );
    });

    it('should select correct TP based on account takeProfitIndex during update', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'tp-index-account', {
        configs: { takeProfitIndex: 1 }, // Select TP2
      });

      await createOrder({
        orderId: 'update-tp-indexed',
        accountId: 'tp-index-account',
        status: OrderStatus.OPEN,
        entry: {
          entryPrice: 50000,
          entryOrderId: 'MOCK-130',
        },
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'tp-index-account',
        orderId: 'update-tp-indexed',
        messageId: 115,
        channelId: 'channel-1',
        command: CommandEnum.SET_TP_SL,
        symbol: 'BTCUSD',
        takeProfits: [{ price: 51000 }, { price: 52000 }], // TP1 and TP2
        traceToken: 'trace-16',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({
        orderId: 'update-tp-indexed',
      });

      // Should pick TP1 (51000) because it is index 1 after sorting by profitability (descending for LONG)
      expect(order?.tp?.tp1Price).toBe(51000);
    });

    it('should skip TP update when forceNoTakeProfit is enabled in account', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'no-tp-account', {
        configs: { forceNoTakeProfit: true },
      });

      await createOrder({
        orderId: 'update-tp-ignored',
        accountId: 'no-tp-account',
        status: OrderStatus.OPEN,
        entry: {
          entryPrice: 50000,
          entryOrderId: 'MOCK-131',
        },
        tp: {
          tp1Price: 50500,
          tp1OrderId: 'OLD-TP',
        },
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'no-tp-account',
        orderId: 'update-tp-ignored',
        messageId: 116,
        channelId: 'channel-1',
        command: CommandEnum.SET_TP_SL,
        symbol: 'BTCUSD',
        takeProfits: [{ price: 52000 }],
        traceToken: 'trace-17',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({
        orderId: 'update-tp-ignored',
      });

      // TP should NOT be updated
      expect(order?.tp?.tp1Price).toBe(50500);
      expect(order?.tp?.tp1OrderId).toBe('OLD-TP');
    });

    it('should skip update when both SL and TP prices are identical to existing ones', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'update-identical',
        status: OrderStatus.OPEN,
        entry: {
          entryPrice: 50000,
          entryOrderId: 'MOCK-132',
        },
        sl: {
          slPrice: 49000,
          slOrderId: 'MOCK-SL-EXISTING',
        },
        tp: {
          tp1Price: 51000,
          tp1OrderId: 'MOCK-TP-EXISTING',
        },
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'update-identical',
        messageId: 117,
        channelId: 'channel-1',
        command: CommandEnum.SET_TP_SL,
        symbol: 'BTCUSD',
        stopLoss: { price: 49000 },
        takeProfits: [{ price: 51000 }],
        traceToken: 'trace-18',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({
        orderId: 'update-identical',
      });

      // Prices and Order IDs should remain the same
      expect(order?.sl?.slPrice).toBe(49000);
      expect(order?.sl?.slOrderId).toBe('MOCK-SL-EXISTING');
      expect(order?.tp?.tp1Price).toBe(51000);
      expect(order?.tp?.tp1OrderId).toBe('MOCK-TP-EXISTING');

      // History should be empty (no update entry added)
      expect(order?.history).toHaveLength(0);
    });
  });

  describe('Pips-to-Price Conversion (SET_TP_SL)', () => {
    it('should convert SL pips to price for LONG order', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'pips-sl-long',
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
        entry: {
          entryPrice: 4200,
          entryOrderId: 'MOCK-200',
          actualEntryPrice: 4200,
        },
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'pips-sl-long',
        messageId: 200,
        channelId: 'channel-1',
        command: CommandEnum.SET_TP_SL,
        symbol: 'XAUUSD',
        stopLoss: { pips: 100 }, // 100 pips = 10 (100 * 0.1)
        traceToken: 'trace-pips-1',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({ orderId: 'pips-sl-long' });

      // LONG: SL = entry - (pips * pipValue) = 4200 - (100 * 0.1) = 4190
      expect(order?.sl?.slPrice).toBe(4190);
    });

    it('should convert TP pips to price for LONG order', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'pips-tp-long',
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
        entry: {
          entryPrice: 4200,
          entryOrderId: 'MOCK-201',
          actualEntryPrice: 4200,
        },
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'pips-tp-long',
        messageId: 201,
        channelId: 'channel-1',
        command: CommandEnum.SET_TP_SL,
        symbol: 'XAUUSD',
        takeProfits: [{ pips: 200 }], // 200 pips = 20 (200 * 0.1)
        traceToken: 'trace-pips-2',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({ orderId: 'pips-tp-long' });

      // LONG: TP = entry + (pips * pipValue) = 4200 + (200 * 0.1) = 4220
      expect(order?.tp?.tp1Price).toBe(4220);
    });

    it('should convert both SL and TP pips for LONG order', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'pips-both-long',
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
        entry: {
          entryPrice: 4200,
          entryOrderId: 'MOCK-202',
          actualEntryPrice: 4200,
        },
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'pips-both-long',
        messageId: 202,
        channelId: 'channel-1',
        command: CommandEnum.SET_TP_SL,
        symbol: 'XAUUSD',
        stopLoss: { pips: 100 },
        takeProfits: [{ pips: 200 }, { pips: 300 }],
        traceToken: 'trace-pips-3',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({
        orderId: 'pips-both-long',
      });

      // SL: 4200 - 10 = 4190
      expect(order?.sl?.slPrice).toBe(4190);
      // TP: 4200 + 30 = 4230 (second TP selected by default takeProfitIndex=1)
      expect(order?.tp?.tp1Price).toBe(4230);
    });

    it('should convert SL pips to price for SHORT order', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'pips-sl-short',
        status: OrderStatus.OPEN,
        side: OrderSide.SHORT,
        entry: {
          entryPrice: 4200,
          entryOrderId: 'MOCK-203',
          actualEntryPrice: 4200,
        },
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'pips-sl-short',
        messageId: 203,
        channelId: 'channel-1',
        command: CommandEnum.SET_TP_SL,
        symbol: 'XAUUSD',
        stopLoss: { pips: 100 },
        traceToken: 'trace-pips-4',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({ orderId: 'pips-sl-short' });

      // SHORT: SL = entry + (pips * pipValue) = 4200 + (100 * 0.1) = 4210
      expect(order?.sl?.slPrice).toBe(4210);
    });

    it('should convert TP pips to price for SHORT order', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'pips-tp-short',
        status: OrderStatus.OPEN,
        side: OrderSide.SHORT,
        entry: {
          entryPrice: 4200,
          entryOrderId: 'MOCK-204',
          actualEntryPrice: 4200,
        },
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'pips-tp-short',
        messageId: 204,
        channelId: 'channel-1',
        command: CommandEnum.SET_TP_SL,
        symbol: 'XAUUSD',
        takeProfits: [{ pips: 200 }],
        traceToken: 'trace-pips-5',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({ orderId: 'pips-tp-short' });

      // SHORT: TP = entry - (pips * pipValue) = 4200 - (200 * 0.1) = 4180
      expect(order?.tp?.tp1Price).toBe(4180);
    });

    it('should use custom pipValue from account config', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'custom-pip-account', {
        symbols: {
          USDJPY: { pipValue: 0.01 }, // Custom pip value for USDJPY
        },
      });

      await createOrder({
        orderId: 'pips-custom-pip',
        accountId: 'custom-pip-account',
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
        entry: {
          entryPrice: 150.5,
          entryOrderId: 'MOCK-205',
          actualEntryPrice: 150.5,
        },
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'custom-pip-account',
        orderId: 'pips-custom-pip',
        messageId: 205,
        channelId: 'channel-1',
        command: CommandEnum.SET_TP_SL,
        symbol: 'USDJPY',
        stopLoss: { pips: 50 }, // 50 pips = 0.5 (50 * 0.01)
        takeProfits: [{ pips: 100 }], // 100 pips = 1.0 (100 * 0.01)
        traceToken: 'trace-pips-6',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({
        orderId: 'pips-custom-pip',
      });

      // SL: 150.5 - 0.5 = 150.0
      expect(order?.sl?.slPrice).toBe(150.0);
      // TP: 150.5 + 1.0 = 151.5
      expect(order?.tp?.tp1Price).toBe(151.5);
    });

    it('should use price when both price and pips are provided (price takes precedence)', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'pips-price-precedence',
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
        entry: {
          entryPrice: 4200,
          entryOrderId: 'MOCK-206',
          actualEntryPrice: 4200,
        },
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'pips-price-precedence',
        messageId: 206,
        channelId: 'channel-1',
        command: CommandEnum.SET_TP_SL,
        symbol: 'XAUUSD',
        stopLoss: { price: 4180, pips: 100 }, // Price should take precedence
        takeProfits: [{ price: 4250, pips: 200 }],
        traceToken: 'trace-pips-7',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({
        orderId: 'pips-price-precedence',
      });

      // Should use price, not pips
      expect(order?.sl?.slPrice).toBe(4180);
      expect(order?.tp?.tp1Price).toBe(4250);
    });

    it('should skip pips conversion when order has no entry price', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'pips-no-entry',
        status: OrderStatus.PENDING,
        side: OrderSide.LONG,
        entry: {
          entryPrice: 0, // Dummy value - actualEntryPrice is what matters
          entryOrderId: 'MOCK-PENDING',
          // No actualEntryPrice - this is what we're testing
        },
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'pips-no-entry',
        messageId: 207,
        channelId: 'channel-1',
        command: CommandEnum.SET_TP_SL,
        symbol: 'XAUUSD',
        stopLoss: { pips: 100 },
        traceToken: 'trace-pips-8',
        timestamp: Date.now(),
      };

      // Should not throw error, just skip conversion
      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({ orderId: 'pips-no-entry' });

      // SL should not be set (conversion skipped)
      expect(order?.sl).toBeUndefined();
    });

    it('should not convert pips for MOVE_SL command (only SET_TP_SL)', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'move-sl-no-pips',
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
        entry: {
          entryPrice: 4200,
          entryOrderId: 'MOCK-207',
          actualEntryPrice: 4200,
        },
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'move-sl-no-pips',
        messageId: 208,
        channelId: 'channel-1',
        command: CommandEnum.MOVE_SL, // MOVE_SL, not SET_TP_SL
        symbol: 'XAUUSD',
        stopLoss: { price: 4190 }, // Must use price for MOVE_SL
        traceToken: 'trace-pips-9',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({
        orderId: 'move-sl-no-pips',
      });

      // Should use price as-is (no pips conversion for MOVE_SL)
      expect(order?.sl?.slPrice).toBe(4190);
    });
  });
});
