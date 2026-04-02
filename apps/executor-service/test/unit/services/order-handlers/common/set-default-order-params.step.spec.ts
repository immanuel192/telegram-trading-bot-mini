import { SetDefaultOrderParamsStep } from '../../../../../src/services/order-handlers/common/set-default-order-params.step';
import {
  ExecutionContext,
  BaseExecutionState,
} from '../../../../../src/services/order-handlers/execution-context';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';

describe('SetDefaultOrderParamsStep', () => {
  let context: ExecutionContext<BaseExecutionState>;
  let next: jest.Mock;

  beforeEach(() => {
    next = jest.fn();

    const payload = {
      orderId: 'order-1',
      symbol: 'EURUSD',
      command: CommandEnum.LONG,
      traceToken: 'trace-1',
      accountId: 'acc-1',
      messageId: 123,
      channelId: 'chan-1',
      timestamp: Date.now(),
      entry: 1.1,
      stopLoss: { price: 1.095 },
      takeProfits: [{ price: 1.11 }, { price: 1.12 }],
    };

    const container = {
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        child: jest.fn().mockReturnThis(),
      },
      orderRepository: {
        updateOne: jest.fn().mockResolvedValue(true),
      },
    } as any;

    context = new ExecutionContext({ payload, container });
  });

  it('should initialize state with payload values', async () => {
    await SetDefaultOrderParamsStep.execute(context, next);

    expect(context.state.entryPrice).toBe(1.1);
    expect(context.state.stopLoss).toEqual({ price: 1.095 });
    expect(context.state.takeProfits).toEqual([
      { price: 1.11 },
      { price: 1.12 },
    ]);
    expect(next).toHaveBeenCalled();
  });

  it('should handle undefined values', async () => {
    context.payload.entry = undefined;
    context.payload.stopLoss = undefined;
    context.payload.takeProfits = undefined;

    await SetDefaultOrderParamsStep.execute(context, next);

    expect(context.state.entryPrice).toBeUndefined();
    expect(context.state.stopLoss).toBeUndefined();
    expect(context.state.takeProfits).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('should handle pips-based SL and TP', async () => {
    context.payload.stopLoss = { pips: 50 };
    context.payload.takeProfits = [{ pips: 100 }, { pips: 200 }];

    await SetDefaultOrderParamsStep.execute(context, next);

    expect(context.state.stopLoss).toEqual({ pips: 50 });
    expect(context.state.takeProfits).toEqual([{ pips: 100 }, { pips: 200 }]);
    expect(next).toHaveBeenCalled();
  });
});
