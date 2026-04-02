import { UpdateOrderHistoryAfterCloseStep } from '../../../../../src/services/order-handlers/close-order/update-order-history-after-close-step.step';
import {
  ExecutionContext,
  CloseAllExecutionState,
} from '../../../../../src/services/order-handlers/execution-context';
import * as closeOrderHelper from '../../../../../src/services/order-handlers/close-order/close-order.helper';

describe('UpdateOrderHistoryAfterCloseStep', () => {
  let step: UpdateOrderHistoryAfterCloseStep;
  let context: ExecutionContext<CloseAllExecutionState>;
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    step = new UpdateOrderHistoryAfterCloseStep();
    next = jest.fn();
    context = {
      payload: {
        orderId: 'test-order-id',
        accountId: 'acc-1',
        traceToken: 'trace-1',
        messageId: 'msg-1',
        channelId: 'chan-1',
      },
      state: {
        closeResult: {
          exchangeOrderId: 'ex-1',
          closedAt: 12345,
          closedPrice: 100,
          closedLots: 1,
        },
        pnlValue: 10,
        isOrderNotFound: false,
      },
    } as any;
  });

  it('should call finalizeOrderClosure and set ctx.result on success', async () => {
    jest
      .spyOn(closeOrderHelper, 'finalizeOrderClosure')
      .mockResolvedValue(undefined);

    await step.execute(context, next);

    expect(closeOrderHelper.finalizeOrderClosure).toHaveBeenCalledWith(
      context,
      {
        orderId: 'test-order-id',
        closePayload: context.payload,
        result: context.state.closeResult,
        error: undefined,
        isNotFound: false,
        pnlValue: 10,
      }
    );

    expect(context.result).toMatchObject({
      orderId: 'test-order-id',
      accountId: 'acc-1',
      traceToken: 'trace-1',
      success: true,
      type: 3, // OrderUpdatedTpSl (since isFullClose is not set)
    });
    expect(next).toHaveBeenCalled();
  });

  it('should call finalizeOrderClosure when there is an error in state', async () => {
    const error = new Error('Some error');
    context.state.closeResult = undefined;
    context.state.error = error;
    jest
      .spyOn(closeOrderHelper, 'finalizeOrderClosure')
      .mockResolvedValue(undefined);

    await step.execute(context, next);

    expect(closeOrderHelper.finalizeOrderClosure).toHaveBeenCalledWith(
      context,
      {
        orderId: 'test-order-id',
        closePayload: context.payload,
        result: undefined,
        error: error,
        isNotFound: false,
        pnlValue: 10,
      }
    );
    expect(context.result).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('should skip if no closeResult and no error in state', async () => {
    context.state.closeResult = undefined;
    context.state.error = undefined;
    jest.spyOn(closeOrderHelper, 'finalizeOrderClosure');

    await step.execute(context, next);

    expect(closeOrderHelper.finalizeOrderClosure).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
