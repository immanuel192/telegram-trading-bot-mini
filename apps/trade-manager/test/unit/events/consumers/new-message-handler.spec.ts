import {
  fakeLogger,
  suiteName,
} from '@telegram-trading-bot-mini/shared/test-utils';
import {
  StreamMessage,
  StreamTopic,
  ServiceName,
  MessageType,
} from '@telegram-trading-bot-mini/shared/utils';
import { NewMessageHandler } from '../../../../src/events/consumers/new-message-handler';
import {
  TelegramMessageRepository,
  AccountRepository,
  MessageHistoryTypeEnum,
} from '@dal';

describe(suiteName(__filename), () => {
  let handler: NewMessageHandler;
  let mockLogger: any;
  let mockRepo: jest.Mocked<TelegramMessageRepository>;
  let mockAccountRepo: jest.Mocked<AccountRepository>;
  let mockPublisher: any;
  let mockErrorCapture: any;

  beforeEach(() => {
    jest.restoreAllMocks();

    mockLogger = fakeLogger;

    mockRepo = {
      findByChannelAndMessageId: jest.fn(),
      addHistoryEntry: jest.fn(),
    } as any;

    mockAccountRepo = {
      findDistinctPromptIdsByChannelCode: jest.fn(),
    } as any;

    mockPublisher = {
      publish: jest.fn().mockResolvedValue('stream-id-123'),
      close: jest.fn(),
    };

    mockErrorCapture = {
      captureException: jest.fn(),
    };

    handler = new NewMessageHandler(
      mockRepo,
      mockAccountRepo,
      mockPublisher,
      mockLogger,
      mockErrorCapture,
    );
  });

  it('should process NEW_MESSAGE event and publish translation request per promptId', async () => {
    const message: StreamMessage<MessageType.NEW_MESSAGE> = {
      version: '1.0',
      type: MessageType.NEW_MESSAGE,
      payload: {
        channelCode: 'TEST_CHANNEL',
        channelId: '123456789',
        messageId: 100,
        receivedAt: Date.now(),
        traceToken: 'trace-123',
        exp: Date.now() + 60000,
      },
    };

    // Mock repository response
    mockRepo.findByChannelAndMessageId.mockResolvedValue({
      message: 'Test message',
      receivedAt: new Date(),
      prevMessage: { message: 'Previous message' },
    } as any);

    // Mock returns distinct promptIds (not accounts)
    mockAccountRepo.findDistinctPromptIdsByChannelCode.mockResolvedValue([
      'prompt-123',
    ]);

    await handler.handle(message, '1-0');

    // Verify logging
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        streamMessageId: '1-0',
        messageType: MessageType.NEW_MESSAGE,
      }),
      'Received NEW_MESSAGE event',
    );

    // Verify repository fetch
    expect(mockRepo.findByChannelAndMessageId).toHaveBeenCalledWith(
      '123456789',
      100,
    );

    expect(
      mockAccountRepo.findDistinctPromptIdsByChannelCode,
    ).toHaveBeenCalledWith('TEST_CHANNEL');

    // Verify publisher called once per unique promptId (no accountId)
    expect(mockPublisher.publish).toHaveBeenCalledTimes(1);
    expect(mockPublisher.publish).toHaveBeenCalledWith(
      StreamTopic.TRANSLATE_REQUESTS,
      expect.objectContaining({
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload: expect.objectContaining({
          messageId: 100,
          channelId: '123456789',
          traceToken: 'trace-123',
          promptId: 'prompt-123',
          messageText: 'Test message',
          prevMessage: 'Previous message',
        }),
      }),
    );

    // Verify payload does NOT contain accountId
    const publishCall = mockPublisher.publish.mock.calls[0];
    expect(publishCall[1].payload).not.toHaveProperty('accountId');

    // Verify history entry added with promptId only (no accountId)
    expect(mockRepo.addHistoryEntry).toHaveBeenCalledWith(
      '123456789',
      100,
      expect.objectContaining({
        type: MessageHistoryTypeEnum.TRANSLATE_MESSAGE,
        fromService: ServiceName.TRADE_MANAGER,
        targetService: ServiceName.INTERPRET_SERVICE,
        traceToken: 'trace-123',
        streamEvent: {
          messageEventType: MessageType.TRANSLATE_MESSAGE_REQUEST,
          messageId: 'stream-id-123',
        },
        notes: JSON.stringify({
          promptId: 'prompt-123',
        }),
      }),
    );
  });

  it('should publish multiple translation requests for multiple unique promptIds', async () => {
    const message: StreamMessage<MessageType.NEW_MESSAGE> = {
      version: '1.0',
      type: MessageType.NEW_MESSAGE,
      payload: {
        channelCode: 'TEST_CHANNEL',
        channelId: '123456789',
        messageId: 100,
        receivedAt: Date.now(),
        traceToken: 'trace-123',
        exp: Date.now() + 60000,
      },
    };

    // Mock repository response
    mockRepo.findByChannelAndMessageId.mockResolvedValue({
      message: 'Test message',
      receivedAt: new Date(),
      prevMessage: { message: 'Previous message' },
    } as any);

    // Two distinct promptIds
    mockAccountRepo.findDistinctPromptIdsByChannelCode.mockResolvedValue([
      'prompt-1',
      'prompt-2',
    ]);

    await handler.handle(message, '1-0');

    // Should publish 2 requests (one per unique promptId)
    expect(mockPublisher.publish).toHaveBeenCalledTimes(2);
    expect(mockPublisher.publish).toHaveBeenCalledWith(
      StreamTopic.TRANSLATE_REQUESTS,
      expect.objectContaining({
        payload: expect.objectContaining({
          promptId: 'prompt-1',
          traceToken: 'trace-123',
        }),
      }),
    );
    expect(mockPublisher.publish).toHaveBeenCalledWith(
      StreamTopic.TRANSLATE_REQUESTS,
      expect.objectContaining({
        payload: expect.objectContaining({
          promptId: 'prompt-2',
          traceToken: 'trace-123',
        }),
      }),
    );

    // Verify no accountId in any payload
    mockPublisher.publish.mock.calls.forEach((call) => {
      expect(call[1].payload).not.toHaveProperty('accountId');
    });

    // Verify 2 history entries (one per promptId)
    expect(mockRepo.addHistoryEntry).toHaveBeenCalledTimes(2);
  });

  it('should skip processing if no promptIds found for channel', async () => {
    const message: StreamMessage<MessageType.NEW_MESSAGE> = {
      version: '1.0',
      type: MessageType.NEW_MESSAGE,
      payload: {
        channelCode: 'TEST_CHANNEL',
        channelId: '123456789',
        messageId: 100,
        receivedAt: Date.now(),
        traceToken: 'trace-123',
        exp: Date.now() + 60000,
      },
    };

    // Mock repository response
    mockRepo.findByChannelAndMessageId.mockResolvedValue({
      message: 'Test message',
    } as any);

    // No promptIds found
    mockAccountRepo.findDistinctPromptIdsByChannelCode.mockResolvedValue([]);

    await handler.handle(message, '1-0');

    expect(mockPublisher.publish).not.toHaveBeenCalled();
    expect(mockRepo.addHistoryEntry).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: '123456789', messageId: 100 }),
      'No active accounts found for channel, skipping translation',
    );
  });

  it('should publish only ONE request when multiple accounts share same promptId', async () => {
    const message: StreamMessage<MessageType.NEW_MESSAGE> = {
      version: '1.0',
      type: MessageType.NEW_MESSAGE,
      payload: {
        channelCode: 'TEST_CHANNEL',
        channelId: '123456789',
        messageId: 100,
        receivedAt: Date.now(),
        traceToken: 'trace-123',
        exp: Date.now() + 60000,
      },
    };

    mockRepo.findByChannelAndMessageId.mockResolvedValue({
      message: 'Test message',
      receivedAt: new Date(),
    } as any);

    // Multiple accounts with same promptId → only one unique promptId returned
    mockAccountRepo.findDistinctPromptIdsByChannelCode.mockResolvedValue([
      'prompt-shared',
    ]);

    await handler.handle(message, '1-0');

    // Should publish only 1 request (one per unique promptId, not per account)
    expect(mockPublisher.publish).toHaveBeenCalledTimes(1);
    expect(mockPublisher.publish).toHaveBeenCalledWith(
      StreamTopic.TRANSLATE_REQUESTS,
      expect.objectContaining({
        payload: expect.objectContaining({
          promptId: 'prompt-shared',
        }),
      }),
    );

    // Verify no accountId in payload
    const publishCall = mockPublisher.publish.mock.calls[0];
    expect(publishCall[1].payload).not.toHaveProperty('accountId');

    // Verify history entry includes only promptId
    expect(mockRepo.addHistoryEntry).toHaveBeenCalledWith(
      '123456789',
      100,
      expect.objectContaining({
        notes: JSON.stringify({
          promptId: 'prompt-shared',
        }),
      }),
    );
  });

  it('should skip processing if message not found in database', async () => {
    const message: StreamMessage<MessageType.NEW_MESSAGE> = {
      version: '1.0',
      type: MessageType.NEW_MESSAGE,
      payload: {
        channelCode: 'TEST_CHANNEL',
        channelId: '123456789',
        messageId: 100,
        receivedAt: Date.now(),
        traceToken: 'trace-123',
        exp: Date.now() + 60000,
      },
    };

    // Mock repository response null
    mockRepo.findByChannelAndMessageId.mockResolvedValue(null);

    await handler.handle(message, '1-0');

    expect(mockRepo.findByChannelAndMessageId).toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: '123456789', messageId: 100 }),
      'Message not found in database, skipping processing',
    );
    expect(mockErrorCapture.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ channelId: '123456789', messageId: 100 }),
    );
    expect(mockPublisher.publish).not.toHaveBeenCalled();
  });

  it('should process multiple distinct promptIds independently', async () => {
    const message: StreamMessage<MessageType.NEW_MESSAGE> = {
      version: '1.0',
      type: MessageType.NEW_MESSAGE,
      payload: {
        channelCode: 'TEST_CHANNEL',
        channelId: '123456789',
        messageId: 100,
        receivedAt: Date.now(),
        traceToken: 'trace-123',
        exp: Date.now() + 60000,
      },
    };

    mockRepo.findByChannelAndMessageId.mockResolvedValue({
      message: 'Test message',
      receivedAt: new Date(),
    } as any);

    // Three distinct promptIds
    mockAccountRepo.findDistinctPromptIdsByChannelCode.mockResolvedValue([
      'prompt-A',
      'prompt-B',
      'prompt-C',
    ]);

    await handler.handle(message, '1-0');

    // Should publish 3 requests (one per unique promptId)
    expect(mockPublisher.publish).toHaveBeenCalledTimes(3);

    // Verify each promptId gets its own request
    expect(mockPublisher.publish).toHaveBeenCalledWith(
      StreamTopic.TRANSLATE_REQUESTS,
      expect.objectContaining({
        payload: expect.objectContaining({
          promptId: 'prompt-A',
        }),
      }),
    );

    expect(mockPublisher.publish).toHaveBeenCalledWith(
      StreamTopic.TRANSLATE_REQUESTS,
      expect.objectContaining({
        payload: expect.objectContaining({
          promptId: 'prompt-B',
        }),
      }),
    );

    expect(mockPublisher.publish).toHaveBeenCalledWith(
      StreamTopic.TRANSLATE_REQUESTS,
      expect.objectContaining({
        payload: expect.objectContaining({
          promptId: 'prompt-C',
        }),
      }),
    );

    // Verify no accountId in any payload
    mockPublisher.publish.mock.calls.forEach((call) => {
      expect(call[1].payload).not.toHaveProperty('accountId');
    });
  });
});
