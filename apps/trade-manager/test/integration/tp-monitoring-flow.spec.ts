import {
  cleanupDb,
  sleep,
  suiteName,
  getTestRedisUrl,
  readStreamMessages,
  createTestAccount,
} from '@telegram-trading-bot-mini/shared/test-utils';
import {
  RedisStreamPublisher,
  StreamTopic,
  MessageType,
  trimStream,
  ExecuteOrderResultType,
} from '@telegram-trading-bot-mini/shared/utils';
import Redis from 'ioredis';
import { startServer, stopServer, ServerContext } from '../../src/server';
import { OrderSide } from '@dal';

describe(suiteName(__filename), () => {
  let serverContext: ServerContext;
  let publisher: RedisStreamPublisher;
  let redis: Redis;

  beforeAll(async () => {
    publisher = new RedisStreamPublisher({
      url: getTestRedisUrl(),
    });
    redis = new Redis(getTestRedisUrl());

    // Start server (starts consumers)
    serverContext = await startServer();
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
    await trimStream(redis, StreamTopic.ORDER_EXECUTION_REQUESTS);
    await trimStream(redis, StreamTopic.ORDER_EXECUTION_RESULTS);
  });

  it('should detect TP hit, publish CLOSE_PARTIAL, and sync cache on result', async () => {
    const accountId = 'user-1';
    const symbol = 'XAUUSD';
    const originalMessageId = 12345;

    // 1. Setup: Account and cached order
    const account = createTestAccount({
      accountId,
      configs: { enableTpMonitoring: true } as any,
    });
    await serverContext.container.accountRepository.create(account);

    const orderId = 'order-abc';
    await serverContext.container.orderCacheService.addOrder(
      orderId,
      accountId,
      symbol,
      OrderSide.LONG,
      originalMessageId,
      'channel-1',
      0.1,
      [{ price: 2650.5, isUsed: false }],
    );

    // 2. Publish LIVE_PRICE_UPDATE crossing 2650.5
    await publisher.publish(StreamTopic.PRICE_UPDATES, {
      version: '1.0',
      type: MessageType.LIVE_PRICE_UPDATE,
      payload: {
        accountId,
        channelId: 'channel-1',
        symbol,
        currentPrice: { bid: 2650.6, ask: 2650.7 },
        previousPrice: { bid: 2650.4, ask: 2650.5 },
        timestamp: Date.now(),
      },
    });

    // Wait for trade-manager to process and publish command
    await sleep(1000);

    // 3. Verify CLOSE_PARTIAL request was published
    // Use the helper utility
    const requests = await readStreamMessages(
      redis,
      StreamTopic.ORDER_EXECUTION_REQUESTS,
    );
    expect(requests.length).toBe(1);

    const requestPayload = requests[0].payload as any;

    expect(requestPayload.command).toBe('CLOSE_PARTIAL');
    expect(requestPayload.orderId).toBe(orderId);
    expect(requestPayload.messageId).toBe(1234501); // originalMessageId * 100 + 1

    // 4. Simulate EXECUTE_ORDER_RESULT (Partial Close Success)
    await publisher.publish(StreamTopic.ORDER_EXECUTION_RESULTS, {
      version: '1.0',
      type: MessageType.EXECUTE_ORDER_RESULT,
      payload: {
        orderId,
        accountId,
        traceToken: requestPayload.traceToken,
        messageId: 1234501,
        channelId: 'channel-1',
        success: true,
        type: ExecuteOrderResultType.OrderUpdatedTpSl,
        lotSizeRemaining: 0.09, // 0.1 - 10%
        takeProfits: [{ price: 2650.5, isUsed: true }],
      },
    });

    // Wait for trade-manager to sync cache
    await sleep(500);

    // 5. Verify cache is synced
    const cached = serverContext.container.orderCacheService.getOrder(orderId);
    expect(cached?.lotSizeRemaining).toBe(0.09);
    expect(cached?.takeProfits[0].isUsed).toBe(true);

    // 6. Verify same TP hit again does NOT trigger another command
    await publisher.publish(StreamTopic.PRICE_UPDATES, {
      version: '1.0',
      type: MessageType.LIVE_PRICE_UPDATE,
      payload: {
        accountId,
        channelId: 'channel-1',
        symbol,
        currentPrice: { bid: 2650.7, ask: 2650.8 },
        previousPrice: { bid: 2650.6, ask: 2650.7 },
        timestamp: Date.now(),
      },
    });

    await sleep(500);
    const requestsAfter = await readStreamMessages(
      redis,
      StreamTopic.ORDER_EXECUTION_REQUESTS,
    );
    expect(requestsAfter.length).toBe(1); // Still 1, no new command
  });
});
