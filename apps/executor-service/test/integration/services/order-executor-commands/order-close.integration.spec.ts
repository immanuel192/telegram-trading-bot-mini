/**
 * Integration tests for Order Close operations (CLOSE_ALL/CLOSE_BAD_POSITION)
 * Tests closing orders and PNL calculation
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
import { OrderNotFoundError } from '../../../../src/adapters/errors';
import { ServerContext, startServer, stopServer } from '../../../../src/server';
import { createMockAccount, createOrder } from '../../test-helpers';

describe(suiteName(__filename), () => {
  let serverContext: ServerContext | null = null;

  beforeAll(async () => {
    serverContext = await startServer();
  });

  beforeEach(async () => {
    // Clear account cache to ensure fresh account data
    serverContext?.container.accountService.clearCache();
    await cleanupDb(mongoDb, [COLLECTIONS.ACCOUNT, COLLECTIONS.ORDERS]);
  });

  afterAll(async () => {
    if (serverContext) {
      await stopServer(serverContext);
      serverContext = null;
    }
  });

  describe('Close Order Operations', () => {
    it('should close LONG order successfully', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'close-long-1',
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
        entry: {
          entryPrice: 50000,
          entryOrderId: 'MOCK-123',
          actualEntryPrice: 50000,
        },
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'close-long-1',
        messageId: 105,
        channelId: 'channel-1',
        command: CommandEnum.CLOSE_ALL,
        symbol: 'BTCUSD',
        lotSize: 0.01, // Should be ignored by ForceFullCloseStep
        traceToken: 'trace-6',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({ orderId: 'close-long-1' });
      expect(order?.status).toBe(OrderStatus.CLOSED);
      expect(order?.exit?.actualExitPrice).toBeGreaterThan(0);
      expect(order?.pnl?.pnl).toBeDefined();

      // Verify history
      expect(order?.history).toHaveLength(1);
      expect(order?.history[0].status).toBe(OrderHistoryStatus.CLOSED);
      // MockAdapter defaults to 0.1 if amount is undefined.
      // If it were 0.01 (from payload), that would mean ForceFullCloseStep failed.
      expect(order?.history[0].info?.closedLots).toBe(0.1);
    });

    it('should calculate PNL correctly for LONG position', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'pnl-long-1',
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
        lotSize: 1.0,
        entry: {
          entryPrice: 50000,
          entryOrderId: 'MOCK-124',
          actualEntryPrice: 50000,
        },
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'pnl-long-1',
        messageId: 106,
        channelId: 'channel-1',
        command: CommandEnum.CLOSE_ALL,
        symbol: 'BTCUSD',
        traceToken: 'trace-7',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({ orderId: 'pnl-long-1' });

      // PNL = (exitPrice - entryPrice) * closedLots * direction
      // For LONG: direction = 1
      // Mock adapter returns closedLots = 0.1
      const expectedPnl = (order!.exit!.actualExitPrice! - 50000) * 0.1 * 1;
      expect(order?.pnl?.pnl).toBeCloseTo(expectedPnl, 2);
    });

    it('should calculate PNL correctly for SHORT position', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'pnl-short-1',
        status: OrderStatus.OPEN,
        side: OrderSide.SHORT,
        lotSize: 1.0,
        entry: {
          entryPrice: 50000,
          entryOrderId: 'MOCK-125',
          actualEntryPrice: 50000,
        },
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'pnl-short-1',
        messageId: 107,
        channelId: 'channel-1',
        command: CommandEnum.CLOSE_ALL,
        symbol: 'BTCUSD',
        traceToken: 'trace-8',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({ orderId: 'pnl-short-1' });

      // PNL = (exitPrice - entryPrice) * closedLots * direction
      // For SHORT: direction = -1
      // Mock adapter returns closedLots = 0.1
      const expectedPnl = (order!.exit!.actualExitPrice! - 50000) * 0.1 * -1;
      expect(order?.pnl?.pnl).toBeCloseTo(expectedPnl, 2);
    });

    it('should handle order not found (HTTP 404) gracefully', async () => {
      const { pipelineExecutor, brokerFactory } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      const adapter = await brokerFactory.getAdapter('test-account');

      await createOrder({
        orderId: 'not-found-order',
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
        entry: {
          entryPrice: 50000,
          entryOrderId: 'MOCK-126',
          actualEntryPrice: 50000,
        },
      });

      // Mock the adapter to throw OrderNotFoundError
      jest.spyOn(adapter as any, 'closeOrder').mockRejectedValueOnce(
        new OrderNotFoundError('not-found-order', {
          errorCode: 'TRADE_DOESNT_EXIST',
          errorMessage: 'The Trade specified does not exist',
        }),
      );

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'not-found-order',
        messageId: 108,
        channelId: 'channel-1',
        command: CommandEnum.CLOSE_ALL,
        symbol: 'BTCUSD',
        traceToken: 'trace-9',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({
        orderId: 'not-found-order',
      });

      // Order should be marked as closed
      expect(order?.status).toBe(OrderStatus.CLOSED);

      // PNL should be undefined (not calculated)
      expect(order?.pnl?.pnl).toBeUndefined();

      // Exit price should be undefined
      expect(order?.exit?.actualExitPrice).toBeUndefined();

      // Verify history contains the "not found" reason
      expect(order?.history).toHaveLength(1);
      expect(order?.history[0].status).toBe(OrderHistoryStatus.CLOSED);
      expect(order?.history[0].info?.reason).toBe(
        'Order already closed (not found on exchange)',
      );
      expect(order?.history[0].info?.rawResponse).toBeDefined();
    });
  });

  describe('CLOSE_BAD_POSITION with disableCloseBadPosition flag', () => {
    it('should skip CLOSE_BAD_POSITION when disableCloseBadPosition=true', async () => {
      const { pipelineExecutor } = serverContext!.container;

      // Create account with disableCloseBadPosition enabled
      await createMockAccount(serverContext!, 'test-account', {
        configs: {
          disableCloseBadPosition: true,
        },
      });

      await createOrder({
        orderId: 'skip-close-bad-1',
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
        entry: {
          entryPrice: 50000,
          entryOrderId: 'MOCK-200',
          actualEntryPrice: 50000,
        },
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'skip-close-bad-1',
        messageId: 200,
        channelId: 'channel-1',
        command: CommandEnum.CLOSE_BAD_POSITION,
        symbol: 'BTCUSD',
        traceToken: 'trace-skip-1',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({
        orderId: 'skip-close-bad-1',
      });

      // Order should remain OPEN (not closed)
      expect(order?.status).toBe(OrderStatus.OPEN);

      // Exit price should be undefined (order not closed)
      expect(order?.exit?.actualExitPrice).toBeUndefined();

      // PNL should be undefined (order not closed)
      expect(order?.pnl?.pnl).toBeUndefined();

      // Verify SKIPPED history entry
      expect(order?.history).toHaveLength(1);
      expect(order?.history[0].status).toBe(OrderHistoryStatus.SKIPPED);
      expect(order?.history[0].command).toBe(CommandEnum.CLOSE_BAD_POSITION);
      expect(order?.history[0].info?.message).toContain(
        'CLOSE_BAD_POSITION command skipped',
      );
      expect(order?.history[0].info?.message).toContain(
        'disableCloseBadPosition=true',
      );
      expect(order?.history[0].info?.reason).toContain('Copy trading delay');
    });

    it('should execute CLOSE_BAD_POSITION when disableCloseBadPosition=false', async () => {
      const { pipelineExecutor } = serverContext!.container;

      // Create account with disableCloseBadPosition explicitly disabled
      await createMockAccount(serverContext!, 'test-account', {
        configs: {
          disableCloseBadPosition: false,
        },
      });

      await createOrder({
        orderId: 'execute-close-bad-1',
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
        entry: {
          entryPrice: 50000,
          entryOrderId: 'MOCK-201',
          actualEntryPrice: 50000,
        },
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'execute-close-bad-1',
        messageId: 201,
        channelId: 'channel-1',
        command: CommandEnum.CLOSE_BAD_POSITION,
        symbol: 'BTCUSD',
        traceToken: 'trace-execute-1',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({
        orderId: 'execute-close-bad-1',
      });

      // Order should be CLOSED (executed normally)
      expect(order?.status).toBe(OrderStatus.CLOSED);
      expect(order?.exit?.actualExitPrice).toBeGreaterThan(0);
      expect(order?.pnl?.pnl).toBeDefined();

      // Verify CLOSED history entry (not SKIPPED)
      expect(order?.history).toHaveLength(1);
      expect(order?.history[0].status).toBe(OrderHistoryStatus.CLOSED);
      expect(order?.history[0].command).toBe(CommandEnum.CLOSE_BAD_POSITION);
    });

    it('should execute CLOSE_BAD_POSITION when disableCloseBadPosition=undefined (default)', async () => {
      const { pipelineExecutor } = serverContext!.container;

      // Create account without disableCloseBadPosition (default behavior)
      await createMockAccount(serverContext!, 'test-account', {
        configs: {},
      });

      await createOrder({
        orderId: 'default-close-bad-1',
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
        entry: {
          entryPrice: 50000,
          entryOrderId: 'MOCK-202',
          actualEntryPrice: 50000,
        },
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'default-close-bad-1',
        messageId: 202,
        channelId: 'channel-1',
        command: CommandEnum.CLOSE_BAD_POSITION,
        symbol: 'BTCUSD',
        traceToken: 'trace-default-1',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({
        orderId: 'default-close-bad-1',
      });

      // Order should be CLOSED (default behavior is to execute)
      expect(order?.status).toBe(OrderStatus.CLOSED);
      expect(order?.exit?.actualExitPrice).toBeGreaterThan(0);
      expect(order?.pnl?.pnl).toBeDefined();

      // Verify CLOSED history entry (not SKIPPED)
      expect(order?.history).toHaveLength(1);
      expect(order?.history[0].status).toBe(OrderHistoryStatus.CLOSED);
      expect(order?.history[0].command).toBe(CommandEnum.CLOSE_BAD_POSITION);
    });

    it('should still execute CLOSE_ALL regardless of disableCloseBadPosition flag', async () => {
      const { pipelineExecutor } = serverContext!.container;

      // Create account with disableCloseBadPosition enabled
      await createMockAccount(serverContext!, 'test-account', {
        configs: {
          disableCloseBadPosition: true,
        },
      });

      await createOrder({
        orderId: 'close-all-test-1',
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
        entry: {
          entryPrice: 50000,
          entryOrderId: 'MOCK-203',
          actualEntryPrice: 50000,
        },
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'close-all-test-1',
        messageId: 203,
        channelId: 'channel-1',
        command: CommandEnum.CLOSE_ALL,
        symbol: 'BTCUSD',
        traceToken: 'trace-close-all-1',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({
        orderId: 'close-all-test-1',
      });

      // CLOSE_ALL should execute normally (not affected by disableCloseBadPosition)
      expect(order?.status).toBe(OrderStatus.CLOSED);
      expect(order?.exit?.actualExitPrice).toBeGreaterThan(0);
      expect(order?.pnl?.pnl).toBeDefined();

      // Verify CLOSED history entry
      expect(order?.history).toHaveLength(1);
      expect(order?.history[0].status).toBe(OrderHistoryStatus.CLOSED);
      expect(order?.history[0].command).toBe(CommandEnum.CLOSE_ALL);
    });

    it('should execute CLOSE_BAD_POSITION and ignore lotSize in payload', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account', {
        configs: {
          disableCloseBadPosition: false,
        },
      });

      await createOrder({
        orderId: 'bad-pos-test-2',
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
        entry: {
          entryPrice: 50000,
          entryOrderId: 'MOCK-204',
          actualEntryPrice: 50000,
        },
      });

      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'bad-pos-test-2',
        messageId: 204,
        channelId: 'channel-1',
        command: CommandEnum.CLOSE_BAD_POSITION,
        symbol: 'BTCUSD',
        lotSize: 0.05, // Should be ignored
        traceToken: 'trace-bad-pos-2',
        timestamp: Date.now(),
      };

      await pipelineExecutor.executeOrder(payload);

      const order = await orderRepository.findOne({
        orderId: 'bad-pos-test-2',
      });

      expect(order?.status).toBe(OrderStatus.CLOSED);
      // Verify history shows mock default 0.1 instead of 0.05
      expect(order?.history[0].info?.closedLots).toBe(0.1);
    });
  });
});
