/**
 * Integration tests for Redis Stream Publisher
 * These tests require a running Redis instance (use npm run stack:up)
 */

// Mock Sentry before imports
jest.mock('@sentry/node', () => ({
  startSpan: jest.fn((options, callback) => {
    const mockSpan = {
      setAttribute: jest.fn(),
      setData: jest.fn(),
      setStatus: jest.fn(),
      end: jest.fn(),
    };
    return callback(mockSpan);
  }),
  getTraceData: jest.fn(() => ({
    'sentry-trace': 'mock-trace-header',
    baggage: 'mock-baggage',
  })),
}));

import Redis from 'ioredis';
import {
  sleep,
  getTestRedisUrl,
} from '@telegram-trading-bot-mini/shared/test-utils';
import {
  RedisStreamPublisher,
  StreamTopic,
  StreamMessage,
  trimStream,
} from '../../src';
import { MessageType } from '../../src/interfaces/messages/message-type';
import { LoggerInstance } from '../../src/interfaces';

const REDIS_URL = getTestRedisUrl();
const TEST_STREAM = StreamTopic.MESSAGES;

describe('RedisStreamPublisher', () => {
  let publisher: RedisStreamPublisher;
  let redis: Redis;
  let mockLogger: LoggerInstance;

  beforeAll(async () => {
    // Create Redis client for verification
    redis = new Redis(getTestRedisUrl());

    // Create mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      fatal: jest.fn(),
    } as any;
  });

  beforeEach(async () => {
    publisher = new RedisStreamPublisher({
      url: REDIS_URL,
      logger: mockLogger,
    });

    // Clean up test stream
    await trimStream(redis, TEST_STREAM);
  });

  afterEach(async () => {
    await publisher.close();
    // Clean up test stream
    await trimStream(redis, TEST_STREAM);
  });

  describe('constructor', () => {
    it('should create a publisher with valid config', () => {
      expect(publisher).toBeDefined();
      expect(publisher.client).toBeDefined();
    });

    it('should create a publisher without logger', () => {
      const publisherWithoutLogger = new RedisStreamPublisher({
        url: REDIS_URL,
      });

      expect(publisherWithoutLogger).toBeDefined();
      expect(publisherWithoutLogger.client).toBeDefined();
    });
  });

  describe('publish', () => {
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
          exp: Date.now() + 60000,
        },
      };

      const entryId = await publisher.publish(TEST_STREAM, message);

      expect(entryId).toBeDefined();
      expect(typeof entryId).toBe('string');
      expect(entryId).toMatch(/^\d+-\d+$/); // Format: timestamp-sequence
    });

    it('should serialize payload as JSON string', async () => {
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

    it('should log debug message when logger is provided', async () => {
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

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: TEST_STREAM,
          entryId: expect.any(String),
          type: MessageType.NEW_MESSAGE,
        }),
        'Published message to stream',
      );
    });

    it('should publish multiple messages in sequence', async () => {
      const messageIds = [101, 102, 103];
      const publishedIds: string[] = [];

      for (const id of messageIds) {
        const message: StreamMessage<MessageType.NEW_MESSAGE> = {
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
        };

        const entryId = await publisher.publish(TEST_STREAM, message);
        publishedIds.push(entryId);
      }

      expect(publishedIds).toHaveLength(3);
      expect(new Set(publishedIds).size).toBe(3); // All IDs should be unique

      // Verify all messages are in the stream
      const streamLength = await redis.xlen(TEST_STREAM);
      expect(streamLength).toBe(3);
    });

    it('should handle messages with optional traceToken', async () => {
      const message: StreamMessage<MessageType.NEW_MESSAGE> = {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: 999,
          traceToken: 'test-trace-token-123',
          receivedAt: Date.now(),
          exp: Date.now() + 60000,
        },
      };

      const entryId = await publisher.publish(TEST_STREAM, message);

      // Read the message back
      // Native Redis (ioredis) returns an array of [id, fields] tuples
      const result = await redis.xrange(TEST_STREAM, entryId, entryId);

      expect(result).toHaveLength(1);
      const [, fields] = result[0];

      // Fields is an array of [key, value, key, value, ...]
      const fieldsMap: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        fieldsMap[fields[i]] = fields[i + 1];
      }

      const payloadData = JSON.parse(fieldsMap['payload']);
      expect(payloadData.traceToken).toBe('test-trace-token-123');
    });

    it('should inject Sentry trace context into published messages', async () => {
      const message: StreamMessage<MessageType.NEW_MESSAGE> = {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: 888,
          traceToken: 'trace-888',
          receivedAt: Date.now(),
          exp: Date.now() + 60000,
        },
      };

      const entryId = await publisher.publish(TEST_STREAM, message);

      // Read the message back from Redis
      const result = await redis.xrange(TEST_STREAM, entryId, entryId);

      expect(result).toHaveLength(1);
      const [, fields] = result[0];

      // Fields is an array of [key, value, key, value, ...]
      const fieldsMap: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        fieldsMap[fields[i]] = fields[i + 1];
      }

      // Verify Sentry trace context fields are present
      expect(fieldsMap['_sentryTrace']).toBeDefined();
      expect(fieldsMap['_sentryTrace']).toBe('mock-trace-header');
      expect(fieldsMap['_sentryBaggage']).toBeDefined();
      expect(fieldsMap['_sentryBaggage']).toBe('mock-baggage');

      // Verify original payload is preserved
      const payloadData = JSON.parse(fieldsMap['payload']);
      expect(payloadData.traceToken).toBe('trace-888');
      expect(payloadData.messageId).toBe(888);
    });

    it('should auto-generate entry ID with timestamp', async () => {
      const beforeTimestamp = Date.now() - 50; // Add 50ms buffer for Sentry span overhead

      const message: StreamMessage<MessageType.NEW_MESSAGE> = {
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
      };

      const entryId = await publisher.publish(TEST_STREAM, message);
      const afterTimestamp = Date.now() + 50; // Add 50ms buffer for Sentry span overhead

      // Parse the entry ID timestamp
      const [timestampPart] = entryId.split('-');
      const entryTimestamp = parseInt(timestampPart, 10);

      // Entry timestamp should be between before and after (with buffer)
      expect(entryTimestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(entryTimestamp).toBeLessThanOrEqual(afterTimestamp);
    });
  });

  describe('close', () => {
    it('should close without errors', async () => {
      // Create a separate publisher instance for this test
      // to avoid conflict with afterEach cleanup
      const testPublisher = new RedisStreamPublisher({
        url: REDIS_URL,
        logger: mockLogger,
      });

      await expect(testPublisher.close()).resolves.toBeUndefined();
    });
  });

  describe('client getter', () => {
    it('should return the Redis client instance', () => {
      const client = publisher.client;
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(Redis);
    });
  });
});
