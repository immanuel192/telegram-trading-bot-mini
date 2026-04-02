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
import { startServer, stopServer, ServerContext } from '../../src/server';
import { NewMessageHandler } from '../../src/events/consumers/new-message-handler';

describe(suiteName(__filename), () => {
  let serverContext: ServerContext;
  let publisher: RedisStreamPublisher;

  beforeAll(async () => {
    await setupDb();
    publisher = new RedisStreamPublisher({
      url: getTestRedisUrl(),
    });

    // Start server (which starts consumers)
    serverContext = await startServer();
  });

  beforeEach(async () => {
    await trimStream(publisher.client, StreamTopic.MESSAGES);
  });

  afterAll(async () => {
    if (serverContext) {
      await stopServer(serverContext);
    }
    await publisher.close();
  });

  afterEach(async () => {
    await cleanupDb();
  });

  it('should consume and process NEW_MESSAGE event from Redis Stream', async () => {
    // Spy on NewMessageHandler.handle
    const handleSpy = jest.spyOn(NewMessageHandler.prototype, 'handle');

    // Publish a message to the stream
    const payload = {
      channelCode: 'TEST_CHANNEL',
      channelId: '123456789',
      messageId: 100,
      traceToken: 'trace-123',
      receivedAt: Date.now(),
      exp: Date.now() + 60000,
    };

    await publisher.publish(StreamTopic.MESSAGES, {
      version: '1.0',
      type: MessageType.NEW_MESSAGE,
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

  it('should reject invalid NEW_MESSAGE event (missing required fields)', async () => {
    // Spy on NewMessageHandler.handle
    const handleSpy = jest.spyOn(NewMessageHandler.prototype, 'handle');

    // Publish an invalid message (missing required fields)
    const invalidPayload = {
      channelCode: 'TEST_CHANNEL',
      // Missing channelId, messageId, traceToken, exp
    };

    await publisher.publish(StreamTopic.MESSAGES, {
      version: '1.0',
      type: MessageType.NEW_MESSAGE,
      payload: invalidPayload,
    } as any);

    // Wait for consumer to process
    await sleep(200);

    // Verify handle was NOT called (message should be rejected by validator)
    expect(handleSpy).not.toHaveBeenCalled();

    handleSpy.mockRestore();
  });
});
