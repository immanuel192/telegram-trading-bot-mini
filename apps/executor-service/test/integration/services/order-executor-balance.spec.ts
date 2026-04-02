/**
 * Integration tests for pipelineExecutorService Balance Integration
 * Tests fetching and validating balance from cache during order execution
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
import { ServerContext, startServer, stopServer } from '../../../src/server';
import { createMockAccount, createOrder } from '../test-helpers';

describe(suiteName(__filename), () => {
  let serverContext: ServerContext | null = null;

  beforeAll(async () => {
    serverContext = await startServer();
  });

  beforeEach(async () => {
    await cleanupDb(mongoDb, [COLLECTIONS.ACCOUNT, COLLECTIONS.ORDERS]);
    // Clear Redis for balance tests
    await serverContext!.container.redis.flushall();
  });

  afterAll(async () => {
    if (serverContext) {
      await stopServer(serverContext);
      serverContext = null;
    }
  });

  describe('Balance Integration', () => {
    it('should use fresh balance cache for lot size calculation', async () => {
      const { pipelineExecutor, redis } = serverContext!.container;

      await createMockAccount(serverContext!, 'balance-cache-account', {
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

      // Seed Redis with fresh balance (Equity = $5000, although DB balance might be $10000)
      const balanceCache = new BalanceCacheService('mock', redis);
      await balanceCache.setBalance('balance-cache-account', {
        balance: 5000,
        equity: 5000,
        marginUsed: 0,
        marginAvailable: 5000,
      });

      await createOrder({
        orderId: 'order-fresh-balance',
        accountId: 'balance-cache-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      await pipelineExecutor.executeOrder({
        orderId: 'order-fresh-balance',
        accountId: 'balance-cache-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0,
        isImmediate: false,
        entry: 2000,
        stopLoss: { price: 1950 },
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-fresh-balance',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-fresh-balance',
      });

      // Calculation:
      // Risk = 2% of $5000 (Equity) = $100
      // PriceRisk = |2000 - 1950| = 50
      // UnitsPerLot = 100000
      // LotSize = (Risk * Leverage) / (PriceRisk * UnitsPerLot)
      // LotSize = (100 * 50) / (50 * 100000) = 5000 / 5000000 = 0.001
      expect(order?.lotSize).toBe(0.001);
    });

    it('should use equity over balance from cache if present', async () => {
      const { pipelineExecutor, redis } = serverContext!.container;

      await createMockAccount(serverContext!, 'equity-prefer-account', {
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

      // Seed with balance=$10000, equity=$8000
      const balanceCache = new BalanceCacheService('mock', redis);
      await balanceCache.setBalance('equity-prefer-account', {
        balance: 10000,
        equity: 8000,
        marginUsed: 2000,
        marginAvailable: 6000,
      });

      await createOrder({
        orderId: 'order-equity-prefer',
        accountId: 'equity-prefer-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      await pipelineExecutor.executeOrder({
        orderId: 'order-equity-prefer',
        accountId: 'equity-prefer-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0,
        isImmediate: false,
        entry: 2000,
        stopLoss: { price: 1950 },
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-equity-prefer',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-equity-prefer',
      });

      // Risk = 2% of $8000 (Equity) = $160
      // LotSize = (160 * 50) / (50 * 100000) = 8000 / 5000000 = 0.0016
      expect(order?.lotSize).toBe(0.0016);
    });

    it('should fallback to defaultLotSize if cache is expired', async () => {
      const { pipelineExecutor, redis } = serverContext!.container;

      await createMockAccount(serverContext!, 'expired-cache-account', {
        brokerConfig: {
          exchangeCode: 'mock',
          apiKey: 'test-api-key',
          unitsPerLot: 100000,
        },
        configs: {
          defaultLotSize: 0.01,
          defaultMaxRiskPercentage: 2,
        },
      });

      // Seed with expired balance (very old timestamp)
      const balanceCache = new BalanceCacheService('mock', redis);
      const expiredTs = Date.now() - 3600 * 1000; // 1 hour ago (TTL is 30m)

      // Since setBalance auto-adds timestamp, we must use redis.set manually to simulate old data
      const key = `balance:mock:expired-cache-account`;
      await redis.set(
        key,
        JSON.stringify({
          balance: 5000,
          equity: 5000,
          marginUsed: 0,
          marginAvailable: 5000,
          ts: expiredTs,
        }),
      );

      await createOrder({
        orderId: 'order-expired-fallback',
        accountId: 'expired-cache-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      await pipelineExecutor.executeOrder({
        orderId: 'order-expired-fallback',
        accountId: 'expired-cache-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0,
        isImmediate: false,
        entry: 2000,
        stopLoss: { price: 1950 },
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-expired-fallback',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-expired-fallback',
      });

      // Should fallback to defaultLotSize (0.01)
      expect(order?.lotSize).toBe(0.01);
    });

    it('should fallback to defaultLotSize if cache is missing', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'missing-cache-account', {
        brokerConfig: {
          exchangeCode: 'mock',
          apiKey: 'test-api-key',
          unitsPerLot: 100000,
        },
        configs: {
          defaultLotSize: 0.01,
          defaultMaxRiskPercentage: 2,
        },
      });

      await createOrder({
        orderId: 'order-missing-fallback',
        accountId: 'missing-cache-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      await pipelineExecutor.executeOrder({
        orderId: 'order-missing-fallback',
        accountId: 'missing-cache-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0,
        isImmediate: false,
        entry: 2000,
        stopLoss: { price: 1950 },
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-missing-fallback',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-missing-fallback',
      });

      // Should fallback to defaultLotSize (0.01)
      expect(order?.lotSize).toBe(0.01);
    });
  });
});
