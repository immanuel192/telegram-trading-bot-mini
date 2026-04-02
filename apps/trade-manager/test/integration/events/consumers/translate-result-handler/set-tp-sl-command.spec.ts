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

  describe('SET_TP_SL Command', () => {
    it('should process SET_TP_SL command and publish execution requests for found orders', async () => {
      // First, create an order by processing a LONG command
      const longPayload = createTranslateResultPayload({
        messageId: 700,
        channelId: '123456789',
        traceToken: 'trace-700',
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
          messageId: 700,
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
        messageId: 700,
        channelId: '123456789',
      });

      expect(longOrders).toHaveLength(1);
      expect(longOrders[0].entry?.entryPrice).toBe(50000);

      // Now send SET_TP_SL command for the same message
      const setTPSLPayload = createTranslateResultPayload({
        messageId: 701, // Different messageId
        channelId: '123456789',
        traceToken: 'trace-701',
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.SET_TP_SL,
            extraction: {
              symbol: 'BTCUSDT',
              stopLoss: { price: 49500 }, // Move SL up
              takeProfits: [{ price: 52000 }, { price: 53000 }], // New TPs
            },
          }),
        ],
      });

      await telegramMessageRepository.create(
        createTestMessage({
          messageId: 701,
          channelId: '123456789',
          message: 'SET SL 49500 TP 52000 53000',
          quotedMessage: {
            id: 700,
            message: 'Original Message',
            hasMedia: false,
          },
        }),
      );

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: setTPSLPayload,
      });

      await sleep(500);

      // Verify SET_TP_SL execution request was published
      const executionMessage = await readLastStreamMessage(
        publisher.client,
        StreamTopic.ORDER_EXECUTION_REQUESTS,
      );

      expect(executionMessage).not.toBeNull();
      expect(executionMessage!.type).toBe(MessageType.EXECUTE_ORDER_REQUEST);
      expect(executionMessage!.payload).toMatchObject({
        orderId: longOrders[0].orderId, // Uses existing order ID
        symbol: 'BTCUSDT',
        command: CommandEnum.SET_TP_SL,
        stopLoss: { price: 49500 },
        takeProfits: [{ price: 52000 }, { price: 53000 }],
      });
    });

    it('should process SET_TP_SL for multiple linked orders', async () => {
      // Create first LONG order
      const firstPayload = createTranslateResultPayload({
        messageId: 800,
        channelId: '123456789',
        traceToken: 'trace-800',
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
          messageId: 800,
          channelId: '123456789',
          message: 'LONG BTCUSDT entry 50000',
        }),
      );
      await telegramMessageRepository.create(
        createTestMessage({
          messageId: 801,
          channelId: '123456789',
          message: 'LONG BTCUSDT entry 51000',
          quotedMessage: {
            id: 800,
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
        messageId: 801,
        channelId: '123456789',
        traceToken: 'trace-801',
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

      // Send SET_TP_SL for the second message
      const setTPSLPayload = createTranslateResultPayload({
        messageId: 802, // Different messageId
        channelId: '123456789',
        traceToken: 'trace-802',
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.SET_TP_SL,
            extraction: {
              symbol: 'BTCUSDT',
              stopLoss: { price: 50000 },
              takeProfits: [{ price: 52000 }],
            },
          }),
        ],
      });

      await telegramMessageRepository.create(
        createTestMessage({
          messageId: 802,
          channelId: '123456789',
          message: 'SET SL 50000 TP 52000',
          quotedMessage: {
            id: 801,
            message: 'Original Message',
            hasMedia: false,
          },
        }),
      );

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: setTPSLPayload,
      });

      await sleep(500);

      // Should publish execution requests for all linked orders
      const executionMessage = await readLastStreamMessage(
        publisher.client,
        StreamTopic.ORDER_EXECUTION_REQUESTS,
      );

      expect(executionMessage).not.toBeNull();
      expect(executionMessage!.payload.command).toBe(CommandEnum.SET_TP_SL);
    });

    it('should validate SL one-way movement and filter invalid SL', async () => {
      // Create order with existing SL
      const longPayload = createTranslateResultPayload({
        messageId: 900,
        channelId: '123456789',
        traceToken: 'trace-900',
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.LONG,
            extraction: {
              symbol: 'BTCUSDT',
              side: CommandSide.BUY,
              entry: 50000,
              stopLoss: { price: 49500 }, // Existing SL
            },
          }),
        ],
      });

      await telegramMessageRepository.create(
        createTestMessage({
          messageId: 900,
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

      // Manually update order to simulate executor-service setting the SL
      const orders = await orderRepository.findAll({
        messageId: 900,
        channelId: '123456789',
      });

      expect(orders).toHaveLength(1);

      // Update order with sl field (simulating executor-service processing)
      await orderRepository.update(orders[0]._id!.toString(), {
        sl: { slPrice: 49500 },
      });

      // Try to move SL down (invalid for LONG)
      const setTPSLPayload = createTranslateResultPayload({
        messageId: 901, // Different messageId
        channelId: '123456789',
        traceToken: 'trace-901',
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.SET_TP_SL,
            extraction: {
              symbol: 'BTCUSDT',
              stopLoss: { price: 49000 }, // Try to move down (invalid)
              takeProfits: [{ price: 52000 }], // Valid TP
            },
          }),
        ],
      });

      await telegramMessageRepository.create(
        createTestMessage({
          messageId: 901,
          channelId: '123456789',
          message: 'SET SL 49000 TP 52000',
          quotedMessage: {
            id: 900,
            message: 'Original Message',
            hasMedia: false,
          },
        }),
      );

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: setTPSLPayload,
      });

      await sleep(500);

      // Execution request should be published with only TP (SL filtered out)
      const executionMessage = await readLastStreamMessage(
        publisher.client,
        StreamTopic.ORDER_EXECUTION_REQUESTS,
      );

      expect(executionMessage).not.toBeNull();
      expect(executionMessage!.payload).toMatchObject({
        command: CommandEnum.SET_TP_SL,
        takeProfits: [{ price: 52000 }],
      });
      // SL should be undefined (filtered out)
      expect(executionMessage!.payload.stopLoss).toBeUndefined();
    });

    it('should validate TP direction and filter invalid TPs', async () => {
      // Create LONG order
      const longPayload = createTranslateResultPayload({
        messageId: 1000,
        channelId: '123456789',
        traceToken: 'trace-1000',
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.LONG,
            extraction: {
              symbol: 'BTCUSDT',
              side: CommandSide.BUY,
              entry: 50000,
            },
          }),
        ],
      });

      await telegramMessageRepository.create(
        createTestMessage({
          messageId: 1000,
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

      // Send SET_TP_SL with mixed valid/invalid TPs
      const setTPSLPayload = createTranslateResultPayload({
        messageId: 1001, // Different messageId
        channelId: '123456789',
        traceToken: 'trace-1001',
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.SET_TP_SL,
            extraction: {
              symbol: 'BTCUSDT',
              takeProfits: [
                { price: 52000 }, // Valid: > entry
                { price: 48000 }, // Invalid: < entry
                { price: 53000 }, // Valid: > entry
              ],
            },
          }),
        ],
      });

      await telegramMessageRepository.create(
        createTestMessage({
          messageId: 1001,
          channelId: '123456789',
          message: 'SET TP ...',
          quotedMessage: {
            id: 1000,
            message: 'Original Message',
            hasMedia: false,
          },
        }),
      );

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: setTPSLPayload,
      });

      await sleep(500);

      // Only valid TPs should be in execution request
      const executionMessage = await readLastStreamMessage(
        publisher.client,
        StreamTopic.ORDER_EXECUTION_REQUESTS,
      );

      expect(executionMessage).not.toBeNull();
      expect(executionMessage!.payload.takeProfits).toEqual([
        { price: 52000 },
        { price: 53000 },
      ]);
    });
  });
});
