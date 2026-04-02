import { BrokerCloseStep } from '../../../../../src/services/order-handlers/close-order/broker-close.step';
import {
  ExecutionContext,
  CloseAllExecutionState,
} from '../../../../../src/services/order-handlers/execution-context';
import * as closeOrderHelper from '../../../../../src/services/order-handlers/close-order/close-order.helper';

describe('BrokerCloseStep', () => {
  let step: BrokerCloseStep;
  let context: ExecutionContext<CloseAllExecutionState>;
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    step = new BrokerCloseStep();
    next = jest.fn();
    context = {
      payload: {
        orderId: 'test-order-id',
        symbol: 'BTCUSD',
        traceToken: 'test-trace',
      },
      adapter: {
        closeOrder: jest.fn(),
      },
      logger: {
        info: jest.fn(),
      },
      state: {},
    } as any;
  });

  it('should call brokerCloseOrder and set result in state', async () => {
    const mockResult = {
      exchangeOrderId: 'ex-123',
      closedPrice: 100,
      closedLots: 1,
      closedAt: Date.now(),
    };
    jest.spyOn(closeOrderHelper, 'brokerCloseOrder').mockResolvedValue({
      result: mockResult,
      isNotFound: false,
    });

    await step.execute(context, next);

    expect(closeOrderHelper.brokerCloseOrder).toHaveBeenCalledWith(
      context.adapter,
      'test-order-id',
      'BTCUSD',
      'test-trace',
      undefined
    );
    expect(context.state.closeResult).toBe(mockResult);
    expect(context.state.isOrderNotFound).toBe(false);
    expect(next).toHaveBeenCalled();
  });

  it('should handle isNotFound result from brokerCloseOrder', async () => {
    const mockResult = {
      exchangeOrderId: 'N/A',
      closedPrice: 0,
      closedLots: 0,
      closedAt: Date.now(),
    };
    jest.spyOn(closeOrderHelper, 'brokerCloseOrder').mockResolvedValue({
      result: mockResult,
      isNotFound: true,
      error: new Error('Not found'),
    });

    await step.execute(context, next);

    expect(context.state.closeResult).toBe(mockResult);
    expect(context.state.error).toBeInstanceOf(Error);
    expect(context.state.isOrderNotFound).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  it('should throw error if brokerCloseOrder fails with non-404 error', async () => {
    const error = new Error('Broker connection error');
    jest.spyOn(closeOrderHelper, 'brokerCloseOrder').mockResolvedValue({
      error,
      isNotFound: false,
    });

    await expect(step.execute(context, next)).rejects.toThrow(
      'Broker connection error'
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should throw error if adapter is not resolved', async () => {
    context.adapter = undefined;

    await expect(step.execute(context, next)).rejects.toThrow(
      'Adapter must be resolved before BrokerCloseStep'
    );
    expect(next).not.toHaveBeenCalled();
  });
});
