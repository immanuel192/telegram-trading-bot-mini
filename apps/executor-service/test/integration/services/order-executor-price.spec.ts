/**
 * Integration tests for pipelineExecutorService Price Integration
 * Tests fetching and using cached price for market orders without entry
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
  PriceCacheService,
  BalanceCacheService,
} from '@telegram-trading-bot-mini/shared/utils';
import { ServerContext, startServer, stopServer } from '../../../src/server';
import { createMockAccount, createOrder } from '../test-helpers';

describe(suiteName(__filename), () => {
  let serverContext: ServerContext | null = null;

  beforeAll(async () => {
    serverContext = await startServer();
  });

  beforeEach(async () => {
    await cleanupDb(mongoDb, [COLLECTIONS.ACCOUNT, COLLECTIONS.ORDERS]);
    // Clear Redis for price tests
    await serverContext!.container.redis.flushall();
  });

  afterAll(async () => {
    if (serverContext) {
      await stopServer(serverContext);
      serverContext = null;
    }
  });

  describe('Price Integration', () => {
    it('should use fresh price cache as entry for market order', async () => {
      const { pipelineExecutor, redis } = serverContext!.container;

      await createMockAccount(serverContext!, 'price-cache-account', {
        brokerConfig: {
          exchangeCode: 'mock',
          apiKey: 'test-api-key',
          unitsPerLot: 100000,
        },
        configs: {
          defaultMaxRiskPercentage: 2,
          defaultLeverage: 50,
        },
      });

      // Seed balance cache
      const balanceCache = new BalanceCacheService('mock', redis);
      await balanceCache.setBalance('price-cache-account', {
        balance: 10000,
        equity: 10000,
        marginUsed: 0,
        marginAvailable: 10000,
      });

      // Seed Redis with fresh price
      const priceCache = new PriceCacheService('mock', redis);
      await priceCache.setPrice('XAUUSD', 2650, 2651);

      await createOrder({
        orderId: 'order-fresh-price',
        accountId: 'price-cache-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      await pipelineExecutor.executeOrder({
        orderId: 'order-fresh-price',
        accountId: 'price-cache-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0,
        isImmediate: true,
        // No entry provided - should use cached price
        stopLoss: { price: 2600 },
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-fresh-price',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-fresh-price',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);

      // Mid price = (2650 + 2651) / 2 = 2650.5
      // Should have calculated SL based on mid price
      expect(order?.sl?.slPrice).toBeDefined();

      // Check INFO history entry
      const infoHistory = order?.history?.find(
        (h) => h.status === OrderHistoryStatus.INFO,
      );
      expect(infoHistory).toBeDefined();
      expect(infoHistory?.info?.message).toBe(
        'Used cached live price as entry for market order',
      );
      expect(infoHistory?.info?.cachedPrice).toBe(2650.5);
      expect(infoHistory?.info?.symbol).toBe('XAUUSD');
    });

    it('should calculate mid price correctly', async () => {
      const { pipelineExecutor, redis } = serverContext!.container;

      await createMockAccount(serverContext!, 'mid-price-account', {
        brokerConfig: {
          exchangeCode: 'mock',
          apiKey: 'test-api-key',
          unitsPerLot: 100000,
        },
        configs: {
          defaultMaxRiskPercentage: 2,
        },
      });

      // Seed balance cache
      const balanceCache = new BalanceCacheService('mock', redis);
      await balanceCache.setBalance('mid-price-account', {
        balance: 10000,
        equity: 10000,
        marginUsed: 0,
        marginAvailable: 10000,
      });

      // Seed with specific bid/ask
      const priceCache = new PriceCacheService('mock', redis);
      await priceCache.setPrice('XAUUSD', 2000, 2010);

      await createOrder({
        orderId: 'order-mid-price',
        accountId: 'mid-price-account',
        symbol: 'XAUUSD',
        side: OrderSide.SHORT,
        status: OrderStatus.PENDING,
      });

      await pipelineExecutor.executeOrder({
        orderId: 'order-mid-price',
        accountId: 'mid-price-account',
        symbol: 'XAUUSD',
        command: CommandEnum.SHORT,
        lotSize: 0,
        isImmediate: true,
        stopLoss: { price: 2050 },
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-mid-price',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-mid-price',
      });

      // Mid price = (2000 + 2010) / 2 = 2005
      const infoHistory = order?.history?.find(
        (h) => h.status === OrderHistoryStatus.INFO,
      );
      expect(infoHistory?.info?.cachedPrice).toBe(2005);
    });

    it('should reject stale price cache and proceed without entry', async () => {
      const { pipelineExecutor, redis } = serverContext!.container;

      await createMockAccount(serverContext!, 'stale-price-account', {
        brokerConfig: {
          exchangeCode: 'mock',
          apiKey: 'test-api-key',
          unitsPerLot: 100000,
        },
        configs: {
          defaultLotSize: 0.01,
        },
      });

      // Seed with expired price (very old timestamp)
      const expiredTs = Date.now() - 60 * 1000; // 1 minute ago (TTL is 32s)

      const key = `price:mock:XAUUSD`;
      await redis.set(
        key,
        JSON.stringify({
          bid: 2650,
          ask: 2651,
          ts: expiredTs,
        }),
      );

      await createOrder({
        orderId: 'order-stale-price',
        accountId: 'stale-price-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      await pipelineExecutor.executeOrder({
        orderId: 'order-stale-price',
        accountId: 'stale-price-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0,
        isImmediate: true,
        stopLoss: { price: 2600 },
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-stale-price',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-stale-price',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);

      // Should NOT have INFO entry (stale price rejected)
      const infoHistory = order?.history?.find(
        (h) => h.status === OrderHistoryStatus.INFO,
      );
      expect(infoHistory).toBeUndefined();

      // Should use defaultLotSize since no entry for risk calculation
      expect(order?.lotSize).toBe(0.01);
    });

    it('should proceed without entry when price cache is missing', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'missing-price-account', {
        brokerConfig: {
          exchangeCode: 'mock',
          apiKey: 'test-api-key',
          unitsPerLot: 100000,
        },
        configs: {
          defaultLotSize: 0.01,
        },
      });

      await createOrder({
        orderId: 'order-missing-price',
        accountId: 'missing-price-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      await pipelineExecutor.executeOrder({
        orderId: 'order-missing-price',
        accountId: 'missing-price-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0,
        isImmediate: true,
        stopLoss: { price: 2600 },
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-missing-price',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-missing-price',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);

      // Should NOT have INFO entry (no cached price)
      const infoHistory = order?.history?.find(
        (h) => h.status === OrderHistoryStatus.INFO,
      );
      expect(infoHistory).toBeUndefined();

      // Should use defaultLotSize
      expect(order?.lotSize).toBe(0.01);
    });

    it('should not add INFO entry when entry is already provided', async () => {
      const { pipelineExecutor, redis } = serverContext!.container;

      await createMockAccount(serverContext!, 'entry-provided-account', {
        brokerConfig: {
          exchangeCode: 'mock',
          apiKey: 'test-api-key',
          unitsPerLot: 100000,
        },
        configs: {
          defaultMaxRiskPercentage: 2,
        },
      });

      // Seed balance cache
      const balanceCache = new BalanceCacheService('mock', redis);
      await balanceCache.setBalance('entry-provided-account', {
        balance: 10000,
        equity: 10000,
        marginUsed: 0,
        marginAvailable: 10000,
      });

      // Seed price cache (should be ignored)
      const priceCache = new PriceCacheService('mock', redis);
      await priceCache.setPrice('XAUUSD', 2650, 2651);

      await createOrder({
        orderId: 'order-entry-provided',
        accountId: 'entry-provided-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      await pipelineExecutor.executeOrder({
        orderId: 'order-entry-provided',
        accountId: 'entry-provided-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0,
        isImmediate: false,
        entry: 2700, // Entry provided explicitly
        stopLoss: { price: 2650 },
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-entry-provided',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-entry-provided',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);

      // Should NOT have INFO entry (entry was provided)
      const infoHistory = order?.history?.find(
        (h) => h.status === OrderHistoryStatus.INFO,
      );
      expect(infoHistory).toBeUndefined();
    });

    it('should use executed price fallback when no cached price', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'executed-price-account', {
        brokerConfig: {
          exchangeCode: 'mock',
          apiKey: 'test-api-key',
          unitsPerLot: 100000,
        },
        configs: {
          defaultLotSize: 0.01,
        },
      });

      await createOrder({
        orderId: 'order-executed-price',
        accountId: 'executed-price-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      await pipelineExecutor.executeOrder({
        orderId: 'order-executed-price',
        accountId: 'executed-price-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0,
        isImmediate: true,
        // No entry, no SL - should use executed price for forced SL
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-executed-price',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-executed-price',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);

      // Should have executed price
      expect(order?.entry?.actualEntryPrice).toBeDefined();

      // Should NOT have INFO entry (no cached price used)
      const infoHistory = order?.history?.find(
        (h) => h.status === OrderHistoryStatus.INFO,
      );
      expect(infoHistory).toBeUndefined();

      // Should use defaultLotSize
      expect(order?.lotSize).toBe(0.01);
    });
  });
});
