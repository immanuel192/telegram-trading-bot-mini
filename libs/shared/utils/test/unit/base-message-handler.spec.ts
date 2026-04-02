/**
 * Unit tests for BaseMessageHandler's processWithTracing method
 * Focus: Verify handler execution, parameter passing, and error propagation
 */

import { BaseMessageHandler } from '../../src/stream/consumers/base-message-handler';
import { StreamMessage } from '../../src/stream/stream-interfaces';
import { MessageType } from '../../src/interfaces/messages/message-type';
import { LoggerInstance } from '../../src/interfaces';
import { IErrorCapture } from '../../src/error-capture';

// Mock Sentry
jest.mock('@sentry/node', () => ({
  continueTrace: jest.fn((context, callback) => callback()),
  startSpan: jest.fn((options, callback) => {
    const mockSpan = {
      setAttribute: jest.fn(),
      setData: jest.fn(),
      setStatus: jest.fn(),
      end: jest.fn(),
    };
    return callback(mockSpan);
  }),
}));

// Concrete implementation for testing
class TestMessageHandler extends BaseMessageHandler<MessageType.TRANSLATE_MESSAGE_REQUEST> {
  async handle(
    message: StreamMessage<MessageType.TRANSLATE_MESSAGE_REQUEST>,
    id: string
  ): Promise<void> {
    // Not used in these tests
  }

  // Expose protected method for testing
  public async testProcessWithTracing<T extends MessageType>(
    message: StreamMessage<T>,
    id: string,
    handler: () => Promise<void>
  ): Promise<void> {
    return this.processWithTracing(message, id, handler);
  }
}

describe('BaseMessageHandler', () => {
  let handler: TestMessageHandler;
  let mockLogger: LoggerInstance;
  let mockErrorCapture: IErrorCapture;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
    } as any;

    mockErrorCapture = {
      captureException: jest.fn(),
    } as any;

    handler = new TestMessageHandler(mockLogger, mockErrorCapture);
  });

  describe('processWithTracing', () => {
    it('should execute handler logic', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_REQUEST> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload: {
          channelId: 'test-channel',
          promptId: 'test-prompt',
          messageId: 12345,
          messageText: 'test message',
          prevMessage: '',
          traceToken: 'test-trace-token',
          receivedAt: Date.now(),
          exp: Date.now() + 10000,
        },
      };

      const handlerFn = jest.fn().mockResolvedValue(undefined);

      await handler.testProcessWithTracing(message, 'test-id-123', handlerFn);

      expect(handlerFn).toHaveBeenCalledTimes(1);
    });

    it('should pass correct message and id to handler', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_REQUEST> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload: {
          channelId: 'test-channel',
          promptId: 'test-prompt',
          messageId: 45678,
          messageText: 'test message',
          prevMessage: '',
          traceToken: 'test-trace-token',
          receivedAt: Date.now(),
          exp: Date.now() + 10000,
        },
      };

      let capturedMessage: any;
      let capturedId: any;

      const handlerFn = jest.fn(async () => {
        // Capture context at execution time
        capturedMessage = message;
        capturedId = 'test-id-456';
      });

      await handler.testProcessWithTracing(message, 'test-id-456', handlerFn);

      expect(capturedMessage).toBe(message);
      expect(capturedId).toBe('test-id-456');
    });

    it('should propagate handler errors', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_REQUEST> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload: {
          channelId: 'test-channel',
          promptId: 'test-prompt',
          messageId: 78901,
          messageText: 'test message',
          prevMessage: '',
          traceToken: 'test-trace-token',
          receivedAt: Date.now(),
          exp: Date.now() + 10000,
        },
      };

      const testError = new Error('Handler execution failed');
      const handlerFn = jest.fn().mockRejectedValue(testError);

      await expect(
        handler.testProcessWithTracing(message, 'test-id-789', handlerFn)
      ).rejects.toThrow('Handler execution failed');
    });

    it('should handle messages without trace context', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_REQUEST> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload: {
          channelId: 'test-channel',
          promptId: 'test-prompt',
          messageId: 11111,
          messageText: 'test message',
          prevMessage: '',
          traceToken: 'test-trace-token',
          receivedAt: Date.now(),
          exp: Date.now() + 10000,
        },
        // No _sentryTrace or _sentryBaggage
      };

      const handlerFn = jest.fn().mockResolvedValue(undefined);

      await handler.testProcessWithTracing(
        message,
        'test-id-no-trace',
        handlerFn
      );

      expect(handlerFn).toHaveBeenCalledTimes(1);
    });

    it('should handle messages with trace context', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_REQUEST> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload: {
          channelId: 'test-channel',
          promptId: 'test-prompt',
          messageId: 22222,
          messageText: 'test message',
          prevMessage: '',
          traceToken: 'test-trace-token',
          receivedAt: Date.now(),
          exp: Date.now() + 10000,
        },
        _sentryTrace: 'mock-sentry-trace-header',
        _sentryBaggage: 'mock-baggage-header',
      };

      const handlerFn = jest.fn().mockResolvedValue(undefined);

      await handler.testProcessWithTracing(
        message,
        'test-id-with-trace',
        handlerFn
      );

      expect(handlerFn).toHaveBeenCalledTimes(1);
    });

    it('should handle async handler logic', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_REQUEST> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload: {
          channelId: 'test-channel',
          promptId: 'test-prompt',
          messageId: 33333,
          messageText: 'test message',
          prevMessage: '',
          traceToken: 'test-trace-token',
          receivedAt: Date.now(),
          exp: Date.now() + 10000,
        },
      };

      const executionOrder: string[] = [];

      const handlerFn = jest.fn(async () => {
        executionOrder.push('start');
        await new Promise((resolve) => setTimeout(resolve, 10));
        executionOrder.push('end');
      });

      await handler.testProcessWithTracing(message, 'test-id-async', handlerFn);

      expect(executionOrder).toEqual(['start', 'end']);
      expect(handlerFn).toHaveBeenCalledTimes(1);
    });
  });
});
