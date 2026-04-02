import { CancelOrdersStep } from '../../../../../src/services/order-handlers/cancel-order/cancel-orders.step';
import {
  ExecutionContext,
  CancelOrderExecutionState,
} from '../../../../../src/services/order-handlers/execution-context';
import { IBrokerAdapter } from '../../../../../src/adapters/interfaces';

describe('CancelOrdersStep', () => {
  let step: CancelOrdersStep;
  let mockContext: ExecutionContext<CancelOrderExecutionState>;
  let mockAdapter: jest.Mocked<IBrokerAdapter>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    step = new CancelOrdersStep();
    mockNext = jest.fn().mockResolvedValue(undefined);

    // Mock adapter
    mockAdapter = {
      cancelOrder: jest.fn().mockResolvedValue(undefined),
      emitMetric: jest.fn(),
    } as any;

    // Mock context
    mockContext = {
      payload: {
        orderId: 'order-123',
        symbol: 'EURUSD',
        traceToken: 'trace-1',
      },
      adapter: mockAdapter,
      state: {
        isAborted: false,
        orderIdsToCancel: ['entry-1', 'sl-1', 'tp1-1'],
      },
      logger: {
        info: jest.fn(),
        error: jest.fn(),
      },
    } as any;
  });

  it('should have the correct name', () => {
    expect(step.name).toBe('CancelOrders');
  });

  it('should successfully cancel all orders and emit success metric', async () => {
    // Act
    await step.execute(mockContext, mockNext);

    // Assert
    expect(mockAdapter.cancelOrder).toHaveBeenCalledTimes(3);
    expect(mockAdapter.cancelOrder).toHaveBeenCalledWith({
      orderId: 'entry-1',
      symbol: 'EURUSD',
      traceToken: 'trace-1',
    });
    expect(mockAdapter.cancelOrder).toHaveBeenCalledWith({
      orderId: 'sl-1',
      symbol: 'EURUSD',
      traceToken: 'trace-1',
    });
    expect(mockAdapter.cancelOrder).toHaveBeenCalledWith({
      orderId: 'tp1-1',
      symbol: 'EURUSD',
      traceToken: 'trace-1',
    });

    expect(mockContext.state.canceledOrderIds).toEqual([
      'entry-1',
      'sl-1',
      'tp1-1',
    ]);

    expect(mockContext.logger.info).toHaveBeenCalledWith(
      {
        orderId: 'order-123',
        symbol: 'EURUSD',
        totalOrders: 3,
        successCount: 3,
        failureCount: 0,
        canceledIds: ['entry-1', 'sl-1', 'tp1-1'],
      },
      'Completed cancel orders operation'
    );

    expect(mockAdapter.emitMetric).toHaveBeenCalledWith(
      'cancelOrder',
      expect.any(Number),
      'EURUSD',
      'success'
    );

    expect(mockNext).toHaveBeenCalled();
  });

  it('should handle partial failures gracefully', async () => {
    // Arrange - Make sl-1 fail
    mockAdapter.cancelOrder.mockImplementation((params) => {
      if (params.orderId === 'sl-1') {
        return Promise.reject(new Error('Order not found on exchange'));
      }
      return Promise.resolve();
    });

    // Act
    await step.execute(mockContext, mockNext);

    // Assert
    expect(mockAdapter.cancelOrder).toHaveBeenCalledTimes(3);
    expect(mockContext.state.canceledOrderIds).toEqual(['entry-1', 'tp1-1']);

    expect(mockContext.logger.error).toHaveBeenCalledWith(
      {
        orderId: 'order-123',
        cancelOrderId: 'sl-1',
        symbol: 'EURUSD',
        traceToken: 'trace-1',
        error: expect.any(Error),
      },
      'Failed to cancel order sl-1'
    );

    expect(mockContext.logger.info).toHaveBeenCalledWith(
      {
        orderId: 'order-123',
        symbol: 'EURUSD',
        totalOrders: 3,
        successCount: 2,
        failureCount: 1,
        canceledIds: ['entry-1', 'tp1-1'],
      },
      'Completed cancel orders operation'
    );

    expect(mockAdapter.emitMetric).toHaveBeenCalledWith(
      'cancelOrder',
      expect.any(Number),
      'EURUSD',
      'success'
    );

    expect(mockNext).toHaveBeenCalled();
  });

  it('should skip cancellation if orderIdsToCancel is empty', async () => {
    // Arrange
    mockContext.state.orderIdsToCancel = [];

    // Act
    await step.execute(mockContext, mockNext);

    // Assert
    expect(mockAdapter.cancelOrder).not.toHaveBeenCalled();
    expect(mockContext.state.canceledOrderIds).toEqual([]);
    expect(mockContext.logger.info).toHaveBeenCalledWith(
      { orderId: 'order-123', symbol: 'EURUSD' },
      'No orders to cancel - skipping cancel step'
    );
    expect(mockAdapter.emitMetric).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalled();
  });

  it('should skip cancellation if orderIdsToCancel is undefined', async () => {
    // Arrange
    mockContext.state.orderIdsToCancel = undefined;

    // Act
    await step.execute(mockContext, mockNext);

    // Assert
    expect(mockAdapter.cancelOrder).not.toHaveBeenCalled();
    expect(mockContext.state.canceledOrderIds).toEqual([]);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should handle all orders failing', async () => {
    // Arrange
    mockAdapter.cancelOrder.mockRejectedValue(
      new Error('Broker connection failed')
    );

    // Act
    await step.execute(mockContext, mockNext);

    // Assert
    expect(mockAdapter.cancelOrder).toHaveBeenCalledTimes(3);
    expect(mockContext.state.canceledOrderIds).toEqual([]);

    expect(mockContext.logger.error).toHaveBeenCalledTimes(3);
    expect(mockContext.logger.info).toHaveBeenCalledWith(
      {
        orderId: 'order-123',
        symbol: 'EURUSD',
        totalOrders: 3,
        successCount: 0,
        failureCount: 3,
        canceledIds: [],
      },
      'Completed cancel orders operation'
    );

    expect(mockAdapter.emitMetric).toHaveBeenCalledWith(
      'cancelOrder',
      expect.any(Number),
      'EURUSD',
      'success'
    );

    expect(mockNext).toHaveBeenCalled();
  });

  it('should throw error if adapter is not found in context', async () => {
    // Arrange
    mockContext.adapter = undefined;

    // Act & Assert
    await expect(step.execute(mockContext, mockNext)).rejects.toThrow(
      'Adapter not found in context'
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should cancel orders in parallel', async () => {
    // Arrange
    const cancelPromises: Array<() => void> = [];
    mockAdapter.cancelOrder.mockImplementation(() => {
      return new Promise((resolve) => {
        cancelPromises.push(() => resolve(undefined));
      });
    });

    // Act
    const executePromise = step.execute(mockContext, mockNext);

    // Wait a bit to ensure all promises are created
    await new Promise((resolve) => setTimeout(resolve, 10));

    // All 3 cancel operations should be in flight
    expect(cancelPromises).toHaveLength(3);

    // Resolve them all
    cancelPromises.forEach((resolve) => resolve());

    await executePromise;

    // Assert
    expect(mockAdapter.cancelOrder).toHaveBeenCalledTimes(3);
    expect(mockNext).toHaveBeenCalled();
  });
});
