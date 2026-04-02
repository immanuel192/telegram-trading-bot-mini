/**
 * Integration tests for Take Profit Tiers persistence
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
import { OrderSide, OrderStatus } from '@dal/models';
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

  describe('Multi-tier TP Persistence', () => {
    it('should persist all normalized TP tiers when opening a LONG order', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account-tp');
      await createOrder({
        orderId: 'tp-tier-long',
        side: OrderSide.LONG,
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account-tp',
        orderId: 'tp-tier-long',
        messageId: 200,
        channelId: 'channel-1',
        command: CommandEnum.LONG,
        symbol: 'BTCUSD',
        lotSize: 0.1,
        isImmediate: true,
        takeProfits: [{ price: 51000 }, { price: 53000 }, { price: 52000 }],
        traceToken: 'trace-tp-1',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({ orderId: 'tp-tier-long' });
      expect(order).toBeDefined();

      // Verify legacy TP field (should be highest for LONG with index 0)
      expect(order?.tp?.tp1Price).toBe(53000);

      // Verify meta.takeProfitTiers (should be all 3, sorted descending for LONG)
      expect(order?.meta?.takeProfitTiers).toHaveLength(3);
      expect(order?.meta?.takeProfitTiers?.[0].price).toBe(51000);
      expect(order?.meta?.takeProfitTiers?.[1].price).toBe(52000);
      expect(order?.meta?.takeProfitTiers?.[2].price).toBe(53000);
      expect(order?.meta?.takeProfitTiers?.[0].isUsed).toBe(false);
    });

    it('should persist all normalized TP tiers when opening a SHORT order', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account-tp-short');
      await createOrder({
        orderId: 'tp-tier-short',
        side: OrderSide.SHORT,
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account-tp-short',
        orderId: 'tp-tier-short',
        messageId: 201,
        channelId: 'channel-1',
        command: CommandEnum.SHORT,
        symbol: 'BTCUSD',
        lotSize: 0.1,
        isImmediate: true,
        takeProfits: [{ price: 49000 }, { price: 47000 }, { price: 48000 }],
        traceToken: 'trace-tp-2',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({ orderId: 'tp-tier-short' });
      expect(order).toBeDefined();

      // Verify legacy TP field (should be lowest for SHORT with index 0)
      expect(order?.tp?.tp1Price).toBe(47000);

      // Verify meta.takeProfitTiers (should be all 3, sorted ascending for SHORT)
      expect(order?.meta?.takeProfitTiers).toHaveLength(3);
      expect(order?.meta?.takeProfitTiers?.[0].price).toBe(49000);
      expect(order?.meta?.takeProfitTiers?.[1].price).toBe(48000);
      expect(order?.meta?.takeProfitTiers?.[2].price).toBe(47000);
    });

    it('should refresh TP tiers when updating TP via SET_TP_SL', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account-update');

      // Initially open an order
      await createOrder({
        orderId: 'order-to-update',
        accountId: 'test-account-update',
        side: OrderSide.LONG,
        status: OrderStatus.OPEN,
        entry: {
          entryOrderId: 'mock-entry-id',
          entryPrice: 50000,
          actualEntryPrice: 50000,
        },
      });

      const updatePayload: ExecuteOrderRequestPayload = {
        accountId: 'test-account-update',
        orderId: 'order-to-update',
        messageId: 202,
        channelId: 'channel-1',
        command: CommandEnum.SET_TP_SL,
        symbol: 'BTCUSD',
        takeProfits: [{ price: 55000 }, { price: 54000 }],
        traceToken: 'trace-tp-3',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(updatePayload);

      const order = await orderRepository.findOne({
        orderId: 'order-to-update',
      });

      // Verify legacy TP field
      expect(order?.tp?.tp1Price).toBe(55000);

      // Verify tiers were refreshed
      expect(order?.meta?.takeProfitTiers).toHaveLength(2);
      expect(order?.meta?.takeProfitTiers?.[0].price).toBe(54000);
      expect(order?.meta?.takeProfitTiers?.[1].price).toBe(55000);
    });
  });
});
