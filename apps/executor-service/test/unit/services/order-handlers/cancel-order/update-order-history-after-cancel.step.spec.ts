import { UpdateOrderHistoryAfterCancelStep } from '../../../../../src/services/order-handlers/cancel-order/update-order-history-after-cancel.step';
import {
  ExecutionContext,
  CancelOrderExecutionState,
} from '../../../../../src/services/order-handlers/execution-context';
import { Order, OrderRepository, OrderHistoryStatus, OrderStatus } from '@dal';

describe('UpdateOrderHistoryAfterCancelStep', () => {
  let step: UpdateOrderHistoryAfterCancelStep;
  let mockContext: ExecutionContext<CancelOrderExecutionState>;
  let mockOrderRepository: jest.Mocked<OrderRepository>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    step = new UpdateOrderHistoryAfterCancelStep();
    mockNext = jest.fn().mockResolvedValue(undefined);

    // Mock order repository
    mockOrderRepository = {
      updateOne: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Mock context
    mockContext = {
      payload: {
        orderId: 'order-123',
        messageId: 'msg-1',
        channelId: 'channel-1',
        command: 'CANCEL',
        traceToken: 'trace-1',
        accountId: 'acc-1',
      },
      container: {
        orderRepository: mockOrderRepository,
      },
      session: {} as any, // Mock session
      state: {
        isAborted: false,
        order: {
          orderId: 'order-123',
          symbol: 'EURUSD',
        } as Order,
        orderIdsToCancel: ['entry-1', 'sl-1', 'tp1-1'],
        canceledOrderIds: ['entry-1', 'tp1-1'],
      },
      logger: {
        info: jest.fn(),
        error: jest.fn(),
      },
      result: undefined,
    } as any;
  });

  it('should have the correct name', () => {
    expect(step.name).toBe('UpdateOrderHistoryAfterCancel');
  });

  it('should update order history and status after successful cancellation', async () => {
    // Act
    await step.execute(mockContext, mockNext);

    // Assert
    expect(mockOrderRepository.updateOne).toHaveBeenCalledWith(
      { orderId: 'order-123' },
      {
        $push: {
          history: {
            _id: expect.any(Object),
            status: OrderHistoryStatus.CANCELED,
            service: 'executor-service',
            ts: expect.any(Date),
            traceToken: 'trace-1',
            messageId: 'msg-1',
            channelId: 'channel-1',
            command: 'CANCEL',
            info: {
              requestedCancelOrderIds: ['entry-1', 'sl-1', 'tp1-1'],
              actuallyCanceledOrderIds: ['entry-1', 'tp1-1'],
            },
          },
        },
        $set: {
          status: OrderStatus.CANCELED,
          closedAt: expect.any(Date),
        },
      },
      expect.any(Object) // session
    );

    expect(mockContext.logger.info).toHaveBeenCalledWith(
      {
        orderId: 'order-123',
        requestedCount: 3,
        canceledCount: 2,
      },
      'Updated order history after cancellation'
    );

    expect(mockContext.result).toEqual({
      orderId: 'order-123',
      accountId: 'acc-1',
      traceToken: 'trace-1',
      messageId: 'msg-1',
      channelId: 'channel-1',
      success: true,
      symbol: undefined,
      type: 0, // OTHERS
    });

    expect(mockNext).toHaveBeenCalled();
  });

  it('should handle case when all orders were canceled', async () => {
    // Arrange
    mockContext.state.orderIdsToCancel = ['entry-1', 'sl-1'];
    mockContext.state.canceledOrderIds = ['entry-1', 'sl-1'];

    // Act
    await step.execute(mockContext, mockNext);

    // Assert
    expect(mockOrderRepository.updateOne).toHaveBeenCalledWith(
      { orderId: 'order-123' },
      expect.objectContaining({
        $push: {
          history: expect.objectContaining({
            info: {
              requestedCancelOrderIds: ['entry-1', 'sl-1'],
              actuallyCanceledOrderIds: ['entry-1', 'sl-1'],
            },
          }),
        },
      }),
      expect.any(Object) // session
    );

    expect(mockContext.logger.info).toHaveBeenCalledWith(
      {
        orderId: 'order-123',
        requestedCount: 2,
        canceledCount: 2,
      },
      'Updated order history after cancellation'
    );

    expect(mockNext).toHaveBeenCalled();
  });

  it('should handle case when no orders were canceled', async () => {
    // Arrange
    mockContext.state.orderIdsToCancel = ['entry-1', 'sl-1'];
    mockContext.state.canceledOrderIds = [];

    // Act
    await step.execute(mockContext, mockNext);

    // Assert
    expect(mockOrderRepository.updateOne).toHaveBeenCalledWith(
      { orderId: 'order-123' },
      expect.objectContaining({
        $push: {
          history: expect.objectContaining({
            info: {
              requestedCancelOrderIds: ['entry-1', 'sl-1'],
              actuallyCanceledOrderIds: [],
            },
          }),
        },
      }),
      expect.any(Object) // session
    );

    expect(mockContext.logger.info).toHaveBeenCalledWith(
      {
        orderId: 'order-123',
        requestedCount: 2,
        canceledCount: 0,
      },
      'Updated order history after cancellation'
    );

    expect(mockNext).toHaveBeenCalled();
  });

  it('should handle undefined orderIdsToCancel and canceledOrderIds', async () => {
    // Arrange
    mockContext.state.orderIdsToCancel = undefined;
    mockContext.state.canceledOrderIds = undefined;

    // Act
    await step.execute(mockContext, mockNext);

    // Assert
    expect(mockOrderRepository.updateOne).toHaveBeenCalledWith(
      { orderId: 'order-123' },
      expect.objectContaining({
        $push: {
          history: expect.objectContaining({
            info: {
              requestedCancelOrderIds: [],
              actuallyCanceledOrderIds: [],
            },
          }),
        },
      }),
      expect.any(Object) // session
    );

    expect(mockContext.logger.info).toHaveBeenCalledWith(
      {
        orderId: 'order-123',
        requestedCount: 0,
        canceledCount: 0,
      },
      'Updated order history after cancellation'
    );

    expect(mockNext).toHaveBeenCalled();
  });

  it('should throw error if order is not found in context state', async () => {
    // Arrange
    mockContext.state.order = undefined;

    // Act & Assert
    await expect(step.execute(mockContext, mockNext)).rejects.toThrow(
      'Order not found in context state'
    );
    expect(mockOrderRepository.updateOne).not.toHaveBeenCalled();
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should propagate database errors', async () => {
    // Arrange
    const dbError = new Error('Database connection failed');
    mockOrderRepository.updateOne.mockRejectedValue(dbError);

    // Act & Assert
    await expect(step.execute(mockContext, mockNext)).rejects.toThrow(
      'Database connection failed'
    );
    expect(mockNext).not.toHaveBeenCalled();
  });
});
