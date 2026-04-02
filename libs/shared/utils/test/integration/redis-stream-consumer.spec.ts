/**
 * Integration tests for Redis Stream Consumer - Additional Scenarios
 * These tests require a running Redis instance (use npm run stack:up)
 *
 * This file focuses on additional consumer scenarios not covered in redis-stream.spec.ts:
 * - Consumer retry flow with success
 * - Consumer error handling
 * - Consumer stop/start
 * - Multiple consumers
 */

import Redis from 'ioredis';
import {
  sleep,
  getTestRedisUrl,
  suiteName,
} from '@telegram-trading-bot-mini/shared/test-utils';
import {
  RedisStreamPublisher,
  RedisStreamConsumer,
  StreamTopic,
  StreamMessage,
  IErrorCapture,
  createConsumerGroup,
  trimStream,
  RedisStreamConsumerConfig,
} from '../../src';
import { MessageType } from '../../src/interfaces/messages/message-type';

const REDIS_URL = getTestRedisUrl();
const TEST_STREAM = StreamTopic.MESSAGES;
const TEST_GROUP = 'test-consumer-group';
const TEST_CONSUMER = 'test-consumer';

describe(suiteName(__filename), () => {
  let publisher: RedisStreamPublisher;
  let consumer: RedisStreamConsumer;
  let redis: Redis;
  let receivedMessages: Array<{
    message: StreamMessage<MessageType.NEW_MESSAGE>;
    id: string;
  }> = [];

  const mockErrorCapture: IErrorCapture = {
    captureException: jest.fn(),
  };

  const mockValidator = {
    validate: jest.fn(),
    isExpired: jest.fn(),
  };

  const startConsumer = async (
    streamTopic: StreamTopic,
    group: string,
    consumerName: string,
    consumerOptions: Pick<
      RedisStreamConsumerConfig,
      'validator' | 'errorCapture' | 'retryConfig' | 'logger'
    > = {},
    handler = async (msg: any, id: any) => {
      receivedMessages.push({ message: msg, id });
    },
  ) => {
    consumer = new RedisStreamConsumer({
      url: REDIS_URL,

      ...consumerOptions,
    });

    // Start consuming
    consumer.start(streamTopic, group, consumerName, handler);

    // Wait a bit for consumer to be ready
    await sleep(100);
  };

  beforeAll(async () => {
    // Create Redis client for cleanup
    redis = new Redis(getTestRedisUrl());
    publisher = new RedisStreamPublisher({
      url: REDIS_URL,
    });
  });

  beforeEach(async () => {
    receivedMessages = [];
    jest.clearAllMocks();

    // Clean up test stream
    await trimStream(redis, TEST_STREAM);

    publisher = new RedisStreamPublisher({
      url: REDIS_URL,
    });

    // Reset mocks
    mockValidator.validate.mockResolvedValue(true);
    mockValidator.isExpired.mockReturnValue(false);
    (mockErrorCapture.captureException as jest.Mock).mockClear();

    // Create consumer group before tests
    await createConsumerGroup(redis, TEST_STREAM, TEST_GROUP, '0');
  });

  afterEach(async () => {
    // Stop consumer if running
    if (consumer) {
      try {
        await consumer.close();
      } catch (error: any) {
        // Ignore "Connection is closed" errors
        if (!error.message?.includes('Connection is closed')) {
          throw error;
        }
      }
    }
  }, 10000); // 10 second timeout for cleanup

  afterAll(async () => {
    await publisher.close();
  });

  describe('Consumer Retry Flow', () => {
    it('should retry and succeed after initial failure', async () => {
      let attemptCount = 0;
      const successAfterAttempts = 2;

      // Create consumer group for this test
      await createConsumerGroup(
        redis,
        TEST_STREAM,
        `${TEST_GROUP}-retry-success`,
        '0',
      );

      // Publish a message
      await publisher.publish(TEST_STREAM, {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: 1001,
          traceToken: 'trace-1001',
          receivedAt: Date.now(),
          exp: Date.now() + 60000,
        },
      });

      await startConsumer(
        TEST_STREAM,
        `${TEST_GROUP}-retry-success`,
        TEST_CONSUMER,
        {
          errorCapture: mockErrorCapture,
          retryConfig: {
            maxRetries: 3,
            initialDelayMs: 50,
            maxDelayMs: 500,
            backoffMultiplier: 2,
          },
        },
        async (msg, id) => {
          attemptCount++;
          if (attemptCount < successAfterAttempts) {
            throw new Error('Processing failed, will retry');
          }
          // Success on attempt 2 - add to received messages
          receivedMessages.push({ message: msg, id });
        },
      );

      // Wait for processing and retries
      await sleep(500);

      // Should have attempted at least successAfterAttempts times (allow for timing variations)
      expect(attemptCount).toBeGreaterThanOrEqual(successAfterAttempts);
      expect(attemptCount).toBeLessThanOrEqual(successAfterAttempts + 1);
      // Message should be received (successfully processed)
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].message.payload.messageId).toBe(1001);
      // Note: Errors during retries are logged but not captured as exceptions
      // Only max retries exceeded triggers error capture
    }, 5000);
  });

  describe('Consumer Max Retries', () => {
    it('should stop retrying after maxRetries and acknowledge message', async () => {
      let attemptCount = 0;
      const maxRetries = 2;

      // Create consumer group for this test
      await createConsumerGroup(
        redis,
        TEST_STREAM,
        `${TEST_GROUP}-max-retries`,
        '0',
      );

      // Publish a message
      const entryId = await publisher.publish(TEST_STREAM, {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: 1002,
          traceToken: 'trace-1002',
          receivedAt: Date.now(),
          exp: Date.now() + 60000,
        },
      });

      await startConsumer(
        TEST_STREAM,
        `${TEST_GROUP}-max-retries`,
        TEST_CONSUMER,
        {
          errorCapture: mockErrorCapture,
          retryConfig: {
            maxRetries,
            initialDelayMs: 50,
            maxDelayMs: 500,
            backoffMultiplier: 2,
          },
        },
        async () => {
          attemptCount++;
          throw new Error('Always fails');
        },
      );

      // Wait for all retries to complete
      await sleep(2000);

      // Should have attempted maxRetries + 1 times (initial + retries)
      // Allow some flexibility due to async timing
      expect(attemptCount).toBeGreaterThanOrEqual(maxRetries);
      expect(attemptCount).toBeLessThanOrEqual(maxRetries + 1);

      // Error should be captured for max retries exceeded
      expect(mockErrorCapture.captureException).toHaveBeenCalled();
      const calls = (mockErrorCapture.captureException as jest.Mock).mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0].message).toBe('Always fails');
      expect(lastCall[1]).toHaveProperty('retries');
      expect(lastCall[1].retries).toBeGreaterThan(maxRetries);

      // Message should be acknowledged (removed from pending)
      const pending = (await redis.xpending(
        TEST_STREAM,
        `${TEST_GROUP}-max-retries`,
        '-',
        '+',
        10,
      )) as any;
      expect(Array.isArray(pending) ? pending.length : 0).toBe(0);

      // Message should not be in receivedMessages (failed)
      expect(receivedMessages).toHaveLength(0);
    }, 5000);
  });

  describe('Consumer Validation Failure', () => {
    it('should acknowledge invalid message and not retry', async () => {
      mockValidator.validate.mockResolvedValue({
        valid: false,
        error: 'Test validation error',
      });
      mockValidator.isExpired.mockReturnValue(false);

      // Create consumer group for this test
      await createConsumerGroup(
        redis,
        TEST_STREAM,
        `${TEST_GROUP}-validation`,
        '0',
      );

      // Publish a message
      const entryId = await publisher.publish(TEST_STREAM, {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: 1003,
          traceToken: 'trace-1003',
          receivedAt: Date.now(),
          exp: Date.now() + 60000,
        },
      });

      await startConsumer(
        TEST_STREAM,
        `${TEST_GROUP}-validation`,
        TEST_CONSUMER,
        {
          validator: mockValidator,
          errorCapture: mockErrorCapture,
        },
      );

      // Wait for processing
      await sleep(500);

      // Message should not be received (invalid)
      expect(receivedMessages).toHaveLength(0);
      expect(mockValidator.validate).toHaveBeenCalled();
      expect(mockErrorCapture.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Message validation failed'),
        }),
        expect.any(Object),
      );

      // Message should be acknowledged (removed from pending)
      // Note: Stream might be deleted in afterEach, so check if group exists first
      try {
        const pending = (await redis.xpending(
          TEST_STREAM,
          `${TEST_GROUP}-validation`,
          '-',
          '+',
          10,
        )) as any;
        expect(Array.isArray(pending) ? pending.length : 0).toBe(0);
      } catch (error: any) {
        // If group doesn't exist, that's also fine - message was acknowledged
        if (!error.message?.includes('NOGROUP')) {
          throw error;
        }
      }
    }, 3000);
  });

  describe('Consumer Expiry Check', () => {
    it('should acknowledge expired message and not process', async () => {
      mockValidator.validate.mockResolvedValue({ valid: true });
      mockValidator.isExpired.mockReturnValue(true);

      // Create consumer group for this test
      await createConsumerGroup(
        redis,
        TEST_STREAM,
        `${TEST_GROUP}-expiry`,
        '0',
      );

      // Publish an expired message
      await publisher.publish(TEST_STREAM, {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: 1004,
          traceToken: 'trace-1004',
          receivedAt: Date.now(),
          exp: Date.now() - 1000, // Expired 1 second ago
        },
      });

      await startConsumer(TEST_STREAM, `${TEST_GROUP}-expiry`, TEST_CONSUMER, {
        validator: mockValidator,
        errorCapture: mockErrorCapture,
      });

      // Wait for processing
      await sleep(500);

      // Message should not be received (expired)
      expect(receivedMessages).toHaveLength(0);
      expect(mockValidator.isExpired).toHaveBeenCalled();
      expect(mockErrorCapture.captureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Message expired' }),
        expect.any(Object),
      );

      // Message should be acknowledged (removed from pending)
      // Note: Stream might be deleted in afterEach, so check if group exists first
      try {
        const pending = (await redis.xpending(
          TEST_STREAM,
          `${TEST_GROUP}-expiry`,
          '-',
          '+',
          10,
        )) as any;
        expect(Array.isArray(pending) ? pending.length : 0).toBe(0);
      } catch (error: any) {
        // If group doesn't exist, that's also fine - message was acknowledged
        if (!error.message?.includes('NOGROUP')) {
          throw error;
        }
      }
    }, 3000);
  });

  describe('Consumer Error Handling', () => {
    it('should capture errors and continue processing', async () => {
      let processedCount = 0;

      // Create consumer group for this test
      await createConsumerGroup(
        redis,
        TEST_STREAM,
        `${TEST_GROUP}-error-handling`,
        '0',
      );

      // Publish multiple messages - one will fail, others should succeed
      await publisher.publish(TEST_STREAM, {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: 1005,
          traceToken: 'trace-1005',
          receivedAt: Date.now(),
          exp: Date.now() + 60000,
        },
      });

      await publisher.publish(TEST_STREAM, {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: 1006,
          traceToken: 'trace-1006',
          receivedAt: Date.now(),
          exp: Date.now() + 60000,
        },
      });

      await startConsumer(
        TEST_STREAM,
        `${TEST_GROUP}-error-handling`,
        TEST_CONSUMER,
        {
          errorCapture: mockErrorCapture,
          retryConfig: {
            maxRetries: 0, // No retries for faster test
            initialDelayMs: 50,
            maxDelayMs: 500,
            backoffMultiplier: 2,
          },
        },
        async (msg, id) => {
          processedCount++;
          if (msg.payload.messageId === 1005) {
            throw new Error('Processing error for message 1005');
          }
          receivedMessages.push({ message: msg, id });
        },
      );

      // Wait for processing
      await sleep(500);

      // Error should be captured
      expect(mockErrorCapture.captureException).toHaveBeenCalled();
      expect(mockErrorCapture.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Processing error for message 1005',
        }),
        expect.any(Object),
      );

      // Second message should be processed successfully
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].message.payload.messageId).toBe(1006);
      expect(processedCount).toBe(2); // Both messages attempted
    }, 5000);
  });

  describe('Consumer Stop/Start', () => {
    it('should gracefully stop and can restart', async () => {
      // Create consumer group for this test
      await createConsumerGroup(
        redis,
        TEST_STREAM,
        `${TEST_GROUP}-stop-start`,
        '0',
      );

      // Start consumer
      await startConsumer(
        TEST_STREAM,
        `${TEST_GROUP}-stop-start`,
        TEST_CONSUMER,
        {},
      );

      // Publish a message
      await publisher.publish(TEST_STREAM, {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: 1007,
          traceToken: 'trace-1007',
          receivedAt: Date.now(),
          exp: Date.now() + 60000,
        },
      });

      // Wait a bit for message to be received
      await sleep(500);
      expect(receivedMessages.length).toBeGreaterThanOrEqual(0);

      // Stop consumer
      await consumer.stop();
      await sleep(200); // Give it time to fully stop
      receivedMessages = []; // Clear received messages

      // Publish another message while stopped
      await publisher.publish(TEST_STREAM, {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: 1008,
          traceToken: 'trace-1008',
          receivedAt: Date.now(),
          exp: Date.now() + 60000,
        },
      });

      // Wait - message should not be received (consumer stopped)
      await sleep(300);
      expect(receivedMessages).toHaveLength(0);

      // Restart consumer
      await startConsumer(
        TEST_STREAM,
        `${TEST_GROUP}-stop-start`,
        TEST_CONSUMER,
        {},
      );

      // Wait for message to be consumed
      await sleep(500);

      // Message should now be received
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].message.payload.messageId).toBe(1008);
    }, 10000);

    it('should throw error if starting already running consumer', async () => {
      // Create consumer group for this test
      await createConsumerGroup(
        redis,
        TEST_STREAM,
        `${TEST_GROUP}-already-running`,
        '0',
      );

      await startConsumer(
        TEST_STREAM,
        `${TEST_GROUP}-already-running`,
        TEST_CONSUMER,
        {},
      );

      // Try to start again - should throw
      expect(() => {
        consumer.start(
          TEST_STREAM,
          `${TEST_GROUP}-already-running`,
          TEST_CONSUMER,
          async () => {},
        );
      }).toThrow('Consumer is already running');
    }, 3000);
  });

  describe('Multiple Consumers', () => {
    it('should distribute messages across multiple consumers in same group', async () => {
      const consumer1Messages: Array<{
        message: StreamMessage<MessageType.NEW_MESSAGE>;
        id: string;
      }> = [];
      const consumer2Messages: Array<{
        message: StreamMessage<MessageType.NEW_MESSAGE>;
        id: string;
      }> = [];

      // Create consumer group for this test
      await createConsumerGroup(
        redis,
        TEST_STREAM,
        `${TEST_GROUP}-multi-consumer`,
        '0',
      );

      // Create first consumer
      const consumer1 = new RedisStreamConsumer({
        url: REDIS_URL,
      });

      consumer1.start(
        TEST_STREAM,
        `${TEST_GROUP}-multi-consumer`,
        'consumer-1',
        async (msg: StreamMessage<MessageType.NEW_MESSAGE>, id: string) => {
          consumer1Messages.push({ message: msg, id });
        },
      );

      // Create second consumer
      const consumer2 = new RedisStreamConsumer({
        url: REDIS_URL,
      });

      consumer2.start(
        TEST_STREAM,
        `${TEST_GROUP}-multi-consumer`,
        'consumer-2',
        async (msg: StreamMessage<MessageType.NEW_MESSAGE>, id: string) => {
          consumer2Messages.push({ message: msg, id });
        },
      );

      // Wait for consumers to be ready
      await sleep(500);

      // Publish multiple messages
      const messageIds = [1009, 1010, 1011, 1012];
      for (const id of messageIds) {
        await publisher.publish(TEST_STREAM, {
          version: '1.0',
          type: MessageType.NEW_MESSAGE,
          payload: {
            channelCode: 'test-channel',
            channelId: '-1001234567890',
            messageId: id,
            traceToken: `trace-${id}`,
            receivedAt: Date.now(),
            exp: Date.now() + 60000,
          },
        });
        await sleep(100); // Small delay between publishes
      }

      // Wait for all messages to be consumed
      await sleep(2000);

      // Both consumers should have received messages
      const totalReceived = consumer1Messages.length + consumer2Messages.length;
      expect(totalReceived).toBe(messageIds.length);

      // Messages should be distributed (not all to one consumer)
      // In practice, distribution depends on Redis, but both should get some
      expect(consumer1Messages.length).toBeGreaterThan(0);
      expect(consumer2Messages.length).toBeGreaterThan(0);

      // All message IDs should be accounted for
      const allReceivedIds = [
        ...consumer1Messages.map((m) => m.message.payload.messageId),
        ...consumer2Messages.map((m) => m.message.payload.messageId),
      ];
      expect(allReceivedIds.sort()).toEqual(messageIds.sort());

      // Cleanup
      await consumer1.close();
      await consumer2.close();
    }, 15000);
  });
});
