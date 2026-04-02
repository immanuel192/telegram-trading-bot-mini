import { NormaliseTakeProfitStep } from '../../../../../src/services/order-handlers/common/normalise-take-profit.step';
import {
  ExecutionContext,
  BaseExecutionState,
  UpdateOrderExecutionState,
} from '../../../../../src/services/order-handlers/execution-context';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';
import { OrderSide } from '@dal';

describe('NormaliseTakeProfitStep', () => {
  let step: NormaliseTakeProfitStep;
  let context: ExecutionContext<BaseExecutionState | UpdateOrderExecutionState>;
  let next: jest.Mock;

  beforeEach(() => {
    step = new NormaliseTakeProfitStep();
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
    } as any;

    context = new ExecutionContext({ payload, container });
  });

  it('should normalise take profits for LONG (sorting natural/ascending)', async () => {
    context.state.takeProfits = [
      { price: 1.12 },
      { price: 1.11 },
      { price: 1.13 },
    ];

    await step.execute(context, next);

    expect(context.state.normalisedTakeProfits).toEqual([
      { price: 1.11 },
      { price: 1.12 },
      { price: 1.13 },
    ]);
    expect(next).toHaveBeenCalled();
  });

  it('should normalise take profits for SHORT (sorting natural/descending)', async () => {
    context.payload.command = CommandEnum.SHORT;
    context.state.takeProfits = [
      { price: 1.09 },
      { price: 1.08 },
      { price: 1.1 },
    ];

    await step.execute(context, next);

    expect(context.state.normalisedTakeProfits).toEqual([
      { price: 1.1 },
      { price: 1.09 },
      { price: 1.08 },
    ]);
    expect(next).toHaveBeenCalled();
  });

  it('should filter out invalid TPs (no price)', async () => {
    context.state.takeProfits = [
      { price: 1.12 },
      { pips: 50 },
      { price: 1.13 },
    ];

    await step.execute(context, next);

    // Natural order (ascending for LONG)
    expect(context.state.normalisedTakeProfits).toEqual([
      { price: 1.12 },
      { price: 1.13 },
    ]);
  });

  it('should respect side from state if provided', async () => {
    (context.state as UpdateOrderExecutionState).side = OrderSide.SHORT;
    context.payload.command = CommandEnum.LONG; // Should be ignored
    context.state.takeProfits = [{ price: 1.1 }, { price: 1.09 }];

    await step.execute(context, next);

    // Should sort natural (descending for SHORT)
    expect(context.state.normalisedTakeProfits).toEqual([
      { price: 1.1 },
      { price: 1.09 },
    ]);
  });

  it('should set empty array if no take profits', async () => {
    context.state.takeProfits = undefined;
    await step.execute(context, next);
    expect(context.state.normalisedTakeProfits).toEqual([]);
  });
});
