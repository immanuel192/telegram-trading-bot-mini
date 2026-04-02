import { ValidateClosePartialStep } from '../../../../../src/services/order-handlers/close-order/validate-close-partial.step';
import {
  ExecutionContext,
  BaseCloseExecutionState,
} from '../../../../../src/services/order-handlers/execution-context';
import { OrderHistoryStatus } from '@dal';

describe('ValidateClosePartialStep', () => {
  let step: ValidateClosePartialStep;
  let context: ExecutionContext<BaseCloseExecutionState>;
  let next: jest.Mock;

  beforeEach(() => {
    step = new ValidateClosePartialStep();
    next = jest.fn();

    const container = {
      orderRepository: {
        updateOne: jest.fn().mockResolvedValue(true),
      },
    };

    context = {
      payload: {
        orderId: 'order-1',
        lotSize: 0.05,
      },
      container,
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
      },
      state: {
        order: {
          orderId: 'order-1',
          lotSize: 0.1,
          lotSizeRemaining: 0.1,
        },
      },
      addOrderHistory: jest.fn().mockResolvedValue(true),
    } as any;
  });

  it('should pass if lotSize <= lotSizeRemaining', async () => {
    await step.execute(context, next);

    expect(context.payload.lotSize).toBe(0.05);
    expect(next).toHaveBeenCalled();
  });

  it('should use order.lotSize if lotSizeRemaining is missing', async () => {
    context.state.order.lotSizeRemaining = undefined;

    await step.execute(context, next);

    expect(context.payload.lotSize).toBe(0.05);
    expect(next).toHaveBeenCalled();
  });

  it('should cap lotSize and log history if it exceeds remaining', async () => {
    context.payload.lotSize = 0.15; // exceeds 0.1

    await step.execute(context, next);

    expect(context.payload.lotSize).toBe(0.1);
    expect(context.addOrderHistory).toHaveBeenCalledWith(
      OrderHistoryStatus.INFO,
      expect.objectContaining({
        reason: 'Partial close amount capped to lotSizeRemaining',
        originalRequested: 0.15,
        cappedTo: 0.1,
      })
    );
    expect(next).toHaveBeenCalled();
  });

  it('should skip if lotSizeRemaining is 0', async () => {
    context.state.order.lotSizeRemaining = 0;

    await step.execute(context, next);

    expect(next).not.toHaveBeenCalled();
    expect(context.logger.warn).toHaveBeenCalledWith(
      expect.anything(),
      'Order already fully closed'
    );
  });

  it('should throw error if order is not resolved', async () => {
    context.state.order = undefined;

    await expect(step.execute(context, next)).rejects.toThrow(
      'Order must be resolved before ValidateClosePartialStep'
    );
    expect(next).not.toHaveBeenCalled();
  });
});
