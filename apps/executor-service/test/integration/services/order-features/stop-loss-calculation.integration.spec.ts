/**
 * Integration tests for Stop Loss Calculation feature
 * Tests SL adjustment and forcing based on account configuration
 */

import {
  suiteName,
  cleanupDb,
  COLLECTIONS,
} from '@telegram-trading-bot-mini/shared/test-utils';
import { mongoDb, orderRepository } from '@dal';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';
import { OrderStatus, OrderSide } from '@dal/models';
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

  describe('Stop Loss Calculation', () => {
    it('should create order with stop loss when provided', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'sl-test-account');

      await createOrder({
        orderId: 'order-with-sl',
        accountId: 'sl-test-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      await pipelineExecutor.executeOrder({
        orderId: 'order-with-sl',
        accountId: 'sl-test-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0.1,
        isImmediate: false,
        entry: 2000,
        stopLoss: { price: 1980 },
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-sl',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-with-sl',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);
      expect(order?.sl?.slOrderId).toBeDefined();

      // Verify the SL price is stored correctly
      expect(order?.sl?.slPrice).toBe(1980);
    });

    it('should create order without stop loss when not provided', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'no-sl-account');

      await createOrder({
        orderId: 'order-no-sl',
        accountId: 'no-sl-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      await pipelineExecutor.executeOrder({
        orderId: 'order-no-sl',
        accountId: 'no-sl-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0.1,
        isImmediate: true,
        // No stopLoss provided
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-no-sl',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-no-sl',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);
      expect(order?.sl?.slOrderId).toBeUndefined();
      expect(order?.sl?.slPrice).toBeUndefined();
    });

    it('should force stop loss when forceStopLossByPercentage is configured', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'force-sl-account');

      // Add symbol-specific config
      await serverContext!.container.accountRepository.updateOne(
        { accountId: 'force-sl-account' },
        {
          $set: {
            symbols: {
              XAUUSD: {
                forceStopLossByPercentage: 0.02, // 2%
              },
            },
          },
        },
      );

      await createOrder({
        orderId: 'order-force-sl',
        accountId: 'force-sl-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      // Open LONG order without SL, entry=2000
      // Expected forced SL = 2000 - (2000 * 0.02) = 2000 - 40 = 1960
      await pipelineExecutor.executeOrder({
        orderId: 'order-force-sl',
        accountId: 'force-sl-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0.1,
        isImmediate: false,
        entry: 2000,
        // No stopLoss provided - should be forced
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-force-sl',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-force-sl',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);
      expect(order?.sl?.slOrderId).toBeDefined();

      // Verify the forced SL price is calculated correctly
      // For LONG: SL = entry - (entry * percentage) = 2000 - 40 = 1960
      const expectedSL = 1960;
      expect(order?.sl?.slPrice).toBe(expectedSL);
    });

    it('should NOT force stop loss when forceStopLossByPercentage is 0', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'no-force-sl-account');

      await serverContext!.container.accountRepository.updateOne(
        { accountId: 'no-force-sl-account' },
        {
          $set: {
            symbols: {
              XAUUSD: {
                forceStopLossByPercentage: 0,
              },
            },
          },
        },
      );

      await createOrder({
        orderId: 'order-no-force-sl',
        accountId: 'no-force-sl-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      await pipelineExecutor.executeOrder({
        orderId: 'order-no-force-sl',
        accountId: 'no-force-sl-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0.1,
        isImmediate: true,
        // No stopLoss provided and forceStopLossByPercentage is 0
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-no-force-sl',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-no-force-sl',
      });

      // Order should be created without SL
      expect(order?.status).toBe(OrderStatus.OPEN);
      expect(order?.sl?.slOrderId).toBeUndefined();
      expect(order?.sl?.slPrice).toBeUndefined();
    });

    it('should force stop loss for SHORT with correct calculation', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'force-sl-short-account');

      await serverContext!.container.accountRepository.updateOne(
        { accountId: 'force-sl-short-account' },
        {
          $set: {
            symbols: {
              XAUUSD: {
                forceStopLossByPercentage: 0.02, // 2%
              },
            },
          },
        },
      );

      await createOrder({
        orderId: 'order-force-sl-short',
        accountId: 'force-sl-short-account',
        symbol: 'XAUUSD',
        side: OrderSide.SHORT,
        status: OrderStatus.PENDING,
      });

      // Open SHORT order without SL, entry=2000
      // Expected forced SL = 2000 + (2000 * 0.02) = 2000 + 40 = 2040
      await pipelineExecutor.executeOrder({
        orderId: 'order-force-sl-short',
        accountId: 'force-sl-short-account',
        symbol: 'XAUUSD',
        command: CommandEnum.SHORT,
        lotSize: 0.1,
        isImmediate: false,
        entry: 2000,
        // No stopLoss provided - should be forced
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-force-sl-short',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-force-sl-short',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);
      expect(order?.sl?.slOrderId).toBeDefined();

      // Verify the forced SL price is calculated correctly for SHORT
      // For SHORT: SL = entry + (entry * percentage) = 2000 + 40 = 2040
      const expectedSL = 2040;
      expect(order?.sl?.slPrice).toBe(expectedSL);
    });

    it('should use account-level forceStopLossByPercentage when symbol-level not set', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'account-level-sl-account');

      // Set account-level forceStopLossByPercentage (no symbol-level config)
      await serverContext!.container.accountRepository.updateOne(
        { accountId: 'account-level-sl-account' },
        {
          $set: {
            configs: {
              forceStopLossByPercentage: 0.03, // 3% at account level
            },
          },
        },
      );

      await createOrder({
        orderId: 'order-account-level-sl',
        accountId: 'account-level-sl-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      // Open LONG order without SL, entry=2000
      // Expected forced SL = 2000 - (2000 * 0.03) = 2000 - 60 = 1940
      await pipelineExecutor.executeOrder({
        orderId: 'order-account-level-sl',
        accountId: 'account-level-sl-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0.1,
        isImmediate: false,
        entry: 2000,
        // No stopLoss provided - should use account-level forced SL
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-account-level-sl',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-account-level-sl',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);
      expect(order?.sl?.slOrderId).toBeDefined();

      // Verify the forced SL price uses account-level config (3%)
      // For LONG: SL = entry - (entry * percentage) = 2000 - 60 = 1940
      const expectedSL = 1940;
      expect(order?.sl?.slPrice).toBe(expectedSL);
    });

    it('should prioritize symbol-level over account-level forceStopLossByPercentage', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'priority-test-account');

      // Set both account-level and symbol-level configs
      await serverContext!.container.accountRepository.updateOne(
        { accountId: 'priority-test-account' },
        {
          $set: {
            configs: {
              forceStopLossByPercentage: 0.05, // 5% at account level
            },
            symbols: {
              XAUUSD: {
                forceStopLossByPercentage: 0.01, // 1% at symbol level (should win)
              },
            },
          },
        },
      );

      await createOrder({
        orderId: 'order-priority-test',
        accountId: 'priority-test-account',
        symbol: 'XAUUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      // Open LONG order without SL, entry=2000
      // Expected forced SL = 2000 - (2000 * 0.01) = 2000 - 20 = 1980 (using symbol-level 1%)
      await pipelineExecutor.executeOrder({
        orderId: 'order-priority-test',
        accountId: 'priority-test-account',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0.1,
        isImmediate: false,
        entry: 2000,
        // No stopLoss provided - should use symbol-level forced SL (1%), not account-level (5%)
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-priority-test',
        timestamp: Date.now(),
      });

      const order = await orderRepository.findOne({
        orderId: 'order-priority-test',
      });

      expect(order?.status).toBe(OrderStatus.OPEN);
      expect(order?.sl?.slOrderId).toBeDefined();

      // Verify the forced SL price uses symbol-level config (1%), not account-level (5%)
      // For LONG: SL = entry - (entry * percentage) = 2000 - 20 = 1980
      const expectedSL = 1980;
      expect(order?.sl?.slPrice).toBe(expectedSL);
    });
  });
});
