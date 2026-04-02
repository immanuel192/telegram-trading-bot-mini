import { SetExecutionResultStep } from '../../../../../src/services/order-handlers/common/set-execution-result.step';
import { ExecuteOrderResultType } from '@telegram-trading-bot-mini/shared/utils';

describe('SetExecutionResultStep', () => {
  let context: any;
  let next: jest.Mock;

  beforeEach(() => {
    next = jest.fn();
    context = {
      payload: {
        orderId: 'order-1',
        accountId: 'acc-1',
        traceToken: 'trace-1',
        messageId: 123,
        channelId: 'chan-1',
        symbol: 'BTC/USDT',
      },
      state: {
        side: 'LONG',
        normalisedTakeProfits: [{ price: 50000 }, { price: 51000 }],
        order: {
          lotSize: 0.1,
          lotSizeRemaining: 0.1,
        },
      },
      result: undefined,
    } as any;
  });

  it('should set success result with update details', async () => {
    const step = new SetExecutionResultStep();
    await step.execute(context, next);

    expect(context.result).toBeDefined();
    expect(context.result).toEqual(
      expect.objectContaining({
        orderId: 'order-1',
        success: true,
        symbol: 'BTC/USDT',
        type: ExecuteOrderResultType.OrderUpdatedTpSl,
        side: 'LONG',
        lotSize: 0.1,
        lotSizeRemaining: 0.1,
        takeProfits: [{ price: 50000 }, { price: 51000 }],
      }),
    );
    expect(next).toHaveBeenCalled();
  });

  it('should not overwrite existing result', async () => {
    const existingResult = { success: false, orderId: 'old' } as any;
    context.result = existingResult;

    const step = new SetExecutionResultStep();
    await step.execute(context, next);

    expect(context.result).toBe(existingResult);
    expect(next).toHaveBeenCalled();
  });
});
