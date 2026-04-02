import { MarketHoursStep } from '../../../../../src/services/order-handlers/common/market-hours.step';
import { OrderHistoryStatus } from '@dal';
import { ServiceName } from '@telegram-trading-bot-mini/shared/utils';
import {
  ExecutionContext,
  BaseExecutionState,
} from '../../../../../src/services/order-handlers/execution-context';
import { OperationTimeCheckerService } from '../../../../../src/services/calculations/operation-time-checker.service';

describe('MarketHoursStep', () => {
  let context: ExecutionContext<BaseExecutionState>;
  let next: jest.Mock;
  let step: MarketHoursStep;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();

    const payload = {
      symbol: 'BTCUSD',
      orderId: 'order-1',
      traceToken: 'trace-1',
      command: 'LONG' as any,
      messageId: 123,
      channelId: 'chan-1',
      accountId: 'acc-1',
      timestamp: Date.now(),
    };

    const container = {
      orderRepository: {
        updateOne: jest.fn().mockResolvedValue(true),
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        child: jest.fn().mockReturnThis(),
      },
    } as any;

    context = new ExecutionContext({ payload, container });
    context.account = {
      accountId: 'acc-1',
      configs: {
        operationHours: {
          schedule: 'Mon-Fri: 00:00 - 23:59',
          timezone: 'UTC',
        },
      },
    } as any;
    context.session = 'mock-session' as any;

    step = new MarketHoursStep(container.logger);

    // Spy on prototype method
    jest.spyOn(OperationTimeCheckerService.prototype, 'isInside');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should call next if market is open', async () => {
    (
      OperationTimeCheckerService.prototype.isInside as jest.Mock
    ).mockReturnValue(true);

    await step.execute(context, next);

    expect(next).toHaveBeenCalled();
    expect(context.container.orderRepository.updateOne).not.toHaveBeenCalled();
    expect(context.result).toBeUndefined();
  });

  it('should call next if no operation hours config is found', async () => {
    context.account.configs = {};
    context.account.symbols = {};

    await step.execute(context, next);

    expect(next).toHaveBeenCalled();
  });

  it('should skip order, update history, and NOT call next if market is closed', async () => {
    (
      OperationTimeCheckerService.prototype.isInside as jest.Mock
    ).mockReturnValue(false);

    await step.execute(context, next);

    expect(next).not.toHaveBeenCalled();
    expect(context.container.orderRepository.updateOne).toHaveBeenCalledWith(
      { orderId: 'order-1' },
      expect.objectContaining({
        $push: {
          history: expect.objectContaining({
            status: OrderHistoryStatus.SKIPPED,
            service: ServiceName.EXECUTOR_SERVICE,
            info: expect.objectContaining({
              reason: 'MARKET_CLOSED',
            }),
          }),
        },
      }),
      'mock-session',
    );
    expect(context.result).toEqual(
      expect.objectContaining({
        success: false,
        errorCode: 'MARKET_CLOSED',
      }),
    );
  });

  it('should prioritize symbol-specific operation hours over account-wide config', async () => {
    context.account.symbols = {
      BTCUSD: {
        operationHours: {
          schedule: 'Sat-Sun: 00:00 - 23:59',
          timezone: 'UTC',
        },
      },
    };
    (
      OperationTimeCheckerService.prototype.isInside as jest.Mock
    ).mockImplementation((config: any) => {
      return config.schedule.includes('Sat-Sun');
    });

    await step.execute(context, next);

    expect(next).toHaveBeenCalled();
    expect(OperationTimeCheckerService.prototype.isInside).toHaveBeenCalledWith(
      context.account.symbols['BTCUSD'].operationHours,
    );
  });
});
