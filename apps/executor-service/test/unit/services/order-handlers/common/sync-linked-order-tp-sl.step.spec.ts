import { SyncLinkedOrderTpSlStep } from '../../../../../src/services/order-handlers/common/sync-linked-order-tp-sl.step';
import {
  ExecutionContext,
  OpenTradeExecutionState,
} from '../../../../../src/services/order-handlers/execution-context';
import {
  CommandEnum,
  ServiceName,
} from '@telegram-trading-bot-mini/shared/utils';
import { OrderHistoryStatus } from '@dal';

describe('SyncLinkedOrderTpSlStep', () => {
  let step: SyncLinkedOrderTpSlStep;
  let context: ExecutionContext<OpenTradeExecutionState>;
  let next: jest.Mock;
  let container: any;
  let mockSession: any;

  beforeEach(() => {
    step = new SyncLinkedOrderTpSlStep();
    next = jest.fn();
    mockSession = { id: 'session-1' };

    container = {
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        child: jest.fn().mockReturnThis(),
      },
      orderRepository: {
        findOne: jest.fn(),
        updateOne: jest.fn(),
      },
      jobService: {
        triggerJob: jest.fn(),
      },
    };

    const payload = {
      orderId: 'order-123',
      command: CommandEnum.LONG,
      traceToken: 'trace-1',
      accountId: 'acc-1',
      messageId: 1,
      channelId: 'chan-1',
      symbol: 'EURUSD',
      timestamp: Date.now(),
    };

    context = new ExecutionContext({ payload, container });
    context.session = mockSession;
    context.account = {
      accountId: 'acc-1',
      configs: {
        linkedOrderOptimiseTp: true,
      },
    } as any;
    context.state.shouldSyncTpSl = true;
    context.state.takeProfits = [
      { price: 1.12 }, // TP1
      { price: 1.15 }, // TP2
    ];
    context.state.normalisedTakeProfits = context.state.takeProfits;
  });

  it('should sync TP/SL for linked orders on OpenOrder and log optimization', async () => {
    const mockOrder = {
      orderId: 'order-123',
      accountId: 'acc-1',
      linkedOrders: ['order-123', 'order-456'],
      sl: { slPrice: 1.09 },
      tp: { tp1Price: 1.12 },
    };

    container.orderRepository.findOne.mockResolvedValue(mockOrder);
    container.orderRepository.updateOne.mockResolvedValue(true);

    await step.execute(context, next);

    // Verify fineOne was called with session
    expect(container.orderRepository.findOne).toHaveBeenCalledWith(
      { orderId: 'order-123' },
      mockSession,
    );

    // Verify jobs were triggered for siblings
    expect(container.jobService.triggerJob).toHaveBeenCalledWith({
      delay: 200,
      jobName: ServiceName.AUTO_SYNC_TP_SL_LINKED_ORDER_JOB,
      params: {
        accountId: 'acc-1',
        orderId: 'order-456',
        sl: { price: 1.09 },
        tp: {
          price: 1.15, // Optimized TP (TP2)
          tiers: [{ price: 1.12 }, { price: 1.15 }],
        },
        sourceOrderId: 'order-123',
      },
      traceToken: 'trace-1',
    });

    // Verify history update for optimization
    expect(container.orderRepository.updateOne).toHaveBeenCalledWith(
      { orderId: 'order-123' },
      expect.objectContaining({
        $push: {
          history: expect.objectContaining({
            status: OrderHistoryStatus.INFO,
            service: ServiceName.EXECUTOR_SERVICE,
            ts: expect.any(Date),
            traceToken: 'trace-1',
            command: CommandEnum.LONG,
            info: expect.objectContaining({
              message: 'TP optimization applied for linked orders',
              currentOrderTP: 1.12,
              linkedOrderTP: 1.15,
            }),
          }),
        },
      }),
      mockSession,
    );

    expect(next).toHaveBeenCalled();
  });

  it('should use same TP if optimization is disabled', async () => {
    context.account.configs.linkedOrderOptimiseTp = false;
    const mockOrder = {
      orderId: 'order-123',
      accountId: 'acc-1',
      linkedOrders: ['order-123', 'order-456'],
      sl: { slPrice: 1.09 },
    };

    container.orderRepository.findOne.mockResolvedValue(mockOrder);

    await step.execute(context, next);

    expect(container.jobService.triggerJob).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          tp: expect.objectContaining({
            price: 1.12, // Same TP as current order (index 0)
          }),
        }),
      }),
    );
  });

  it('should skip if no linked orders', async () => {
    container.orderRepository.findOne.mockResolvedValue({
      orderId: 'order-123',
      linkedOrders: [],
    });

    await step.execute(context, next);

    expect(container.jobService.triggerJob).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should skip if shouldSyncTpSl is false', async () => {
    context.state.shouldSyncTpSl = false;

    await step.execute(context, next);

    expect(container.orderRepository.findOne).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should skip if meta.executionInstructions.skipLinkedOrderSync is true', async () => {
    (context.payload as any).meta = {
      executionInstructions: { skipLinkedOrderSync: true },
    };

    await step.execute(context, next);

    expect(container.orderRepository.findOne).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should handle regular update commands (MOVE_SL) by syncing current state', async () => {
    (context.payload as any).command = CommandEnum.MOVE_SL;
    (context.payload as any).stopLoss = { price: 1.08 };
    (context.payload as any).takeProfits = [{ price: 1.13 }];
    context.state.stopLoss = { price: 1.08 };
    context.state.takeProfits = [{ price: 1.13 }];

    const mockOrder = {
      orderId: 'order-123',
      accountId: 'acc-1',
      linkedOrders: ['order-123', 'order-456'],
    };

    container.orderRepository.findOne.mockResolvedValue(mockOrder);

    await step.execute(context, next);

    expect(container.jobService.triggerJob).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          sl: { price: 1.08 },
          tp: expect.objectContaining({
            price: 1.13,
          }),
        }),
      }),
    );

    // Should NOT log optimization info for non-open commands
    expect(container.orderRepository.updateOne).not.toHaveBeenCalled();
  });
});
