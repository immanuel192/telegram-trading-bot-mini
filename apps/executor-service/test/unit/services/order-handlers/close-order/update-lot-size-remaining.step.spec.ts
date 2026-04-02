import { UpdateLotSizeRemainingStep } from '../../../../../src/services/order-handlers/close-order/update-lot-size-remaining.step';
import {
  ExecutionContext,
  BaseCloseExecutionState,
} from '../../../../../src/services/order-handlers/execution-context';

describe('UpdateLotSizeRemainingStep', () => {
  let step: UpdateLotSizeRemainingStep;
  let context: ExecutionContext<BaseCloseExecutionState>;
  let next: jest.Mock;

  beforeEach(() => {
    step = new UpdateLotSizeRemainingStep();
    next = jest.fn();

    const container = {
      orderRepository: {
        updateOne: jest.fn().mockResolvedValue(true),
      },
    };

    context = {
      payload: {
        orderId: 'order-1',
      },
      container,
      logger: {
        info: jest.fn(),
      },
      session: { id: 'mock-session' },
      state: {
        closeResult: { closedLots: 0.05 },
        error: undefined,
        isOrderNotFound: false,
        order: { lotSize: 0.1, lotSizeRemaining: 0.1 },
      },
    } as any;
  });

  it('should decrement lotSizeRemaining on success without redundantly fetching', async () => {
    await step.execute(context, next);

    expect(context.container.orderRepository.updateOne).toHaveBeenCalledWith(
      { orderId: 'order-1' },
      { $inc: { lotSizeRemaining: -0.05 } },
      context.session
    );

    expect(next).toHaveBeenCalled();
  });

  it('should skip update if there was an error', async () => {
    context.state.error = new Error('Broker error');

    await step.execute(context, next);

    expect(context.container.orderRepository.updateOne).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should skip update if order was not found', async () => {
    context.state.isOrderNotFound = true;

    await step.execute(context, next);

    expect(context.container.orderRepository.updateOne).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should skip update if closeResult is missing', async () => {
    context.state.closeResult = undefined;

    await step.execute(context, next);

    expect(context.container.orderRepository.updateOne).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
