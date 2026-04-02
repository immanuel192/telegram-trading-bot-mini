/**
 * Integration tests for Order Close Partial operations
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
import { OrderStatus, OrderSide, OrderHistoryStatus } from '@dal/models';
import { ServerContext, startServer, stopServer } from '../../../../src/server';
import { createMockAccount, createOrder } from '../../test-helpers';

describe(suiteName(__filename), () => {
  let serverContext: ServerContext | null = null;

  beforeAll(async () => {
    serverContext = await startServer();
  });

  beforeEach(async () => {
    serverContext?.container.accountService.clearCache();
    await cleanupDb(mongoDb, [COLLECTIONS.ACCOUNT, COLLECTIONS.ORDERS]);
  });

  afterAll(async () => {
    if (serverContext) {
      await stopServer(serverContext);
      serverContext = null;
    }
  });

  describe('Close Partial Operations', () => {
    it('should complete multiple partial closes and update state correctly', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');

      // Initial Order with 0.1 lots
      const orderId = 'partial-test-1';
      await createOrder({
        orderId,
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
        lotSize: 0.1,
        lotSizeRemaining: 0.1,
        entry: {
          entryPrice: 50000,
          actualEntryPrice: 50000,
        },
        meta: {
          takeProfitTiers: [{ price: 51000 }, { price: 52000 }], // 2 tiers
        },
      });

      // 1. First Partial Close (Tier 1 -> factor 0.5 -> 0.05 lots)
      const payload1: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId,
        messageId: 10001, // 01 suffix
        channelId: 'channel-1',
        command: CommandEnum.CLOSE_PARTIAL,
        symbol: 'BTCUSD',
        lotSize: 0.05, // Provided by trade-manager in real scenario
        traceToken: 'trace-p1',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload1);

      let order = await orderRepository.findByOrderId(orderId);
      expect(order?.status).toBe(OrderStatus.OPEN);
      expect(order?.lotSizeRemaining).toBeCloseTo(0.05, 5);
      expect(order?.pnl?.pnl).toBeDefined();
      expect(
        order?.history.some((h) => h.status === OrderHistoryStatus.INFO),
      ).toBe(true);

      const firstPnl = order?.pnl?.pnl || 0;

      // 2. Second Partial Close (Tier 2 -> factor 0.5 -> another 0.05 lots)
      const payload2: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId,
        messageId: 10002, // 02 suffix
        channelId: 'channel-1',
        command: CommandEnum.CLOSE_PARTIAL,
        symbol: 'BTCUSD',
        lotSize: 0.05, // Provided by trade-manager
        traceToken: 'trace-p2',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload2);

      order = await orderRepository.findByOrderId(orderId);
      expect(order?.status).toBe(OrderStatus.CLOSED); // Should be closed now!
      expect(order?.lotSizeRemaining).toBeCloseTo(0, 5);

      // Cumulative PNL: should be different from first partial close
      expect(order?.pnl?.pnl).not.toBe(firstPnl);
      // Since both were losses (close at ~1000 vs entry 50000), total loss should be greater (more negative)
      expect(order?.pnl?.pnl).toBeLessThan(firstPnl);
      expect(
        order?.history.filter((h) => h.status === OrderHistoryStatus.CLOSED),
      ).toHaveLength(1);
    });

    it('should cap partial close amount if it exceeds remaining lots', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');

      const orderId = 'cap-test-1';
      await createOrder({
        orderId,
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
        lotSize: 0.1,
        lotSizeRemaining: 0.04, // Only 0.04 left
        entry: { entryPrice: 50000, actualEntryPrice: 50000 },
        meta: { takeProfitTiers: [{ price: 51000 }] }, // 1 tier -> would request 0.1
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId,
        messageId: 10001,
        channelId: 'channel-1',
        command: CommandEnum.CLOSE_PARTIAL,
        symbol: 'BTCUSD',
        lotSize: 0.1, // Requested 0.1, but only 0.04 left
        traceToken: 'trace-cap',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findByOrderId(orderId);
      expect(order?.status).toBe(OrderStatus.CLOSED);
      expect(order?.lotSizeRemaining || 0).toBeLessThanOrEqual(0);

      // Verify capping history
      expect(
        order?.history.some((h) => h.info?.reason?.includes('capped')),
      ).toBe(true);
    });

    it('should mark TP tiers as used sequentially during partial closes', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');

      // Initial Order with 0.1 lots and 3 TP tiers
      const orderId = 'tp-tier-test-1';
      await createOrder({
        orderId,
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
        lotSize: 0.1,
        lotSizeRemaining: 0.1,
        entry: {
          entryPrice: 1900, // Below mock base price of 2000, so closes will be profitable
          actualEntryPrice: 1900,
        },
        meta: {
          takeProfitTiers: [
            { price: 2100 }, // TP1 - not used
            { price: 2200 }, // TP2 - not used
            { price: 2300 }, // TP3 - not used
          ],
        },
      });

      // 1. First Partial Close - should mark TP1 as used
      const payload1: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId,
        messageId: 10001,
        channelId: 'channel-1',
        command: CommandEnum.CLOSE_PARTIAL,
        symbol: 'XAUUSD',
        lotSize: 0.03,
        traceToken: 'trace-tp1',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload1);

      let order = await orderRepository.findByOrderId(orderId);
      expect(order?.status).toBe(OrderStatus.OPEN);
      expect(order?.lotSizeRemaining).toBeCloseTo(0.07, 5);
      expect(order?.meta?.takeProfitTiers?.[0].isUsed).toBe(true); // TP1 marked
      expect(order?.meta?.takeProfitTiers?.[1].isUsed).toBeUndefined(); // TP2 not marked
      expect(order?.meta?.takeProfitTiers?.[2].isUsed).toBeUndefined(); // TP3 not marked

      // 2. Second Partial Close - should mark TP2 as used
      const payload2: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId,
        messageId: 10002,
        channelId: 'channel-1',
        command: CommandEnum.CLOSE_PARTIAL,
        symbol: 'XAUUSD',
        lotSize: 0.03,
        traceToken: 'trace-tp2',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload2);

      order = await orderRepository.findByOrderId(orderId);
      expect(order?.status).toBe(OrderStatus.OPEN);
      expect(order?.lotSizeRemaining).toBeCloseTo(0.04, 5);
      expect(order?.meta?.takeProfitTiers?.[0].isUsed).toBe(true); // TP1 still marked
      expect(order?.meta?.takeProfitTiers?.[1].isUsed).toBe(true); // TP2 now marked
      expect(order?.meta?.takeProfitTiers?.[2].isUsed).toBeUndefined(); // TP3 not marked

      // 3. Third Partial Close - should mark TP3 as used and close the order
      const payload3: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId,
        messageId: 10003,
        channelId: 'channel-1',
        command: CommandEnum.CLOSE_PARTIAL,
        symbol: 'XAUUSD',
        lotSize: 0.04,
        traceToken: 'trace-tp3',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload3);

      order = await orderRepository.findByOrderId(orderId);
      expect(order?.status).toBe(OrderStatus.CLOSED); // Fully closed
      expect(order?.lotSizeRemaining).toBeCloseTo(0, 5);
      expect(order?.meta?.takeProfitTiers?.[0].isUsed).toBe(true); // TP1 marked
      expect(order?.meta?.takeProfitTiers?.[1].isUsed).toBe(true); // TP2 marked
      expect(order?.meta?.takeProfitTiers?.[2].isUsed).toBe(true); // TP3 marked
    });
  });
});
