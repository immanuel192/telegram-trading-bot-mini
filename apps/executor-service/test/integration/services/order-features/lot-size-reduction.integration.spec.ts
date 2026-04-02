/**
 * Integration tests for Lot Size Reduction feature
 * Tests lot size reduction based on meta.reduceLotSize flag
 */

import {
  suiteName,
  cleanupDb,
  COLLECTIONS,
} from '@telegram-trading-bot-mini/shared/test-utils';
import { mongoDb, orderRepository } from '@dal';
import { OrderStatus, OrderSide, OrderHistoryStatus } from '@dal/models';
import {
  CommandEnum,
  BalanceCacheService,
} from '@telegram-trading-bot-mini/shared/utils';
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

  describe('Lot Size Reduction', () => {
    it('should reduce lot size when meta.reduceLotSize is true', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'reduce-lot-account');

      // Add symbol-specific config with reduceLotSizePercent = 0.5 (50%)
      await serverContext!.container.accountRepository.updateOne(
        { accountId: 'reduce-lot-account' },
        {
          $set: {
            symbols: {
              XAUUSD: {
                reduceLotSizePercent: 0.5,
              },
            },
          },
        },
      );

      // Seed balance cache (New logic requires cache)
      const balanceCache = new BalanceCacheService(
        'mock',
        serverContext!.container.redis,
      );
      await balanceCache.setBalance('reduce-lot-account', {
        balance: 10000,
        equity: 10000,
        marginUsed: 0,
        marginAvailable: 10000,
      });

      await createOrder({
        orderId: 'order-reduce-lot',
        accountId: 'reduce-lot-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      // Open order with lotSize=1.0 and meta.reduceLotSize=true
      // Expected: lotSize should be reduced to 0.5 (50% of 1.0)
      await pipelineExecutor.executeOrder({
        orderId: 'order-reduce-lot',
        accountId: 'reduce-lot-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 1.0,
        isImmediate: true,
        meta: { reduceLotSize: true },
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-reduce-lot',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-reduce-lot',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);

      // Verify lot size was reduced to 50%
      const expectedLotSize = 0.5; // 1.0 * 0.5
      expect(order?.lotSize).toBe(expectedLotSize);

      // Verify history shows the reduction
      const openHistory = order?.history?.find(
        (h) => h.status === OrderHistoryStatus.OPEN,
      );
      expect(openHistory?.info?.calculatedLotSize).toBe(expectedLotSize);
      expect(openHistory?.info?.originalLotSize).toBe(1.0);
    });

    it('should NOT reduce lot size when meta.reduceLotSize is false', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'no-reduce-lot-account');

      // Seed balance cache (New logic requires cache)
      const balanceCache = new BalanceCacheService(
        'mock',
        serverContext!.container.redis,
      );
      await balanceCache.setBalance('no-reduce-lot-account', {
        balance: 10000,
        equity: 10000,
        marginUsed: 0,
        marginAvailable: 10000,
      });

      await createOrder({
        orderId: 'order-no-reduce',
        accountId: 'no-reduce-lot-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      // Open order with lotSize=1.0 and meta.reduceLotSize=false
      // Expected: lotSize should remain 1.0 (no reduction)
      await pipelineExecutor.executeOrder({
        orderId: 'order-no-reduce',
        accountId: 'no-reduce-lot-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 1.0,
        isImmediate: true,
        meta: { reduceLotSize: false },
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-no-reduce',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-no-reduce',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);

      // Verify lot size was NOT reduced
      expect(order?.lotSize).toBe(1.0);

      const openHistory = order?.history?.find(
        (h) => h.status === OrderHistoryStatus.OPEN,
      );
      expect(openHistory?.info?.calculatedLotSize).toBe(1.0);
      expect(openHistory?.info?.originalLotSize).toBe(1.0);
    });

    it('should use custom reduceLotSizePercent when configured', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'custom-reduce-account');

      // Add symbol-specific config with reduceLotSizePercent = 0.25 (25%)
      await serverContext!.container.accountRepository.updateOne(
        { accountId: 'custom-reduce-account' },
        {
          $set: {
            symbols: {
              XAUUSD: {
                reduceLotSizePercent: 0.25,
              },
            },
          },
        },
      );

      // Seed balance cache (New logic requires cache)
      const balanceCache = new BalanceCacheService(
        'mock',
        serverContext!.container.redis,
      );
      await balanceCache.setBalance('custom-reduce-account', {
        balance: 10000,
        equity: 10000,
        marginUsed: 0,
        marginAvailable: 10000,
      });

      await createOrder({
        orderId: 'order-custom-reduce',
        accountId: 'custom-reduce-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      // Open order with lotSize=1.0 and meta.reduceLotSize=true
      // Expected: lotSize should be reduced to 0.25 (25% of 1.0)
      await pipelineExecutor.executeOrder({
        orderId: 'order-custom-reduce',
        accountId: 'custom-reduce-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 1.0,
        isImmediate: true,
        meta: { reduceLotSize: true },
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-custom-reduce',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-custom-reduce',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);

      // Verify lot size was reduced to 25%
      const expectedLotSize = 0.25; // 1.0 * 0.25
      expect(order?.lotSize).toBe(expectedLotSize);

      const openHistory = order?.history?.find(
        (h) => h.status === OrderHistoryStatus.OPEN,
      );
      expect(openHistory?.info?.calculatedLotSize).toBe(expectedLotSize);
      expect(openHistory?.info?.originalLotSize).toBe(1.0);
    });
  });
});
