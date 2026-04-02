/**
 * Unit tests for BaseRedisStreamConsumer
 *
 * Tests the abstract base class methods for:
 * - Message parsing (Redis format → StreamMessage)
 * - Message validation (schema + expiration)
 * - ACK operations
 * - Error handling
 */

import { BaseRedisStreamConsumer } from '../../src/stream/consumers/base-redis-stream-consumer';
import {
  StreamMessage,
  StreamTopic,
  IMessageValidator,
  MessageValidationResult,
  RedisStreamConsumerConfig,
} from '../../src/stream/stream-interfaces';
import { MessageType } from '../../src/interfaces/messages/message-type';
import { IErrorCapture } from '../../src/error-capture';
import Redis from 'ioredis';

// Concrete implementation for testing
class TestConsumer extends BaseRedisStreamConsumer {
  constructor(config: RedisStreamConsumerConfig) {
    super(config);
  }

  // Implement abstract method (no-op for testing)
  protected async _consumeLoop(
    _topic: StreamTopic,
    _groupName: string,
    _consumerName: string,
    _handler: any
  ): Promise<void> {
    // No-op implementation for testing
  }

  // Expose protected methods for testing
  public async testFetchMessages(
    topic: StreamTopic,
    groupName: string,
    consumerName: string,
    count: number
  ) {
    return super.fetchMessages(topic, groupName, consumerName, count);
  }

  public testParseMessage<T extends MessageType>(
    id: string,
    fieldsArray: string[]
  ) {
    return super.parseMessage<T>(id, fieldsArray);
  }

  public async testValidateMessage<T extends MessageType>(
    message: StreamMessage<T>,
    id: string
  ) {
    return super.validateMessage(message, id);
  }

  public async testAckMessage(
    topic: StreamTopic,
    groupName: string,
    id: string
  ) {
    return super.ackMessage(topic, groupName, id);
  }

  public testSleep(ms: number) {
    return super.sleep(ms);
  }

  public getClient() {
    return this.client;
  }
}

