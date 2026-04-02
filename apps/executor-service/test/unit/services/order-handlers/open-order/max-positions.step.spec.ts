import { MaxPositionsStep } from '../../../../../src/services/order-handlers/open-order/max-positions.step';
import { OrderHistoryStatus } from '@dal';
import {
  ServiceName,
  CommandEnum,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  ExecutionContext,
  BaseExecutionState,
} from '../../../../../src/services/order-handlers/execution-context';

describe('MaxPositionsStep', () => {
  let context: ExecutionContext<BaseExecutionState>;
  let next: jest.Mock;

  beforeEach(() => {
    next = jest.fn();

    const payload = {
      symbol: 'BTCUSD',
      orderId: 'order-1',
      traceToken: 'trace-1',
      command: CommandEnum.LONG,
      messageId: 123,
      channelId: 'chan-1',
      accountId: 'acc-1',
      timestamp: Date.now(),
    };

    const container = {
      orderRepository: {
        countOpenOrdersByAccountId: jest.fn(),
        updateOne: jest.fn().mockResolvedValue(true),
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        child: jest.fn().mockReturnThis(),
      },
    } as any;

    context = new ExecutionContext({ payload, container });
    context.account = {
      accountId: 'acc-1',
      configs: {
        maxOpenPositions: 5,
      },
    } as any;
    context.session = 'mock-session' as any;
  });

  it('should call next if under limit', async () => {
    (
      context.container.orderRepository.countOpenOrdersByAccountId as jest.Mock
    ).mockResolvedValue(3);

    await MaxPositionsStep.execute(context, next);

    expect(next).toHaveBeenCalled();
    expect(context.container.orderRepository.updateOne).not.toHaveBeenCalled();
    expect(context.result).toBeUndefined();
  });

  it('should call next if limit is not set', async () => {
    context.account.configs = {};

    await MaxPositionsStep.execute(context, next);

    expect(next).toHaveBeenCalled();
  });

  it('should skip order and NOT call next if limit reached', async () => {
    (
      context.container.orderRepository.countOpenOrdersByAccountId as jest.Mock
    ).mockResolvedValue(5);

    await MaxPositionsStep.execute(context, next);

    expect(next).not.toHaveBeenCalled();
    expect(context.container.orderRepository.updateOne).toHaveBeenCalledWith(
      { orderId: 'order-1' },
      expect.objectContaining({
        $push: {
          history: expect.objectContaining({
            status: OrderHistoryStatus.SKIPPED,
            service: ServiceName.EXECUTOR_SERVICE,
            info: expect.objectContaining({
              reason: 'EXCEED_MAX_OPEN_POSITIONS',
              currentOpenPositions: 5,
              maxOpenPositions: 5,
            }),
          }),
        },
      }),
      'mock-session',
    );
    expect(context.result).toEqual(
      expect.objectContaining({
        success: false,
        errorCode: 'EXCEED_MAX_OPEN_POSITIONS',
      }),
    );
  });
});
