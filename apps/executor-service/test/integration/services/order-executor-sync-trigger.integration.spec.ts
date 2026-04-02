/**
 * Integration tests for OrderExecutorService synchronization triggers
 * Verifies that the service correctly triggers background jobs for TP/SL sync
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
import { OrderStatus } from '@dal/models';
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
    const { jobRepository, jobManager } = serverContext!.container;
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

  describe('handleOpenOrder Triggers', () => {
    it('should broadcast TP/SL to existing siblings when a new linked order is created (Order B syncs Order A)', async () => {
      const { pipelineExecutor: orderExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');

      const linkedIds = ['order-a', 'order-b'];

      // 1. Create Order A (Already OPEN, maybe orphan or previously created)
      await createOrder({
        orderId: 'order-a',
        accountId: 'test-account',
        status: OrderStatus.OPEN,
        symbol: 'BTC/USD',
        linkedOrders: linkedIds,
        entry: {
          entryPrice: 40000,
          actualEntryPrice: 40000,
          entryOrderId: 'MOCK-A',
        },
        sl: { slPrice: 41000 }, // Old/forced SL
      });

      // 2. Pre-create Order B in PENDING
      await createOrder({
        orderId: 'order-b',
        accountId: 'test-account',
        status: OrderStatus.PENDING,
        symbol: 'BTC/USD',
        linkedOrders: linkedIds,
        messageId: 2,
      });

      // 3. Execute Order B with proper TP/SL
      await orderExecutor.executeOrder({
        accountId: 'test-account',
        orderId: 'order-b',
        symbol: 'BTC/USD',
        command: CommandEnum.LONG,
        lotSize: 0.1,
        stopLoss: { price: 39000 }, // New proper SL
        takeProfits: [{ price: 45000 }],
        traceToken: 'test-trace-order-b',
        messageId: 2,
        channelId: 'chan-1',
        timestamp: Date.now(),
      });

      // 4. Wait for background job to update Order A
      let orderA: any = null;
      for (let i = 0; i < 20; i++) {
        orderA = await mongoDb
          .collection(COLLECTIONS.ORDERS)
          .findOne({ orderId: 'order-a' });
        if (orderA?.sl?.slPrice === 39000) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      // Verify Order A was updated
      expect(orderA?.sl?.slPrice).toBe(39000);
      expect(orderA?.tp?.tp1Price).toBe(45000);

      // Verify history on Order A
      expect(orderA?.history).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            service: ServiceName.AUTO_SYNC_TP_SL_LINKED_ORDER_JOB,
            info: expect.objectContaining({
              reason: 'linked-order-sync',
              sourceOrderId: 'order-b',
            }),
          }),
        ]),
      );
    });
  });

  describe('handleUpdateTakeProfitStopLoss Triggers', () => {
    it('should broadcast TP/SL updates to all linked orders', async () => {
      const { pipelineExecutor } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');

      const linkedIds = ['main-order', 'linked-order'];

      await createOrder({
        orderId: 'main-order',
        accountId: 'test-account',
        symbol: 'BTC/USD',
        status: OrderStatus.OPEN,
        linkedOrders: linkedIds,
        entry: {
          entryPrice: 40000,
          actualEntryPrice: 40000,
          entryOrderId: 'MOCK-ENTRY-1',
        },
        sl: {
          slPrice: 40000,
          slOrderId: 'MOCK-SL-1',
        },
      });

      await createOrder({
        orderId: 'linked-order',
        accountId: 'test-account',
        symbol: 'BTC/USD',
        status: OrderStatus.OPEN,
        linkedOrders: linkedIds,
        entry: {
          entryPrice: 40000,
          actualEntryPrice: 40000,
          entryOrderId: 'MOCK-ENTRY-2',
        },
        sl: {
          slPrice: 40000,
          slOrderId: 'MOCK-SL-2',
        },
      });

      // Update TP/SL on the main order
      await pipelineExecutor.executeOrder({
        accountId: 'test-account',
        orderId: 'main-order',
        symbol: 'BTC/USD',
        command: CommandEnum.SET_TP_SL,
        stopLoss: { price: 38000 },
        traceToken: 'test-trace-update-trigger',
        messageId: 3,
        channelId: 'chan-1',
        timestamp: Date.now(),
      });

      // Wait for background job to update the linked order
      let linkedOrder: any = null;
      for (let i = 0; i < 20; i++) {
        linkedOrder = await mongoDb
          .collection(COLLECTIONS.ORDERS)
          .findOne({ orderId: 'linked-order' });
        if (linkedOrder?.sl?.slPrice === 38000) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      // Verify the linked order was updated
      expect(linkedOrder?.sl?.slPrice).toBe(38000);

      // Verify history on linked order
      expect(linkedOrder?.history).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            service: ServiceName.AUTO_SYNC_TP_SL_LINKED_ORDER_JOB,
            info: expect.objectContaining({
              reason: 'linked-order-sync',
              sourceOrderId: 'main-order',
            }),
          }),
        ]),
      );
    });
  });
});
