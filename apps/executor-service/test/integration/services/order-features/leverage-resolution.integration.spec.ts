/**
 * Integration tests for Leverage Resolution
 * Tests leverage resolution priority and calculation impact
 */

import {
  suiteName,
  cleanupDb,
  COLLECTIONS,
} from '@telegram-trading-bot-mini/shared/test-utils';
import { mongoDb, orderRepository } from '@dal';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';
import { OrderStatus, OrderSide, OrderHistoryStatus } from '@dal/models';
import { ServerContext, startServer, stopServer } from '../../../../src/server';
import { createMockAccount, createOrder } from '../../test-helpers';
import { BalanceCacheService } from '@telegram-trading-bot-mini/shared/utils';

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

  describe('Leverage Resolution', () => {
    it('should use symbol-level leverage over account-level leverage', async () => {
      const { pipelineExecutor } = serverContext!.container;

      // Create account with account-level leverage
      await createMockAccount(serverContext!, 'symbol-leverage-account', {
        brokerConfig: {
          exchangeCode: 'mock',
          apiKey: 'test-api-key',
          unitsPerLot: 100000,
        },
        configs: {
          defaultMaxRiskPercentage: 2,
          defaultLeverage: 50, // Account-level: 50x
        },
      });

      // Add symbol-specific leverage to DB and seed balance in Redis cache
      const { redis } = serverContext!.container;
      const balanceCache = new BalanceCacheService('mock', redis);
      await balanceCache.setBalance('symbol-leverage-account', {
        balance: 10000,
        equity: 10000,
        marginUsed: 0,
        marginAvailable: 10000,
      });

      await serverContext!.container.accountRepository.updateOne(
        { accountId: 'symbol-leverage-account' },
        {
          $set: {
            symbols: {
              XAUUSD: {
                leverage: 100, // Symbol-level: 100x (should override)
              },
            },
          },
        },
      );

      await createOrder({
        orderId: 'order-symbol-leverage',
        accountId: 'symbol-leverage-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      // Open order with lotSize=0
      // Expected: Use symbol-level 100x instead of account-level 50x
      // riskAmount = 10000 * 0.02 = 200
      // leverage = 100 (symbol-level)
      // priceRisk = |2000 - 1950| = 50
      // lotSize = (200 × 100) / (50 × 100000) = 20000 / 5000000 = 0.004
      await pipelineExecutor.executeOrder({
        orderId: 'order-symbol-leverage',
        accountId: 'symbol-leverage-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0,
        isImmediate: false,
        entry: 2000,
        stopLoss: { price: 1950 },
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-symbol-leverage',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-symbol-leverage',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);

      // Calculate expected lot size with symbol-level 100x leverage
      // riskAmount = 10000 × 0.02 = 200
      // leverage = 100
      // priceRisk = |2000 - 1950| = 50
      // lotSize = (200 × 100) / (50 × 100000) = 0.004
      const expectedLotSize = 0.004;

      expect(order?.lotSize).toBe(expectedLotSize);

      const openHistory = order?.history?.find(
        (h) => h.status === OrderHistoryStatus.OPEN,
      );
      expect(openHistory?.info?.calculatedLotSize).toBe(expectedLotSize);
    });

    it('should clamp leverage to maxLeverage when configured', async () => {
      const { pipelineExecutor } = serverContext!.container;

      // Create account with high default leverage but maxLeverage limit
      await createMockAccount(serverContext!, 'max-leverage-account', {
        brokerConfig: {
          exchangeCode: 'mock',
          apiKey: 'test-api-key',
          unitsPerLot: 100000,
        },
        configs: {
          defaultMaxRiskPercentage: 2,
          defaultLeverage: 200, // High leverage
          maxLeverage: 100, // But clamped to 100x max
        },
      });

      // Seed balance in Redis cache
      const { redis } = serverContext!.container;
      const balanceCache = new BalanceCacheService('mock', redis);
      await balanceCache.setBalance('max-leverage-account', {
        balance: 10000,
        equity: 10000,
        marginUsed: 0,
        marginAvailable: 10000,
      });

      await createOrder({
        orderId: 'order-max-leverage',
        accountId: 'max-leverage-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      // Open order with lotSize=0
      // Expected: Leverage clamped from 200x to 100x
      // riskAmount = 10000 * 0.02 = 200
      // leverage = 100 (clamped from 200)
      // priceRisk = |2000 - 1950| = 50
      // lotSize = (200 × 100) / (50 × 100000) = 0.004
      await pipelineExecutor.executeOrder({
        orderId: 'order-max-leverage',
        accountId: 'max-leverage-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0,
        isImmediate: false,
        entry: 2000,
        stopLoss: { price: 1950 },
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-max-leverage',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-max-leverage',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);

      // Verify leverage was clamped to 100x (not 200x)
      // WITHOUT clamping (200x leverage):
      //   lotSize = (200 × 200) / (50 × 100000) = 0.008
      // WITH clamping (100x leverage):
      //   lotSize = (200 × 100) / (50 × 100000) = 0.004
      const expectedLotSize = 0.004; // Proves leverage was clamped to 100x

      expect(order?.lotSize).toBe(expectedLotSize);

      const openHistory = order?.history?.find(
        (h) => h.status === OrderHistoryStatus.OPEN,
      );
      expect(openHistory?.info?.calculatedLotSize).toBe(expectedLotSize);
    });

    it('should use leverage = 1 when no leverage configured (fallback)', async () => {
      const { pipelineExecutor } = serverContext!.container;

      // Create account WITHOUT any leverage configuration
      await createMockAccount(serverContext!, 'no-leverage-account', {
        brokerConfig: {
          exchangeCode: 'mock',
          apiKey: 'test-api-key',
          unitsPerLot: 100000,
        },
        configs: {
          defaultMaxRiskPercentage: 2,
          // No defaultLeverage configured
        },
      });

      // Seed balance in Redis cache
      const { redis } = serverContext!.container;
      const balanceCache = new BalanceCacheService('mock', redis);
      await balanceCache.setBalance('no-leverage-account', {
        balance: 10000,
        equity: 10000,
        marginUsed: 0,
        marginAvailable: 10000,
      });

      await createOrder({
        orderId: 'order-no-leverage',
        accountId: 'no-leverage-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      // Open order with lotSize=0
      // Expected: Leverage defaults to 1 (no leverage)
      // riskAmount = 10000 * 0.02 = 200
      // leverage = 1 (fallback)
      // priceRisk = |2000 - 1950| = 50
      // lotSize = (200 × 1) / (50 × 100000) = 200 / 5000000 = 0.00004
      await pipelineExecutor.executeOrder({
        orderId: 'order-no-leverage',
        accountId: 'no-leverage-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0,
        isImmediate: false,
        entry: 2000,
        stopLoss: { price: 1950 },
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-no-leverage',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-no-leverage',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);

      // Calculate expected lot size with leverage = 1
      // riskAmount = 10000 × 0.02 = 200
      // leverage = 1
      // priceRisk = |2000 - 1950| = 50
      // lotSize = (200 × 1) / (50 × 100000) = 0.00004
      const expectedLotSize = 0.00004;

      expect(order?.lotSize).toBe(expectedLotSize);

      const openHistory = order?.history?.find(
        (h) => h.status === OrderHistoryStatus.OPEN,
      );
      expect(openHistory?.info?.calculatedLotSize).toBe(expectedLotSize);
    });

    it('should calculate correctly with different leverage values', async () => {
      const { pipelineExecutor } = serverContext!.container;

      // Test with 10x leverage
      await createMockAccount(serverContext!, 'leverage-10x-account', {
        brokerConfig: {
          exchangeCode: 'mock',
          apiKey: 'test-api-key',
          unitsPerLot: 100000,
        },
        configs: {
          defaultMaxRiskPercentage: 2,
          defaultLeverage: 10, // 10x leverage
        },
      });

      // Seed balance in Redis cache
      const { redis } = serverContext!.container;
      const balanceCache = new BalanceCacheService('mock', redis);
      await balanceCache.setBalance('leverage-10x-account', {
        balance: 10000,
        equity: 10000,
        marginUsed: 0,
        marginAvailable: 10000,
      });

      await createOrder({
        orderId: 'order-leverage-10x',
        accountId: 'leverage-10x-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      // Expected with 10x leverage:
      // riskAmount = 10000 * 0.02 = 200
      // leverage = 10
      // priceRisk = |2000 - 1950| = 50
      // lotSize = (200 × 10) / (50 × 100000) = 2000 / 5000000 = 0.0004
      await pipelineExecutor.executeOrder({
        orderId: 'order-leverage-10x',
        accountId: 'leverage-10x-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0,
        isImmediate: false,
        entry: 2000,
        stopLoss: { price: 1950 },
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-leverage-10x',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-leverage-10x',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);

      // Verify 10x leverage calculation
      const expectedLotSize = 0.0004;
      expect(order?.lotSize).toBe(expectedLotSize);

      const openHistory = order?.history?.find(
        (h) => h.status === OrderHistoryStatus.OPEN,
      );
      expect(openHistory?.info?.calculatedLotSize).toBe(expectedLotSize);
    });
  });
});
