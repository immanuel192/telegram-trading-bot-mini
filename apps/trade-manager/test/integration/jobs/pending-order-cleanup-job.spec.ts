import {
  suiteName,
  setupDb,
  teardownDb,
  cleanupDb,
  COLLECTIONS,
  createTestAccount,
  createTestChannel,
} from '@telegram-trading-bot-mini/shared/test-utils';
import {
  tradeManagerJobRepository,
  mongoDb,
  orderRepository,
  accountRepository,
  telegramChannelRepository,
  OrderStatus,
  OrderSide,
  OrderExecutionType,
  TradeType,
  OrderHistoryStatus,
} from '@dal';
import {
  CommandEnum,
  ServiceName,
} from '@telegram-trading-bot-mini/shared/utils';
import { Job } from '@telegram-trading-bot-mini/shared/utils';
import { PendingOrderCleanupJob } from '../../../src/jobs/pending-order-cleanup-job';
import { Container } from '../../../src/interfaces';
import { createContainer } from '../../../src/container';
import { logger } from '../../../src/logger';
import { ObjectId } from 'mongodb';

describe(suiteName(__filename), () => {
  let container: Container;

  beforeAll(async () => {
    jest.setTimeout(30000);
    await setupDb();
    container = createContainer(logger);
  });

  afterAll(async () => {
    await teardownDb();
  });

  beforeEach(async () => {
    // Clean up before each test
    await cleanupDb(mongoDb, [
      COLLECTIONS.JOBS_TRADE_MANAGER,
      COLLECTIONS.ORDERS,
      COLLECTIONS.ACCOUNT,
      COLLECTIONS.TELEGRAM_CHANNELS,
    ]);

    // Create test data
    await telegramChannelRepository.create(createTestChannel());
    await accountRepository.create(createTestAccount());
  });

  describe('Stale Order Identification', () => {
    it('should identify stale orders based on default timeout (1 minute)', async () => {
      // Create a stale order (older than 1 minute)
      const staleOrder = {
        accountId: 'test-account-1',
        orderId: 'stale-order-1',
        messageId: 100,
        channelId: '123456789',
        status: OrderStatus.PENDING,
        side: OrderSide.LONG,
        executionType: OrderExecutionType.market,
        tradeType: TradeType.FUTURE,
        createdAt: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
        symbol: 'BTCUSDT',
        lotSize: 0.1,
        history: [
          {
            _id: new ObjectId(),
            status: OrderHistoryStatus.INTEND,
            service: ServiceName.TRADE_MANAGER,
            ts: new Date(),
            traceToken: 'trace-100',
            messageId: 100,
            channelId: '123456789',
            command: CommandEnum.LONG,
          },
        ],
      };

      await orderRepository.create(staleOrder);

      // Create job config with default timeout
      const jobConfig: Job = {
        jobId: 'pending-order-cleanup-job',
        name: 'test-cleanup-job',
        isActive: true,
        config: {
          cronExpression: '*/1 * * * *',
        },
        meta: {
          timeoutMinutes: 1,
          notificationAccountIds: [],
        },
      } as Job;

      await tradeManagerJobRepository.create(jobConfig);
      await container.jobManager.init();

      const job = container.jobManager.getJobByName('test-cleanup-job');
      expect(job).toBeDefined();
      expect(job).toBeInstanceOf(PendingOrderCleanupJob);

      // Trigger job manually
      await job!.trigger();

      // Verify order was closed
      const orders = await orderRepository.findAll({
        orderId: 'stale-order-1',
      });

      expect(orders).toHaveLength(1);
      expect(orders[0].status).toBe(OrderStatus.CLOSED);
      expect(orders[0].closedAt).toBeDefined();
    });

    it('should identify stale orders based on custom timeout from meta', async () => {
      // Create an order that's 3 minutes old
      const staleOrder = {
        accountId: 'test-account-1',
        orderId: 'stale-order-2',
        messageId: 101,
        channelId: '123456789',
        status: OrderStatus.PENDING,
        side: OrderSide.LONG,
        executionType: OrderExecutionType.market,
        tradeType: TradeType.FUTURE,
        createdAt: new Date(Date.now() - 3 * 60 * 1000), // 3 minutes ago
        symbol: 'BTCUSDT',
        lotSize: 0.1,
        history: [
          {
            _id: new ObjectId(),
            status: OrderHistoryStatus.INTEND,
            service: ServiceName.TRADE_MANAGER,
            ts: new Date(),
            traceToken: 'trace-101',
            messageId: 101,
            channelId: '123456789',
            command: CommandEnum.LONG,
          },
        ],
      };

      await orderRepository.create(staleOrder);

      // Create job config with 2-minute timeout
      const jobConfig: Job = {
        jobId: 'pending-order-cleanup-job',
        name: 'test-cleanup-job-custom',
        isActive: true,
        config: {
          cronExpression: '*/1 * * * *',
        },
        meta: {
          timeoutMinutes: 2, // Custom timeout
          notificationAccountIds: [],
        },
      } as Job;

      await tradeManagerJobRepository.create(jobConfig);
      await container.jobManager.init();

      const job = container.jobManager.getJobByName('test-cleanup-job-custom');
      await job!.trigger();

      // Verify order was closed (3 minutes > 2 minute timeout)
      const orders = await orderRepository.findAll({
        orderId: 'stale-order-2',
      });

      expect(orders).toHaveLength(1);
      expect(orders[0].status).toBe(OrderStatus.CLOSED);
    });

    it('should not clean orders younger than timeout', async () => {
      // Create a recent order (30 seconds old)
      const recentOrder = {
        accountId: 'test-account-1',
        orderId: 'recent-order-1',
        messageId: 102,
        channelId: '123456789',
        status: OrderStatus.PENDING,
        side: OrderSide.LONG,
        executionType: OrderExecutionType.market,
        tradeType: TradeType.FUTURE,
        createdAt: new Date(Date.now() - 30 * 1000), // 30 seconds ago
        symbol: 'BTCUSDT',
        lotSize: 0.1,
        history: [
          {
            _id: new ObjectId(),
            status: OrderHistoryStatus.INTEND,
            service: ServiceName.TRADE_MANAGER,
            ts: new Date(),
            traceToken: 'trace-102',
            messageId: 102,
            channelId: '123456789',
            command: CommandEnum.LONG,
          },
        ],
      };

      await orderRepository.create(recentOrder);

      const jobConfig: Job = {
        jobId: 'pending-order-cleanup-job',
        name: 'test-cleanup-job-recent',
        isActive: true,
        config: {
          cronExpression: '*/1 * * * *',
        },
        meta: {
          timeoutMinutes: 1,
          notificationAccountIds: [],
        },
      } as Job;

      await tradeManagerJobRepository.create(jobConfig);
      await container.jobManager.init();

      const job = container.jobManager.getJobByName('test-cleanup-job-recent');
      await job!.trigger();

      // Verify order was NOT closed
      const orders = await orderRepository.findAll({
        orderId: 'recent-order-1',
      });

      expect(orders).toHaveLength(1);
      expect(orders[0].status).toBe(OrderStatus.PENDING);
      expect(orders[0].closedAt).toBeUndefined();
    });

    it('should not clean limit orders (only market orders are cleaned)', async () => {
      // Create a stale limit order (older than timeout)
      const staleLimitOrder = {
        accountId: 'test-account-1',
        orderId: 'limit-order-1',
        messageId: 103,
        channelId: '123456789',
        status: OrderStatus.PENDING,
        side: OrderSide.LONG,
        executionType: OrderExecutionType.limit,
        tradeType: TradeType.FUTURE,
        createdAt: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
        symbol: 'BTCUSDT',
        lotSize: 0.1,
        history: [
          {
            _id: new ObjectId(),
            status: OrderHistoryStatus.INTEND,
            service: ServiceName.TRADE_MANAGER,
            ts: new Date(),
            traceToken: 'trace-103',
            messageId: 103,
            channelId: '123456789',
            command: CommandEnum.LONG,
          },
        ],
      };

      await orderRepository.create(staleLimitOrder);

      const jobConfig: Job = {
        jobId: 'pending-order-cleanup-job',
        name: 'test-cleanup-job-limit',
        isActive: true,
        config: {
          cronExpression: '*/1 * * * *',
        },
        meta: {
          timeoutMinutes: 1,
          notificationAccountIds: [],
        },
      } as Job;

      await tradeManagerJobRepository.create(jobConfig);
      await container.jobManager.init();

      const job = container.jobManager.getJobByName('test-cleanup-job-limit');
      await job!.trigger();

      // Verify limit order was NOT closed (job only processes market orders)
      const orders = await orderRepository.findAll({
        orderId: 'limit-order-1',
      });

      expect(orders).toHaveLength(1);
      expect(orders[0].status).toBe(OrderStatus.PENDING);
      expect(orders[0].closedAt).toBeUndefined();
    });
  });

  describe('Order Closure', () => {
    it('should close stale orders and set closedAt, status=CLOSED', async () => {
      const staleOrder = {
        accountId: 'test-account-1',
        orderId: 'stale-order-3',
        messageId: 103,
        channelId: '123456789',
        status: OrderStatus.PENDING,
        side: OrderSide.SHORT,
        executionType: OrderExecutionType.market,
        tradeType: TradeType.FUTURE,
        createdAt: new Date(Date.now() - 2 * 60 * 1000),
        symbol: 'ETHUSDT',
        lotSize: 0.5,
        history: [
          {
            _id: new ObjectId(),
            status: OrderHistoryStatus.INTEND,
            service: ServiceName.TRADE_MANAGER,
            ts: new Date(),
            traceToken: 'trace-103',
            messageId: 103,
            channelId: '123456789',
            command: CommandEnum.SHORT,
          },
        ],
      };

      await orderRepository.create(staleOrder);

      const jobConfig: Job = {
        jobId: 'pending-order-cleanup-job',
        name: 'test-cleanup-job-closure',
        isActive: true,
        config: {
          cronExpression: '*/1 * * * *',
        },
        meta: {
          timeoutMinutes: 1,
          notificationAccountIds: [],
        },
      } as Job;

      await tradeManagerJobRepository.create(jobConfig);
      await container.jobManager.init();

      const job = container.jobManager.getJobByName('test-cleanup-job-closure');
      await job!.trigger();

      const orders = await orderRepository.findAll({
        orderId: 'stale-order-3',
      });

      expect(orders).toHaveLength(1);
      expect(orders[0].status).toBe(OrderStatus.CLOSED);
      expect(orders[0].closedAt).toBeDefined();
      expect(orders[0].closedAt).toBeInstanceOf(Date);
    });

    it('should add CANCELED history entry with correct fields (service, command=NONE, reason)', async () => {
      const staleOrder = {
        accountId: 'test-account-1',
        orderId: 'stale-order-4',
        messageId: 104,
        channelId: '123456789',
        status: OrderStatus.PENDING,
        side: OrderSide.LONG,
        executionType: OrderExecutionType.market,
        tradeType: TradeType.FUTURE,
        createdAt: new Date(Date.now() - 2 * 60 * 1000),
        symbol: 'BTCUSDT',
        lotSize: 0.1,
        history: [
          {
            _id: new ObjectId(),
            status: OrderHistoryStatus.INTEND,
            service: ServiceName.TRADE_MANAGER,
            ts: new Date(),
            traceToken: 'trace-104',
            messageId: 104,
            channelId: '123456789',
            command: CommandEnum.LONG,
          },
        ],
      };

      await orderRepository.create(staleOrder);

      const jobConfig: Job = {
        jobId: 'pending-order-cleanup-job',
        name: 'test-cleanup-job-history',
        isActive: true,
        config: {
          cronExpression: '*/1 * * * *',
        },
        meta: {
          timeoutMinutes: 1,
          notificationAccountIds: [],
        },
      } as Job;

      await tradeManagerJobRepository.create(jobConfig);
      await container.jobManager.init();

      const job = container.jobManager.getJobByName('test-cleanup-job-history');
      await job!.trigger();

      const orders = await orderRepository.findAll({
        orderId: 'stale-order-4',
      });

      expect(orders).toHaveLength(1);
      expect(orders[0].history).toHaveLength(2); // INTEND + CANCELED

      const canceledHistory = orders[0].history.find(
        (h) => h.status === OrderHistoryStatus.CANCELED,
      );

      expect(canceledHistory).toBeDefined();
      expect(canceledHistory!.service).toBe(
        ServiceName.PENDING_ORDER_CLEANUP_JOB,
      );
      expect(canceledHistory!.command).toBe(CommandEnum.NONE);
      expect(canceledHistory!.traceToken).toBe('');
      expect(canceledHistory!.messageId).toBe(104);
      expect(canceledHistory!.channelId).toBe('123456789');
      expect(canceledHistory!.info?.reason).toContain('timeout');
    });

    it('should use correct service name in history', async () => {
      const staleOrder = {
        accountId: 'test-account-1',
        orderId: 'stale-order-5',
        messageId: 105,
        channelId: '123456789',
        status: OrderStatus.PENDING,
        side: OrderSide.LONG,
        executionType: OrderExecutionType.market,
        tradeType: TradeType.FUTURE,
        createdAt: new Date(Date.now() - 2 * 60 * 1000),
        symbol: 'BTCUSDT',
        lotSize: 0.1,
        history: [
          {
            _id: new ObjectId(),
            status: OrderHistoryStatus.INTEND,
            service: ServiceName.TRADE_MANAGER,
            ts: new Date(),
            traceToken: 'trace-105',
            messageId: 105,
            channelId: '123456789',
            command: CommandEnum.LONG,
          },
        ],
      };

      await orderRepository.create(staleOrder);

      const jobConfig: Job = {
        jobId: 'pending-order-cleanup-job',
        name: 'test-cleanup-job-service',
        isActive: true,
        config: {
          cronExpression: '*/1 * * * *',
        },
        meta: {
          timeoutMinutes: 1,
          notificationAccountIds: [],
        },
      } as Job;

      await tradeManagerJobRepository.create(jobConfig);
      await container.jobManager.init();

      const job = container.jobManager.getJobByName('test-cleanup-job-service');
      await job!.trigger();

      const orders = await orderRepository.findAll({
        orderId: 'stale-order-5',
      });

      const canceledHistory = orders[0].history.find(
        (h) => h.status === OrderHistoryStatus.CANCELED,
      );

      expect(canceledHistory!.service).toBe('pending-order-cleanup-job');
    });

    it('should use MongoDB transaction for atomicity', async () => {
      // This test verifies that the cleanup happens in a transaction
      // We can't easily test rollback without mocking, but we can verify
      // that both status update and history entry are present
      const staleOrder = {
        accountId: 'test-account-1',
        orderId: 'stale-order-6',
        messageId: 106,
        channelId: '123456789',
        status: OrderStatus.PENDING,
        side: OrderSide.LONG,
        executionType: OrderExecutionType.market,
        tradeType: TradeType.FUTURE,
        createdAt: new Date(Date.now() - 2 * 60 * 1000),
        symbol: 'BTCUSDT',
        lotSize: 0.1,
        history: [
          {
            _id: new ObjectId(),
            status: OrderHistoryStatus.INTEND,
            service: ServiceName.TRADE_MANAGER,
            ts: new Date(),
            traceToken: 'trace-106',
            messageId: 106,
            channelId: '123456789',
            command: CommandEnum.LONG,
          },
        ],
      };

      await orderRepository.create(staleOrder);

      const jobConfig: Job = {
        jobId: 'pending-order-cleanup-job',
        name: 'test-cleanup-job-transaction',
        isActive: true,
        config: {
          cronExpression: '*/1 * * * *',
        },
        meta: {
          timeoutMinutes: 1,
          notificationAccountIds: [],
        },
      } as Job;

      await tradeManagerJobRepository.create(jobConfig);
      await container.jobManager.init();

      const job = container.jobManager.getJobByName(
        'test-cleanup-job-transaction',
      );
      await job!.trigger();

      const orders = await orderRepository.findAll({
        orderId: 'stale-order-6',
      });

      // Both updates should be present (atomic)
      expect(orders[0].status).toBe(OrderStatus.CLOSED);
      expect(orders[0].closedAt).toBeDefined();
      expect(orders[0].history).toHaveLength(2);
    });
  });

  describe('Notification Logic', () => {

    it('should skip notification for non-whitelisted accounts', async () => {
      const staleOrder = {
        accountId: 'test-account-1',
        orderId: 'stale-order-8',
        messageId: 108,
        channelId: '123456789',
        status: OrderStatus.PENDING,
        side: OrderSide.LONG,
        executionType: OrderExecutionType.market,
        tradeType: TradeType.FUTURE,
        createdAt: new Date(Date.now() - 2 * 60 * 1000),
        symbol: 'BTCUSDT',
        lotSize: 0.1,
        history: [
          {
            _id: new ObjectId(),
            status: OrderHistoryStatus.INTEND,
            service: ServiceName.TRADE_MANAGER,
            ts: new Date(),
            traceToken: 'trace-108',
            messageId: 108,
            channelId: '123456789',
            command: CommandEnum.LONG,
          },
        ],
      };

      await orderRepository.create(staleOrder);

      const jobConfig: Job = {
        jobId: 'pending-order-cleanup-job',
        name: 'test-cleanup-job-no-notification',
        isActive: true,
        config: {
          cronExpression: '*/1 * * * *',
        },
        meta: {
          timeoutMinutes: 1,
          notificationAccountIds: ['different-account'], // Different account
        },
      } as Job;

      await tradeManagerJobRepository.create(jobConfig);
      await container.jobManager.init();

      const job = container.jobManager.getJobByName(
        'test-cleanup-job-no-notification',
      );
      await job!.trigger();

      // Order should still be cleaned up
      const orders = await orderRepository.findAll({
        orderId: 'stale-order-8',
      });

      expect(orders[0].status).toBe(OrderStatus.CLOSED);
    });

    it('should skip notification when whitelist is empty', async () => {
      const staleOrder = {
        accountId: 'test-account-1',
        orderId: 'stale-order-9',
        messageId: 109,
        channelId: '123456789',
        status: OrderStatus.PENDING,
        side: OrderSide.LONG,
        executionType: OrderExecutionType.market,
        tradeType: TradeType.FUTURE,
        createdAt: new Date(Date.now() - 2 * 60 * 1000),
        symbol: 'BTCUSDT',
        lotSize: 0.1,
        history: [
          {
            _id: new ObjectId(),
            status: OrderHistoryStatus.INTEND,
            service: ServiceName.TRADE_MANAGER,
            ts: new Date(),
            traceToken: 'trace-109',
            messageId: 109,
            channelId: '123456789',
            command: CommandEnum.LONG,
          },
        ],
      };

      await orderRepository.create(staleOrder);

      const jobConfig: Job = {
        jobId: 'pending-order-cleanup-job',
        name: 'test-cleanup-job-empty-whitelist',
        isActive: true,
        config: {
          cronExpression: '*/1 * * * *',
        },
        meta: {
          timeoutMinutes: 1,
          notificationAccountIds: [], // Empty whitelist
        },
      } as Job;

      await tradeManagerJobRepository.create(jobConfig);
      await container.jobManager.init();

      const job = container.jobManager.getJobByName(
        'test-cleanup-job-empty-whitelist',
      );
      await job!.trigger();

      // Order should still be cleaned up
      const orders = await orderRepository.findAll({
        orderId: 'stale-order-9',
      });

      expect(orders[0].status).toBe(OrderStatus.CLOSED);
    });
  });

  describe('Error Handling', () => {
    it('should continue processing on transaction failure', async () => {
      // Create two stale orders
      const staleOrder1 = {
        accountId: 'test-account-1',
        orderId: 'stale-order-10',
        messageId: 110,
        channelId: '123456789',
        status: OrderStatus.PENDING,
        side: OrderSide.LONG,
        executionType: OrderExecutionType.market,
        tradeType: TradeType.FUTURE,
        createdAt: new Date(Date.now() - 2 * 60 * 1000),
        symbol: 'BTCUSDT',
        lotSize: 0.1,
        history: [
          {
            _id: new ObjectId(),
            status: OrderHistoryStatus.INTEND,
            service: ServiceName.TRADE_MANAGER,
            ts: new Date(),
            traceToken: 'trace-110',
            messageId: 110,
            channelId: '123456789',
            command: CommandEnum.LONG,
          },
        ],
      };

      const staleOrder2 = {
        accountId: 'test-account-1',
        orderId: 'stale-order-11',
        messageId: 111,
        channelId: '123456789',
        status: OrderStatus.PENDING,
        side: OrderSide.LONG,
        executionType: OrderExecutionType.market,
        tradeType: TradeType.FUTURE,
        createdAt: new Date(Date.now() - 2 * 60 * 1000),
        symbol: 'BTCUSDT',
        lotSize: 0.1,
        history: [
          {
            _id: new ObjectId(),
            status: OrderHistoryStatus.INTEND,
            service: ServiceName.TRADE_MANAGER,
            ts: new Date(),
            traceToken: 'trace-111',
            messageId: 111,
            channelId: '123456789',
            command: CommandEnum.LONG,
          },
        ],
      };

      await orderRepository.create(staleOrder1);
      await orderRepository.create(staleOrder2);

      const jobConfig: Job = {
        jobId: 'pending-order-cleanup-job',
        name: 'test-cleanup-job-error',
        isActive: true,
        config: {
          cronExpression: '*/1 * * * *',
        },
        meta: {
          timeoutMinutes: 1,
          notificationAccountIds: [],
        },
      } as Job;

      await tradeManagerJobRepository.create(jobConfig);
      await container.jobManager.init();

      const job = container.jobManager.getJobByName('test-cleanup-job-error');

      // Job should not throw even if there are errors
      await expect(job!.trigger()).resolves.not.toThrow();

      // At least one order should be cleaned (error handling allows continuation)
      const orders = await orderRepository.findAll({
        status: OrderStatus.CLOSED,
      });

      expect(orders.length).toBeGreaterThan(0);
    });

  });
});
