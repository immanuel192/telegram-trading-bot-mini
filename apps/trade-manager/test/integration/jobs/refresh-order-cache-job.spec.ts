import {
  suiteName,
  setupDb,
  teardownDb,
  cleanupDb,
  COLLECTIONS,
} from '@telegram-trading-bot-mini/shared/test-utils';
import {
  tradeManagerJobRepository,
  mongoDb,
  orderRepository,
  OrderStatus,
} from '@dal';
import { Job } from '@telegram-trading-bot-mini/shared/utils';
import { RefreshOrderCacheJob } from '../../../src/jobs/refresh-order-cache-job';
import { Container } from '../../../src/interfaces';
import { createContainer } from '../../../src/container';
import { logger } from '../../../src/logger';

describe(suiteName(__filename), () => {
  let container: Container;

  beforeAll(async () => {
    await setupDb();
  });

  afterAll(async () => {
    await teardownDb();
  });

  beforeEach(async () => {
    await cleanupDb(mongoDb, [
      COLLECTIONS.JOBS_TRADE_MANAGER,
      COLLECTIONS.ORDERS,
    ]);
    container = createContainer(logger);
  });

  it('should refresh order cache when job is triggered', async () => {
    // 1. Setup DB with some open orders
    await orderRepository.create({
      orderId: 'job-order-1',
      accountId: 'acc-1',
      symbol: 'BTCUSDT',
      side: 'LONG',
      status: OrderStatus.OPEN,
      lotSize: 0.1,
      lotSizeRemaining: 0.1,
      createdAt: new Date(),
    } as any);

    // 2. Register the job in DB
    const jobConfig: Job = {
      jobId: 'refresh-order-cache-job',
      name: 'periodic-cache-refresh',
      isActive: true,
      config: {
        cronExpression: '*/1 * * * *',
        runOnInit: false,
      },
    } as Job;

    await tradeManagerJobRepository.create(jobConfig);

    // 3. Initialize JobManager
    await container.jobManager.init();

    const job = container.jobManager.getJobByName(
      'periodic-cache-refresh',
    ) as RefreshOrderCacheJob;
    expect(job).toBeDefined();

    // 4. Cache should be populated after init (job.init() calls refreshCache())
    let stats = container.orderCacheService.getStats();
    expect(stats.totalOrders).toBe(1);

    // 5. Add another order to DB
    await orderRepository.create({
      orderId: 'job-order-2',
      accountId: 'acc-1',
      symbol: 'ETHUSDT',
      side: 'SHORT',
      status: OrderStatus.OPEN,
      lotSize: 1.0,
      lotSizeRemaining: 1.0,
      createdAt: new Date(),
    } as any);

    // 6. Trigger the job manually to refresh cache
    await job.trigger();

    // 7. Verify cache is now updated with both orders
    stats = container.orderCacheService.getStats();
    expect(stats.totalOrders).toBe(2);
  });

  it('should handle periodic cache refresh correctly', async () => {
    // Setup initial order
    await orderRepository.create({
      orderId: 'scheduled-order-1',
      accountId: 'acc-2',
      symbol: 'ETHUSD',
      side: 'LONG',
      status: OrderStatus.OPEN,
      lotSize: 0.5,
      lotSizeRemaining: 0.5,
      createdAt: new Date(),
    } as any);

    const jobConfig: Job = {
      jobId: 'refresh-order-cache-job',
      name: 'scheduled-refresh-job',
      isActive: true,
      config: {
        cronExpression: '*/1 * * * *',
        runOnInit: false,
      },
    } as Job;

    await tradeManagerJobRepository.create(jobConfig);
    await container.jobManager.init();

    const job = container.jobManager.getJobByName(
      'scheduled-refresh-job',
    ) as RefreshOrderCacheJob;

    // Verify initial state after init
    let stats = container.orderCacheService.getStats();
    expect(stats.totalOrders).toBe(1);

    // Add another order
    await orderRepository.create({
      orderId: 'scheduled-order-2',
      accountId: 'acc-2',
      symbol: 'BTCUSD',
      side: 'SHORT',
      status: OrderStatus.OPEN,
      lotSize: 0.2,
      lotSizeRemaining: 0.2,
      createdAt: new Date(),
    } as any);

    // Manually trigger to simulate cron execution
    await job.trigger();

    // Verify cache now has both orders
    stats = container.orderCacheService.getStats();
    expect(stats.totalOrders).toBe(2);
  });
});
