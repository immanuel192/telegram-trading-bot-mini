import { CalculatePnlAfterCloseOrderStep } from '../../../../../src/services/order-handlers/close-order/calculate-pnl.step';
import {
  ExecutionContext,
  CloseAllExecutionState,
} from '../../../../../src/services/order-handlers/execution-context';
import * as closeOrderHelper from '../../../../../src/services/order-handlers/close-order/close-order.helper';

describe('CalculatePnlAfterCloseOrderStep', () => {
  let step: CalculatePnlAfterCloseOrderStep;
  let context: ExecutionContext<CloseAllExecutionState>;
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    step = new CalculatePnlAfterCloseOrderStep();
    next = jest.fn();
    context = {
      state: {
        order: { orderId: 'test-1' },
        closeResult: { closedPrice: 100, closedLots: 1 },
        isOrderNotFound: false,
      },
    } as any;
  });

  it('should calculate PNL and store in state', async () => {
    jest.spyOn(closeOrderHelper, 'calculateOrderPnl').mockReturnValue(50);

    await step.execute(context, next);

    expect(closeOrderHelper.calculateOrderPnl).toHaveBeenCalledWith(
      context.state.order,
      100,
      1
    );
    expect(context.state.pnlValue).toBe(50);
    expect(next).toHaveBeenCalled();
  });

  it('should skip calculation if order is missing in state', async () => {
    context.state.order = undefined;
    jest.spyOn(closeOrderHelper, 'calculateOrderPnl');

    await step.execute(context, next);

    expect(closeOrderHelper.calculateOrderPnl).not.toHaveBeenCalled();
    expect(context.state.pnlValue).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('should skip calculation if closeResult is missing in state', async () => {
    context.state.closeResult = undefined;
    jest.spyOn(closeOrderHelper, 'calculateOrderPnl');

    await step.execute(context, next);

    expect(closeOrderHelper.calculateOrderPnl).not.toHaveBeenCalled();
    expect(context.state.pnlValue).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('should skip calculation if order was not found on exchange', async () => {
    context.state.isOrderNotFound = true;
    jest.spyOn(closeOrderHelper, 'calculateOrderPnl');

    await step.execute(context, next);

    expect(closeOrderHelper.calculateOrderPnl).not.toHaveBeenCalled();
    expect(context.state.pnlValue).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });
});
