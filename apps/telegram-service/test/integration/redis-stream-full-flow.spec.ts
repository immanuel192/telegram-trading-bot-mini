/**
 * Full flow integration test for telegram-service with Redis Stream
 *
 * This test validates the complete message processing pipeline:
 * 1. Telegram message received via mtcute (mocked)
 * 2. Message processed by TelegramClientService
 * 3. Message persisted to MongoDB
 * 4. Message published to Redis Stream
 * 5. Message consumed from Redis Stream
 *
 * Requirements:
 * - Running MongoDB instance (use npm run stack:up)
 * - Running Redis instance (use npm run stack:up)
 *
 * Future: Can be extended to test QStash integration
 */

import Redis from 'ioredis';
import {
  RedisStreamConsumer,
  StreamTopic,
  StreamMessage,
  createConsumerGroup,
  trimStream,
  RedisStreamConsumerConfig,
  ServiceName,
} from '@telegram-trading-bot-mini/shared/utils';
import { MessageType } from '@telegram-trading-bot-mini/shared/utils/interfaces/messages/message-type';
import {
  cleanupDb,
  sleep,
  suiteName,
} from '@telegram-trading-bot-mini/shared/test-utils';
import { TelegramClient } from '@mtcute/node';
import { Message } from '@mtcute/core';
import * as Sentry from '@sentry/node';
import {
  telegramChannelRepository,
  telegramMessageRepository,
  configRepository,
  init,
} from '@dal';
import { TelegramChannel } from '@dal/models';

import { createContainer } from '../../src/container';
import { Container } from '../../src/interfaces';
import { config } from '../../src/config';
import { logger } from '../../src/logger';
import { TELEGRAM_SESSION_KEY_ID } from '../../src/services/telegram-client.service';

const TEST_STREAM = StreamTopic.MESSAGES;
const TEST_GROUP = 'test-telegram-service';
const TEST_CONSUMER = 'test-telegram-consumer';

