import { ForceFullCloseStep } from '../../../../../src/services/order-handlers/close-order/force-full-close.step';
import {
  ExecutionContext,
  BaseCloseExecutionState,
} from '../../../../../src/services/order-handlers/execution-context';

describe('ForceFullCloseStep', () => {
  let step: ForceFullCloseStep;
  let context: ExecutionContext<BaseCloseExecutionState>;
  let next: jest.Mock;

  beforeEach(() => {
    step = new ForceFullCloseStep();
    next = jest.fn();

    context = {
      payload: {
        orderId: 'order-1',
        lotSize: 0.05,
      },
      logger: {
        info: jest.fn(),
      },
    } as any;
  });

  it('should clear lotSize from payload if present', async () => {
    await step.execute(context, next);

    expect(context.payload.lotSize).toBeUndefined();
    expect(context.logger.info).toHaveBeenCalledWith(
      { originalLotSize: 0.05 },
      'Clearing lotSize from payload to force full close'
    );
    expect(next).toHaveBeenCalled();
  });

  it('should do nothing if lotSize is not in payload', async () => {
    delete context.payload.lotSize;

    await step.execute(context, next);

    expect(context.payload.lotSize).toBeUndefined();
    expect(context.logger.info).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