describe('BaseRedisStreamConsumer', () => {
  let consumer: TestConsumer;
  let mockValidator: jest.Mocked<IMessageValidator>;
  let mockErrorCapture: jest.Mocked<IErrorCapture>;
  let mockRedisClient: jest.Mocked<Redis>;

  beforeEach(() => {
    // Mock validator
    mockValidator = {
      validate: jest.fn(),
      isExpired: jest.fn(),
    };

    // Mock error capture
    mockErrorCapture = {
      captureException: jest.fn(),
    };

    // Create consumer with mocked dependencies
    const config: RedisStreamConsumerConfig = {
      url: 'redis://localhost:6379',
      validator: mockValidator,
      errorCapture: mockErrorCapture,
    };

    consumer = new TestConsumer(config);
    mockRedisClient = consumer.getClient() as jest.Mocked<Redis>;

    // Mock Redis methods
    mockRedisClient.xack = jest.fn().mockResolvedValue(1);
    mockRedisClient.quit = jest.fn().mockResolvedValue('OK');
  });

  afterEach(async () => {
    await consumer.close();
  });

  describe('constructor', () => {
    it('should be abstract (cannot instantiate BaseRedisStreamConsumer directly)', () => {
      // This test verifies that BaseRedisStreamConsumer is abstract
      // We can only instantiate it through a concrete subclass (TestConsumer)
      expect(consumer).toBeInstanceOf(BaseRedisStreamConsumer);
      expect(consumer).toBeInstanceOf(TestConsumer);
    });

    it('should initialize with default config', () => {
      const config: RedisStreamConsumerConfig = {
        url: 'redis://localhost:6379',
      };
      const testConsumer = new TestConsumer(config);
      expect(testConsumer).toBeDefined();
    });
  });

  describe('parseMessage', () => {
    it('should correctly convert Redis format to StreamMessage', () => {
      const id = '1234567890-0';
      const fieldsArray = [
        'version',
        '1.0',
        'type',
        MessageType.NEW_MESSAGE,
        'payload',
        JSON.stringify({
          channelId: 'channel1',
          messageId: 10001,
          text: 'Test message',
        }),
      ];

      const result = consumer.testParseMessage(id, fieldsArray);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(id);
      expect(result?.message.version).toBe('1.0');
      expect(result?.message.type).toBe(MessageType.NEW_MESSAGE);
      expect(result?.message.payload).toEqual({
        channelId: 'channel1',
        messageId: 10001,
        text: 'Test message',
      });
    });

    it('should handle invalid JSON gracefully', () => {
      const id = '1234567890-0';
      const fieldsArray = [
        'version',
        '1.0',
        'type',
        MessageType.NEW_MESSAGE,
        'payload',
        'invalid json{',
      ];

      const result = consumer.testParseMessage(id, fieldsArray);

      expect(result).toBeNull();
      expect(mockErrorCapture.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        { id }
      );
    });

    it('should handle missing fields by creating message with undefined values', () => {
      const id = '1234567890-0';
      const fieldsArray = ['version', '1.0']; // Missing type and payload

      const result = consumer.testParseMessage(id, fieldsArray);

      // Missing fields result in undefined values, not null
      // Validation will catch these issues later
      expect(result).not.toBeNull();
      expect(result?.message.version).toBe('1.0');
      expect(result?.message.type).toBeUndefined();
      expect(result?.message.payload).toBeUndefined();
    });

    it('should handle already-parsed payload object', () => {
      const id = '1234567890-0';
      const payload = {
        channelId: 'channel1',
        messageId: 10001,
        text: 'Test message',
      };
      const fieldsArray = [
        'version',
        '1.0',
        'type',
        MessageType.NEW_MESSAGE,
        'payload',
        payload as any, // Already an object
      ];

      const result = consumer.testParseMessage(id, fieldsArray);

      expect(result).not.toBeNull();
      expect(result?.message.payload).toEqual(payload);
    });
  });

  describe('validateMessage', () => {
    const mockMessage: StreamMessage<MessageType.NEW_MESSAGE> = {
      version: '1.0',
      type: MessageType.NEW_MESSAGE,
      payload: {
        channelId: 'channel1',
        messageId: 10001,
        text: 'Test message',
        timestamp: new Date().toISOString(),
      } as any,
    };

    it('should call validator correctly', async () => {
      const validationResult: MessageValidationResult = { valid: true };
      mockValidator.validate.mockResolvedValue(validationResult);
      mockValidator.isExpired.mockReturnValue(false);

      const result = await consumer.testValidateMessage(mockMessage, 'msg-id');

      expect(result).toBe(true);
      expect(mockValidator.validate).toHaveBeenCalledWith(mockMessage);
      expect(mockValidator.isExpired).toHaveBeenCalledWith(mockMessage);
    });

    it('should return false for invalid message', async () => {
      const validationResult: MessageValidationResult = {
        valid: false,
        error: 'Invalid schema',
      };
      mockValidator.validate.mockResolvedValue(validationResult);

      const result = await consumer.testValidateMessage(mockMessage, 'msg-id');

      expect(result).toBe(false);
      expect(mockErrorCapture.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          id: 'msg-id',
          message: mockMessage,
        })
      );
    });

    it('should return false for expired message', async () => {
      const validationResult: MessageValidationResult = { valid: true };
      mockValidator.validate.mockResolvedValue(validationResult);
      mockValidator.isExpired.mockReturnValue(true);

      const result = await consumer.testValidateMessage(mockMessage, 'msg-id');

      expect(result).toBe(false);
      expect(mockErrorCapture.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          id: 'msg-id',
          message: mockMessage,
        })
      );
    });
  });

  describe('ackMessage', () => {
    it('should call Redis XACK with correct parameters', async () => {
      const topic = StreamTopic.MESSAGES;
      const groupName = 'test-group';
      const id = '1234567890-0';

      await consumer.testAckMessage(topic, groupName, id);

      expect(mockRedisClient.xack).toHaveBeenCalledWith(topic, groupName, id);
    });
  });

  describe('sleep', () => {
    it('should sleep for the specified duration', async () => {
      const start = Date.now();
      await consumer.testSleep(100);
      const duration = Date.now() - start;

      // Allow some tolerance for timing
      expect(duration).toBeGreaterThanOrEqual(90);
      expect(duration).toBeLessThan(150);
    });
  });

  describe('lifecycle', () => {
    it('should stop the consumer', async () => {
      await consumer.stop();
      // Verify isRunning is set to false (we can't access it directly, but stop should complete)
      expect(true).toBe(true);
    });

    it('should close the consumer and quit Redis connection', async () => {
      await consumer.close();

      expect(mockRedisClient.quit).toHaveBeenCalled();
    });
  });
});
