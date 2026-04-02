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
  ExecuteOrderResultType,
} from '@telegram-trading-bot-mini/shared/utils';
import Redis from 'ioredis';
import { startServer, stopServer, ServerContext } from '../../../../src/server';
import { config } from '../../../../src/config';

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
    await trimStream(redis, StreamTopic.ORDER_EXECUTION_RESULTS);
  });

  it('should update OrderCacheService on OrderOpen result', async () => {
    const { orderCacheService } = serverContext.container;

    const payload = {
      orderId: 'integration-order-1',
      accountId: 'acc-1',
      traceToken: 'trace-1',
      messageId: 101,
      channelId: 'chan-1',
      success: true,
      type: ExecuteOrderResultType.OrderOpen,
      symbol: 'XAUUSD',
      side: 'LONG',
      lotSize: 0.1,
      lotSizeRemaining: 0.1,
      takeProfits: [{ price: 2000 }],
    };

    await publisher.publish(StreamTopic.ORDER_EXECUTION_RESULTS, {
      version: '1.0.0',
      type: MessageType.EXECUTE_ORDER_RESULT,
      payload,
    });

    // Wait for processing
    await sleep(1000);

    const cached = orderCacheService.getOrder('integration-order-1');
    expect(cached).toBeDefined();
    expect(cached?.symbol).toBe('XAUUSD');
    expect(cached?.lotSize).toBe(0.1);
  });

  it('should update OrderCacheService on OrderUpdatedTpSl result', async () => {
    const { orderCacheService } = serverContext.container;

    // Pre-populate cache
    await orderCacheService.addOrder(
      'order-2',
      'acc-1',
      'EURUSD',
      'SHORT',
      102,
      'chan-1',
      1.0,
    );

    const payload = {
      orderId: 'order-2',
      accountId: 'acc-1',
      traceToken: 'trace-2',
      messageId: 102,
      channelId: 'chan-1',
      success: true,
      type: ExecuteOrderResultType.OrderUpdatedTpSl,
      lotSizeRemaining: 0.5,
      takeProfits: [{ price: 1.05 }],
    };

    await publisher.publish(StreamTopic.ORDER_EXECUTION_RESULTS, {
      version: '1.0.0',
      type: MessageType.EXECUTE_ORDER_RESULT,
      payload: payload as any,
    });

    await sleep(1000);

    const cached = orderCacheService.getOrder('order-2');
    expect(cached?.lotSizeRemaining).toBe(0.5);
    expect(cached?.takeProfits).toEqual([{ price: 1.05 }]);
  });

  it('should remove from OrderCacheService on OrderClosed result', async () => {
    const { orderCacheService } = serverContext.container;

    // Pre-populate cache
    await orderCacheService.addOrder('order-3', 'acc-1', 'GBPUSD', 'LONG', 103, 'chan-1', 0.5);
    expect(orderCacheService.getOrder('order-3')).toBeDefined();

    const payload = {
      orderId: 'order-3',
      accountId: 'acc-1',
      traceToken: 'trace-3',
      messageId: 103,
      channelId: 'chan-1',
      success: true,
      type: ExecuteOrderResultType.OrderClosed,
    };

    await publisher.publish(StreamTopic.ORDER_EXECUTION_RESULTS, {
      version: '1.0.0',
      type: MessageType.EXECUTE_ORDER_RESULT,
      payload: payload as any,
    });

    await sleep(1000);

    expect(orderCacheService.getOrder('order-3')).toBeUndefined();
  });
});
