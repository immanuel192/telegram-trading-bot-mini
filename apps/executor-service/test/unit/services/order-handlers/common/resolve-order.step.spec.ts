import { ResolveOrderStep } from '../../../../../src/services/order-handlers/common/resolve-order.step';
import { ExecutionContext } from '../../../../../src/services/order-handlers/execution-context';

describe('ResolveOrderStep', () => {
  let context: ExecutionContext<any>;
  let next: jest.Mock;

  beforeEach(() => {
    next = jest.fn();
    context = {
      payload: { orderId: 'test-order-id' },
      container: {
        orderRepository: {
          findOne: jest.fn(),
        },
      },
      state: {},
    } as any;
  });

  it('should resolve order and call next', async () => {
    const mockOrder = { orderId: 'test-order-id', symbol: 'BTCUSD' };
    (context.container.orderRepository.findOne as jest.Mock).mockResolvedValue(
      mockOrder
    );

    await ResolveOrderStep.execute(context, next);

    expect(context.container.orderRepository.findOne).toHaveBeenCalledWith({
      orderId: 'test-order-id',
    });
    expect(context.state.order).toBe(mockOrder);
    expect(next).toHaveBeenCalled();
  });

  it('should throw error if orderId is missing in payload', async () => {
    context.payload.orderId = undefined;

    await expect(ResolveOrderStep.execute(context, next)).rejects.toThrow(
      'orderId must be provided in the payload for ResolveOrderStep'
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should throw error if order not found in database', async () => {
    (context.container.orderRepository.findOne as jest.Mock).mockResolvedValue(
      null
    );

    await expect(ResolveOrderStep.execute(context, next)).rejects.toThrow(
      'Order test-order-id not found'
    );
    expect(next).not.toHaveBeenCalled();
  });
});
