import {
  cleanupDb,
  sleep,
  suiteName,
  getTestRedisUrl,
  createTestAccount,
  createTestChannel,
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

  describe('Multiple Accounts', () => {
    it('should process LONG command for multiple accounts', async () => {
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

      const payload = {
        receivedAt: Date.now() - 200,
        messageId: 400,
        channelId: '123456789',
        promptId: 'prompt-123',
        traceToken: 'trace-400',
        commands: [
          {
            isCommand: true,
            confidence: 0.95,
            reason: 'LONG command for multiple accounts',
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
        payload,
      });

      await sleep(500);

      // Verify orders were created for both accounts
      const orders = await orderRepository.findAll({
        messageId: 400,
        channelId: '123456789',
      });

      expect(orders).toHaveLength(2);
      expect(orders.map((o) => o.accountId).sort()).toEqual([
        'test-account-1',
        'test-account-2',
      ]);
    });
  });
});
