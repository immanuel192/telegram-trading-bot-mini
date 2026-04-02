/**
 * Integration tests for Risk-Based Lot Size Calculation
 * Tests automatic lot size calculation based on account balance and risk percentage
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

  describe('Risk-Based Lot Size Calculation', () => {
    it('should calculate lot size based on risk when lotSize=0', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'risk-calc-account', {
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

      const balanceCache = new BalanceCacheService(
        'mock',
        serverContext!.container.redis,
      );
      await balanceCache.setBalance('risk-calc-account', {
        balance: 10000,
        equity: 10000,
        marginUsed: 0,
        marginAvailable: 10000,
      });

      await createOrder({
        orderId: 'order-risk-calc',
        accountId: 'risk-calc-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      await pipelineExecutor.executeOrder({
        orderId: 'order-risk-calc',
        accountId: 'risk-calc-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0,
        isImmediate: false,
        entry: 2000,
        stopLoss: { price: 1950 },
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-risk-calc',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-risk-calc',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);
      expect(order?.entry?.entryOrderId).toBeDefined();

      const expectedLotSize = 0.002;
      expect(order?.lotSize).toBe(expectedLotSize);

      const openHistory = order?.history?.find(
        (h) => h.status === OrderHistoryStatus.OPEN,
      );
      expect(openHistory?.info?.calculatedLotSize).toBe(expectedLotSize);
      expect(openHistory?.info?.originalLotSize).toBe(0);
    });

    it('should fallback to defaultLotSize when balance is missing', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'fallback-account', {
        configs: {
          defaultLotSize: 0.01,
          defaultMaxRiskPercentage: 2,
        },
      });

      await createOrder({
        orderId: 'order-fallback',
        accountId: 'fallback-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      await pipelineExecutor.executeOrder({
        orderId: 'order-fallback',
        accountId: 'fallback-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0,
        isImmediate: false,
        entry: 2000,
        stopLoss: { price: 1950 },
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-fallback',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-fallback',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);
      expect(order?.lotSize).toBe(0.01);

      const openHistory = order?.history?.find(
        (h) => h.status === OrderHistoryStatus.OPEN,
      );
      expect(openHistory?.info?.calculatedLotSize).toBe(0.01);
      expect(openHistory?.info?.originalLotSize).toBe(0);
    });

    it('should use symbol-level maxRiskPercentage over account-level', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'symbol-priority-account', {
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

      await serverContext!.container.accountRepository.updateOne(
        { accountId: 'symbol-priority-account' },
        {
          $set: {
            symbols: {
              XAUUSD: {
                maxRiskPercentage: 3,
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
      await balanceCache.setBalance('symbol-priority-account', {
        balance: 10000,
        equity: 10000,
        marginUsed: 0,
        marginAvailable: 10000,
      });

      await createOrder({
        orderId: 'order-symbol-priority',
        accountId: 'symbol-priority-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      await pipelineExecutor.executeOrder({
        orderId: 'order-symbol-priority',
        accountId: 'symbol-priority-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0,
        isImmediate: false,
        entry: 2000,
        stopLoss: { price: 1950 },
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-symbol-priority',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-symbol-priority',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);
      const expectedLotSize = 0.003;
      expect(order?.lotSize).toBe(expectedLotSize);
    });
  });
});
