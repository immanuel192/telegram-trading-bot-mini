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
  OrderHistoryStatus,
} from '@dal';
import {
  startServer,
  stopServer,
  ServerContext,
} from '../../../../../src/server';
import { TranslateResultHandler } from '../../../../../src/events/consumers/translate-result-handler';

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

  describe('LONG/SHORT Commands', () => {
    it('should process LONG command and create order record', async () => {
      // Spy on TranslateResultHandler.handle
      const handleSpy = jest.spyOn(TranslateResultHandler.prototype, 'handle');

      // Publish a LONG command using factory
      const payload = createTranslateResultPayload({
        messageId: 100,
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.LONG,
            reason: 'Message contains LONG command with entry price',
            extraction: {
              symbol: 'BTCUSDT',
              side: CommandSide.BUY,
              isImmediate: false,
              entry: 50000,
              stopLoss: { price: 49000 },
              takeProfits: [{ price: 51000 }],
            },
          }),
        ],
      });

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload,
      });

      // Wait for consumer to process
      await sleep(500);

      // Verify handle was called
      expect(handleSpy).toHaveBeenCalled();

      // Verify order was created
      const orders = await orderRepository.findAll({
        messageId: 100,
        channelId: '123456789',
      });

      expect(orders).toHaveLength(1);
      expect(orders[0].symbol).toBe('BTCUSDT');
      expect(orders[0].accountId).toBe('test-account-1');
      expect(orders[0].linkedOrders).toBeUndefined();

      // Verify command field in INTEND history entry
      expect(orders[0]).toEqual(
        expect.objectContaining({
          history: expect.arrayContaining([
            expect.objectContaining({
              status: OrderHistoryStatus.INTEND,
              command: CommandEnum.LONG,
            }),
          ]),
        }),
      );

      // Verify EXECUTE_ORDER_REQUEST message was published
      const executorMessage = await readLastStreamMessage(
        publisher.client,
        StreamTopic.ORDER_EXECUTION_REQUESTS,
      );

      expect(executorMessage).not.toBeNull();
      expect(executorMessage).toMatchObject({
        type: MessageType.EXECUTE_ORDER_REQUEST,
        payload: expect.objectContaining({
          messageId: 100,
          symbol: 'BTCUSDT',
          command: CommandEnum.LONG,
        }),
      });

      handleSpy.mockRestore();
    });

    it('should process SHORT command and create order record', async () => {
      // Spy on TranslateResultHandler.handle
      const handleSpy = jest.spyOn(TranslateResultHandler.prototype, 'handle');

      // Publish a SHORT command
      const payload = {
        receivedAt: Date.now() - 200,
        messageId: 101,
        channelId: '123456789',
        promptId: 'prompt-123',
        traceToken: 'trace-124',
        commands: [
          {
            isCommand: true,
            confidence: 0.92,
            reason: 'Message contains SHORT command',
            command: CommandEnum.SHORT,
            extraction: {
              symbol: 'ETHUSDT',
              side: CommandSide.SELL,
              isImmediate: true,
              meta: {},
              entryZone: [],
              stopLoss: { price: 3100 },
              takeProfits: [{ price: 3000 }],
              validationError: '',
            },
          },
        ],
      };

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload,
      });

      // Wait for consumer to process
      await sleep(500);

      // Verify handle was called
      expect(handleSpy).toHaveBeenCalled();

      // Verify order was created
      const orders = await orderRepository.findAll({
        messageId: 101,
        channelId: '123456789',
      });

      expect(orders).toHaveLength(1);
      expect(orders[0].symbol).toBe('ETHUSDT');
      expect(orders[0].accountId).toBe('test-account-1');

      // Verify command field in INTEND history entry
      expect(orders[0]).toEqual(
        expect.objectContaining({
          history: expect.arrayContaining([
            expect.objectContaining({
              status: OrderHistoryStatus.INTEND,
              command: CommandEnum.SHORT,
            }),
          ]),
        }),
      );

      // Verify EXECUTE_ORDER_REQUEST message was published
      const executorMessage = await readLastStreamMessage(
        publisher.client,
        StreamTopic.ORDER_EXECUTION_REQUESTS,
      );

      expect(executorMessage).not.toBeNull();
      expect(executorMessage).toMatchObject({
        type: MessageType.EXECUTE_ORDER_REQUEST,
        payload: expect.objectContaining({
          messageId: 101,
          symbol: 'ETHUSDT',
          command: CommandEnum.SHORT,
        }),
      });

      handleSpy.mockRestore();
    });

    it('should handle linkedOrders for LONG command with isLinkedWithPrevious', async () => {
      // Create first order
      const firstPayload = {
        receivedAt: Date.now() - 300,
        messageId: 200,
        channelId: '123456789',
        promptId: 'prompt-123',
        traceToken: 'trace-200',
        commands: [
          {
            isCommand: true,
            confidence: 0.95,
            reason: 'First LONG command',
            command: CommandEnum.LONG,
            extraction: {
              symbol: 'BTCUSDT',
              side: CommandSide.BUY,
              isImmediate: false,
              meta: {},
              entry: 50000,
              entryZone: [],
              stopLoss: { price: 49000 },
              takeProfits: [{ price: 51000 }],
              validationError: '',
            },
          },
        ],
      };

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: firstPayload,
      });

      await sleep(500);

      // Create second order with isLinkedWithPrevious
      const secondPayload = {
        receivedAt: Date.now() - 200,
        messageId: 201,
        channelId: '123456789',
        promptId: 'prompt-123',
        traceToken: 'trace-201',
        commands: [
          {
            isCommand: true,
            confidence: 0.95,
            reason: 'Second LONG command linked with previous',
            command: CommandEnum.LONG,
            extraction: {
              symbol: 'BTCUSDT',
              side: CommandSide.BUY,
              isImmediate: false,
              meta: {},
              entry: 49500,
              entryZone: [],
              stopLoss: { price: 49000 },
              takeProfits: [{ price: 51000 }],
              isLinkedWithPrevious: true,
              validationError: '',
            },
          },
        ],
      };

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: secondPayload,
      });

      await sleep(500);

      // Verify both orders were created
      const firstOrders = await orderRepository.findAll({
        messageId: 200,
        channelId: '123456789',
      });

      const secondOrders = await orderRepository.findAll({
        messageId: 201,
        channelId: '123456789',
      });

      expect(firstOrders).toHaveLength(1);
      expect(secondOrders).toHaveLength(1);

      // Verify linkedOrders relationship
      const firstOrder = firstOrders[0];
      const secondOrder = secondOrders[0];

      expect(secondOrder.linkedOrders).toContain(firstOrder.orderId);
      expect(firstOrder.linkedOrders).toContain(secondOrder.orderId);
    });
  });
});
