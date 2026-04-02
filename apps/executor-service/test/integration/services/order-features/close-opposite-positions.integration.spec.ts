/**
 * Integration tests for Close Opposite Positions feature
 * Tests automatic closing of opposite positions when opening new orders
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

  describe('Close Opposite Positions', () => {
    it('should close opposite SHORT positions when opening LONG', async () => {
      const { pipelineExecutor } = serverContext!.container;

      // Create account with closeOppositePosition enabled (default)
      await createMockAccount(serverContext!, 'close-opposite-account');

      // Create 2 existing SHORT orders
      await createOrder({
        orderId: 'short-order-1',
        accountId: 'close-opposite-account',
        symbol: 'BTCUSD',
        side: OrderSide.SHORT,
        status: OrderStatus.OPEN,
        entry: {
          entryPrice: 50000,
          entryOrderId: 'SHORT-1',
          actualEntryPrice: 50000,
        },
      });

      await createOrder({
        orderId: 'short-order-2',
        accountId: 'close-opposite-account',
        symbol: 'BTCUSD',
        side: OrderSide.SHORT,
        status: OrderStatus.OPEN,
        entry: {
          entryPrice: 50100,
          entryOrderId: 'SHORT-2',
          actualEntryPrice: 50100,
        },
      });

      // Create the new LONG order first
      await createOrder({
        orderId: 'new-long-order',
        accountId: 'close-opposite-account',
        symbol: 'BTCUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      // Open a LONG order (should close both SHORT orders)
      await pipelineExecutor.executeOrder({
        orderId: 'new-long-order',
        accountId: 'close-opposite-account',
        symbol: 'BTCUSD',
        command: CommandEnum.LONG,
        lotSize: 0.1,
        isImmediate: true,
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-close-opposite',
        timestamp: Date.now(),
      });

      // Verify SHORT orders were closed
      const closedShort1 = await orderRepository.findOne({
        orderId: 'short-order-1',
      });
      const closedShort2 = await orderRepository.findOne({
        orderId: 'short-order-2',
      });

      expect(closedShort1?.status).toBe(OrderStatus.CLOSED);
      expect(closedShort2?.status).toBe(OrderStatus.CLOSED);

      // Verify LONG order was opened
      const longOrder = await orderRepository.findOne({
        orderId: 'new-long-order',
      });
      expect(longOrder?.status).toBe(OrderStatus.OPEN);
      expect(longOrder?.side).toBe(OrderSide.LONG);
    });

    it('should NOT close opposite positions when closeOppositePosition is false', async () => {
      const { pipelineExecutor } = serverContext!.container;

      // Create account with closeOppositePosition disabled
      await createMockAccount(serverContext!, 'no-close-account', {
        configs: { closeOppositePosition: false },
      });

      // Create existing SHORT order
      await createOrder({
        orderId: 'short-order-keep',
        accountId: 'no-close-account',
        symbol: 'BTCUSD',
        side: OrderSide.SHORT,
        status: OrderStatus.OPEN,
        entry: {
          entryPrice: 50000,
          entryOrderId: 'SHORT-KEEP',
          actualEntryPrice: 50000,
        },
      });

      // Create the new LONG order first
      await createOrder({
        orderId: 'new-long-no-close',
        accountId: 'no-close-account',
        symbol: 'BTCUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      // Open a LONG order (should NOT close SHORT order)
      await pipelineExecutor.executeOrder({
        orderId: 'new-long-no-close',
        accountId: 'no-close-account',
        symbol: 'BTCUSD',
        command: CommandEnum.LONG,
        lotSize: 0.1,
        isImmediate: true,
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-no-close',
        timestamp: Date.now(),
      });

      // Verify SHORT order is still OPEN
      const shortOrder = await orderRepository.findOne({
        orderId: 'short-order-keep',
      });
      expect(shortOrder?.status).toBe(OrderStatus.OPEN);

      // Verify LONG order was opened
      const longOrder = await orderRepository.findOne({
        orderId: 'new-long-no-close',
      });
      expect(longOrder?.status).toBe(OrderStatus.OPEN);
    });

    it('should only close opposite positions for same symbol', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'symbol-specific-account');

      // Create SHORT order for BTCUSD
      await createOrder({
        orderId: 'short-btc',
        accountId: 'symbol-specific-account',
        symbol: 'BTCUSD',
        side: OrderSide.SHORT,
        status: OrderStatus.OPEN,
        entry: {
          entryPrice: 50000,
          entryOrderId: 'SHORT-BTC',
          actualEntryPrice: 50000,
        },
      });

      // Create SHORT order for ETHUSD (different symbol)
      await createOrder({
        orderId: 'short-eth',
        accountId: 'symbol-specific-account',
        symbol: 'ETHUSD',
        side: OrderSide.SHORT,
        status: OrderStatus.OPEN,
        entry: {
          entryPrice: 3000,
          entryOrderId: 'SHORT-ETH',
          actualEntryPrice: 3000,
        },
      });

      // Create the new LONG order first
      await createOrder({
        orderId: 'long-btc',
        accountId: 'symbol-specific-account',
        symbol: 'BTCUSD',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      });

      // Open LONG for BTCUSD (should only close BTCUSD SHORT)
      await pipelineExecutor.executeOrder({
        orderId: 'long-btc',
        accountId: 'symbol-specific-account',
        symbol: 'BTCUSD',
        command: CommandEnum.LONG,
        lotSize: 0.1,
        isImmediate: true,
        messageId: 1,
        channelId: 'test-channel',
        traceToken: 'trace-symbol',
        timestamp: Date.now(),
      });

      // Verify BTCUSD SHORT was closed
      const btcShort = await orderRepository.findOne({
        orderId: 'short-btc',
      });
      expect(btcShort?.status).toBe(OrderStatus.CLOSED);

      // Verify ETHUSD SHORT is still OPEN
      const ethShort = await orderRepository.findOne({
        orderId: 'short-eth',
      });
      expect(ethShort?.status).toBe(OrderStatus.OPEN);
    });
  });
});
