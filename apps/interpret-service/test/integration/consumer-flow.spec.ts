/**
 * Integration test for interpret-service consumer flow
 * Tests message validation in the consumer
 */

import {
  cleanupDb,
  sleep,
  suiteName,
  getTestRedisUrl,
  setupDb,
} from '@telegram-trading-bot-mini/shared/test-utils';
import {
  RedisStreamPublisher,
  StreamTopic,
  MessageType,
  trimStream,
} from '@telegram-trading-bot-mini/shared/utils';
import { startServer, stopServer } from '../../src/server';
import { ServerContext } from '../../src/interfaces';
import { TranslateRequestHandler } from '../../src/events/consumers/translate-request-handler';

describe(suiteName(__filename), () => {
  let serverContext: ServerContext;
  let publisher: RedisStreamPublisher;

  beforeAll(async () => {
    await setupDb();
    publisher = new RedisStreamPublisher({
      url: getTestRedisUrl(),
    });
    await trimStream(publisher.client, StreamTopic.TRANSLATE_REQUESTS);

    // Start server (which starts consumers)
    serverContext = await startServer();
  }, 30000); // 30 second timeout for setup

  afterAll(async () => {
    if (serverContext) {
      await stopServer(serverContext);
    }
    await publisher.close();
  }, 30000); // 30 second timeout for cleanup

  afterEach(async () => {
    await cleanupDb();
  });

  it('should consume and process TRANSLATE_MESSAGE_REQUEST event from Redis Stream', async () => {
    // Spy on TranslateRequestHandler.handle
    const handleSpy = jest.spyOn(TranslateRequestHandler.prototype, 'handle');

    // Publish a valid message to the stream
    const payload = {
      accountId: 'test-account-001',
      promptId: 'test-prompt-001',
      messageId: 100,
      channelId: 'test-channel-123',
      messageText: 'LONG BTC 50000',
      prevMessage: '',
      traceToken: 'trace-100test-channel-123',
      receivedAt: Date.now(),
      exp: Date.now() + 60000,
    };

    await publisher.publish(StreamTopic.TRANSLATE_REQUESTS, {
      version: '1.0',
      type: MessageType.TRANSLATE_MESSAGE_REQUEST,
      payload,
    });

    // Wait for consumer to process
    await sleep(200);

    // Verify handle was called
    expect(handleSpy).toHaveBeenCalled();
    const calledMessage = handleSpy.mock.calls[0][0];
    expect(calledMessage.payload).toEqual(expect.objectContaining(payload));

    handleSpy.mockRestore();
  });

  it('should reject invalid TRANSLATE_MESSAGE_REQUEST event (missing required fields)', async () => {
    // Spy on TranslateRequestHandler.handle
    const handleSpy = jest.spyOn(TranslateRequestHandler.prototype, 'handle');

    // Publish an invalid message (missing required fields)
    const invalidPayload = {
      promptId: 'test-prompt-001',
      // Missing messageId, channelId, messageText, prevMessage
    };

    await publisher.publish(StreamTopic.TRANSLATE_REQUESTS, {
      version: '1.0',
      type: MessageType.TRANSLATE_MESSAGE_REQUEST,
      payload: invalidPayload,
    } as any);

    // Wait for consumer to process
    await sleep(200);

    // Verify handle was NOT called (message should be rejected by validator)
    expect(handleSpy).not.toHaveBeenCalled();

    handleSpy.mockRestore();
  });
});
