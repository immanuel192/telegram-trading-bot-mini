/**
 * Unit tests for OrderExecutionHandler
 * Tests message handling and delegation to OrderExecutorService
 */

import { OrderExecutionHandler } from '../../../src/events/consumers/order-execution-handler';
import { PipelineOrderExecutorService } from '../../../src/services/order-handlers/pipeline-executor.service';

import {
  MessageType,
  StreamMessage,
  CommandEnum,
  ExecuteOrderRequestPayload,
} from '@telegram-trading-bot-mini/shared/utils';
import { IErrorCapture } from '@telegram-trading-bot-mini/shared/utils';
import pino from 'pino';

describe('OrderExecutionHandler', () => {
  let handler: OrderExecutionHandler;
  let mockPipelineExecutor: jest.Mocked<PipelineOrderExecutorService>;
  let mockErrorCapture: jest.Mocked<IErrorCapture>;
  const logger = pino({ level: 'silent' });

  beforeEach(() => {
    mockPipelineExecutor = {
      executeOrder: jest.fn(),
    } as any;

    mockErrorCapture = {
      captureException: jest.fn(),
    } as any;

    handler = new OrderExecutionHandler(
      mockPipelineExecutor,
      logger,
      mockErrorCapture,
    );
  });

  describe('handle', () => {
    const createMessage = (
      payload: ExecuteOrderRequestPayload,
    ): StreamMessage<MessageType.EXECUTE_ORDER_REQUEST> => ({
      version: '1.0.0',
      type: MessageType.EXECUTE_ORDER_REQUEST,
      payload,
    });

    it('should process valid EXECUTE_ORDER_REQUEST message', async () => {
      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'order-123',
        messageId: 100,
        channelId: 'channel-1',
        command: CommandEnum.LONG,
        symbol: 'BTCUSD',
        lotSize: 0.1,
        isImmediate: true,
        traceToken: 'trace-1',
        timestamp: Date.now(),
      };

      const message = createMessage(payload);
      mockPipelineExecutor.executeOrder.mockResolvedValue();

      await handler.handle(message, 'stream-msg-1');

      expect(mockPipelineExecutor.executeOrder).toHaveBeenCalledWith(payload);
      expect(mockPipelineExecutor.executeOrder).toHaveBeenCalledTimes(1);
    });

    it('should delegate to OrderExecutorService', async () => {
      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'order-456',
        messageId: 101,
        channelId: 'channel-1',
        command: CommandEnum.SHORT,
        symbol: 'ETHUSD',
        lotSize: 0.5,
        isImmediate: true,
        traceToken: 'trace-2',
        timestamp: Date.now(),
      };

      const message = createMessage(payload);
      mockPipelineExecutor.executeOrder.mockResolvedValue();

      await handler.handle(message, 'stream-msg-2');

      expect(mockPipelineExecutor.executeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'test-account',
          orderId: 'order-456',
          command: CommandEnum.SHORT,
          symbol: 'ETHUSD',
          traceToken: 'trace-2',
        }),
      );
    });

    it('should handle LONG command', async () => {
      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'long-order',
        messageId: 102,
        channelId: 'channel-1',
        command: CommandEnum.LONG,
        symbol: 'XAUUSD',
        lotSize: 1.0,
        isImmediate: true,
        traceToken: 'trace-3',
        timestamp: Date.now(),
      };

      const message = createMessage(payload);
      mockPipelineExecutor.executeOrder.mockResolvedValue();

      await handler.handle(message, 'stream-msg-3');

      expect(mockPipelineExecutor.executeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          command: CommandEnum.LONG,
        }),
      );
    });

    it('should handle CLOSE_ALL command', async () => {
      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'close-order',
        messageId: 103,
        channelId: 'channel-1',
        command: CommandEnum.CLOSE_ALL,
        symbol: 'BTCUSD',
        traceToken: 'trace-4',
        timestamp: Date.now(),
      };

      const message = createMessage(payload);
      mockPipelineExecutor.executeOrder.mockResolvedValue();

      await handler.handle(message, 'stream-msg-4');

      expect(mockPipelineExecutor.executeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          command: CommandEnum.CLOSE_ALL,
        }),
      );
    });

    it('should handle CANCEL command', async () => {
      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'cancel-order',
        messageId: 104,
        channelId: 'channel-1',
        command: CommandEnum.CANCEL,
        symbol: 'BTCUSD',
        traceToken: 'trace-5',
        timestamp: Date.now(),
      };

      const message = createMessage(payload);
      mockPipelineExecutor.executeOrder.mockResolvedValue();

      await handler.handle(message, 'stream-msg-5');

      expect(mockPipelineExecutor.executeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          command: CommandEnum.CANCEL,
        }),
      );
    });

    it('should handle MOVE_SL command', async () => {
      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'update-sl-order',
        messageId: 105,
        channelId: 'channel-1',
        command: CommandEnum.MOVE_SL,
        symbol: 'BTCUSD',
        stopLoss: { price: 49000 },
        traceToken: 'trace-6',
        timestamp: Date.now(),
      };

      const message = createMessage(payload);
      mockPipelineExecutor.executeOrder.mockResolvedValue();

      await handler.handle(message, 'stream-msg-6');

      expect(mockPipelineExecutor.executeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          command: CommandEnum.MOVE_SL,
          stopLoss: { price: 49000 },
        }),
      );
    });

    it('should handle SET_TP_SL command', async () => {
      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'update-tp-sl-order',
        messageId: 106,
        channelId: 'channel-1',
        command: CommandEnum.SET_TP_SL,
        symbol: 'BTCUSD',
        stopLoss: { price: 49000 },
        takeProfits: [{ price: 52000 }],
        traceToken: 'trace-7',
        timestamp: Date.now(),
      };

      const message = createMessage(payload);
      mockPipelineExecutor.executeOrder.mockResolvedValue();

      await handler.handle(message, 'stream-msg-7');

      expect(mockPipelineExecutor.executeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          command: CommandEnum.SET_TP_SL,
          stopLoss: { price: 49000 },
          takeProfits: [{ price: 52000 }],
        }),
      );
    });

    it('should include trace token in delegation', async () => {
      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'trace-test',
        messageId: 107,
        channelId: 'channel-1',
        command: CommandEnum.LONG,
        symbol: 'BTCUSD',
        lotSize: 0.1,
        isImmediate: true,
        traceToken: 'unique-trace-token-123',
        timestamp: Date.now(),
      };

      const message = createMessage(payload);
      mockPipelineExecutor.executeOrder.mockResolvedValue();

      await handler.handle(message, 'stream-msg-8');

      expect(mockPipelineExecutor.executeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          traceToken: 'unique-trace-token-123',
        }),
      );
    });

    it('should include order ID in delegation', async () => {
      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'specific-order-id-789',
        messageId: 108,
        channelId: 'channel-1',
        command: CommandEnum.LONG,
        symbol: 'BTCUSD',
        lotSize: 0.1,
        isImmediate: true,
        traceToken: 'trace-8',
        timestamp: Date.now(),
      };

      const message = createMessage(payload);
      mockPipelineExecutor.executeOrder.mockResolvedValue();

      await handler.handle(message, 'stream-msg-9');

      expect(mockPipelineExecutor.executeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'specific-order-id-789',
        }),
      );
    });

    it('should include account ID in delegation', async () => {
      const payload: ExecuteOrderRequestPayload = {
        accountId: 'specific-account-456',
        orderId: 'order-123',
        messageId: 109,
        channelId: 'channel-1',
        command: CommandEnum.LONG,
        symbol: 'BTCUSD',
        lotSize: 0.1,
        isImmediate: true,
        traceToken: 'trace-9',
        timestamp: Date.now(),
      };

      const message = createMessage(payload);
      mockPipelineExecutor.executeOrder.mockResolvedValue();

      await handler.handle(message, 'stream-msg-10');

      expect(mockPipelineExecutor.executeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'specific-account-456',
        }),
      );
    });
  });

  describe('error handling', () => {
    const createMessage = (
      payload: ExecuteOrderRequestPayload,
    ): StreamMessage<MessageType.EXECUTE_ORDER_REQUEST> => ({
      version: '1.0.0',
      type: MessageType.EXECUTE_ORDER_REQUEST,
      payload,
    });

    it('should re-throw error for stream consumer retry', async () => {
      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'error-order',
        messageId: 110,
        channelId: 'channel-1',
        command: CommandEnum.LONG,
        symbol: 'BTCUSD',
        lotSize: 0.1,
        isImmediate: true,
        traceToken: 'trace-10',
        timestamp: Date.now(),
      };

      const message = createMessage(payload);
      const error = new Error('Execution failed');
      mockPipelineExecutor.executeOrder.mockRejectedValue(error);

      await expect(handler.handle(message, 'stream-msg-11')).rejects.toThrow(
        'Execution failed',
      );
    });

    it('should capture errors to Sentry', async () => {
      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'sentry-error-order',
        messageId: 111,
        channelId: 'channel-1',
        command: CommandEnum.LONG,
        symbol: 'BTCUSD',
        lotSize: 0.1,
        isImmediate: true,
        traceToken: 'trace-11',
        timestamp: Date.now(),
      };

      const message = createMessage(payload);
      const error = new Error('Sentry test error');
      mockPipelineExecutor.executeOrder.mockRejectedValue(error);

      await expect(handler.handle(message, 'stream-msg-12')).rejects.toThrow();

      expect(mockErrorCapture.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          messageId: 'stream-msg-12',
          messageType: MessageType.EXECUTE_ORDER_REQUEST,
        }),
      );
    });

    it('should include message context in error capture', async () => {
      const payload: ExecuteOrderRequestPayload = {
        accountId: 'context-account',
        orderId: 'context-order',
        messageId: 112,
        channelId: 'channel-1',
        command: CommandEnum.SHORT,
        symbol: 'ETHUSD',
        lotSize: 0.5,
        isImmediate: true,
        traceToken: 'context-trace',
        timestamp: Date.now(),
      };

      const message = createMessage(payload);
      const error = new Error('Context error');
      mockPipelineExecutor.executeOrder.mockRejectedValue(error);

      await expect(handler.handle(message, 'stream-msg-13')).rejects.toThrow();

      expect(mockErrorCapture.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          orderId: 'context-order',
          accountId: 'context-account',
          command: CommandEnum.SHORT,
          traceToken: 'context-trace',
        }),
      );
    });

    it('should handle validation errors', async () => {
      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'validation-error-order',
        messageId: 113,
        channelId: 'channel-1',
        command: CommandEnum.LONG,
        symbol: 'BTCUSD',
        lotSize: 0.1,
        isImmediate: true,
        traceToken: 'trace-12',
        timestamp: Date.now(),
      };

      const message = createMessage(payload);
      const validationError = new Error('Invalid lot size');
      mockPipelineExecutor.executeOrder.mockRejectedValue(validationError);

      await expect(handler.handle(message, 'stream-msg-14')).rejects.toThrow(
        'Invalid lot size',
      );

      expect(mockErrorCapture.captureException).toHaveBeenCalledWith(
        validationError,
        expect.any(Object),
      );
    });

    it('should handle execution errors', async () => {
      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'execution-error-order',
        messageId: 114,
        channelId: 'channel-1',
        command: CommandEnum.CLOSE_ALL,
        symbol: 'BTCUSD',
        traceToken: 'trace-13',
        timestamp: Date.now(),
      };

      const message = createMessage(payload);
      const executionError = new Error('Order not found');
      mockPipelineExecutor.executeOrder.mockRejectedValue(executionError);

      await expect(handler.handle(message, 'stream-msg-15')).rejects.toThrow(
        'Order not found',
      );

      expect(mockErrorCapture.captureException).toHaveBeenCalledWith(
        executionError,
        expect.any(Object),
      );
    });

    it('should handle broker API errors', async () => {
      const payload: ExecuteOrderRequestPayload = {
        accountId: 'test-account',
        orderId: 'broker-error-order',
        messageId: 115,
        channelId: 'channel-1',
        command: CommandEnum.LONG,
        symbol: 'BTCUSD',
        lotSize: 0.1,
        isImmediate: true,
        traceToken: 'trace-14',
        timestamp: Date.now(),
      };

      const message = createMessage(payload);
      const brokerError = new Error('Insufficient balance');
      mockPipelineExecutor.executeOrder.mockRejectedValue(brokerError);

      await expect(handler.handle(message, 'stream-msg-16')).rejects.toThrow(
        'Insufficient balance',
      );

      expect(mockErrorCapture.captureException).toHaveBeenCalledWith(
        brokerError,
        expect.any(Object),
      );
    });
  });
});
