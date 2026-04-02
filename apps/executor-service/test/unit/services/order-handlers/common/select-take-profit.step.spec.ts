import { SelectTakeProfitStep } from '../../../../../src/services/order-handlers/common/select-take-profit.step';
import {
  ExecutionContext,
  BaseExecutionState,
} from '../../../../../src/services/order-handlers/execution-context';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';

describe('SelectTakeProfitStep', () => {
  let step: SelectTakeProfitStep;
  let context: ExecutionContext<BaseExecutionState>;
  let next: jest.Mock;

  beforeEach(() => {
    step = new SelectTakeProfitStep();
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
    };

    const container = {
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        child: jest.fn().mockReturnThis(),
      },
      orderRepository: {
        updateOne: jest.fn().mockResolvedValue(true),
      },
    } as any;

    context = new ExecutionContext({ payload, container });
    context.account = {
      accountId: 'acc-1',
      configs: {
        takeProfitIndex: 0,
      },
    } as any;
  });

  it('should select take profit based on account configuration', async () => {
    context.state.normalisedTakeProfits = [
      { price: 1.11 },
      { price: 1.12 },
      { price: 1.13 },
    ];

    await step.execute(context, next);

    // With takeProfitIndex=0, should select 1.13
    expect(context.state.takeProfits).toHaveLength(2);
    expect(context.state.takeProfits![0].price).toBe(1.13);
    // Second element should be averaged TP
    expect(context.state.takeProfits![1].price).toBeCloseTo(1.125, 2); // (1.13 + 1.12) / 2
    expect(next).toHaveBeenCalled();
  });

  it('should handle forceNoTakeProfit configuration', async () => {
    context.account.configs!.forceNoTakeProfit = true;
    context.state.normalisedTakeProfits = [{ price: 1.12 }];

    await step.execute(context, next);

    expect(context.state.takeProfits).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('should handle undefined normalised take profits', async () => {
    context.state.normalisedTakeProfits = undefined;

    await step.execute(context, next);

    expect(context.state.takeProfits).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('should handle empty normalised take profits array', async () => {
    context.state.normalisedTakeProfits = [];

    await step.execute(context, next);

    expect(context.state.takeProfits).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('should select correct TP for SHORT orders', async () => {
    // Note: Normalised array is already sorted by profitability
    context.state.normalisedTakeProfits = [
      { price: 1.1 },
      { price: 1.09 },
      { price: 1.08 },
    ];

    await step.execute(context, next);

    // With takeProfitIndex=0, should select 1.08
    expect(context.state.takeProfits).toHaveLength(2);
    expect(context.state.takeProfits![0].price).toBe(1.08);
    // Second element should be averaged TP: (1.08 + 1.09) / 2 = 1.085, rounded to 1.09
    expect(context.state.takeProfits![1].price).toBe(1.09);
    expect(next).toHaveBeenCalled();
  });

  it('should handle takeProfitIndex out of range', async () => {
    context.account.configs!.takeProfitIndex = 5;
    context.state.normalisedTakeProfits = [{ price: 1.11 }, { price: 1.12 }];

    await step.execute(context, next);

    // Should use last available TP
    expect(context.state.takeProfits).toHaveLength(1);
    expect(context.state.takeProfits![0].price).toBe(1.11);
    expect(next).toHaveBeenCalled();
  });

  it('should handle single TP without averaging', async () => {
    context.state.normalisedTakeProfits = [{ price: 1.12 }];

    await step.execute(context, next);

    // Only one TP, no averaging
    expect(context.state.takeProfits).toHaveLength(1);
    expect(context.state.takeProfits![0].price).toBe(1.12);
    expect(next).toHaveBeenCalled();
  });

  it('should use default takeProfitIndex when not configured', async () => {
    context.account.configs = {};
    context.state.normalisedTakeProfits = [
      { price: 1.11 },
      { price: 1.12 },
      { price: 1.13 },
    ];

    await step.execute(context, next);

    // Default takeProfitIndex is 0
    expect(context.state.takeProfits).toHaveLength(2);
    expect(context.state.takeProfits![0].price).toBe(1.13);
    expect(next).toHaveBeenCalled();
  });
});
