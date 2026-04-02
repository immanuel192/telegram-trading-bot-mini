import {
  cleanupDb,
  sleep,
  suiteName,
  getTestRedisUrl,
  setupDb,
  readLastStreamMessages,
} from '@telegram-trading-bot-mini/shared/test-utils';
import {
  RedisStreamPublisher,
  StreamTopic,
  MessageType,
  trimStream,
} from '@telegram-trading-bot-mini/shared/utils';
import { startServer, stopServer, ServerContext } from '../../src/server';
import Redis from 'ioredis';
import { MessageHistoryTypeEnum } from '@dal';
import { NewMessageHandler } from '../../src/events/consumers/new-message-handler';

describe(suiteName(__filename), () => {
  let serverContext: ServerContext;
  let publisher: RedisStreamPublisher;
  let redis: Redis;

  beforeAll(async () => {
    await setupDb();
    redis = new Redis(getTestRedisUrl());
    publisher = new RedisStreamPublisher({
      url: getTestRedisUrl(),
    });

    // Start server (which starts consumers and creates consumer groups)
    // Note: beforeEach will handle stream cleanup and consumer group recreation
    serverContext = await startServer();

    // Give consumers time to be ready
    await sleep(500);
  });

  afterAll(async () => {
    // Clean up streams after all tests
    await Promise.all([
      trimStream(redis, StreamTopic.MESSAGES),
      trimStream(redis, StreamTopic.TRANSLATE_REQUESTS),
    ]);

    if (serverContext) {
      await stopServer(serverContext);
    }
    await publisher.close();
    await redis.quit();
  });

  beforeEach(async () => {
    // Clean up streams after all tests
    await Promise.all([
      trimStream(redis, StreamTopic.MESSAGES),
      trimStream(redis, StreamTopic.TRANSLATE_REQUESTS),
    ]);
    // Clean up database to ensure test isolation
    // Do NOT delete streams - the server's consumers are actively using them
    await cleanupDb();
  });

  it('should process NEW_MESSAGE, create history, and publish TRANSLATE_MESSAGE_REQUEST for multiple prompts', async () => {
    await trimStream(redis, StreamTopic.TRANSLATE_REQUESTS);
    const channelId = '123456789';
    const channelCode = 'TEST_CHANNEL';
    const messageId = 100;
    const messageText = 'Buy BTC';

    // 1. Setup: Create accounts with prompts
    const accountRepo = serverContext.container.accountRepository;
    await accountRepo.create({
      accountId: 'acc-1',
      isActive: true,
      telegramChannelCode: channelCode,
      promptId: 'prompt-A',
      accountType: 'mt5' as any,
    } as any);

    await accountRepo.create({
      accountId: 'acc-2',
      isActive: true,
      telegramChannelCode: channelCode,
      promptId: 'prompt-B',
      accountType: 'mt5' as any,
    } as any);

    // 2. Setup: Create a message in MongoDB
    const repo = serverContext.container.telegramMessageRepository;
    await repo.create({
      channelId,
      messageId,
      message: messageText,
      channelCode,
      hasMedia: false,
      hashTags: [],
      sentAt: new Date(),
      receivedAt: new Date(),
      history: [],
    });

    // 4. Publish NEW_MESSAGE event
    const payload = {
      channelCode,
      channelId,
      messageId,
      traceToken: 'trace-123',
      receivedAt: Date.now(),
      exp: Date.now() + 60000,
    };

    // Spy on handle
    const handleSpy = jest.spyOn(NewMessageHandler.prototype, 'handle');

    await publisher.publish(StreamTopic.MESSAGES, {
      version: '1.0',
      type: MessageType.NEW_MESSAGE,
      payload,
    });

    // 5. Wait for processing
    await sleep(2000);

    // Verify handle was called
    expect(handleSpy).toHaveBeenCalled();

    // 6. Verify: Message history updated in MongoDB
    const message = await repo.findByChannelAndMessageId(channelId, messageId);
    expect(message).toBeDefined();
    expect(message?.history).toBeDefined();

    const translateHistoryEntries = message?.history?.filter(
      (h) => h.type === MessageHistoryTypeEnum.TRANSLATE_MESSAGE,
    );
    expect(translateHistoryEntries?.length).toBe(2);

    // Verify prompts in history notes
    const historyPrompts = translateHistoryEntries
      ?.map((h) => JSON.parse(h.notes || '{}').promptId)
      .sort();
    expect(historyPrompts).toEqual(['prompt-A', 'prompt-B']);

    const newMessages = await readLastStreamMessages(
      redis,
      StreamTopic.TRANSLATE_REQUESTS,
      20,
    );

    const payloadPrompts = newMessages.map((p) => p.payload.promptId).sort();
    expect(payloadPrompts).toEqual(['prompt-A', 'prompt-B']);

    expect(newMessages[0].payload.messageId).toBe(messageId);
    expect(newMessages[0].payload.messageText).toBe(messageText);

    // Cleanup spy
    handleSpy.mockRestore();
  });
});
