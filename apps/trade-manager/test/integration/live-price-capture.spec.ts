import {
  cleanupDb,
  sleep,
  suiteName,
  getTestRedisUrl,
  setupDb,
} from '@telegram-trading-bot-mini/shared/test-utils';
import {
  MessageType,
  StreamMessage,
  StreamTopic,
  CommandEnum,
  CommandSide,
  PriceCacheService,
  RedisStreamPublisher,
} from '@telegram-trading-bot-mini/shared/utils';
import { startServer, stopServer, ServerContext } from '../../src/server';
import {
  AccountRepository,
  telegramChannelRepository,
  telegramMessageRepository,
} from '@dal';
import Redis from 'ioredis';

describe(suiteName(__filename), () => {
  let redis: Redis;
  let serverContext: ServerContext;

  beforeEach(async () => {
    await setupDb();
    await cleanupDb();
    redis = new Redis(getTestRedisUrl());
    await redis.flushdb();
    serverContext = await startServer();
  }, 30000);

  afterEach(async () => {
    if (serverContext) {
      await stopServer(serverContext);
    }
    await redis.quit();
  });

  it('should capture audit metadata (live price and command) when processing translation result', async () => {
    const channelId = '-1003409608482';
    const messageId = 12345;
    const symbol = 'XAUUSD';
    const bidPrice = 2650.5;
    const askPrice = 2651.5;

    // 1. Setup Account and Channel
    const accountRepository = new AccountRepository();
    await accountRepository.create({
      accountId: 'acc-test-1',
      telegramChannelCode: 'TESTCHAN',
      isActive: true,
      brokerConfig: { exchangeCode: 'oanda' },
      configs: { entryPriceValidationThreshold: 0.1 },
    } as any);

    await telegramChannelRepository.create({
      channelId,
      channelCode: 'TESTCHAN',
      isActive: true,
    } as any);

    // 2. Create the Telegram Message
    await telegramMessageRepository.create({
      channelId,
      messageId,
      channelCode: 'TESTCHAN',
      message: 'Buy XAUUSD now',
      sentAt: new Date(),
      receivedAt: new Date(),
      history: [],
      meta: { traceToken: `${messageId}${channelId}` },
    } as any);

    // 3. Mock live price in Redis
    const priceCache = new PriceCacheService('oanda', redis);
    await priceCache.setPrice(symbol, bidPrice, askPrice);

    // 4. Publish TRANSLATE_MESSAGE_RESULT
    const publisher = new RedisStreamPublisher({ url: getTestRedisUrl() });
    const streamMessage: StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT> = {
      version: '1.0',
      type: MessageType.TRANSLATE_MESSAGE_RESULT,
      payload: {
        messageId,
        channelId,
        receivedAt: Date.now(),
        promptId: 'prompt-1',
        traceToken: `trace-${messageId}`,
        commands: [
          {
            isCommand: true,
            confidence: 0.9,
            reason: 'Test command',
            command: CommandEnum.LONG,
            extraction: {
              symbol,
              side: CommandSide.BUY,
              isImmediate: true,
              entry: 2651,
            },
          },
        ],
      },
    };

    await publisher.publish(StreamTopic.TRANSLATE_RESULTS, streamMessage);
    await publisher.close();

    // 5. Poll for message update
    let updatedMessage = null;
    let found = false;
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      updatedMessage =
        await telegramMessageRepository.findByChannelAndMessageId(
          channelId,
          messageId,
        );
      if (
        updatedMessage?.meta?.livePrice &&
        updatedMessage?.meta?.extractedCommand
      ) {
        found = true;
        break;
      }
    }

    // 6. Assertions
    expect(found).toBe(true);
    expect(updatedMessage?.meta?.livePrice).toEqual({
      bid: bidPrice,
      ask: askPrice,
    });
    expect(updatedMessage?.meta?.extractedCommand).toBe(CommandEnum.LONG);
  }, 15000);
});
