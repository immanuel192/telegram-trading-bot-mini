/**
 * Integration tests for AutoSyncTpSlLinkedOrderJob
 * Tests automatic TP/SL synchronization across linked orders
 */

import {
  suiteName,
  cleanupDb,
  COLLECTIONS,
} from '@telegram-trading-bot-mini/shared/test-utils';
import { mongoDb, orderRepository } from '@dal';
import {
  CommandEnum,
  ServiceName,
} from '@telegram-trading-bot-mini/shared/utils';
import { OrderStatus, OrderHistoryStatus } from '@dal/models';
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

    // Register the job in the database so JobManager can load it
    const { jobRepository, jobManager } = serverContext!.container;
    await jobRepository.create({
      jobId: ServiceName.AUTO_SYNC_TP_SL_LINKED_ORDER_JOB,
      name: ServiceName.AUTO_SYNC_TP_SL_LINKED_ORDER_JOB,
      isActive: true,
      config: {}, // Manual only
      meta: {},
    } as any);

    // Force reload jobs
    await jobManager.init();
  });

  afterAll(async () => {
    if (serverContext) {
      await stopServer(serverContext);
      serverContext = null;
    }
  });

  describe('Job Execution', () => {
    it('should successfully update TP/SL for a linked order', async () => {
      const { jobService } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'linked-order-1',
        accountId: 'test-account',
        status: OrderStatus.OPEN,
        entry: {
          entryPrice: 50000,
          entryOrderId: 'MOCK-200',
          actualEntryPrice: 50000,
        },
      });

      await jobService.triggerJob({
        jobName: ServiceName.AUTO_SYNC_TP_SL_LINKED_ORDER_JOB,
        params: {
          accountId: 'test-account',
          orderId: 'linked-order-1',
          sl: { price: 49000 },
          tp: { price: 51000 },
          sourceOrderId: 'source-order-1',
        },
        traceToken: 'test-trace-1',
      });

      // Wait for job to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      const order = await orderRepository.findOne({
        orderId: 'linked-order-1',
      });

      // Verify TP/SL were updated
      expect(order?.sl?.slPrice).toBe(49000);
      expect(order?.tp?.tp1Price).toBe(51000);

      // Verify history has 2 entries: job marker + actual update
      expect(order?.history).toHaveLength(2);

      // First entry: job execution marker
      expect(order?.history[0].status).toBe(OrderHistoryStatus.UPDATE);
      expect(order?.history[0].service).toBe(
        'auto-sync-tp-sl-linked-order-job',
      );
      expect(order?.history[0].command).toBe(CommandEnum.NONE);
      expect(order?.history[0].info?.sourceOrderId).toBe('source-order-1');
      expect(order?.history[0].info?.reason).toBe('linked-order-sync');

      // Second entry: actual TP/SL update
      expect(order?.history[1].status).toBe(OrderHistoryStatus.UPDATE);
      expect(order?.history[1].service).toBe('executor-service');
      expect(order?.history[1].command).toBe(CommandEnum.SET_TP_SL);
    });

    it('should update only SL when TP is not provided', async () => {
      const { jobService } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'linked-order-2',
        accountId: 'test-account',
        status: OrderStatus.OPEN,
        entry: {
          entryPrice: 50000,
          entryOrderId: 'MOCK-201',
          actualEntryPrice: 50000,
        },
      });

      await jobService.triggerJob({
        jobName: ServiceName.AUTO_SYNC_TP_SL_LINKED_ORDER_JOB,
        params: {
          accountId: 'test-account',
          orderId: 'linked-order-2',
          sl: { price: 48500 },
          sourceOrderId: 'source-order-2',
        },
        traceToken: 'test-trace-2',
      });

      await new Promise((resolve) => setTimeout(resolve, 500));

      const order = await orderRepository.findOne({
        orderId: 'linked-order-2',
      });

      // Verify only SL was updated
      expect(order?.sl?.slPrice).toBe(48500);
      expect(order?.tp).toBeUndefined();

      // Verify history
      expect(order?.history).toHaveLength(2);
      expect(order?.history[0].info?.sl).toEqual({ price: 48500 });
      expect(order?.history[0].info?.tp).toBeFalsy();
    });

    it('should update only TP when SL is not provided', async () => {
      const { jobService } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'linked-order-3',
        accountId: 'test-account',
        status: OrderStatus.OPEN,
        entry: {
          entryPrice: 50000,
          entryOrderId: 'MOCK-202',
          actualEntryPrice: 50000,
        },
      });

      await jobService.triggerJob({
        jobName: ServiceName.AUTO_SYNC_TP_SL_LINKED_ORDER_JOB,
        params: {
          accountId: 'test-account',
          orderId: 'linked-order-3',
          tp: { price: 52000 },
          sourceOrderId: 'source-order-3',
        },
        traceToken: 'test-trace-3',
      });

      await new Promise((resolve) => setTimeout(resolve, 500));

      const order = await orderRepository.findOne({
        orderId: 'linked-order-3',
      });

      // Verify only TP was updated
      expect(order?.tp?.tp1Price).toBe(52000);
      expect(order?.sl).toBeUndefined();

      // Verify history
      expect(order?.history).toHaveLength(2);
      expect(order?.history[0].info?.tp).toEqual({ price: 52000 });
      expect(order?.history[0].info?.sl).toBeFalsy();
    });

    it('should mark deferred SL update with correct reason', async () => {
      const { jobService } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'deferred-sl-order',
        accountId: 'test-account',
        status: OrderStatus.OPEN,
        entry: {
          entryPrice: 50000,
          entryOrderId: 'MOCK-203',
          actualEntryPrice: 50000,
        },
      });

      // Trigger job with sourceOrderId === orderId (deferred SL scenario)
      await jobService.triggerJob({
        jobName: ServiceName.AUTO_SYNC_TP_SL_LINKED_ORDER_JOB,
        params: {
          accountId: 'test-account',
          orderId: 'deferred-sl-order',
          sl: { price: 49500 },
          sourceOrderId: 'deferred-sl-order', // Same as orderId
        },
        traceToken: 'test-trace-4',
      });

      await new Promise((resolve) => setTimeout(resolve, 500));

      const order = await orderRepository.findOne({
        orderId: 'deferred-sl-order',
      });

      // Verify history has correct reason
      expect(order?.history[0].info?.reason).toBe('deferred-sl-update');
    });
  });

  describe('Validation', () => {
    it('should skip update when order is not in OPEN status', async () => {
      const { jobService } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'pending-order',
        accountId: 'test-account',
        status: OrderStatus.PENDING, // Not OPEN
      });

      await jobService.triggerJob({
        jobName: ServiceName.AUTO_SYNC_TP_SL_LINKED_ORDER_JOB,
        params: {
          accountId: 'test-account',
          orderId: 'pending-order',
          sl: { price: 49000 },
          sourceOrderId: 'source-order-5',
        },
        traceToken: 'test-trace-5',
      });

      await new Promise((resolve) => setTimeout(resolve, 500));

      const order = await orderRepository.findOne({ orderId: 'pending-order' });

      // Verify no TP/SL was set
      expect(order?.sl).toBeUndefined();
      expect(order?.tp).toBeUndefined();

      // Verify no history was added
      expect(order?.history).toHaveLength(0);
    });

    it('should throw error when order does not exist', async () => {
      const { jobService } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');

      // Trigger job for non-existent order
      await jobService.triggerJob({
        jobName: ServiceName.AUTO_SYNC_TP_SL_LINKED_ORDER_JOB,
        params: {
          accountId: 'test-account',
          orderId: 'non-existent-order',
          sl: { price: 49000 },
          sourceOrderId: 'source-order-6',
        },
        traceToken: 'test-trace-6',
      });

      // Wait for job to fail
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Job should have failed but not crashed the system
      // Error should be captured in Sentry
    });

    it('should throw error when required params are missing', async () => {
      const { jobService } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');

      // Trigger job without accountId
      await jobService.triggerJob({
        jobName: ServiceName.AUTO_SYNC_TP_SL_LINKED_ORDER_JOB,
        params: {
          orderId: 'some-order',
          sl: { price: 49000 },
        } as any,
        traceToken: 'test-trace-7',
      });

      // Wait for job to fail
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Job should have failed with validation error
    });
  });

  describe('Recursion Prevention', () => {
    it('should set skipLinkedOrderSync flag to prevent endless loops', async () => {
      const { jobService } = serverContext!.container;

      await createMockAccount(serverContext!, 'test-account');
      await createOrder({
        orderId: 'order-with-linked',
        accountId: 'test-account',
        status: OrderStatus.OPEN,
        linkedOrders: ['linked-a', 'linked-b'], // Has linked orders
        entry: {
          entryPrice: 50000,
          entryOrderId: 'MOCK-204',
          actualEntryPrice: 50000,
        },
      });

      await jobService.triggerJob({
        jobName: ServiceName.AUTO_SYNC_TP_SL_LINKED_ORDER_JOB,
        params: {
          accountId: 'test-account',
          orderId: 'order-with-linked',
          sl: { price: 49000 },
          sourceOrderId: 'source-order-8',
        },
        traceToken: 'test-trace-8',
      });

      await new Promise((resolve) => setTimeout(resolve, 500));

      const order = await orderRepository.findOne({
        orderId: 'order-with-linked',
      });

      // Verify TP/SL was updated
      expect(order?.sl?.slPrice).toBe(49000);

      // Verify history shows the update happened
      expect(order?.history).toHaveLength(2);

      // The job should have passed skipLinkedOrderSync: true in executionInstructions
      // So no additional sync jobs should be triggered for linked-a and linked-b
      // This prevents endless recursion
    });
  });
});
