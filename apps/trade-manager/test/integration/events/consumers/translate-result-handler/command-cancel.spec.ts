import {
  cleanupDb,
  sleep,
  suiteName,
  getTestRedisUrl,
  createTestAccount,
  createTestChannel,
  createTranslateResultPayload,
  createTranslateResultCommand,
  readLastStreamMessage,
  createTestMessage,
} from '@telegram-trading-bot-mini/shared/test-utils';
import {
  RedisStreamPublisher,
  StreamTopic,
  MessageType,
  trimStream,
  CommandEnum,
  CommandSide,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  accountRepository,
  telegramChannelRepository,
  telegramMessageRepository,
} from '@dal';
import {
  startServer,
  stopServer,
  ServerContext,
} from '../../../../../src/server';

describe(suiteName(__filename), () => {
  let serverContext: ServerContext;
  let publisher: RedisStreamPublisher;

  beforeAll(async () => {
    publisher = new RedisStreamPublisher({
      url: getTestRedisUrl(),
    });

    // Start server (which starts consumers and creates consumer groups)
    serverContext = await startServer();

    // Give consumers time to be ready
    await sleep(500);
  });

  afterAll(async () => {
    if (serverContext) {
      await stopServer(serverContext);
    }
    await publisher.close();
  });

  beforeEach(async () => {
    // Clean up BEFORE each test to ensure isolation
    // This prevents duplicate key errors when previous test fails
    await cleanupDb();

    await Promise.all([
      trimStream(publisher.client, StreamTopic.ORDER_EXECUTION_REQUESTS),
      trimStream(publisher.client, StreamTopic.TRANSLATE_REQUESTS),
      trimStream(publisher.client, StreamTopic.TRANSLATE_RESULTS),
      trimStream(publisher.client, StreamTopic.MESSAGES),
    ]);

    // Create test channel using factory
    await telegramChannelRepository.create(createTestChannel());

    // Create test account using factory
    await accountRepository.create(createTestAccount());
  });

  afterEach(async () => {
    // Also cleanup after for good measure
    await cleanupDb();
  });

  describe('CANCEL Command', () => {
    it('should process CANCEL and publish execution request for pending order', async () => {
      // Create initial LONG order (PENDING)
      const longPayload = createTranslateResultPayload({
        messageId: 1400,
        channelId: '123456789',
        traceToken: 'trace-1400',
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.LONG,
            extraction: {
              symbol: 'BTCUSDT',
              side: CommandSide.BUY,
              entry: 50000, // Limit order = PENDING
            },
          }),
        ],
      });

      await telegramMessageRepository.create(
        createTestMessage({
          messageId: 1400,
          channelId: '123456789',
          message: 'LONG BTCUSDT',
        }),
      );

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: longPayload,
      });

      await sleep(500);

      // Now send CANCEL command
      const cancelPayload = createTranslateResultPayload({
        messageId: 1401,
        channelId: '123456789',
        traceToken: 'trace-1401',
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.CANCEL,
            extraction: {
              symbol: 'BTCUSDT',
            },
          }),
        ],
      });

      await telegramMessageRepository.create(
        createTestMessage({
          messageId: 1401,
          channelId: '123456789',
          message: 'CANCEL',
          quotedMessage: {
            id: 1400,
            message: 'LONG BTCUSDT',
            hasMedia: false,
          },
        }),
      );

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: cancelPayload,
      });

      await sleep(500);

      // Should publish execution request with orderId
      const executionMessage = await readLastStreamMessage(
        publisher.client,
        StreamTopic.ORDER_EXECUTION_REQUESTS,
      );

      expect(executionMessage).not.toBeNull();
      expect(executionMessage!.payload.command).toBe(CommandEnum.CANCEL);
      expect(executionMessage!.payload.orderId).toBeDefined();
      expect(executionMessage!.payload.symbol).toBe('BTCUSDT');
    });

    it('should process CANCEL for multiple pending orders', async () => {
      // Create signal order (PENDING)
      const signalPayload = createTranslateResultPayload({
        messageId: 1500,
        channelId: '123456789',
        traceToken: 'trace-1500',
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.LONG,
            extraction: {
              symbol: 'ETHUSD',
              side: CommandSide.BUY,
              entry: 3000,
            },
          }),
        ],
      });

      await telegramMessageRepository.create(
        createTestMessage({
          messageId: 1500,
          channelId: '123456789',
          message: 'LONG ETHUSD',
        }),
      );

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: signalPayload,
      });

      await sleep(500);

      // Create DCA order (PENDING, linked)
      const dcaPayload = createTranslateResultPayload({
        messageId: 1501,
        channelId: '123456789',
        traceToken: 'trace-1501',
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.LONG,
            extraction: {
              symbol: 'ETHUSD',
              side: CommandSide.BUY,
              entry: 2950,
              isLinkedWithPrevious: true,
            },
          }),
        ],
      });

      await telegramMessageRepository.create(
        createTestMessage({
          messageId: 1501,
          channelId: '123456789',
          message: 'DCA ETHUSD',
          quotedMessage: {
            id: 1500,
            message: 'LONG ETHUSD',
            hasMedia: false,
          },
        }),
      );

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: dcaPayload,
      });

      await sleep(500);

      // Now send CANCEL command
      const cancelPayload = createTranslateResultPayload({
        messageId: 1502,
        channelId: '123456789',
        traceToken: 'trace-1502',
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.CANCEL,
            extraction: {
              symbol: 'ETHUSD',
            },
          }),
        ],
      });

      await telegramMessageRepository.create(
        createTestMessage({
          messageId: 1502,
          channelId: '123456789',
          message: 'CANCEL',
          quotedMessage: {
            id: 1500,
            message: 'LONG ETHUSD',
            hasMedia: false,
          },
        }),
      );

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: cancelPayload,
      });

      await sleep(500);

      // Should publish execution requests for both pending orders
      const executionMessage = await readLastStreamMessage(
        publisher.client,
        StreamTopic.ORDER_EXECUTION_REQUESTS,
      );
      expect(executionMessage).not.toBeNull();
      expect(executionMessage.payload.command).toBe(CommandEnum.CANCEL);
      expect(executionMessage!.payload.orderId).toBeDefined();
    });

    it('should not publish execution request when no pending orders found for CANCEL', async () => {
      const cancelPayload = createTranslateResultPayload({
        messageId: 1600,
        channelId: '123456789',
        traceToken: 'trace-1600',
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.CANCEL,
            extraction: {
              symbol: 'XRPUSDT',
            },
          }),
        ],
      });

      await telegramMessageRepository.create(
        createTestMessage({
          messageId: 1600,
          channelId: '123456789',
          message: 'CANCEL',
        }),
      );

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: cancelPayload,
      });

      await sleep(500);

      // Should NOT publish any execution request
      const newMessage = await readLastStreamMessage(
        publisher.client,
        StreamTopic.ORDER_EXECUTION_REQUESTS,
      );

      expect(newMessage).toBeNull();
    });
  });
});
