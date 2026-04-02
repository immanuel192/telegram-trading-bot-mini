import { FetchOrdersToCancelStep } from '../../../../../src/services/order-handlers/cancel-order/fetch-orders-to-cancel.step';
import {
  ExecutionContext,
  CancelOrderExecutionState,
} from '../../../../../src/services/order-handlers/execution-context';
import { Order } from '@dal';
import { IBrokerAdapter } from '../../../../../src/adapters/interfaces';

describe('FetchOrdersToCancelStep', () => {
  let step: FetchOrdersToCancelStep;
  let mockContext: ExecutionContext<CancelOrderExecutionState>;
  let mockAdapter: jest.Mocked<IBrokerAdapter>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    step = new FetchOrdersToCancelStep();
    mockNext = jest.fn().mockResolvedValue(undefined);

    // Mock adapter
    mockAdapter = {
      fetchOpenOrders: jest.fn(),
    } as any;

    // Mock context
    mockContext = {
      payload: {
        orderId: 'order-123',
        symbol: 'EURUSD',
        accountId: 'acc-1',
        traceToken: 'trace-1',
      },
      adapter: mockAdapter,
      state: {
        isAborted: false,
        order: {
          orderId: 'order-123',
          entry: { entryOrderId: 'entry-1' },
          sl: { slOrderId: 'sl-1' },
          tp: {
            tp1OrderId: 'tp1-1',
            tp2OrderId: 'tp2-1',
            tp3OrderId: undefined,
          },
        } as Order,
      },
      logger: {
        info: jest.fn(),
        error: jest.fn(),
      },
    } as any;
  });

  it('should have the correct name', () => {
    expect(step.name).toBe('FetchOrdersToCancel');
  });

  it('should fetch orders to cancel and filter to only existing orders', async () => {
    // Arrange
    const pendingOrders = [
      { id: 'entry-1', symbol: 'EURUSD' },
      { id: 'tp1-1', symbol: 'EURUSD' },
      // sl-1 and tp2-1 are NOT in pending orders
    ];

    mockAdapter.fetchOpenOrders.mockResolvedValue(pendingOrders as any);

    // Act
    await step.execute(mockContext, mockNext);

    // Assert
    expect(mockAdapter.fetchOpenOrders).toHaveBeenCalledWith('EURUSD');
    expect(mockContext.state.orderIdsToCancel).toEqual(['entry-1', 'tp1-1']);
    expect(mockContext.logger.info).toHaveBeenCalledWith(
      {
        orderId: 'order-123',
        symbol: 'EURUSD',
        potentialOrderIds: ['entry-1', 'sl-1', 'tp1-1', 'tp2-1'],
        pendingOrderIds: ['entry-1', 'tp1-1'],
        ordersToCancel: ['entry-1', 'tp1-1'],
      },
      'Fetched orders to cancel'
    );
    expect(mockNext).toHaveBeenCalled();
  });

  it('should handle case when no pending orders exist on exchange', async () => {
    // Arrange
    mockAdapter.fetchOpenOrders.mockResolvedValue([]);

    // Act
    await step.execute(mockContext, mockNext);

    // Assert
    expect(mockContext.state.orderIdsToCancel).toEqual([]);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should handle case when all potential orders exist on exchange', async () => {
    // Arrange
    const pendingOrders = [
      { id: 'entry-1', symbol: 'EURUSD' },
      { id: 'sl-1', symbol: 'EURUSD' },
      { id: 'tp1-1', symbol: 'EURUSD' },
      { id: 'tp2-1', symbol: 'EURUSD' },
    ];

    mockAdapter.fetchOpenOrders.mockResolvedValue(pendingOrders as any);

    // Act
    await step.execute(mockContext, mockNext);

    // Assert
    expect(mockContext.state.orderIdsToCancel).toEqual([
      'entry-1',
      'sl-1',
      'tp1-1',
      'tp2-1',
    ]);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should filter out undefined order IDs from potential list', async () => {
    // Arrange
    mockContext.state.order = {
      orderId: 'order-123',
      entry: { entryOrderId: undefined },
      sl: { slOrderId: 'sl-1' },
      tp: {
        tp1OrderId: undefined,
        tp2OrderId: undefined,
        tp3OrderId: undefined,
      },
    } as any;

    const pendingOrders = [{ id: 'sl-1', symbol: 'EURUSD' }];
    mockAdapter.fetchOpenOrders.mockResolvedValue(pendingOrders as any);

    // Act
    await step.execute(mockContext, mockNext);

    // Assert
    expect(mockContext.state.orderIdsToCancel).toEqual(['sl-1']);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should throw error if order is not found in context state', async () => {
    // Arrange
    mockContext.state.order = undefined;

    // Act & Assert
    await expect(step.execute(mockContext, mockNext)).rejects.toThrow(
      'Order not found in context state'
    );
    expect(mockNext).not.toHaveBeenCalled();
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
});
