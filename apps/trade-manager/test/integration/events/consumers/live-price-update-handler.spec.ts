import {
  cleanupDb,
  sleep,
  suiteName,
  getTestRedisUrl,
} from '@telegram-trading-bot-mini/shared/test-utils';
import {
  RedisStreamPublisher,
  StreamTopic,
  MessageType,
  trimStream,
} from '@telegram-trading-bot-mini/shared/utils';
import Redis from 'ioredis';
import { startServer, stopServer, ServerContext } from '../../../../src/server';
import { config } from '../../../../src/config';
import { OrderSide } from '@dal';
import { createTestAccount } from '@telegram-trading-bot-mini/shared/test-utils';

describe(suiteName(__filename), () => {
  let serverContext: ServerContext;
  let publisher: RedisStreamPublisher;
  let redis: Redis;

  beforeAll(async () => {
    publisher = new RedisStreamPublisher({
      url: getTestRedisUrl(),
    });
    redis = new Redis(getTestRedisUrl());

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
    await redis.quit();
  });

  beforeEach(async () => {
    await cleanupDb();
    await trimStream(redis, StreamTopic.PRICE_UPDATES);
  });

  it('should consume and acknowledge LIVE_PRICE_UPDATE message', async () => {
    const accountId = 'test-account';
    const symbol = 'XAUUSD';

    // 1. Create account with TP monitoring enabled
    const account = createTestAccount({
      accountId,
      configs: {
        enableTpMonitoring: true,
      } as any,
    });
    await serverContext.container.accountRepository.create(account);

    // 2. Add an order to the cache that has a TP tier
    const orderId = 'order-tp-test';
    await serverContext.container.orderCacheService.addOrder(
      orderId,
      accountId,
      symbol,
      OrderSide.LONG,
      12345, // messageId
      'test-channel', // channelId
      0.1,
      [{ price: 2650.45 }], // Crosses from 2650.4 to 2650.5
    );

    const payload = {
      accountId,
      channelId: 'test-channel',
      symbol,
      currentPrice: {
        bid: 2650.5,
        ask: 2650.7,
      },
      previousPrice: {
        bid: 2650.4,
        ask: 2650.6,
      },
      timestamp: Date.now(),
    };

    const spy = jest.spyOn(serverContext.container.logger, 'info');

    await publisher.publish(StreamTopic.PRICE_UPDATES, {
      version: '1.0',
      type: MessageType.LIVE_PRICE_UPDATE,
      payload,
    });

    // Wait for processing
    await sleep(1000);

    // Verify crossing was detected
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-tp-test',
        tpPrice: 2650.45,
      }),
      expect.stringContaining('Take Profit crossing detected'),
    );

    // Check pending messages count for the group
    const groupName = config('APP_NAME');
    const pendingInfo = await redis.xpending(
      StreamTopic.PRICE_UPDATES,
      groupName,
    );

    const pendingCount = (pendingInfo as any)[0];
    expect(pendingCount).toBe(0);
  });
});
