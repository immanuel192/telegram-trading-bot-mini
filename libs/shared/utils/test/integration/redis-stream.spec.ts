/**
 * Integration tests for Redis Stream Publisher and Consumer
 * These tests require a running Redis instance (use npm run stack:up)
 */

import Redis from 'ioredis';
import {
  sleep,
  getTestRedisUrl,
} from '@telegram-trading-bot-mini/shared/test-utils';
import {
  RedisStreamPublisher,
  RedisStreamConsumer,
  StreamTopic,
  StreamMessage,
  IErrorCapture,
  createConsumerGroup,
  deleteStream,
  RedisStreamConsumerConfig,
} from '../../src';
import { MessageType } from '../../src/interfaces/messages/message-type';

const REDIS_URL = getTestRedisUrl();
const TEST_STREAM = StreamTopic.MESSAGES;
const TEST_GROUP = 'test-group';
const TEST_CONSUMER = 'test-consumer';

describe('Redis Stream Integration Tests', () => {
  let publisher: RedisStreamPublisher;
  let consumer: RedisStreamConsumer;
  let redis: Redis;
  let receivedMessages: Array<{
    message: StreamMessage<MessageType.NEW_MESSAGE>;
    id: string;
  }> = [];

  const mockValidator = {
    validate: jest.fn(),
    isExpired: jest.fn(),
  };

  const mockErrorCapture: IErrorCapture = {
    captureException: jest.fn(),
  };

  const startConsumer = async (
    streamTopic: StreamTopic,
    group: string,
    consumerName: string,
    consumerOptions: Pick<
      RedisStreamConsumerConfig,
      'validator' | 'errorCapture' | 'retryConfig'
    > = {},
    handler = async (msg: any, id: any) => {
      receivedMessages.push({ message: msg, id });
      // await consumer.stop(); // Stop after first message
    },
  ) => {
    consumer = new RedisStreamConsumer({
      url: REDIS_URL,
      ...consumerOptions,
    });

    // Start consuming
    consumer.start(streamTopic, group, consumerName, handler);

    // Wait a bit for consumer to be ready
    await new Promise((resolve) => setTimeout(resolve, 1000));
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

    // Clean up test stream FIRST to ensure no old messages
    await deleteStream(redis, TEST_STREAM);

    publisher = new RedisStreamPublisher({
      url: REDIS_URL,
    });

    // Create consumer group before tests using helper function
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

    // Clean up test stream
    await deleteStream(redis, TEST_STREAM);
  });

  afterAll(async () => {
    await publisher.close();
  });

  describe('RedisStreamPublisher', () => {
    it('should publish a message to the stream', async () => {
      const message: StreamMessage<MessageType.NEW_MESSAGE> = {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: 123,
          traceToken: 'trace-123',
          receivedAt: Date.now(),
          exp: Date.now() + 60000, // 1 minute from now
        },
      };

      const entryId = await publisher.publish(TEST_STREAM, message);

      expect(entryId).toBeDefined();
      expect(typeof entryId).toBe('string');
      expect(entryId).toMatch(/^\d+-\d+$/); // Format: timestamp-sequence
    });

    it('should serialize payload correctly', async () => {
      const message: StreamMessage<MessageType.NEW_MESSAGE> = {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: 456,
          traceToken: 'trace-456',
          receivedAt: Date.now(),
          exp: Date.now() + 60000,
        },
      };

      const entryId = await publisher.publish(TEST_STREAM, message);

      // Read the message back directly from Redis
      // Native Redis (ioredis) returns an array of [id, fields] tuples
      const result = await redis.xrange(TEST_STREAM, '-', '+');

      expect(result).toHaveLength(1);
      const [id, fields] = result[0];
      expect(id).toBe(entryId);

      // Fields is an array of [key, value, key, value, ...]
      const fieldsMap: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        fieldsMap[fields[i]] = fields[i + 1];
      }

      expect(fieldsMap['version']).toBeDefined();
      expect(fieldsMap['type']).toBe('NEW_MESSAGE');
      const payloadData = JSON.parse(fieldsMap['payload']);
      expect(payloadData).toEqual({
        channelCode: 'test-channel',
        channelId: '-1001234567890',
        messageId: 456,
        traceToken: 'trace-456',
        receivedAt: expect.any(Number),
        exp: expect.any(Number),
      });
    });
  });

  describe('RedisStreamConsumer', () => {
    it('should consume a message from the stream', async () => {
      await startConsumer(TEST_STREAM, TEST_GROUP, TEST_CONSUMER);

      // Now publish a message
      const message: StreamMessage<MessageType.NEW_MESSAGE> = {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: 789,
          traceToken: 'trace-789',
          receivedAt: Date.now(),
          exp: Date.now() + 60000,
        },
      };
      await publisher.publish(TEST_STREAM, message);
      await sleep(100);

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].message.version).toBe('1.0');
      expect(receivedMessages[0].message.type).toBe(MessageType.NEW_MESSAGE);
      expect(receivedMessages[0].message.payload.messageId).toBe(789);
    }, 2000); // 15 second timeout

    it('should validate messages and skip invalid ones', async () => {
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
      await publisher.publish(TEST_STREAM, {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: 999,
          traceToken: 'trace-999',
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

      // Wait a bit for processing
      await sleep(100);

      // Message should not be received (invalid)
      expect(receivedMessages).toHaveLength(0);
      expect(mockValidator.validate).toHaveBeenCalled();
      expect(mockErrorCapture.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Message validation failed'),
        }),
        expect.any(Object),
      );
    }, 2000);

    it('should skip expired messages', async () => {
      mockValidator.validate.mockResolvedValue(true);
      mockValidator.isExpired.mockReturnValue(true);

      // Publish an expired message
      await publisher.publish(TEST_STREAM, {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: 888,
          traceToken: 'trace-888',
          receivedAt: Date.now(),
          exp: Date.now() - 1000, // Expired 1 second ago
        },
      });

      // Create consumer group for this test
      await createConsumerGroup(
        redis,
        TEST_STREAM,
        `${TEST_GROUP}-expiry`,
        '0',
      );

      await startConsumer(TEST_STREAM, `${TEST_GROUP}-expiry`, TEST_CONSUMER, {
        errorCapture: mockErrorCapture,
      });

      // Message should not be received (expired)
      expect(receivedMessages).toHaveLength(0);
      expect(mockErrorCapture.captureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Message expired' }),
        expect.any(Object),
      );
    }, 2000);

    it('should retry failed message processing', async () => {
      let attemptCount = 0;
      const maxAttempts = 2;

      // Create consumer group for this test
      await createConsumerGroup(redis, TEST_STREAM, `${TEST_GROUP}-retry`, '0');

      // Publish a message
      await publisher.publish(TEST_STREAM, {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: 777,
          traceToken: 'trace-777',
          receivedAt: Date.now(),
          exp: Date.now() + 60000,
        },
      });

      await startConsumer(
        TEST_STREAM,
        `${TEST_GROUP}-retry`,
        TEST_CONSUMER,
        {
          errorCapture: mockErrorCapture,
          retryConfig: {
            maxRetries: maxAttempts,
            initialDelayMs: 100,
            maxDelayMs: 1000,
            backoffMultiplier: 2,
          },
        },
        async () => {
          attemptCount++;
          if (attemptCount <= maxAttempts) {
            throw new Error('Processing failed');
          }
        },
      );

      // Should have attempted maxRetries + 1 times (initial + retries)
      expect(attemptCount).toBe(maxAttempts + 1);
    }, 2000);

    it('should acknowledge message after max retries', async () => {
      // Create consumer group for this test
      await createConsumerGroup(
        redis,
        TEST_STREAM,
        `${TEST_GROUP}-max-retry`,
        '0',
      );

      // Publish a message
      const entryId = await publisher.publish(TEST_STREAM, {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: 666,
          traceToken: 'trace-666',
          receivedAt: Date.now(),
          exp: Date.now() + 60000,
        },
      });

      await startConsumer(
        TEST_STREAM,
        `${TEST_GROUP}-max-retry`,
        TEST_CONSUMER,
        {
          errorCapture: mockErrorCapture,
          retryConfig: {
            maxRetries: 2,
            initialDelayMs: 100,
            maxDelayMs: 1000,
            backoffMultiplier: 2,
          },
        },
        async () => {
          throw new Error('Always fails');
        },
      );

      // Check that error was captured (should be called for max retries exceeded)
      expect(mockErrorCapture.captureException).toHaveBeenCalled();
      // The last call should be for max retries exceeded
      const calls = (mockErrorCapture.captureException as jest.Mock).mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0].message).toBe('Always fails');
      expect(lastCall[1]).toHaveProperty('retries');

      // Message should be acknowledged (removed from pending)
      // Check pending messages using XPENDING with range
      const pending = (await redis.xpending(
        TEST_STREAM,
        `${TEST_GROUP}-max-retry`,
        '-',
        '+',
        10,
      )) as any;

      // pending should be an array of pending messages, empty if all acknowledged
      expect(Array.isArray(pending) ? pending.length : 0).toBe(0);
    }, 2000);

    it('should process multiple messages in order', async () => {
      // Create consumer group for this test
      await createConsumerGroup(redis, TEST_STREAM, `${TEST_GROUP}-multi`, '0');

      // Publish multiple messages
      const messageIds = [101, 102, 103];
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
      }

      await startConsumer(TEST_STREAM, `${TEST_GROUP}-multi`, TEST_CONSUMER, {
        errorCapture: mockErrorCapture,
      });

      expect(receivedMessages.map((i) => i.message.payload.messageId)).toEqual([
        101, 102, 103,
      ]);
    }, 2000);
  });

  describe('Publisher-Consumer Integration', () => {
    it('should handle end-to-end message flow', async () => {
      // Create consumer group for this test
      await createConsumerGroup(redis, TEST_STREAM, `${TEST_GROUP}-e2e`, '0');

      const testMessage = {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: 12345,
          traceToken: 'trace-12345',
          receivedAt: Date.now(),
          exp: Date.now() + 60000,
        },
      };
      await startConsumer(TEST_STREAM, `${TEST_GROUP}-e2e`, TEST_CONSUMER, {
        errorCapture: mockErrorCapture,
      });

      // Publish message
      const publishedId = await publisher.publish(
        TEST_STREAM,
        testMessage as StreamMessage<MessageType.NEW_MESSAGE>,
      );

      // Wait for consumption
      await sleep(200);

      expect(receivedMessages.length).toBe(1);
      expect(receivedMessages[0].message.version).toBe('1.0');
      expect(receivedMessages[0].message.type).toBe(MessageType.NEW_MESSAGE);
      expect(receivedMessages[0].message.payload.messageId).toBe(12345);
      expect(receivedMessages[0].id).toBe(publishedId);
    }, 2000);

    it('should wait for messages when stream is initially empty', async () => {
      // Create consumer group for this test
      await createConsumerGroup(redis, TEST_STREAM, `${TEST_GROUP}-wait`, '0');

      await startConsumer(TEST_STREAM, `${TEST_GROUP}-wait`, TEST_CONSUMER, {
        errorCapture: mockErrorCapture,
      });
      await sleep(200);

      // Verify no message received yet
      expect(receivedMessages.length).toBe(0);

      // Now publish a message
      await publisher.publish(TEST_STREAM, {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: 555,
          traceToken: 'trace-555',
          receivedAt: Date.now(),
          exp: Date.now() + 60000,
        },
      });

      // Wait for consumption
      await sleep(200);

      // Verify message was received
      expect(receivedMessages.length).toBe(1);
      expect(receivedMessages[0].message.payload.messageId).toBe(555);
    }, 2000);

    it('should not lose messages when publisher starts before consumer group is created', async () => {
      // Clean up to ensure no consumer group exists
      await deleteStream(redis, TEST_STREAM);

      // Publisher starts first - publish messages BEFORE consumer group exists
      const publishedIds: string[] = [];
      const messageIds = [201, 202, 203];

      for (const id of messageIds) {
        const entryId = await publisher.publish(TEST_STREAM, {
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
        publishedIds.push(entryId);
      }

      // Verify messages are in the stream
      const streamLength = await redis.xlen(TEST_STREAM);
      expect(streamLength).toBe(3);

      // NOW create consumer group with startId='0' to read from beginning
      await createConsumerGroup(
        redis,
        TEST_STREAM,
        `${TEST_GROUP}-publisher-first`,
        '0', // Start from beginning to get all messages
      );

      await startConsumer(
        TEST_STREAM,
        `${TEST_GROUP}-publisher-first`,
        TEST_CONSUMER,
        {
          errorCapture: mockErrorCapture,
        },
      );

      await sleep(200);

      // Verify all messages were received in order
      expect(receivedMessages.map((i) => i.message.payload.messageId)).toEqual([
        201, 202, 203,
      ]);
    }, 2000);

    it('should lose messages when consumer group is created with startId="$" after publishing', async () => {
      // Clean up to ensure no consumer group exists
      await deleteStream(redis, TEST_STREAM);

      // Publisher starts first - publish messages BEFORE consumer group exists
      const messageIds = [301, 302, 303];

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
      }

      // Verify messages are in the stream
      const streamLength = await redis.xlen(TEST_STREAM);
      expect(streamLength).toBe(3);

      // Create consumer group with startId='$' to read only NEW messages
      await createConsumerGroup(
        redis,
        TEST_STREAM,
        `${TEST_GROUP}-dollar-start`,
        '$', // Start from end - only new messages after this point
      );

      await startConsumer(
        TEST_STREAM,
        `${TEST_GROUP}-dollar-start`,
        TEST_CONSUMER,
        {
          errorCapture: mockErrorCapture,
        },
      );

      await sleep(200);

      // Verify NO old messages were received (they were published before group creation)
      expect(receivedMessages.length).toBe(0);

      // Now publish a NEW message after consumer group exists
      await publisher.publish(TEST_STREAM, {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: 999,
          traceToken: 'trace-999',
          receivedAt: Date.now(),
          exp: Date.now() + 60000,
        },
      });

      // Wait for the new message to be consumed
      await sleep(200);

      // Verify only the NEW message was received
      expect(receivedMessages.length).toBe(1);
      expect(receivedMessages[0].message.payload.messageId).toBe(999);
    }, 2000);
  });
});
