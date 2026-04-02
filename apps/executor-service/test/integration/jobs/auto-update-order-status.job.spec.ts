/**
 * Integration Test: AutoUpdateOrderStatusJob
 *
 * Verifies that the job can:
 * 1. Correctly fetch OPEN orders and group them by account.
 * 2. Fetch transactions from broker adapters using the oldest order as reference.
 * 3. Match transaction IDs with our database (entryId, slId, tpId).
 * 4. Atomically update order status, exit info, and history in MongoDB.
 */

import { startServer, stopServer, ServerContext } from '../../../src/server';
import { createMockAccount, createOrder } from '../test-helpers';
import { AutoUpdateOrderStatusJob } from '../../../src/jobs/auto-update-order-status.job';
import { OrderStatus, OrderHistoryStatus } from '@dal';
import {
  TransactionStatus,
  TransactionCloseReason,
} from '../../../src/adapters/interfaces';

describe('AutoUpdateOrderStatusJob Integration', () => {
  let serverContext: ServerContext;

  beforeAll(async () => {
    serverContext = await startServer();
  });

  afterAll(async () => {
    await stopServer(serverContext);
  });

  beforeEach(async () => {
    // Clean up collections before each test
    await serverContext.container.accountRepository.deleteMany({});
    await serverContext.container.orderRepository.deleteMany({});
  });

  it('should update orders from OPEN to CLOSED when broker reports closure via TP', async () => {
    const accountId = 'sync-acc-tp';
    await createMockAccount(serverContext, accountId);

    // Seed an open order
    const entryOrderId = 'broker-fill-1';
    const ourOrderId = 'our-tp-order-1';
    await createOrder({
      accountId,
      orderId: ourOrderId,
      status: OrderStatus.OPEN,
      entry: { entryOrderId } as any,
    });

    await serverContext.container.brokerFactory.preloadAdapters();
    const adapter = await serverContext.container.brokerFactory.getAdapter(
      accountId
    );

    // Mock broker returning a CLOSED transaction for this entryOrderId (TP hit)
    const closeTime = new Date('2026-01-13T01:00:00Z');
    jest.spyOn(adapter, 'getTransactions').mockResolvedValue([
      {
        orderId: entryOrderId,
        symbol: 'BTCUSD',
        status: TransactionStatus.CLOSED,
        closeReason: TransactionCloseReason.TP,
        pnl: 120.75,
        closedPrice: 50500.5,
        closeTime: closeTime,
      } as any,
    ]);

    // Create job instance (usually managed by JobService, but we run directly for test)
    const job = new AutoUpdateOrderStatusJob(
      {
        jobId: 'test-job',
        name: 'Auto Update Job',
        status: 'active',
        meta: { batchLimit: 10 },
      } as any,
      serverContext.container.logger,
      serverContext.container
    );

    await (job as any).onTick();

    // Verify database state
    const updatedOrder =
      await serverContext.container.orderRepository.findByOrderId(ourOrderId);
    expect(updatedOrder).toBeDefined();
    expect(updatedOrder?.status).toBe(OrderStatus.CLOSED);
    expect(updatedOrder?.exit?.actualExitPrice).toBe(50500.5);
    expect(updatedOrder?.pnl?.pnl).toBe(120.75);
    expect(updatedOrder?.closedAt?.toISOString()).toBe(closeTime.toISOString());

    // Verify history entry
    const tpHistory = updatedOrder?.history.find(
      (h) => h.status === OrderHistoryStatus.TAKE_PROFIT
    );
    expect(tpHistory).toBeDefined();
    expect(tpHistory?.info?.message).toBe('Auto closed due to tp');
    expect(tpHistory?.info?.closedPrice).toBe(50500.5);
    expect(tpHistory?.info?.pnl).toBe(120.75);
  });

  it('should correctly synchronize orders closed via SL order ID', async () => {
    const accountId = 'sync-acc-sl';
    await createMockAccount(serverContext, accountId);

    const entryOrderId = 'fill-100';
    const slOrderId = 'sl-200';
    const ourOrderId = 'our-sl-order-1';

    await createOrder({
      accountId,
      orderId: ourOrderId,
      status: OrderStatus.OPEN,
      entry: { entryOrderId } as any,
      sl: { slOrderId } as any,
    });

    await serverContext.container.brokerFactory.preloadAdapters();
    const adapter = await serverContext.container.brokerFactory.getAdapter(
      accountId
    );

    // Mock Oanda-style TP/SL hit where transaction ID matches the SL order ID
    jest.spyOn(adapter, 'getTransactions').mockResolvedValue([
      {
        orderId: slOrderId,
        symbol: 'BTCUSD',
        status: TransactionStatus.CLOSED,
        closeReason: TransactionCloseReason.SL,
        pnl: -45.0,
        closedPrice: 49000.0,
      } as any,
    ]);

    const job = new AutoUpdateOrderStatusJob(
      {
        jobId: 'test-job',
        name: 'Auto Update Job',
        status: 'active',
        meta: {},
      } as any,
      serverContext.container.logger,
      serverContext.container
    );

    await (job as any).onTick();

    const updatedOrder =
      await serverContext.container.orderRepository.findByOrderId(ourOrderId);
    expect(updatedOrder?.status).toBe(OrderStatus.CLOSED);

    const slHistory = updatedOrder?.history.find(
      (h) => h.status === OrderHistoryStatus.STOP_LOSS
    );
    expect(slHistory).toBeDefined();
    expect(slHistory?.info?.message).toBe('Auto closed due to sl');
  });

  it('should skip accounts if oldest order is missing entryOrderId', async () => {
    const accountId = 'missing-id-acc';
    await createMockAccount(serverContext, accountId);

    await createOrder({
      accountId,
      orderId: 'bad-order',
      status: OrderStatus.OPEN,
      entry: undefined as any, // Missing entryOrderId
    });

    await serverContext.container.brokerFactory.preloadAdapters();
    const adapter = await serverContext.container.brokerFactory.getAdapter(
      accountId
    );
    const getTransactionsSpy = jest.spyOn(adapter, 'getTransactions');

    const job = new AutoUpdateOrderStatusJob(
      {
        jobId: 'test-job',
        name: 'Auto Update Job',
        status: 'active',
        meta: {},
      } as any,
      serverContext.container.logger,
      serverContext.container
    );

    await (job as any).onTick();

    // Should not have called getTransactions because we couldn't determine fromId
    expect(getTransactionsSpy).not.toHaveBeenCalled();

    const order = await serverContext.container.orderRepository.findByOrderId(
      'bad-order'
    );
    expect(order?.status).toBe(OrderStatus.OPEN); // Still open
  });

  it('should handle batching and only process requested number of orders', async () => {
    const accountId = 'batch-acc';
    await createMockAccount(serverContext, accountId);

    // Create 3 orders
    for (let i = 1; i <= 3; i++) {
      await createOrder({
        accountId,
        orderId: `order-${i}`,
        status: OrderStatus.OPEN,
        entry: { entryOrderId: `fill-${i}` } as any,
      });
    }

    await serverContext.container.brokerFactory.preloadAdapters();
    const adapter = await serverContext.container.brokerFactory.getAdapter(
      accountId
    );
    const getTransactionsSpy = jest
      .spyOn(adapter, 'getTransactions')
      .mockResolvedValue([]);

    const job = new AutoUpdateOrderStatusJob(
      {
        jobId: 'test-job',
        name: 'Auto Update Job',
        status: 'active',
        meta: { batchLimit: 2 },
      } as any,
      serverContext.container.logger,
      serverContext.container
    );

    await (job as any).onTick();

    // Verify only the first batch (fromId should be from order-1)
    expect(getTransactionsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        fromId: 'fill-1',
        from: expect.any(Date),
        to: expect.any(Date),
      })
    );
  });
});
