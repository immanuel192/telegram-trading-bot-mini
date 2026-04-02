/**
 * Integration tests for Broker Price Adjustment feature
 * Tests SL adjustment to handle price differences across broker exchanges
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

  describe('Broker Price Adjustment - Price-Based', () => {
    it('should apply broker price adjustment for LONG order with price-based SL', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'broker-adj-account');

      // Configure broker price adjustment at account level
      await serverContext!.container.accountRepository.updateOne(
        { accountId: 'broker-adj-account' },
        {
          $set: {
            configs: {
              stopLossAdjustPricePercentage: 0.05, // 5% adjustment
            },
          },
        },
      );

      await createOrder({
        orderId: 'order-broker-adj-long',
        accountId: 'broker-adj-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      // Open LONG order with SL, entry=2000, SL=1980
      // Distance = 20
      // Adjusted distance = 20 * (1 + 0.05) = 21
      // Adjusted SL = 2000 - 21 = 1979
      await pipelineExecutor.executeOrder({
        orderId: 'order-broker-adj-long',
        accountId: 'broker-adj-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0.1,
        isImmediate: false,
        entry: 2000,
        stopLoss: { price: 1980 },
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-broker-adj-long',
        timestamp: Date.now(),
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const order = await orderRepository.findOne({
        orderId: 'order-broker-adj-long',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);
      expect(order?.sl?.slOrderId).toBeDefined();

      // Verify adjusted SL price
      const expectedSL = 1979;
      expect(order?.sl?.slPrice).toBe(expectedSL);

      // Verify history contains broker adjustment info
      const openHistory = order?.history.find(
        (h) => h.status === OrderHistoryStatus.OPEN,
      );

      expect(openHistory?.info?.brokerSlAdjustment).toBeDefined();
      expect(openHistory?.info?.brokerSlAdjustment.original.price).toBe(1980);
      expect(openHistory?.info?.brokerSlAdjustment.adjusted.price).toBe(1979);
      expect(openHistory?.info?.brokerSlAdjustment.adjustPercent).toBe(0.05);
      expect(openHistory?.info?.brokerSlAdjustment.source).toBe(
        'account-level',
      );
    });

    it('should apply broker price adjustment for SHORT order with price-based SL', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'broker-adj-short-account');

      await serverContext!.container.accountRepository.updateOne(
        { accountId: 'broker-adj-short-account' },
        {
          $set: {
            configs: {
              stopLossAdjustPricePercentage: 0.05, // 5% adjustment
            },
          },
        },
      );

      await createOrder({
        orderId: 'order-broker-adj-short',
        accountId: 'broker-adj-short-account',
        symbol: 'XAUUSD',
        side: OrderSide.SHORT,
        status: OrderStatus.PENDING,
      });

      // Open SHORT order with SL, entry=2000, SL=2020
      // Distance = 20
      // Adjusted distance = 20 * (1 + 0.05) = 21
      // Adjusted SL = 2000 + 21 = 2021
      await pipelineExecutor.executeOrder({
        orderId: 'order-broker-adj-short',
        accountId: 'broker-adj-short-account',
        symbol: 'XAUUSD',
        command: CommandEnum.SHORT,
        lotSize: 0.1,
        isImmediate: false,
        entry: 2000,
        stopLoss: { price: 2020 },
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-broker-adj-short',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-broker-adj-short',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);
      expect(order?.sl?.slOrderId).toBeDefined();

      // Verify adjusted SL price
      const expectedSL = 2021;
      expect(order?.sl?.slPrice).toBe(expectedSL);

      // Verify history contains broker adjustment info
      const openHistory = order?.history.find(
        (h) => h.status === OrderHistoryStatus.OPEN,
      );
      expect(openHistory?.info?.brokerSlAdjustment).toBeDefined();
      expect(openHistory?.info?.brokerSlAdjustment.original.price).toBe(2020);
      expect(openHistory?.info?.brokerSlAdjustment.adjusted.price).toBe(2021);
    });

    it('should NOT apply broker adjustment to forced stop loss', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'no-adj-forced-sl-account');

      await serverContext!.container.accountRepository.updateOne(
        { accountId: 'no-adj-forced-sl-account' },
        {
          $set: {
            configs: {
              forceStopLossByPercentage: 0.02, // 2% forced SL
              stopLossAdjustPricePercentage: 0.05, // 5% adjustment (should NOT apply)
            },
          },
        },
      );

      await createOrder({
        orderId: 'order-no-adj-forced',
        accountId: 'no-adj-forced-sl-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      // Open LONG order without SL, entry=2000
      // Expected forced SL = 2000 - (2000 * 0.02) = 1960
      // Broker adjustment should NOT be applied to forced SL
      await pipelineExecutor.executeOrder({
        orderId: 'order-no-adj-forced',
        accountId: 'no-adj-forced-sl-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0.1,
        isImmediate: false,
        entry: 2000,
        // No stopLoss provided - will be forced
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-no-adj-forced',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-no-adj-forced',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);
      expect(order?.sl?.slOrderId).toBeDefined();

      // Verify forced SL is NOT adjusted
      const expectedSL = 1960;
      expect(order?.sl?.slPrice).toBe(expectedSL);

      // Verify history does NOT contain broker adjustment info
      const openHistory = order?.history.find(
        (h) => h.status === OrderHistoryStatus.OPEN,
      );
      expect(openHistory?.info?.brokerSlAdjustment).toBeUndefined();
    });

    it('should prioritize symbol-level over account-level broker adjustment', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'symbol-priority-account');

      await serverContext!.container.accountRepository.updateOne(
        { accountId: 'symbol-priority-account' },
        {
          $set: {
            configs: {
              stopLossAdjustPricePercentage: 0.05, // 5% at account level
            },
            symbols: {
              XAUUSD: {
                stopLossAdjustPricePercentage: 0.1, // 10% at symbol level (should win)
              },
            },
          },
        },
      );

      await createOrder({
        orderId: 'order-symbol-priority',
        accountId: 'symbol-priority-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      // Open LONG order with SL, entry=2000, SL=1980
      // Distance = 20
      // Adjusted distance = 20 * (1 + 0.10) = 22 (using symbol-level 10%)
      // Adjusted SL = 2000 - 22 = 1978
      await pipelineExecutor.executeOrder({
        orderId: 'order-symbol-priority',
        accountId: 'symbol-priority-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0.1,
        isImmediate: false,
        entry: 2000,
        stopLoss: { price: 1980 },
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-symbol-priority',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-symbol-priority',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);
      expect(order?.sl?.slOrderId).toBeDefined();

      // Verify adjusted SL uses symbol-level config (10%)
      const expectedSL = 1978;
      expect(order?.sl?.slPrice).toBe(expectedSL);

      // Verify history shows symbol-level source
      const openHistory = order?.history.find(
        (h) => h.status === OrderHistoryStatus.OPEN,
      );
      expect(openHistory?.info?.brokerSlAdjustment.source).toBe('symbol-level');
      expect(openHistory?.info?.brokerSlAdjustment.adjustPercent).toBe(0.1);
    });
  });

  describe('Broker Price Adjustment - MOVE_SL Command', () => {
    it('should apply broker adjustment when moving SL via MOVE_SL command', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'move-sl-adj-account');

      await serverContext!.container.accountRepository.updateOne(
        { accountId: 'move-sl-adj-account' },
        {
          $set: {
            configs: {
              stopLossAdjustPricePercentage: 0.05, // 5% adjustment
            },
          },
        },
      );

      // Create an open order first
      await createOrder({
        orderId: 'order-move-sl-adj',
        accountId: 'move-sl-adj-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.OPEN,
        entry: {
          entryPrice: 2000,
          actualEntryPrice: 2000,
          entryOrderId: 'entry-123',
        },
        sl: {
          slPrice: 1980,
          slOrderId: 'sl-123',
        },
      });

      // Move SL from 1980 to 1990
      // Distance = 10 (from entry 2000)
      // Adjusted distance = 10 * (1 + 0.05) = 10.5
      // Adjusted SL = 2000 - 10.5 = 1989.5
      await pipelineExecutor.executeOrder({
        orderId: 'order-move-sl-adj',
        accountId: 'move-sl-adj-account',
        symbol: 'XAUUSD',
        command: CommandEnum.MOVE_SL,
        lotSize: 0.1,
        stopLoss: { price: 1990 },
        messageId: 2,
        channelId: 'test-channel',
        traceToken: 'trace-move-sl-adj',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-move-sl-adj',
      });

      // Verify adjusted SL price
      const expectedSL = 1989.5;
      expect(order?.sl?.slPrice).toBe(expectedSL);

      // Verify history contains broker adjustment info for UPDATE event
      const updateHistory = order?.history.find(
        (h) => h.status === OrderHistoryStatus.UPDATE,
      );
      expect(updateHistory?.info?.brokerSlAdjustment).toBeDefined();
      expect(updateHistory?.info?.brokerSlAdjustment.original.price).toBe(1990);
      expect(updateHistory?.info?.brokerSlAdjustment.adjusted.price).toBe(
        1989.5,
      );
    });

    it('should NOT apply broker adjustment when skipBrokerPriceAdjustment is true', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'skip-adj-account');

      await serverContext!.container.accountRepository.updateOne(
        { accountId: 'skip-adj-account' },
        {
          $set: {
            configs: {
              stopLossAdjustPricePercentage: 0.05, // 5% adjustment (should be skipped)
            },
          },
        },
      );

      await createOrder({
        orderId: 'order-skip-adj',
        accountId: 'skip-adj-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.OPEN,
        entry: {
          entryPrice: 2000,
          actualEntryPrice: 2000,
          entryOrderId: 'entry-456',
        },
        sl: {
          slPrice: 1980,
          slOrderId: 'sl-456',
        },
      });

      // Move SL with skipBrokerPriceAdjustment flag
      await pipelineExecutor.executeOrder({
        orderId: 'order-skip-adj',
        accountId: 'skip-adj-account',
        symbol: 'XAUUSD',
        command: CommandEnum.MOVE_SL,
        lotSize: 0.1,
        stopLoss: { price: 1990 },
        meta: {
          executionInstructions: {
            skipBrokerPriceAdjustment: true, // Skip adjustment
          },
        },
        messageId: 3,
        channelId: 'test-channel',
        traceToken: 'trace-skip-adj',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-skip-adj',
      });

      // Verify SL is NOT adjusted
      expect(order?.sl?.slPrice).toBe(1990);

      // Verify history does NOT contain broker adjustment info
      const updateHistory = order?.history.find(
        (h) => h.status === OrderHistoryStatus.UPDATE,
      );
      expect(updateHistory?.info?.brokerSlAdjustment).toBeFalsy();
    });
  });
});
