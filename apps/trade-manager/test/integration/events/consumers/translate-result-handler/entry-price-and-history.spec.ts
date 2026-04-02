import {
  cleanupDb,
  sleep,
  suiteName,
  getTestRedisUrl,
  createTestAccount,
  createTestChannel,
  createTranslateResultPayload,
  createTranslateResultCommand,
  createTestMessage,
} from '@telegram-trading-bot-mini/shared/test-utils';
import {
  RedisStreamPublisher,
  StreamTopic,
  MessageType,
  trimStream,
  CommandEnum,
  CommandSide,
  PriceCacheService,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  accountRepository,
  orderRepository,
  telegramChannelRepository,
  telegramMessageRepository,
} from '@dal';
import Redis from 'ioredis';
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

  describe('Entry Price Validation', () => {
    it('should use cached price when AI entry price differs significantly (>0.5%)', async () => {
      // Setup: Cache a price for XAUUSD
      const redis = new Redis(getTestRedisUrl());
      const priceCache = new PriceCacheService('oanda', redis);

      // Cache current price: 4236
      await priceCache.setPrice('XAUUSD', 4236.0, 4237.0);

      // Publish LONG command with AI-inferred entry=36 (misinterpretation)
      const payload = createTranslateResultPayload({
        messageId: 800,
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.LONG,
            extraction: {
              symbol: 'XAUUSD',
              side: CommandSide.BUY,
              isImmediate: true, // Market order
              entry: 36, // AI misinterpretation
              stopLoss: { price: 35 },
              takeProfits: [{ price: 37 }],
            },
          }),
        ],
      });

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload,
      });

      await sleep(500);

      // Verify order was created with CACHED price (not AI price)
      const orders = await orderRepository.findAll({
        messageId: 800,
        channelId: '123456789',
      });

      expect(orders).toHaveLength(1);
      expect(orders[0].entry?.entryPrice).toBe(4236.5); // Mid price: (4236 + 4237) / 2

      await redis.quit();
    });

    it('should use AI price when it is within validation threshold (<0.5%)', async () => {
      // Setup: Cache a price for XAUUSD
      const redis = new Redis(getTestRedisUrl());
      const priceCache = new PriceCacheService('oanda', redis);

      // Cache current price: 4238
      await priceCache.setPrice('XAUUSD', 4238.0, 4239.0);

      // Publish LONG command with AI-inferred entry=4236 (correct, within threshold)
      const payload = createTranslateResultPayload({
        messageId: 801,
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.LONG,
            extraction: {
              symbol: 'XAUUSD',
              side: CommandSide.BUY,
              isImmediate: true, // Market order
              entry: 4236, // AI price, difference = 0.04% < 0.5%
              stopLoss: { price: 4200 },
              takeProfits: [{ price: 4300 }],
            },
          }),
        ],
      });

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload,
      });

      await sleep(500);

      // Verify order was created with AI price (not cached price)
      const orders = await orderRepository.findAll({
        messageId: 801,
        channelId: '123456789',
      });

      expect(orders).toHaveLength(1);
      expect(orders[0].entry?.entryPrice).toBe(4236); // AI price accepted

      await redis.quit();
    });

    it('should skip validation for limit orders (isImmediate=false)', async () => {
      // Setup: Cache a price for XAUUSD
      const redis = new Redis(getTestRedisUrl());
      const priceCache = new PriceCacheService('oanda', redis);

      // Cache current price: 4236
      await priceCache.setPrice('XAUUSD', 4236.0, 4237.0);

      // Publish LONG command with limit order and entry=36 (intentional limit price)
      const payload = createTranslateResultPayload({
        messageId: 802,
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.LONG,
            extraction: {
              symbol: 'XAUUSD',
              side: CommandSide.BUY,
              isImmediate: false, // Limit order - skip validation
              entry: 36, // Intentional limit price
              stopLoss: { price: 35 },
              takeProfits: [{ price: 37 }],
            },
          }),
        ],
      });

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload,
      });

      await sleep(500);

      // Verify order was created with AI price (validation skipped)
      const orders = await orderRepository.findAll({
        messageId: 802,
        channelId: '123456789',
      });

      expect(orders).toHaveLength(1);
      expect(orders[0].entry?.entryPrice).toBe(36); // AI price used as-is

      await redis.quit();
    });

    it('should use AI price when no cached price is available', async () => {
      // Don't cache any price for XAUUSD

      // Publish LONG command with AI-inferred entry=4236
      const payload = createTranslateResultPayload({
        messageId: 803,
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.LONG,
            extraction: {
              symbol: 'XAUUSD',
              side: CommandSide.BUY,
              isImmediate: true, // Market order
              entry: 4236,
              stopLoss: { price: 4200 },
              takeProfits: [{ price: 4300 }],
            },
          }),
        ],
      });

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload,
      });

      await sleep(500);

      // Verify order was created with AI price (no cached price available)
      const orders = await orderRepository.findAll({
        messageId: 803,
        channelId: '123456789',
      });

      expect(orders).toHaveLength(1);
      expect(orders[0].entry?.entryPrice).toBe(4236); // AI price used
    });
  });

  describe('History Tracking', () => {
    it('should add EXECUTE_REQUEST history entry when publishing execution request', async () => {
      // Create telegram message first (required for history tracking)
      await telegramMessageRepository.create(
        createTestMessage({
          messageId: 2000,
          channelId: '123456789',
          message: 'LONG BTCUSDT entry 50000 sl 49000 tp 51000',
        }),
      );

      // Publish a LONG command
      const payload = createTranslateResultPayload({
        messageId: 2000,
        channelId: '123456789',
        traceToken: 'trace-2000',
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.LONG,
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

      await sleep(500);

      // Verify history entry was added
      const message = await telegramMessageRepository.findByChannelAndMessageId(
        '123456789',
        2000,
      );

      expect(message).not.toBeNull();
      expect(message!.history).toBeDefined();

      // Find EXECUTE_REQUEST history entry
      const executeHistory = message!.history.find(
        (h) => h.type === 'execute-request',
      );

      expect(executeHistory).toBeDefined();
      expect(executeHistory).toMatchObject({
        type: 'execute-request',
        fromService: 'trade-manager',
        targetService: 'executor-service',
        traceToken: 'trace-2000',
      });

      // Verify streamEvent is present
      expect(executeHistory!.streamEvent).toBeDefined();
      expect(executeHistory!.streamEvent!.messageEventType).toBe(
        MessageType.EXECUTE_ORDER_REQUEST,
      );
      expect(executeHistory!.streamEvent!.messageId).toBeDefined();

      // Verify no error message
      expect(executeHistory!.errorMessage).toBeUndefined();

      // Verify notes field contains orderId and executePayload
      expect(executeHistory!.notes).toBeDefined();
      expect(executeHistory!.notes).toMatchObject({
        orderId: expect.any(String),
        executePayload: expect.objectContaining({
          command: CommandEnum.LONG,
          symbol: 'BTCUSDT',
          accountId: 'test-account-1',
          orderId: expect.any(String),
          isImmediate: false,
          entry: 50000,
          stopLoss: { price: 49000 },
          takeProfits: [{ price: 51000 }],
        }),
      });
    });

    it('should add EXECUTE_REQUEST history for each account when multiple accounts exist', async () => {
      // Create second account
      await accountRepository.create({
        accountId: 'test-account-2',
        telegramChannelCode: 'test-channel',
        isActive: true,
        accountType: 'api' as any,
        promptId: 'prompt-123',
        brokerConfig: {
          exchangeCode: 'XM',
          apiKey: 'test-key-2',
          accountId: 'broker-account-2',
          unitsPerLot: 100000,
        },
        createdAt: new Date(),
      });

      // Create telegram message
      await telegramMessageRepository.create(
        createTestMessage({
          messageId: 2001,
          channelId: '123456789',
          message: 'LONG BTCUSDT entry 50000',
        }),
      );

      // Publish a LONG command
      const payload = createTranslateResultPayload({
        messageId: 2001,
        channelId: '123456789',
        traceToken: 'trace-2001',
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

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload,
      });

      await sleep(500);

      // Verify history entries (should have 2 EXECUTE_REQUEST entries, one per account)
      const message = await telegramMessageRepository.findByChannelAndMessageId(
        '123456789',
        2001,
      );

      expect(message).not.toBeNull();
      const executeHistories = message!.history.filter(
        (h) => h.type === 'execute-request',
      );

      // Should have 2 execution request history entries (one per account)
      expect(executeHistories).toHaveLength(2);
      executeHistories.forEach((h) => {
        expect(h).toMatchObject({
          type: 'execute-request',
          fromService: 'trade-manager',
          targetService: 'executor-service',
          traceToken: 'trace-2001',
        });
        expect(h.streamEvent).toBeDefined();
        expect(h.errorMessage).toBeUndefined();

        // Verify notes field
        expect(h.notes).toBeDefined();
        expect(h.notes).toMatchObject({
          orderId: expect.any(String),
          executePayload: expect.objectContaining({
            command: CommandEnum.LONG,
            symbol: 'BTCUSDT',
            orderId: expect.any(String),
          }),
        });
      });
    });

    it('should add EXECUTE_REQUEST history for non-order-creating commands like MOVE_SL', async () => {
      // First create an order
      const longPayload = createTranslateResultPayload({
        messageId: 2002,
        channelId: '123456789',
        traceToken: 'trace-2002',
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

      // Create telegram message
      await telegramMessageRepository.create(
        createTestMessage({
          messageId: 2002,
          channelId: '123456789',
          message: 'LONG BTCUSDT entry 50000 sl 49000',
        }),
      );

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: longPayload,
      });

      await sleep(500);

      // Now send MOVE_SL command
      const moveSLPayload = createTranslateResultPayload({
        messageId: 2002,
        channelId: '123456789',
        traceToken: 'trace-2003',
        commands: [
          createTranslateResultCommand({
            command: CommandEnum.MOVE_SL,
          }),
        ],
      });

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: moveSLPayload,
      });

      await sleep(500);

      // Verify history entries
      const message = await telegramMessageRepository.findByChannelAndMessageId(
        '123456789',
        2002,
      );

      expect(message).not.toBeNull();
      const executeHistories = message!.history.filter(
        (h) => h.type === 'execute-request',
      );

      // Should have 2 EXECUTE_REQUEST entries (one for LONG, one for MOVE_SL)
      expect(executeHistories.length).toBeGreaterThanOrEqual(2);

      // Verify both have proper structure
      executeHistories.forEach((h) => {
        expect(h).toMatchObject({
          type: 'execute-request',
          fromService: 'trade-manager',
          targetService: 'executor-service',
        });
        expect(h.streamEvent).toBeDefined();

        // Verify notes field
        expect(h.notes).toBeDefined();
        expect(h.notes).toMatchObject({
          orderId: expect.any(String),
          executePayload: expect.objectContaining({
            orderId: expect.any(String),
            accountId: expect.any(String),
          }),
        });
      });
    });
  });
});
