import { ApplyExecutionInstructionsStep } from '../../../../../src/services/order-handlers/common/apply-execution-instructions.step';
import { ExecutionContext } from '../../../../../src/services/order-handlers/execution-context';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';

describe('ApplyExecutionInstructionsStep', () => {
  let step: ApplyExecutionInstructionsStep;
  let context: ExecutionContext<any>;
  let next: jest.Mock;

  beforeEach(() => {
    step = new ApplyExecutionInstructionsStep();
    next = jest.fn();

    const payload = {
      orderId: 'order-1',
      symbol: 'BTCUSD',
      command: CommandEnum.LONG,
      traceToken: 'trace-1',
      accountId: 'acc-1',
      messageId: 1,
      channelId: 'chan-1',
      timestamp: Date.now(),
    };

    const container = {
      logger: {
        info: jest.fn(),
        child: jest.fn().mockReturnThis(),
      },
    } as any;

    context = new ExecutionContext({ payload, container });
  });

  it('should sync takeProfitTiers from instructions to state', async () => {
    const tiers = [{ price: 50000 }, { price: 51000 }];
    context.payload.meta = {
      executionInstructions: {
        takeProfitTiers: tiers,
      },
    };

    await step.execute(context, next);

    expect(context.state.normalisedTakeProfits).toEqual(tiers);
    expect(next).toHaveBeenCalled();
  });

  it('should skip if no instructions provided', async () => {
    context.state.normalisedTakeProfits = [{ price: 49000 }];

    await step.execute(context, next);

    expect(context.state.normalisedTakeProfits).toEqual([{ price: 49000 }]);
    expect(next).toHaveBeenCalled();
  });

  it('should skip if empty takeProfitTiers provided', async () => {
    context.state.normalisedTakeProfits = [{ price: 49000 }];
    context.payload.meta = {
      executionInstructions: {
        takeProfitTiers: [],
      },
    };

    await step.execute(context, next);

    expect(context.state.normalisedTakeProfits).toEqual([{ price: 49000 }]);
    expect(next).toHaveBeenCalled();
  });
});