describe(suiteName(__filename), () => {
  const channelCode = 'test-channel';
  let container: Container | null = null;
  let redis: Redis;
  let consumer: RedisStreamConsumer;
  let receivedMessages: Array<{
    message: StreamMessage<MessageType.NEW_MESSAGE>;
    id: string;
  }> = [];

  beforeAll(async () => {
    // Create Redis client for stream operations
    redis = new Redis(config('REDIS_URL'));
    // Initialize database connection
    await init(config, logger);
  }, 15000); // 15 second timeout for database initialization

  beforeEach(async () => {
    receivedMessages = [];

    await trimStream(redis, TEST_STREAM);
    // Create consumer group for testing
    await createConsumerGroup(redis, TEST_STREAM, TEST_GROUP, '0');

    // Clean up test data
    try {
      await cleanupDb();
    } catch (error) {
      // Ignore cleanup errors
    }

    // do not init server here, init in each test
  }, 10000); // 10 second timeout for setup

  afterEach(async () => {
    // Stop consumer if running - IMPORTANT: stop before close to prevent hanging
    if (consumer) {
      try {
        // Stop first to break out of consume loop
        await consumer.stop();
        // Then close the Redis connection
        await consumer.close();
      } catch (error: any) {
        // Ignore "Connection is closed" errors during cleanup
        if (!error.message?.includes('Connection is closed')) {
          console.error('Error closing consumer:', error);
          // Don't throw - allow cleanup to continue
        }
      }
    }

    // Clean up service components manually (without closing DB)
    if (container) {
      try {
        // Disconnect telegram service
        await container.telegramService.disconnect();

        // Close stream publisher
        await container.streamPublisher.close();
      } catch (error) {
        console.error('Error cleaning up container:', error);
        // Don't throw - allow cleanup to continue
      }

      container = null;
    }
  }, 10000); // 10 second timeout - if cleanup takes longer, something is fundamentally wrong

  const setupTelegramAccount = async (
    channel: Partial<TelegramChannel> = {},
    sessionId: string = 'test-session-string',
  ) => {
    // Setup: Create a test channel in the database
    const testChannel: TelegramChannel = {
      channelCode,
      url: 'https://t.me/c/123456789/1',
      channelId: '123456789',
      accessHash: 'test-access-hash',
      isActive: true,
      createdOn: new Date(),
      ...channel,
    };
    await telegramChannelRepository.create(testChannel);

    // Setup: Store telegram session in config
    await configRepository.setValue(TELEGRAM_SESSION_KEY_ID, sessionId);

    return {
      channel: testChannel,
      sessionId,
    };
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
      url: config('REDIS_URL'),
      ...consumerOptions,
    });

    // Start consuming
    consumer.start(streamTopic, group, consumerName, handler);
    await sleep(500);
  };

  describe('Full Flow - Message Processing to Redis Stream', () => {
    it('should process a new Telegram message and publish to Redis Stream', async () => {
      // Setup: Create a test channel in the database
      const { channel: testChannel } = await setupTelegramAccount();

      // Create container and connect telegram service (sets up queues and listeners)
      container = createContainer(logger);
      await container.telegramService.connect();

      await startConsumer(TEST_STREAM, TEST_GROUP, TEST_CONSUMER);
      // Act: Simulate a new message from Telegram
      const mockMessage: Partial<Message> = {
        id: 12345,
        text: 'Test message from Telegram',
        date: new Date(),
        chat: {
          id: 123456789, // Matches channelId
        } as any,
        isAutomaticForward: false,
        isChannelPost: true,
      };

      // Get the mocked TelegramClient instance and its onNewMessage handler
      // Use the latest mock instance (important for multiple tests)
      const MockedTelegramClient = jest.mocked(TelegramClient);
      const mockResults = MockedTelegramClient.mock.results;
      const mockInstance = mockResults[mockResults.length - 1]?.value;
      const mockOnNewMessageAdd = jest.mocked(mockInstance.onNewMessage.add);
      const onNewMessageHandler = mockOnNewMessageAdd.mock.calls[0]?.[0];
      expect(onNewMessageHandler).toBeDefined();

      // Trigger the message handler
      onNewMessageHandler(mockMessage as Message);

      // Wait for async processing: queue -> database -> Redis publish -> consumer
      await sleep(300);

      // Assert: Verify message was published to Redis Stream
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].message.version).toBe('1.0');
      expect(receivedMessages[0].message.type).toBe(MessageType.NEW_MESSAGE);
      expect(receivedMessages[0].message.payload.channelId).toBe('123456789');
      expect(receivedMessages[0].message.payload.channelCode).toBe(channelCode);
      expect(receivedMessages[0].message.payload.messageId).toBe(12345);
      expect(receivedMessages[0].message.payload.exp).toBeGreaterThan(0);

      // Assert: Verify message was persisted to database
      const savedMessage =
        await telegramMessageRepository.findByChannelAndMessageId(
          '123456789', // channelId, not channelCode
          12345,
        );
      expect(savedMessage).toBeDefined();
      expect(savedMessage?.message).toBe('Test message from Telegram');
      expect(savedMessage?.channelCode).toBe(channelCode);
      expect(savedMessage?.messageId).toBe(12345);

      // Assert: Verify history was tracked
      expect(savedMessage?.history).toHaveLength(1);
      expect(savedMessage?.history[0].fromService).toBe(
        ServiceName.TELEGRAM_SERVICE,
      );
      expect(savedMessage?.history[0].targetService).toBe(
        ServiceName.INTERPRET_SERVICE,
      );
      expect(savedMessage?.history[0].streamEvent?.messageEventType).toBe(
        'NEW_MESSAGE',
      );
      // The stream message ID in history should match the one received from Redis
      // Note: receivedMessages[0].id is the Redis Stream ID (e.g. "1700000000000-0")
      expect(savedMessage?.history[0].streamEvent?.messageId).toBe(
        receivedMessages[0].id,
      );
    }, 3000);

    it('should handle message with quoted message (reply)', async () => {
      // Setup: Create a previous message that will be quoted
      await telegramMessageRepository.create({
        channelCode,
        channelId: '123456789',
        messageId: 100,
        message: 'Original message',
        hasMedia: false,
        hashTags: [],
        sentAt: new Date(),
        receivedAt: new Date(),
        history: [],
      });

      // Setup: Create test channel and connect service
      await setupTelegramAccount();
      container = createContainer(logger);
      await container.telegramService.connect();

      // Start consumer
      await startConsumer(TEST_STREAM, TEST_GROUP, TEST_CONSUMER);

      // Act: Simulate a reply message
      const mockMessage: Partial<Message> = {
        id: 200,
        text: 'Reply to original message',
        date: new Date(),
        chat: {
          id: 123456789,
        } as any,
        isAutomaticForward: false,
        isChannelPost: true,
        replyToMessage: {
          id: 100, // References the original message
        } as any,
      };

      // Get the mocked TelegramClient instance and its onNewMessage handler
      // Use the latest mock instance (important for multiple tests)
      const MockedTelegramClient = jest.mocked(TelegramClient);
      const mockResults = MockedTelegramClient.mock.results;
      const mockInstance = mockResults[mockResults.length - 1]?.value;
      const mockOnNewMessageAdd = jest.mocked(mockInstance.onNewMessage.add);
      const onNewMessageHandler = mockOnNewMessageAdd.mock.calls[0]?.[0];
      expect(onNewMessageHandler).toBeDefined();

      // Trigger the message handler
      onNewMessageHandler(mockMessage as Message);

      // Wait for async processing: queue -> database -> Redis publish -> consumer
      await sleep(300);

      // Assert: Verify message was published to Redis Stream
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].message.payload.messageId).toBe(200);

      // Assert: Verify quoted message was populated in database
      const savedMessage =
        await telegramMessageRepository.findByChannelAndMessageId(
          '123456789', // channelId
          200,
        );
      expect(savedMessage).toBeDefined();
      expect(savedMessage?.message).toBe('Reply to original message');
      expect(savedMessage?.quotedMessage).toBeDefined();
      expect(savedMessage?.quotedMessage?.id).toBe(100);
      expect(savedMessage?.quotedMessage?.message).toBe('Original message');
    }, 3000);

    it('should handle message with previous message context', async () => {
      // Setup: Create a previous message
      await telegramMessageRepository.create({
        channelCode,
        channelId: '123456789',
        messageId: 50,
        message: 'Previous message',
        hasMedia: false,
        hashTags: [],
        sentAt: new Date(),
        receivedAt: new Date(),
        history: [],
      });

      // Setup: Create test channel and connect service
      await setupTelegramAccount();
      container = createContainer(logger);
      await container.telegramService.connect();

      // Start consumer
      await startConsumer(TEST_STREAM, TEST_GROUP, TEST_CONSUMER);

      // Act: Send a new message (with higher ID)
      const mockMessage: Partial<Message> = {
        id: 51,
        text: 'New message after previous',
        date: new Date(),
        chat: {
          id: 123456789,
        } as any,
        isAutomaticForward: false,
        isChannelPost: true,
      };

      // Get the mocked TelegramClient instance and its onNewMessage handler
      // Use the latest mock instance (important for multiple tests)
      const MockedTelegramClient = jest.mocked(TelegramClient);
      const mockResults = MockedTelegramClient.mock.results;
      const mockInstance = mockResults[mockResults.length - 1]?.value;
      const mockOnNewMessageAdd = jest.mocked(mockInstance.onNewMessage.add);
      const onNewMessageHandler = mockOnNewMessageAdd.mock.calls[0]?.[0];
      expect(onNewMessageHandler).toBeDefined();

      // Trigger the message handler
      onNewMessageHandler(mockMessage as Message);

      // Wait for async processing: queue -> database -> Redis publish -> consumer
      await sleep(300);

      // Assert: Verify message was published to Redis Stream
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].message.payload.messageId).toBe(51);

      // Assert: Verify prevMessage was populated in database
      const savedMessage =
        await telegramMessageRepository.findByChannelAndMessageId(
          '123456789', // channelId
          51,
        );
      expect(savedMessage).toBeDefined();
      expect(savedMessage?.message).toBe('New message after previous');
      expect(savedMessage?.prevMessage).toBeDefined();
      expect(savedMessage?.prevMessage?.id).toBe(50);
      expect(savedMessage?.prevMessage?.message).toBe('Previous message');
    }, 3000);

    it('should skip messages from non-active channels', async () => {
      // Setup: Create an inactive channel
      const inactiveChannel: TelegramChannel = {
        channelCode: 'inactive-channel',
        url: 'https://t.me/c/999999999/1',
        channelId: '999999999',
        accessHash: 'test-access-hash',
        isActive: false,
        createdOn: new Date(),
      };
      await telegramChannelRepository.create(inactiveChannel);

      // Setup: Create active test channel and connect service
      await setupTelegramAccount();
      container = createContainer(logger);
      await container.telegramService.connect();

      // Start consumer
      await startConsumer(TEST_STREAM, TEST_GROUP, TEST_CONSUMER);

      // Act: Send message from inactive channel
      const mockMessage: Partial<Message> = {
        id: 999,
        text: 'Message from inactive channel',
        date: new Date(),
        chat: {
          id: 999999999, // Inactive channel
        } as any,
        isAutomaticForward: false,
        isChannelPost: true,
      };

      // Get the mocked TelegramClient instance and its onNewMessage handler
      // Use the latest mock instance (important for multiple tests)
      const MockedTelegramClient = jest.mocked(TelegramClient);
      const mockResults = MockedTelegramClient.mock.results;
      const mockInstance = mockResults[mockResults.length - 1]?.value;
      const mockOnNewMessageAdd = jest.mocked(mockInstance.onNewMessage.add);
      const onNewMessageHandler = mockOnNewMessageAdd.mock.calls[0]?.[0];
      expect(onNewMessageHandler).toBeDefined();

      // Trigger the message handler
      onNewMessageHandler(mockMessage as Message);

      // Wait for potential processing
      await sleep(300);

      // Assert: No messages should be published to Redis Stream
      expect(receivedMessages).toHaveLength(0);

      // Assert: No messages should be saved to database
      const savedMessage =
        await telegramMessageRepository.findByChannelAndMessageId(
          '999999999', // channelId for inactive channel
          999,
        );
      expect(savedMessage).toBeNull();
    }, 3000);

    it('should skip automatic forwards (comments)', async () => {
      // Setup: Create test channel and connect service
      await setupTelegramAccount();
      container = createContainer(logger);
      await container.telegramService.connect();

      // Start consumer
      await startConsumer(TEST_STREAM, TEST_GROUP, TEST_CONSUMER);

      // Act: Send an automatic forward (comment)
      const mockMessage: Partial<Message> = {
        id: 777,
        text: 'This is a comment',
        date: new Date(),
        chat: {
          id: 123456789,
        } as any,
        isAutomaticForward: true, // This marks it as a comment
        isChannelPost: false,
      };

      // Get the mocked TelegramClient instance and its onNewMessage handler
      // Use the latest mock instance (important for multiple tests)
      const MockedTelegramClient = jest.mocked(TelegramClient);
      const mockResults = MockedTelegramClient.mock.results;
      const mockInstance = mockResults[mockResults.length - 1]?.value;
      const mockOnNewMessageAdd = jest.mocked(mockInstance.onNewMessage.add);
      const onNewMessageHandler = mockOnNewMessageAdd.mock.calls[0]?.[0];
      expect(onNewMessageHandler).toBeDefined();

      // Trigger the message handler
      onNewMessageHandler(mockMessage as Message);

      // Wait for potential processing
      await sleep(300);

      // Assert: No messages should be published (comments are filtered)
      expect(receivedMessages).toHaveLength(0);

      // Assert: No messages should be saved to database
      const savedMessage =
        await telegramMessageRepository.findByChannelAndMessageId(
          '123456789', // channelId
          777,
        );
      expect(savedMessage).toBeNull();
    }, 3000);
  });

  describe('Multiple Messages Flow', () => {
    it('should process multiple messages in sequence and publish all to stream', async () => {
      // Setup: Create test channel and connect service
      await setupTelegramAccount();
      container = createContainer(logger);
      await container.telegramService.connect();

      // Start consumer
      await startConsumer(TEST_STREAM, TEST_GROUP, TEST_CONSUMER);

      // Get the mocked TelegramClient instance and its onNewMessage handler
      // Use the latest mock instance (important for multiple tests)
      const MockedTelegramClient = jest.mocked(TelegramClient);
      const mockResults = MockedTelegramClient.mock.results;
      const mockInstance = mockResults[mockResults.length - 1]?.value;
      const mockOnNewMessageAdd = jest.mocked(mockInstance.onNewMessage.add);
      const onNewMessageHandler = mockOnNewMessageAdd.mock.calls[0]?.[0];
      expect(onNewMessageHandler).toBeDefined();

      // Act: Send multiple messages
      for (let i = 1; i <= 3; i++) {
        const mockMessage: Partial<Message> = {
          id: i,
          text: `Message ${i}`,
          date: new Date(),
          chat: {
            id: 123456789,
          } as any,
          isAutomaticForward: false,
          isChannelPost: true,
        };

        onNewMessageHandler(mockMessage as Message);
        // Small delay between messages to simulate realistic timing
        await sleep(100);
      }

      // Wait for all messages to be processed
      await sleep(300);

      // Assert: All messages should be published to Redis Stream
      expect(receivedMessages).toHaveLength(3);
      expect(receivedMessages[0].message.payload.messageId).toBe(1);
      expect(receivedMessages[1].message.payload.messageId).toBe(2);
      expect(receivedMessages[2].message.payload.messageId).toBe(3);

      // Assert: All messages should be in database
      for (let i = 1; i <= 3; i++) {
        const savedMessage =
          await telegramMessageRepository.findByChannelAndMessageId(
            '123456789', // channelId
            i,
          );
        expect(savedMessage).toBeDefined();
        expect(savedMessage?.message).toBe(`Message ${i}`);
      }
    }, 3000);
  });

  describe('New Message Handler - Integration Tests', () => {
    it('should process messages sequentially per channel (queue order)', async () => {
      // Setup: Create test channel and connect service
      await setupTelegramAccount();
      container = createContainer(logger);
      await container.telegramService.connect();

      // Start consumer
      await startConsumer(TEST_STREAM, TEST_GROUP, TEST_CONSUMER);

      // Get the mocked TelegramClient instance and its onNewMessage handler
      const MockedTelegramClient = jest.mocked(TelegramClient);
      const mockResults = MockedTelegramClient.mock.results;
      const mockInstance = mockResults[mockResults.length - 1]?.value;
      const mockOnNewMessageAdd = jest.mocked(mockInstance.onNewMessage.add);
      const onNewMessageHandler = mockOnNewMessageAdd.mock.calls[0]?.[0];
      expect(onNewMessageHandler).toBeDefined();

      // Track processing order by message IDs
      const processingOrder: number[] = [];

      // Spy on repository create to track order
      const originalCreate = telegramMessageRepository.create;
      const boundOriginal = originalCreate.bind(telegramMessageRepository);
      const createOrderSpy = jest
        .spyOn(telegramMessageRepository, 'create')
        .mockImplementation(async (message: any) => {
          processingOrder.push(message.messageId);
          return boundOriginal(message);
        });

      // Act: Send multiple messages rapidly (simulating burst)
      const messages = [100, 101, 102, 103, 104];
      for (const messageId of messages) {
        const mockMessage: Partial<Message> = {
          id: messageId,
          text: `Message ${messageId}`,
          date: new Date(),
          chat: {
            id: 123456789,
          } as any,
          isAutomaticForward: false,
          isChannelPost: true,
        };

        onNewMessageHandler(mockMessage as Message);
        // No delay - send all at once to test queue ordering
      }

      // Wait for all messages to be processed
      await sleep(300);

      // Assert: Messages should be processed in order (queue is sequential with concurrency=1)
      expect(processingOrder).toHaveLength(5);
      expect(processingOrder).toEqual([100, 101, 102, 103, 104]);

      // Assert: All messages should be published to Redis Stream in order
      expect(receivedMessages).toHaveLength(5);
      expect(receivedMessages.map((m) => m.message.payload.messageId)).toEqual([
        100, 101, 102, 103, 104,
      ]);

      // Assert: All messages should be in database
      for (const messageId of messages) {
        const savedMessage =
          await telegramMessageRepository.findByChannelAndMessageId(
            '123456789',
            messageId,
          );
        expect(savedMessage).toBeDefined();
        expect(savedMessage?.message).toBe(`Message ${messageId}`);
      }

      // Restore spy
      createOrderSpy.mockRestore();
    }, 5000);

    it('should handle handler errors gracefully and continue processing', async () => {
      // Setup: Create test channel and connect service
      await setupTelegramAccount();
      container = createContainer(logger);
      await container.telegramService.connect();

      // Start consumer
      await startConsumer(TEST_STREAM, TEST_GROUP, TEST_CONSUMER);

      // Get the mocked TelegramClient instance and its onNewMessage handler
      const MockedTelegramClient = jest.mocked(TelegramClient);
      const mockResults = MockedTelegramClient.mock.results;
      const mockInstance = mockResults[mockResults.length - 1]?.value;
      const mockOnNewMessageAdd = jest.mocked(mockInstance.onNewMessage.add);
      const onNewMessageHandler = mockOnNewMessageAdd.mock.calls[0]?.[0];
      expect(onNewMessageHandler).toBeDefined();

      // Get the telegram service logger to spy on (queue uses service logger)
      const telegramService = container!.telegramService;
      const serviceLogger = (telegramService as any).logger;

      // Clear any previous calls
      jest.clearAllMocks();

      // Spy on logger to verify error logging
      const loggerErrorSpy = jest.spyOn(serviceLogger, 'error');

      // Mock Sentry to verify error reporting
      const sentrySpy = jest.spyOn(Sentry, 'captureException');

      // Make repository.create fail for one message, then succeed
      const testError = new Error('Database error on message 2');

      // Save original implementation before mocking
      const originalCreate = telegramMessageRepository.create;
      const boundOriginal = originalCreate.bind(telegramMessageRepository);

      let callCount = 0;
      // Use mockImplementation to fail on second call only
      const createSpy = jest
        .spyOn(telegramMessageRepository, 'create')
        .mockImplementation(async (message: any) => {
          callCount++;
          if (callCount === 2) {
            // Second call fails
            throw testError;
          }
          // All other calls use original implementation
          return boundOriginal(message);
        });

      // Act: Send multiple messages
      const messages = [
        { id: 200, text: 'Message 200' },
        { id: 201, text: 'Message 201 - will fail' },
        { id: 202, text: 'Message 202' },
      ];

      for (const msg of messages) {
        const mockMessage: Partial<Message> = {
          id: msg.id,
          text: msg.text,
          date: new Date(),
          chat: {
            id: 123456789,
          } as any,
          isAutomaticForward: false,
          isChannelPost: true,
        };

        onNewMessageHandler(mockMessage as Message);
        await sleep(50); // Small delay between messages
      }

      // Wait for processing (including error handling)
      await sleep(300);

      // Assert: Error should be logged (queue error handler format)
      // Check that it was called with our specific error
      const errorCalls = loggerErrorSpy.mock.calls.filter((call) => {
        const firstArg = call[0] as any;
        const secondArg = call[1] as string;
        return (
          firstArg?.messageId === 201 &&
          firstArg?.channelCode === 'test-channel' &&
          secondArg?.includes('Error processing message')
        );
      });
      expect(errorCalls.length).toBeGreaterThan(0);

      // Assert: Error should be reported to Sentry
      const sentryCalls = sentrySpy.mock.calls.filter((call) => {
        const error = call[0] as any;
        const extra = call[1] as any;
        return (
          error === testError ||
          (error?.message === 'Database error on message 2' &&
            extra?.extra?.messageId === 201)
        );
      });
      expect(sentryCalls.length).toBeGreaterThan(0);

      // Assert: First message should be processed successfully
      const message200 =
        await telegramMessageRepository.findByChannelAndMessageId(
          '123456789',
          200,
        );
      expect(message200).toBeDefined();
      expect(message200?.message).toBe('Message 200');

      // Assert: Second message should NOT be in database (failed)
      const message201 =
        await telegramMessageRepository.findByChannelAndMessageId(
          '123456789',
          201,
        );
      expect(message201).toBeNull();

      // Assert: Third message should be processed successfully (queue continued)
      const message202 =
        await telegramMessageRepository.findByChannelAndMessageId(
          '123456789',
          202,
        );
      expect(message202).toBeDefined();
      expect(message202?.message).toBe('Message 202');

      // Assert: Only successful messages should be published to stream
      expect(receivedMessages).toHaveLength(2);
      expect(receivedMessages.map((m) => m.message.payload.messageId)).toEqual([
        200, 202,
      ]);

      // Restore spies (createSpy may already be restored)
      if (createSpy.mock.calls.length > 0) {
        createSpy.mockRestore();
      }
      loggerErrorSpy.mockRestore();
      sentrySpy.mockRestore();
    }, 5000);

    it('should handle message without channelId gracefully', async () => {
      // Setup: Create test channel and connect service
      await setupTelegramAccount();
      container = createContainer(logger);
      await container.telegramService.connect();

      // Start consumer
      await startConsumer(TEST_STREAM, TEST_GROUP, TEST_CONSUMER);

      // Get the mocked TelegramClient instance and its onNewMessage handler
      const MockedTelegramClient = jest.mocked(TelegramClient);
      const mockResults = MockedTelegramClient.mock.results;
      const mockInstance = mockResults[mockResults.length - 1]?.value;
      const mockOnNewMessageAdd = jest.mocked(mockInstance.onNewMessage.add);
      const onNewMessageHandler = mockOnNewMessageAdd.mock.calls[0]?.[0];
      expect(onNewMessageHandler).toBeDefined();

      // Act: Send message without chat (no channelId)
      const mockMessage: Partial<Message> = {
        id: 300,
        text: 'Message without channelId',
        date: new Date(),
        chat: null, // No chat
        isAutomaticForward: false,
        isChannelPost: true,
      } as any;

      onNewMessageHandler(mockMessage as Message);

      // Wait for potential processing
      await sleep(300);

      // Assert: No messages should be published
      expect(receivedMessages).toHaveLength(0);

      // Assert: No messages should be saved to database
      const savedMessage =
        await telegramMessageRepository.findByChannelAndMessageId(
          '123456789',
          300,
        );
      expect(savedMessage).toBeNull();
    }, 3000);

    it('should handle queue not found for channel gracefully', async () => {
      // Setup: Create test channel and connect service
      await setupTelegramAccount();
      container = createContainer(logger);
      await container.telegramService.connect();

      // Start consumer
      await startConsumer(TEST_STREAM, TEST_GROUP, TEST_CONSUMER);

      // Get the mocked TelegramClient instance and its onNewMessage handler
      const MockedTelegramClient = jest.mocked(TelegramClient);
      const mockResults = MockedTelegramClient.mock.results;
      const mockInstance = mockResults[mockResults.length - 1]?.value;
      const mockOnNewMessageAdd = jest.mocked(mockInstance.onNewMessage.add);
      const onNewMessageHandler = mockOnNewMessageAdd.mock.calls[0]?.[0];
      expect(onNewMessageHandler).toBeDefined();

      // Spy on logger to verify warning
      const loggerWarnSpy = jest.spyOn(logger, 'warn');

      // Manually clear the queue for the channel to simulate missing queue
      const telegramService = container!.telegramService;
      (telegramService as any).channelQueues.delete('123456789');

      // Act: Send message from active channel (but queue is missing)
      const mockMessage: Partial<Message> = {
        id: 400,
        text: 'Message with missing queue',
        date: new Date(),
        chat: {
          id: 123456789,
        } as any,
        isAutomaticForward: false,
        isChannelPost: true,
      };

      onNewMessageHandler(mockMessage as Message);

      // Wait for potential processing
      await sleep(300);

      // Assert: Warning should be logged
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          channelCode: 'test-channel',
          channelId: '123456789',
        }),
        'No queue found for channel',
      );

      // Assert: No messages should be published
      expect(receivedMessages).toHaveLength(0);

      // Assert: No messages should be saved to database
      const savedMessage =
        await telegramMessageRepository.findByChannelAndMessageId(
          '123456789',
          400,
        );
      expect(savedMessage).toBeNull();
    }, 3000);
  });
});
