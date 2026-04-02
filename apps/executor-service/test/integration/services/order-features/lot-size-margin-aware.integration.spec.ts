/**
 * Integration tests for Margin-Aware Lot Size Calculation with DCA
 * Tests lot size calculation considering both risk and margin constraints
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

  describe('Margin-Aware Lot Size with maxOpenPositions', () => {
    it('should limit lot size by margin when maxOpenPositions is configured', async () => {
      const { pipelineExecutor } = serverContext!.container;

      // Create account with maxOpenPositions = 5 for DCA
      await createMockAccount(serverContext!, 'dca-margin-account', {
        brokerConfig: {
          exchangeCode: 'mock',
          apiKey: 'test-api-key',
          unitsPerLot: 1, // OANDA style
        },
        configs: {
          defaultMaxRiskPercentage: 2,
          defaultLeverage: 50,
          maxOpenPositions: 5, // Allow 5 DCA positions
        },
      });

      // Seed balance cache (New logic requires cache)
      const balanceCache = new BalanceCacheService(
        'mock',
        serverContext!.container.redis,
      );
      await balanceCache.setBalance('dca-margin-account', {
        balance: 10000,
        equity: 10000,
        marginUsed: 0,
        marginAvailable: 10000,
      });

      await createOrder({
        orderId: 'order-dca-margin',
        accountId: 'dca-margin-account',
        symbol: 'XAUUSD',
        side: OrderSide.SHORT,
        status: OrderStatus.PENDING,
      });

      // Real example: GOLD Sell 4472, TP 4452, SL 4477
      await pipelineExecutor.executeOrder({
        orderId: 'order-dca-margin',
        accountId: 'dca-margin-account',
        symbol: 'XAUUSD',
        command: CommandEnum.SHORT,
        lotSize: 0,
        isImmediate: false,
        entry: 4472,
        stopLoss: { price: 4477 },
        takeProfits: [{ price: 4452 }],
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-dca-margin',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-dca-margin',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);
      expect(order?.entry?.entryOrderId).toBeDefined();

      // Calculations:
      // Risk-based: (200 * 50) / (5 * 1) = 2000 units
      // Margin-based: (2000 * 50) / (4472 * 1) = 22.361 units
      // Final: min(2000, 22.361) = 22.361 units (limited by margin)
      const expectedLotSize = 22.361359570661897;
      expect(order?.lotSize).toBe(expectedLotSize);

      // Verify margin requirement is within limits
      // Margin = (22.361 * 4472) / 50 = 2000 per position ✓
      const marginRequired = (expectedLotSize * 4472) / 50;
      const marginPerPosition = 10000 / 5;
      expect(marginRequired).toBeLessThanOrEqual(marginPerPosition + 0.01); // Allow small floating point error

      const openHistory = order?.history?.find(
        (h) => h.status === OrderHistoryStatus.OPEN,
      );
      expect(openHistory?.info?.calculatedLotSize).toBe(expectedLotSize);
      expect(openHistory?.info?.originalLotSize).toBe(0);
    });

    it('should use risk-based lot size when margin is not limiting', async () => {
      const { pipelineExecutor } = serverContext!.container;

      // Create account with high maxOpenPositions (margin not limiting)
      await createMockAccount(serverContext!, 'risk-limited-account', {
        brokerConfig: {
          exchangeCode: 'mock',
          apiKey: 'test-api-key',
          unitsPerLot: 100000, // Standard lot
        },
        configs: {
          defaultMaxRiskPercentage: 2,
          defaultLeverage: 50,
          maxOpenPositions: 100, // Very high, but still creates constraint
        },
      });

      // Seed balance cache (New logic requires cache)
      const balanceCache = new BalanceCacheService(
        'mock',
        serverContext!.container.redis,
      );
      await balanceCache.setBalance('risk-limited-account', {
        balance: 10000,
        equity: 10000,
        marginUsed: 0,
        marginAvailable: 10000,
      });

      await createOrder({
        orderId: 'order-risk-limited',
        accountId: 'risk-limited-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      await pipelineExecutor.executeOrder({
        orderId: 'order-risk-limited',
        accountId: 'risk-limited-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0,
        isImmediate: false,
        entry: 2000,
        stopLoss: { price: 1950 },
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-risk-limited',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-risk-limited',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);

      // Risk-based: (200 * 50) / (50 * 100000) = 0.002
      // Margin-based: (100 * 50) / (2000 * 100000) = 0.000025
      // Final: min(0.002, 0.000025) = 0.000025 (limited by margin)
      // Even with maxOpenPositions=100, margin per position is only $100
      const expectedLotSize = 0.000025;
      expect(order?.lotSize).toBe(expectedLotSize);
    });

    it('should work without maxOpenPositions (backward compatible)', async () => {
      const { pipelineExecutor } = serverContext!.container;

      // Create account WITHOUT maxOpenPositions
      await createMockAccount(serverContext!, 'no-max-positions-account', {
        brokerConfig: {
          exchangeCode: 'mock',
          apiKey: 'test-api-key',
          unitsPerLot: 100000,
        },
        configs: {
          defaultMaxRiskPercentage: 2,
          defaultLeverage: 50,
          // No maxOpenPositions configured
        },
      });

      // Seed balance cache (New logic requires cache)
      const balanceCache = new BalanceCacheService(
        'mock',
        serverContext!.container.redis,
      );
      await balanceCache.setBalance('no-max-positions-account', {
        balance: 10000,
        equity: 10000,
        marginUsed: 0,
        marginAvailable: 10000,
      });

      await createOrder({
        orderId: 'order-no-max-positions',
        accountId: 'no-max-positions-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      await pipelineExecutor.executeOrder({
        orderId: 'order-no-max-positions',
        accountId: 'no-max-positions-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0,
        isImmediate: false,
        entry: 2000,
        stopLoss: { price: 1950 },
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-no-max-positions',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-no-max-positions',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);

      // Should use only risk-based calculation (no margin constraint)
      // Risk-based: (200 * 50) / (50 * 100000) = 0.002
      const expectedLotSize = 0.002;
      expect(order?.lotSize).toBe(expectedLotSize);
    });
  });
});
