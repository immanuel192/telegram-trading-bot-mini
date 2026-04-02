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
  orderRepository,
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

  describe('MOVE_SL Command', () => {
    it('should process MOVE_SL command and publish execution requests for found orders', async () => {
      // First, create orders by processing a LONG command
      const longPayload = createTranslateResultPayload({
        messageId: 500,
        channelId: '123456789',
        traceToken: 'trace-500',
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.LONG,
            extraction: {
              symbol: 'BTCUSDT',
              side: CommandSide.BUY,
              entry: 50000,
              stopLoss: { price: 49000 },
              takeProfits: [{ price: 51000 }],
            },
          }),
        ],
      });

      // Create Telegram message record (required for order lookup)
      await telegramMessageRepository.create(
        createTestMessage({
          messageId: 500,
          channelId: '123456789',
          message: 'LONG BTCUSDT entry 50000 sl 49000 tp 51000',
        }),
      );

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: longPayload,
      });

      await sleep(500);

      // Verify LONG order was created
      const longOrders = await orderRepository.findAll({
        messageId: 500,
        channelId: '123456789',
      });

      expect(longOrders).toHaveLength(1);
      expect(longOrders[0].entry?.entryPrice).toBe(50000);

      // Now send MOVE_SL command for the same message context
      const moveSLPayload = createTranslateResultPayload({
        messageId: 501, // Different messageId
        channelId: '123456789',
        traceToken: 'trace-501',
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.MOVE_SL,
            extraction: {}, // Clear extraction to avoid detecting as edit
          }),
        ],
      });

      // Create Telegram message record for the follow-up
      await telegramMessageRepository.create(
        createTestMessage({
          messageId: 501,
          channelId: '123456789',
          message: 'MOVE SL',
          quotedMessage: {
            id: 500,
            message: 'LONG BTCUSDT entry 50000 sl 49000 tp 51000',
            hasMedia: false,
          },
        }),
      );

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: moveSLPayload,
      });

      await sleep(500);

      // Verify MOVE_SL execution request was published
      const executionMessage = await readLastStreamMessage(
        publisher.client,
        StreamTopic.ORDER_EXECUTION_REQUESTS,
      );

      expect(executionMessage).not.toBeNull();
      expect(executionMessage!.type).toBe(MessageType.EXECUTE_ORDER_REQUEST);
      expect(executionMessage!.payload).toMatchObject({
        orderId: longOrders[0].orderId, // Uses existing order ID
        symbol: 'BTCUSDT',
        command: CommandEnum.MOVE_SL,
        stopLoss: {
          price: 50000, // Breakeven: entry + delta (delta=0 by default)
        },
      });
    });

    it('should process MOVE_SL for multiple linked orders', async () => {
      // Create first LONG order
      const firstPayload = createTranslateResultPayload({
        messageId: 600,
        channelId: '123456789',
        traceToken: 'trace-600',
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.LONG,
            extraction: {
              symbol: 'BTCUSDT',
              side: CommandSide.BUY,
              entry: 50000,
              stopLoss: { price: 49000 },
            },
          }),
        ],
      });

      // Create Telegram message records (required for order lookup)
      await telegramMessageRepository.create(
        createTestMessage({
          messageId: 600,
          channelId: '123456789',
          message: 'LONG BTCUSDT entry 50000',
        }),
      );
      await telegramMessageRepository.create(
        createTestMessage({
          messageId: 601,
          channelId: '123456789',
          message: 'LONG BTCUSDT entry 51000',
          quotedMessage: {
            id: 600,
            message: 'LONG BTCUSDT entry 50000',
            hasMedia: false,
          },
        }),
      );

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: firstPayload,
      });

      await sleep(500);

      // Create second linked order
      const secondPayload = createTranslateResultPayload({
        messageId: 601,
        channelId: '123456789',
        traceToken: 'trace-601',
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.LONG,
            extraction: {
              symbol: 'BTCUSDT',
              side: CommandSide.BUY,
              entry: 51000,
              isLinkedWithPrevious: true,
            },
          }),
        ],
      });

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: secondPayload,
      });

      await sleep(500);

      // Verify both orders exist
      const orders = await orderRepository.findAll({
        channelId: '123456789',
        symbol: 'BTCUSDT',
      });

      expect(orders.length).toBeGreaterThanOrEqual(2);

      // Send MOVE_SL for the second message (which is linked to first)
      const moveSLPayload = createTranslateResultPayload({
        messageId: 602, // Different messageId
        channelId: '123456789',
        traceToken: 'trace-602',
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.MOVE_SL,
            extraction: {},
          }),
        ],
      });

      await telegramMessageRepository.create(
        createTestMessage({
          messageId: 602,
          channelId: '123456789',
          message: 'MOVE SL',
          quotedMessage: {
            id: 601,
            message: 'LONG BTCUSDT entry 51000',
            hasMedia: false,
          },
        }),
      );

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: moveSLPayload,
      });

      await sleep(500);

      // Should publish execution requests for all linked orders
      // Note: We can't easily verify count without reading all messages,
      // but we can verify at least one was published
      const executionMessage = await readLastStreamMessage(
        publisher.client,
        StreamTopic.ORDER_EXECUTION_REQUESTS,
      );

      expect(executionMessage).not.toBeNull();
      expect(executionMessage!.payload.command).toBe(CommandEnum.MOVE_SL);
    });
  });
});
