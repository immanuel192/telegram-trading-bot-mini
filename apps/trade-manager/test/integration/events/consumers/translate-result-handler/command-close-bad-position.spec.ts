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
  OrderStatus,
  OrderSide,
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

  describe('CLOSE_BAD_POSITION Command', () => {
    it('should close bad LONG positions and keep the best one', async () => {
      // Create 3 LONG orders with different entry prices (market orders = OPEN immediately)
      const order1Payload = createTranslateResultPayload({
        messageId: 1700,
        channelId: '123456789',
        traceToken: 'trace-1700',
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.LONG,
            extraction: {
              symbol: 'BTCUSDT',
              side: CommandSide.BUY,
              isImmediate: true, // Market order = OPEN
            },
          }),
        ],
      });

      await telegramMessageRepository.create(
        createTestMessage({
          messageId: 1700,
          channelId: '123456789',
          message: 'LONG BTCUSDT',
        }),
      );

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: order1Payload,
      });

      await sleep(500);

      // Manually update first order to have entry price (simulating execution)
      const { orderRepository } = serverContext.container;
      const firstOrder = await orderRepository.findOne({
        messageId: 1700,
      } as any);
      await orderRepository.updateMany({ _id: firstOrder!._id }, {
        $set: {
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
          entry: { actualEntryPrice: 50000 }, // Best entry
        },
      } as any);

      // Create second LONG order
      const order2Payload = createTranslateResultPayload({
        messageId: 1701,
        channelId: '123456789',
        traceToken: 'trace-1701',
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.LONG,
            extraction: {
              symbol: 'BTCUSDT',
              side: CommandSide.BUY,
              isImmediate: true,
              isLinkedWithPrevious: true,
            },
          }),
        ],
      });

      await telegramMessageRepository.create(
        createTestMessage({
          messageId: 1701,
          channelId: '123456789',
          message: 'DCA LONG',
          quotedMessage: {
            id: 1700,
            message: 'LONG BTCUSDT',
            hasMedia: false,
          },
        }),
      );

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: order2Payload,
      });

      await sleep(500);

      // Update second order
      let secondOrder = await orderRepository.findOne({
        messageId: 1701,
      } as any);
      await orderRepository.updateMany({ _id: secondOrder!._id }, {
        $set: {
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
          entry: { actualEntryPrice: 51000 }, // Worse entry
        },
      } as any);

      // Now send CLOSE_BAD_POSITION command
      const closeBadPayload = createTranslateResultPayload({
        messageId: 1702,
        channelId: '123456789',
        traceToken: 'trace-1702',
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.CLOSE_BAD_POSITION,
            extraction: {
              symbol: 'BTCUSDT',
              side: CommandSide.BUY,
            },
          }),
        ],
      });

      await telegramMessageRepository.create(
        createTestMessage({
          messageId: 1702,
          channelId: '123456789',
          message: 'CLOSE BAD',
          quotedMessage: {
            id: 1700,
            message: 'LONG BTCUSDT',
            hasMedia: false,
          },
        }),
      );

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: closeBadPayload,
      });

      await sleep(500);
      const executionMessage = await readLastStreamMessage(
        publisher.client,
        StreamTopic.ORDER_EXECUTION_REQUESTS,
      );
      expect(executionMessage).not.toBeNull();
      expect(executionMessage.payload.command).toBe(
        CommandEnum.CLOSE_BAD_POSITION,
      );
      expect(executionMessage!.payload.orderId).toBeDefined();
    });
  });
});
