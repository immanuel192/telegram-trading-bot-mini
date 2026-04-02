import {
  fakeLogger,
  suiteName,
} from '@telegram-trading-bot-mini/shared/test-utils';
import {
  StreamMessage,
  MessageType,
  ExecuteOrderResultType,
} from '@telegram-trading-bot-mini/shared/utils';
import { ExecuteOrderResultHandler } from '../../../../src/events/consumers/execute-order-result-handler';

describe(suiteName(__filename), () => {
  let handler: ExecuteOrderResultHandler;
  let mockLogger: any;
  let mockErrorCapture: any;
  let mockOrderCacheService: any;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();

    mockLogger = fakeLogger;

    mockErrorCapture = {
      captureException: jest.fn(),
    };

    mockOrderCacheService = {
      addOrder: jest.fn(),
      updateOrder: jest.fn(),
      removeOrder: jest.fn(),
    };

    handler = new ExecuteOrderResultHandler(
      mockLogger,
      mockErrorCapture,
      mockOrderCacheService,
    );
  });

  it('should process OrderOpen and call addOrder', async () => {
    const message: StreamMessage<MessageType.EXECUTE_ORDER_RESULT> = {
      version: '1.0',
      type: MessageType.EXECUTE_ORDER_RESULT,
      payload: {
        orderId: 'order-123',
        accountId: 'acc-123',
        traceToken: 'trace-123',
        messageId: 100,
        channelId: 'chan-123',
        success: true,
        type: ExecuteOrderResultType.OrderOpen,
        symbol: 'BTCUSDT',
        side: 'LONG',
        lotSize: 0.1,
        lotSizeRemaining: 0.1,
        takeProfits: [{ price: 50000, isUsed: true }],
      },
    };

    await handler.handle(message, '1-0');

    expect(mockOrderCacheService.addOrder).toHaveBeenCalledWith(
      'order-123',
      'acc-123',
      'BTCUSDT',
      'LONG',
      100,
      'chan-123',
      0.1,
      [{ price: 50000, isUsed: true }],
    );
  });

  it('should process OrderUpdatedTpSl and call updateOrder', async () => {
    const message: StreamMessage<MessageType.EXECUTE_ORDER_RESULT> = {
      version: '1.0',
      type: MessageType.EXECUTE_ORDER_RESULT,
      payload: {
        orderId: 'order-123',
        accountId: 'acc-123',
        traceToken: 'trace-123',
        messageId: 100,
        channelId: 'chan-123',
        success: true,
        type: ExecuteOrderResultType.OrderUpdatedTpSl,
        lotSizeRemaining: 0.05,
        takeProfits: [{ price: 51000, isUsed: true }],
      },
    };

    await handler.handle(message, '2-0');

    expect(mockOrderCacheService.updateOrder).toHaveBeenCalledWith(
      'order-123',
      {
        lotSizeRemaining: 0.05,
        takeProfits: [{ price: 51000, isUsed: true }],
      },
    );
  });

  it('should process OrderClosed and call removeOrder', async () => {
    const message: StreamMessage<MessageType.EXECUTE_ORDER_RESULT> = {
      version: '1.0',
      type: MessageType.EXECUTE_ORDER_RESULT,
      payload: {
        orderId: 'order-123',
        accountId: 'acc-123',
        traceToken: 'trace-123',
        messageId: 100,
        channelId: 'chan-123',
        success: true,
        type: ExecuteOrderResultType.OrderClosed,
      },
    };

    await handler.handle(message, '3-0');

    expect(mockOrderCacheService.removeOrder).toHaveBeenCalledWith('order-123');
  });

  it('should skip if execution was not successful', async () => {
    const message: StreamMessage<MessageType.EXECUTE_ORDER_RESULT> = {
      version: '1.0',
      type: MessageType.EXECUTE_ORDER_RESULT,
      payload: {
        orderId: 'order-123',
        accountId: 'acc-123',
        traceToken: 'trace-123',
        messageId: 100,
        channelId: 'chan-123',
        success: false,
        type: ExecuteOrderResultType.OrderOpen,
        error: 'Execution failed',
      },
    };

    await handler.handle(message, '4-0');

    expect(mockOrderCacheService.addOrder).not.toHaveBeenCalled();
    expect(mockOrderCacheService.updateOrder).not.toHaveBeenCalled();
    expect(mockOrderCacheService.removeOrder).not.toHaveBeenCalled();
  });

  it('should skip if type is OTHERS', async () => {
    const message: StreamMessage<MessageType.EXECUTE_ORDER_RESULT> = {
      version: '1.0',
      type: MessageType.EXECUTE_ORDER_RESULT,
      payload: {
        orderId: 'order-123',
        accountId: 'acc-123',
        traceToken: 'trace-123',
        messageId: 100,
        channelId: 'chan-123',
        success: true,
        type: ExecuteOrderResultType.OTHERS,
      },
    };

    await handler.handle(message, '5-0');

    expect(mockOrderCacheService.addOrder).not.toHaveBeenCalled();
    expect(mockOrderCacheService.updateOrder).not.toHaveBeenCalled();
    expect(mockOrderCacheService.removeOrder).not.toHaveBeenCalled();
  });
});
