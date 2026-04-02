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

  describe('NONE Commands', () => {
    it('should skip non-command messages (isCommand = false)', async () => {
      const handleSpy = jest.spyOn(TranslateResultHandler.prototype, 'handle');

      const payload = {
        receivedAt: Date.now() - 100,
        messageId: 300,
        channelId: '123456789',
        promptId: 'prompt-123',
        traceToken: 'trace-300',
        commands: [
          {
            isCommand: false,
            confidence: 0.3,
            reason: 'Message is not a trading command',
            command: CommandEnum.NONE,
          },
        ],
      };

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload,
      });

      await sleep(500);

      // Verify handle was called
      expect(handleSpy).toHaveBeenCalled();

      // Verify no orders were created
      const orders = await orderRepository.findAll({
        messageId: 300,
        channelId: '123456789',
      });

      expect(orders).toHaveLength(0);

      handleSpy.mockRestore();
    });

    it('should skip NONE commands', async () => {
      const handleSpy = jest.spyOn(TranslateResultHandler.prototype, 'handle');

      const payload = {
        receivedAt: Date.now() - 100,
        messageId: 301,
        channelId: '123456789',
        promptId: 'prompt-123',
        traceToken: 'trace-301',
        commands: [
          {
            isCommand: true,
            confidence: 0.5,
            reason: 'Classified as NONE',
            command: CommandEnum.NONE,
          },
        ],
      };

      await publisher.publish(StreamTopic.TRANSLATE_RESULTS, {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload,
      });

      await sleep(500);

      // Verify handle was called
      expect(handleSpy).toHaveBeenCalled();

      // Verify no orders were created
      const orders = await orderRepository.findAll({
        messageId: 301,
        channelId: '123456789',
      });

      expect(orders).toHaveLength(0);

      handleSpy.mockRestore();
    });
  });
});
