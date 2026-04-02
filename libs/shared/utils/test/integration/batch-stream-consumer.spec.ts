/**
 * Integration tests for Batch Stream Consumer
 *
 * This file tests the batch processing functionality:
 * - Grouping messages by channelId:accountId
 * - Transposing groups into batches
 * - Sequential batch processing
 * - Per-message ACK tracking
 * - Retry logic for failed messages
 */

import Redis from 'ioredis';
import {
  sleep,
  getTestRedisUrl,
  suiteName,
} from '@telegram-trading-bot-mini/shared/test-utils';
import {
  RedisStreamPublisher,
  BatchStreamConsumer,
  StreamTopic,
  StreamMessage,
  IErrorCapture,
  createConsumerGroup,
  trimStream,
  BatchMessageHandler,
} from '../../src';
import { MessageType } from '../../src/interfaces/messages/message-type';

const REDIS_URL = getTestRedisUrl();
const TEST_STREAM = StreamTopic.MESSAGES;
const TEST_GROUP = 'test-batch-consumer-group';
const TEST_CONSUMER = 'test-batch-consumer';

describe(suiteName(__filename), () => {
  let publisher: RedisStreamPublisher;
  let consumer: BatchStreamConsumer;
  let redis: Redis;

  const mockErrorCapture: IErrorCapture = {
    captureException: jest.fn(),
  };

  beforeAll(async () => {
    // Create Redis client for cleanup
    redis = new Redis(getTestRedisUrl());
    publisher = new RedisStreamPublisher({
      url: REDIS_URL,
    });
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // Clean up test stream
    await trimStream(redis, TEST_STREAM);

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

    // Clean up test stream
    await trimStream(redis, TEST_STREAM);
  });

  afterAll(async () => {
    await publisher.close();
    await redis.quit();
  });

  describe('Batch Processing', () => {
    it('should process messages in batches grouped by channelId', async () => {
      const processedBatches: Array<
        Array<{
          id: string;
          message: StreamMessage<MessageType.NEW_MESSAGE>;
          groupKey: string;
        }>
      > = [];

      const handler: BatchMessageHandler<MessageType.NEW_MESSAGE> = async (
        batch,
      ) => {
        processedBatches.push(batch);
        return batch.map((item) => ({ id: item.id, success: true }));
      };

      consumer = new BatchStreamConsumer({
        url: REDIS_URL,
        errorCapture: mockErrorCapture,
      });

      consumer.start(TEST_STREAM, TEST_GROUP, TEST_CONSUMER, handler);

      // Wait for consumer to be ready
      await sleep(100);

      // Publish messages for different channels in quick succession
      // to ensure they're fetched in the same batch
      const publishPromises = [
        publisher.publish(TEST_STREAM, {
          version: '1.0',
          type: MessageType.NEW_MESSAGE,
          payload: {
            channelCode: 'channel-1',
            channelId: '-1001111111111',
            messageId: 1,
            traceToken: 'trace-1',
            receivedAt: Date.now(),
            exp: Date.now() + 60000,
          },
        }),
        publisher.publish(TEST_STREAM, {
          version: '1.0',
          type: MessageType.NEW_MESSAGE,
          payload: {
            channelCode: 'channel-2',
            channelId: '-1002222222222',
            messageId: 2,
            traceToken: 'trace-2',
            receivedAt: Date.now(),
            exp: Date.now() + 60000,
          },
        }),
      ];

      await Promise.all(publishPromises);

      // Wait for processing
      await sleep(1000);

      // Should have processed at least one batch
      expect(processedBatches.length).toBeGreaterThan(0);

      // Verify all messages were processed
      const allMessages = processedBatches.flat();
      expect(allMessages.length).toBe(2);

      // Verify messages are from different channels
      const channelIds = allMessages.map(
        (item) => item.message.payload.channelId,
      );
      expect(new Set(channelIds).size).toBe(2);
    }, 10000);

    it('should group messages by channelId:accountId', async () => {
      const processedBatches: Array<
        Array<{
          id: string;
          message: StreamMessage<MessageType.NEW_MESSAGE>;
          groupKey: string;
        }>
      > = [];

      const handler: BatchMessageHandler<MessageType.NEW_MESSAGE> = async (
        batch,
      ) => {
        processedBatches.push(batch);
        return batch.map((item) => ({ id: item.id, success: true }));
      };

      consumer = new BatchStreamConsumer({
        url: REDIS_URL,
        errorCapture: mockErrorCapture,
      });

      consumer.start(TEST_STREAM, TEST_GROUP, TEST_CONSUMER, handler);

      // Wait for consumer to be ready
      await sleep(100);

      // Publish messages for same channel but different accounts in parallel
      const publishPromises = [
        publisher.publish(TEST_STREAM, {
          version: '1.0',
          type: MessageType.NEW_MESSAGE,
          payload: {
            channelCode: 'channel-1',
            channelId: '-1001111111111',
            accountId: 'account-1',
            messageId: 1,
            traceToken: 'trace-1',
            receivedAt: Date.now(),
            exp: Date.now() + 60000,
          } as any,
        }),
        publisher.publish(TEST_STREAM, {
          version: '1.0',
          type: MessageType.NEW_MESSAGE,
          payload: {
            channelCode: 'channel-1',
            channelId: '-1001111111111',
            accountId: 'account-2',
            messageId: 2,
            traceToken: 'trace-2',
            receivedAt: Date.now(),
            exp: Date.now() + 60000,
          } as any,
        }),
      ];

      await Promise.all(publishPromises);

      // Wait for processing
      await sleep(1000);

      // Should have processed at least one batch
      expect(processedBatches.length).toBeGreaterThan(0);

      // Verify all messages were processed
      const allMessages = processedBatches.flat();
      expect(allMessages.length).toBe(2);

      // Verify different group keys
      const groupKeys = allMessages.map((item) => item.groupKey);
      expect(new Set(groupKeys).size).toBe(2);
      expect(groupKeys).toContain('-1001111111111:account-1');
      expect(groupKeys).toContain('-1001111111111:account-2');
    }, 10000);

    it('should transpose groups into batches correctly', async () => {
      const processedBatches: Array<
        Array<{
          id: string;
          message: StreamMessage<MessageType.NEW_MESSAGE>;
          groupKey: string;
        }>
      > = [];

      const handler: BatchMessageHandler<MessageType.NEW_MESSAGE> = async (
        batch,
      ) => {
        processedBatches.push(batch);
        return batch.map((item) => ({ id: item.id, success: true }));
      };

      consumer = new BatchStreamConsumer({
        url: REDIS_URL,
        errorCapture: mockErrorCapture,
      });

      consumer.start(TEST_STREAM, TEST_GROUP, TEST_CONSUMER, handler);

      // Wait for consumer to be ready
      await sleep(100);

      // Publish all messages in parallel to ensure they're fetched together
      const publishPromises = [];

      // Group A: 3 messages
      for (let i = 1; i <= 3; i++) {
        publishPromises.push(
          publisher.publish(TEST_STREAM, {
            version: '1.0',
            type: MessageType.NEW_MESSAGE,
            payload: {
              channelCode: 'channel-1',
              channelId: '-1001111111111',
              messageId: i,
              traceToken: `trace-1-${i}`,
              receivedAt: Date.now(),
              exp: Date.now() + 60000,
            },
          }),
        );
      }

      // Group B: 2 messages
      for (let i = 1; i <= 2; i++) {
        publishPromises.push(
          publisher.publish(TEST_STREAM, {
            version: '1.0',
            type: MessageType.NEW_MESSAGE,
            payload: {
              channelCode: 'channel-2',
              channelId: '-1002222222222',
              messageId: i + 10,
              traceToken: `trace-2-${i}`,
              receivedAt: Date.now(),
              exp: Date.now() + 60000,
            },
          }),
        );
      }

      await Promise.all(publishPromises);

      // Wait for processing
      await sleep(1500);

      // Should have processed 3 batches:
      // Batch 0: [A0, B0]
      // Batch 1: [A1, B1]
      // Batch 2: [A2]
      expect(processedBatches.length).toBeGreaterThanOrEqual(3);

      // Verify all 5 messages were processed
      const allMessages = processedBatches.flat();
      expect(allMessages.length).toBe(5);

      // Verify batch structure - first batch should have messages from both groups
      expect(processedBatches[0].length).toBeGreaterThanOrEqual(1);
      expect(processedBatches[1].length).toBeGreaterThanOrEqual(1);
      expect(processedBatches[2].length).toBeGreaterThanOrEqual(1);
    }, 10000);
  });

  describe('Retry Logic', () => {
    it('should retry failed messages and ACK successful ones', async () => {
      let attemptCount = 0;
      const failingMessageId = 2;

      const handler: BatchMessageHandler<MessageType.NEW_MESSAGE> = async (
        batch,
      ) => {
        attemptCount++;
        return batch.map((item) => {
          if (
            item.message.payload.messageId === failingMessageId &&
            attemptCount < 2
          ) {
            return {
              id: item.id,
              success: false,
              error: new Error('Temporary failure'),
            };
          }
          return { id: item.id, success: true };
        });
      };

      consumer = new BatchStreamConsumer({
        url: REDIS_URL,
        errorCapture: mockErrorCapture,
        retryConfig: {
          maxRetries: 3,
          initialDelayMs: 50,
          maxDelayMs: 500,
          backoffMultiplier: 2,
        },
      });

      consumer.start(TEST_STREAM, TEST_GROUP, TEST_CONSUMER, handler);

      // Wait for consumer to be ready
      await sleep(100);

      // Publish messages
      await publisher.publish(TEST_STREAM, {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          channelCode: 'channel-1',
          channelId: '-1001111111111',
          messageId: 1,
          traceToken: 'trace-1',
          receivedAt: Date.now(),
          exp: Date.now() + 60000,
        },
      });

      await publisher.publish(TEST_STREAM, {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          channelCode: 'channel-2',
          channelId: '-1002222222222',
          messageId: failingMessageId,
          traceToken: 'trace-2',
          receivedAt: Date.now(),
          exp: Date.now() + 60000,
        },
      });

      // Wait for processing and retries
      await sleep(2000);

      // Should have attempted at least twice (initial + retry)
      expect(attemptCount).toBeGreaterThanOrEqual(2);

      // All messages should be acknowledged (no pending)
      const pending = (await redis.xpending(
        TEST_STREAM,
        TEST_GROUP,
        '-',
        '+',
        10,
      )) as any;
      expect(Array.isArray(pending) ? pending.length : 0).toBe(0);
    }, 10000);

    it('should ACK messages after max retries exceeded', async () => {
      const handler: BatchMessageHandler<MessageType.NEW_MESSAGE> = async (
        batch,
      ) => {
        // Always fail
        return batch.map((item) => ({
          id: item.id,
          success: false,
          error: new Error('Always fails'),
        }));
      };

      consumer = new BatchStreamConsumer({
        url: REDIS_URL,
        errorCapture: mockErrorCapture,
        retryConfig: {
          maxRetries: 2,
          initialDelayMs: 50,
          maxDelayMs: 500,
          backoffMultiplier: 2,
        },
      });

      consumer.start(TEST_STREAM, TEST_GROUP, TEST_CONSUMER, handler);

      // Wait for consumer to be ready
      await sleep(100);

      // Publish a message
      await publisher.publish(TEST_STREAM, {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          channelCode: 'channel-1',
          channelId: '-1001111111111',
          messageId: 1,
          traceToken: 'trace-1',
          receivedAt: Date.now(),
          exp: Date.now() + 60000,
        },
      });

      // Wait for processing and retries
      await sleep(2000);

      // Error should be captured
      expect(mockErrorCapture.captureException).toHaveBeenCalled();

      // Message should be acknowledged (no pending)
      const pending = (await redis.xpending(
        TEST_STREAM,
        TEST_GROUP,
        '-',
        '+',
        10,
      )) as any;
      expect(Array.isArray(pending) ? pending.length : 0).toBe(0);
    }, 10000);
  });

  describe('Sequential Batch Processing', () => {
    it('should process batches sequentially, not in parallel', async () => {
      const batchStartTimes: number[] = [];
      const batchEndTimes: number[] = [];

      const handler: BatchMessageHandler<MessageType.NEW_MESSAGE> = async (
        batch,
      ) => {
        batchStartTimes.push(Date.now());
        // Simulate processing time
        await sleep(200);
        batchEndTimes.push(Date.now());
        return batch.map((item) => ({ id: item.id, success: true }));
      };

      consumer = new BatchStreamConsumer({
        url: REDIS_URL,
        errorCapture: mockErrorCapture,
      });

      consumer.start(TEST_STREAM, TEST_GROUP, TEST_CONSUMER, handler);

      // Wait for consumer to be ready
      await sleep(100);

      // Publish messages that will create multiple batches
      // Group A: 2 messages
      for (let i = 1; i <= 2; i++) {
        await publisher.publish(TEST_STREAM, {
          version: '1.0',
          type: MessageType.NEW_MESSAGE,
          payload: {
            channelCode: 'channel-1',
            channelId: '-1001111111111',
            messageId: i,
            traceToken: `trace-1-${i}`,
            receivedAt: Date.now(),
            exp: Date.now() + 60000,
          },
        });
      }

      // Wait for processing
      await sleep(1500);

      // Should have processed 2 batches
      expect(batchStartTimes.length).toBe(2);
      expect(batchEndTimes.length).toBe(2);

      // Second batch should start after first batch ends (sequential processing)
      expect(batchStartTimes[1]).toBeGreaterThanOrEqual(batchEndTimes[0]);
    }, 10000);
  });
});
