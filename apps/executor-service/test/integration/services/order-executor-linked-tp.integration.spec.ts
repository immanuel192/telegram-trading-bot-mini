/**
 * Integration tests for Linked Order Take Profit Optimization
 * Verifies that the linkedOrderOptimiseTp feature correctly assigns different TPs
 * to orphan vs new orders when enabled
 */

import {
  suiteName,
  cleanupDb,
  COLLECTIONS,
} from '@telegram-trading-bot-mini/shared/test-utils';
import { mongoDb } from '@dal';
import {
  CommandEnum,
  ServiceName,
} from '@telegram-trading-bot-mini/shared/utils';
import { OrderStatus, OrderHistoryStatus, OrderSide } from '@dal/models';
import { ServerContext, startServer, stopServer } from '../../../src/server';
import { createMockAccount, createOrder } from '../test-helpers';

describe(suiteName(__filename), () => {
  let serverContext: ServerContext | null = null;

  beforeAll(async () => {
    serverContext = await startServer();
  });

  beforeEach(async () => {
    await cleanupDb(mongoDb, [
      COLLECTIONS.ACCOUNT,
      COLLECTIONS.ORDERS,
      COLLECTIONS.JOBS_EXECUTOR_SERVICE,
    ]);

    // Register the job
    const { jobRepository, jobManager, accountService } =
      serverContext!.container;

    // Clear account cache to prevent state leakage between tests
    accountService.clearCache();

    await jobRepository.create({
      jobId: ServiceName.AUTO_SYNC_TP_SL_LINKED_ORDER_JOB,
      name: ServiceName.AUTO_SYNC_TP_SL_LINKED_ORDER_JOB,
      isActive: true,
      config: {},
      meta: {},
    } as any);

    await jobManager.init();
  });

  afterAll(async () => {
    if (serverContext) {
      await stopServer(serverContext);
      serverContext = null;
    }
  });

  describe('TP Optimization Disabled (linkedOrderOptimiseTp = false)', () => {
    it('should assign same TP to both orders when optimization is disabled', async () => {
      const { pipelineExecutor } = serverContext!.container;

      // Create account with optimization DISABLED
      await createMockAccount(serverContext!, 'test-account', {
        configs: {
          linkedOrderOptimiseTp: false,
          takeProfitIndex: 0,
        },
      });

      const linkedIds = ['order-a', 'order-b'];

      // 1. Create Order A (orphan, already OPEN)
      await createOrder({
        orderId: 'order-a',
        accountId: 'test-account',
        status: OrderStatus.OPEN,
        symbol: 'XAUUSD',
        linkedOrders: linkedIds,
        entry: {
          entryPrice: 4091,
          actualEntryPrice: 4091,
          entryOrderId: 'MOCK-A',
        },
      });

      // 2. Pre-create Order B in PENDING
      await createOrder({
        orderId: 'order-b',
        accountId: 'test-account',
        status: OrderStatus.PENDING,
        symbol: 'XAUUSD',
        linkedOrders: linkedIds,
        messageId: 2,
      });

      // 3. Execute Order B with multiple TPs
      await pipelineExecutor.executeOrder({
        accountId: 'test-account',
        orderId: 'order-b',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0.01,
        stopLoss: { price: 4086 },
        takeProfits: [{ price: 4094 }, { price: 4111 }, { price: 4150 }],
        traceToken: 'test-trace-disabled',
        messageId: 2,
        channelId: 'chan-1',
        timestamp: Date.now(),
      });

      // 4. Wait for background job to update Order A
      // First ensure Order B is fully created
      await new Promise((resolve) => setTimeout(resolve, 1000));

      let orderA: any = null;
      for (let i = 0; i < 30; i++) {
        orderA = await mongoDb
          .collection(COLLECTIONS.ORDERS)
          .findOne({ orderId: 'order-a' });
        if (orderA?.tp?.tp1Price) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      const orderB = await mongoDb
        .collection(COLLECTIONS.ORDERS)
        .findOne({ orderId: 'order-b' });

      // Verify: Both orders should have the SAME TP (4150 - most aggressive)
      expect(orderB?.tp?.tp1Price).toBe(4150);
      expect(orderA?.tp?.tp1Price).toBe(4150); // Same as Order B

      // Verify: No TP optimization history entry
      expect(orderB?.history).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            status: OrderHistoryStatus.INFO,
            info: expect.objectContaining({
              message: 'TP optimization applied for linked orders',
            }),
          }),
        ]),
      );
    });
  });

  describe('TP Optimization Enabled (linkedOrderOptimiseTp = true)', () => {
    it('should assign different TPs when optimization is enabled (LONG order)', async () => {
      const { pipelineExecutor } = serverContext!.container;

      // Create account with optimization ENABLED
      await createMockAccount(serverContext!, 'test-account', {
        configs: {
          linkedOrderOptimiseTp: true,
          takeProfitIndex: 0,
        },
      });

      // 1. Create Order A (orphan, already OPEN)
      await createOrder({
        orderId: 'order-a',
        accountId: 'test-account',
        status: OrderStatus.OPEN,
        symbol: 'XAUUSD',
        linkedOrders: ['order-b'],
        entry: {
          entryPrice: 4091,
          actualEntryPrice: 4091,
          entryOrderId: 'MOCK-A',
        },
      });

      // 2. Pre-create Order B in PENDING
      await createOrder({
        orderId: 'order-b',
        accountId: 'test-account',
        status: OrderStatus.PENDING,
        symbol: 'XAUUSD',
        linkedOrders: ['order-a'],
        messageId: 2,
      });

      // 3. Execute Order B with multiple TPs
      await pipelineExecutor.executeOrder({
        accountId: 'test-account',
        orderId: 'order-b',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0.01,
        stopLoss: { price: 4086 },
        takeProfits: [{ price: 4094 }, { price: 4111 }, { price: 4150 }],
        traceToken: 'test-trace-enabled',
        messageId: 2,
        channelId: 'chan-1',
        timestamp: Date.now(),
      });

      // 4. Wait for background job to update Order A
      await new Promise((resolve) => setTimeout(resolve, 1000));

      let orderA: any = null;
      for (let i = 0; i < 30; i++) {
        orderA = await mongoDb
          .collection(COLLECTIONS.ORDERS)
          .findOne({ orderId: 'order-a' });
        if (orderA?.tp?.tp1Price) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      const orderB = await mongoDb
        .collection(COLLECTIONS.ORDERS)
        .findOne({ orderId: 'order-b' });

      // Verify: Different TPs assigned
      // Order B (new): Gets TP[0] = 4150 (most aggressive, furthest)
      // Order A (orphan): Gets avg(4150, 4111) = 4130.5
      expect(orderB?.tp?.tp1Price).toBe(4150);
      expect(orderA?.tp?.tp1Price).toBe(4130.5); // Averaged price

      // Verify: TP optimization history entry exists
      expect(orderB?.history).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            status: OrderHistoryStatus.INFO,
            service: ServiceName.EXECUTOR_SERVICE,
            info: expect.objectContaining({
              message: 'TP optimization applied for linked orders',
              currentOrderTP: 4150,
              linkedOrderTP: 4130.5,
            }),
          }),
        ]),
      );
    });

    it('should assign different TPs for SHORT orders', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account', {
        configs: {
          linkedOrderOptimiseTp: true,
          takeProfitIndex: 0,
        },
      });

      await createOrder({
        orderId: 'order-a',
        accountId: 'test-account',
        status: OrderStatus.OPEN,
        symbol: 'XAUUSD',
        side: OrderSide.SHORT, // Explicitly SHORT to match Order B side
        linkedOrders: ['order-b'],
        entry: {
          entryPrice: 2650,
          actualEntryPrice: 2650,
          entryOrderId: 'MOCK-A',
        },
      });

      await createOrder({
        orderId: 'order-b',
        accountId: 'test-account',
        status: OrderStatus.PENDING,
        symbol: 'XAUUSD',
        linkedOrders: ['order-a'],
        messageId: 2,
      });

      // Execute SHORT order with multiple TPs
      await pipelineExecutor.executeOrder({
        accountId: 'test-account',
        orderId: 'order-b',
        symbol: 'XAUUSD',
        command: CommandEnum.SHORT,
        lotSize: 0.01,
        stopLoss: { price: 2700 },
        takeProfits: [{ price: 2600 }, { price: 2550 }, { price: 2500 }],
        traceToken: 'test-trace-short',
        messageId: 2,
        channelId: 'chan-1',
        timestamp: Date.now(),
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      let orderA: any = null;
      for (let i = 0; i < 30; i++) {
        orderA = await mongoDb
          .collection(COLLECTIONS.ORDERS)
          .findOne({ orderId: 'order-a' });
        if (orderA?.tp?.tp1Price) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      const orderB = await mongoDb
        .collection(COLLECTIONS.ORDERS)
        .findOne({ orderId: 'order-b' });

      // For SHORT: Sorted TPs = [2500, 2550, 2600] (lowest first = most aggressive)
      // Order B: Gets TP[0] = 2500 (most aggressive)
      // Order A: Gets avg(2500, 2550) = 2525
      expect(orderB?.tp?.tp1Price).toBe(2500);
      expect(orderA?.tp?.tp1Price).toBe(2525);
    });

    it('should fallback to same TP when only one TP available', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account', {
        configs: {
          linkedOrderOptimiseTp: true,
          takeProfitIndex: 0,
        },
      });

      const linkedIds = ['order-a', 'order-b'];

      await createOrder({
        orderId: 'order-a',
        accountId: 'test-account',
        status: OrderStatus.OPEN,
        symbol: 'XAUUSD',
        linkedOrders: linkedIds,
        entry: {
          entryPrice: 4091,
          actualEntryPrice: 4091,
          entryOrderId: 'MOCK-A',
        },
      });

      await createOrder({
        orderId: 'order-b',
        accountId: 'test-account',
        status: OrderStatus.PENDING,
        symbol: 'XAUUSD',
        linkedOrders: linkedIds,
        messageId: 2,
      });

      // Execute with only ONE TP
      await pipelineExecutor.executeOrder({
        accountId: 'test-account',
        orderId: 'order-b',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0.01,
        stopLoss: { price: 4086 },
        takeProfits: [{ price: 4094 }], // Only one TP!
        traceToken: 'test-trace-one-tp',
        messageId: 2,
        channelId: 'chan-1',
        timestamp: Date.now(),
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      let orderA: any = null;
      for (let i = 0; i < 30; i++) {
        orderA = await mongoDb
          .collection(COLLECTIONS.ORDERS)
          .findOne({ orderId: 'order-a' });
        if (orderA?.tp?.tp1Price) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      const orderB = await mongoDb
        .collection(COLLECTIONS.ORDERS)
        .findOne({ orderId: 'order-b' });

      // Both should have the same TP (fallback behavior)
      expect(orderB?.tp?.tp1Price).toBe(4094);
      expect(orderA?.tp?.tp1Price).toBe(4094);

      // No optimization history entry (because only 1 TP available)
      expect(orderB?.history).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            status: OrderHistoryStatus.INFO,
            info: expect.objectContaining({
              message: 'TP optimization applied for linked orders',
            }),
          }),
        ]),
      );
    });
  });

  describe('History Logging', () => {
    it('should NOT log optimization when disabled', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account', {
        configs: {
          linkedOrderOptimiseTp: false, // Disabled
          takeProfitIndex: 0,
        },
      });

      const linkedIds = ['order-a', 'order-b'];

      await createOrder({
        orderId: 'order-a',
        accountId: 'test-account',
        status: OrderStatus.OPEN,
        symbol: 'XAUUSD',
        linkedOrders: linkedIds,
        entry: {
          entryPrice: 4091,
          actualEntryPrice: 4091,
          entryOrderId: 'MOCK-A',
        },
      });

      await createOrder({
        orderId: 'order-b',
        accountId: 'test-account',
        status: OrderStatus.PENDING,
        symbol: 'XAUUSD',
        linkedOrders: linkedIds,
        messageId: 2,
      });

      await pipelineExecutor.executeOrder({
        accountId: 'test-account',
        orderId: 'order-b',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0.01,
        stopLoss: { price: 4086 },
        takeProfits: [{ price: 4094 }, { price: 4111 }],
        traceToken: 'test-trace-no-log',
        messageId: 2,
        channelId: 'chan-1',
        timestamp: Date.now(),
      });

      // Wait a bit for any potential history updates
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const orderB = await mongoDb
        .collection(COLLECTIONS.ORDERS)
        .findOne({ orderId: 'order-b' });

      // Should NOT have optimization history entry
      const optimizationEntry = orderB?.history?.find(
        (h: any) =>
          h.status === OrderHistoryStatus.INFO &&
          h.info?.message === 'TP optimization applied for linked orders',
      );

      expect(optimizationEntry).toBeUndefined();
    });

    it('should log optimization details when enabled and applied', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account', {
        configs: {
          linkedOrderOptimiseTp: true, // Enabled
          takeProfitIndex: 0,
        },
      });

      await createOrder({
        orderId: 'order-a',
        accountId: 'test-account',
        status: OrderStatus.OPEN,
        symbol: 'XAUUSD',
        linkedOrders: ['order-b'],
        entry: {
          entryPrice: 4091,
          actualEntryPrice: 4091,
          entryOrderId: 'MOCK-A',
        },
      });

      await createOrder({
        orderId: 'order-b',
        accountId: 'test-account',
        status: OrderStatus.PENDING,
        symbol: 'XAUUSD',
        linkedOrders: ['order-a'],
        messageId: 2,
      });

      await pipelineExecutor.executeOrder({
        accountId: 'test-account',
        orderId: 'order-b',
        symbol: 'XAUUSD',
        command: CommandEnum.LONG,
        lotSize: 0.01,
        stopLoss: { price: 4086 },
        takeProfits: [{ price: 4094 }, { price: 4111 }, { price: 4150 }],
        traceToken: 'test-trace-with-log',
        messageId: 2,
        channelId: 'chan-1',
        timestamp: Date.now(),
      });

      // Wait for order to be created and history logged
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const orderB = await mongoDb
        .collection(COLLECTIONS.ORDERS)
        .findOne({ orderId: 'order-b' });

      // Should have optimization history entry with all details
      const optimizationEntry = orderB?.history?.find(
        (h: any) =>
          h.status === OrderHistoryStatus.INFO &&
          h.info?.message === 'TP optimization applied for linked orders',
      );

      expect(optimizationEntry).toBeDefined();
      expect(optimizationEntry?.service).toBe(ServiceName.EXECUTOR_SERVICE);
      expect(optimizationEntry?.info).toMatchObject({
        message: 'TP optimization applied for linked orders',
        currentOrderTP: 4150,
        linkedOrderTP: 4130.5,
      });
      expect(optimizationEntry?.traceToken).toBe('test-trace-with-log');
      expect(optimizationEntry?.messageId).toBe(2);
      expect(optimizationEntry?.channelId).toBe('chan-1');
    });
  });
});
