import {
  fakeLogger,
  suiteName,
} from '@telegram-trading-bot-mini/shared/test-utils';
import {
  StreamMessage,
  MessageType,
  CommandEnum,
  CommandSide,
} from '@telegram-trading-bot-mini/shared/utils';
import { TranslateResultHandler } from '../../../../src/events/consumers/translate-result-handler';

describe(suiteName(__filename), () => {
  let handler: TranslateResultHandler;
  let mockLogger: any;
  let mockErrorCapture: any;
  let mockTelegramChannelCacheService: any;
  let mockAccountRepository: any;
  let mockPipelineService: any;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();

    mockLogger = fakeLogger;

    mockErrorCapture = {
      captureException: jest.fn(),
    };

    mockTelegramChannelCacheService = {
      getChannelCodeById: jest.fn().mockResolvedValue('test-channel-code'),
    };

    mockAccountRepository = {
      findActiveByChannelCode: jest.fn().mockResolvedValue([
        {
          accountId: 'test-account-1',
          channelCode: 'test-channel-code',
          isActive: true,
        },
      ]),
    };

    mockPipelineService = {
      createContext: jest.fn().mockReturnValue({}),
      process: jest.fn().mockResolvedValue(undefined),
    };

    handler = new TranslateResultHandler(
      mockLogger,
      mockErrorCapture,
      mockTelegramChannelCacheService,
      mockAccountRepository,
      mockPipelineService as any,
    );
  });

  it('should process TRANSLATE_MESSAGE_RESULT event and call pipeline', async () => {
    const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT> = {
      version: '1.0',
      type: MessageType.TRANSLATE_MESSAGE_RESULT,
      payload: {
        receivedAt: Date.now() - 200,
        messageId: 100,
        channelId: '123456789',
        promptId: 'prompt-123',
        traceToken: 'trace-123',
        commands: [
          {
            isCommand: true,
            confidence: 0.95,
            reason: 'Message contains LONG command',
            command: CommandEnum.LONG,
            extraction: {
              symbol: 'BTCUSDT',
              side: CommandSide.BUY,
              isImmediate: true,
              meta: {},
              entry: 50000,
              entryZone: [],
              stopLoss: { price: 49000 },
              takeProfits: [{ price: 51000 }],
              validationError: '',
            },
          },
        ],
      },
    };

    await handler.handle(message, '1-0');

    expect(
      mockTelegramChannelCacheService.getChannelCodeById,
    ).toHaveBeenCalledWith('123456789');
    expect(mockAccountRepository.findActiveByChannelCode).toHaveBeenCalledWith(
      'test-channel-code',
    );
    expect(mockPipelineService.createContext).toHaveBeenCalled();
    expect(mockPipelineService.process).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalled();
  });

  it('should skip if no valid commands', async () => {
    const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT> = {
      version: '1.0',
      type: MessageType.TRANSLATE_MESSAGE_RESULT,
      payload: {
        receivedAt: Date.now() - 100,
        messageId: 101,
        channelId: '987654321',
        promptId: 'prompt-456',
        traceToken: 'trace-456',
        commands: [
          {
            isCommand: false,
            confidence: 0.3,
            reason: 'Not a command',
            command: CommandEnum.NONE,
          },
        ],
      },
    } as any;

    await handler.handle(message, '2-0');

    expect(mockPipelineService.process).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.anything(),
      'No valid commands to process - skipping',
    );
  });

  it('should skip if channel code not found', async () => {
    mockTelegramChannelCacheService.getChannelCodeById.mockResolvedValue(null);

    const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT> = {
      version: '1.0',
      type: MessageType.TRANSLATE_MESSAGE_RESULT,
      payload: {
        receivedAt: Date.now() - 100,
        messageId: 102,
        channelId: 'unknown',
        promptId: 'prompt-789',
        traceToken: 'trace-789',
        commands: [{ isCommand: true, command: CommandEnum.LONG }],
      },
    } as any;

    await handler.handle(message, '3-0');

    expect(
      mockAccountRepository.findActiveByChannelCode,
    ).not.toHaveBeenCalled();
    expect(mockPipelineService.process).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.anything(),
      'Channel code not found - skipping message',
    );
  });

  it('should skip if no active accounts found', async () => {
    mockAccountRepository.findActiveByChannelCode.mockResolvedValue([]);

    const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT> = {
      version: '1.0',
      type: MessageType.TRANSLATE_MESSAGE_RESULT,
      payload: {
        receivedAt: Date.now() - 100,
        messageId: 103,
        channelId: 'chan-1',
        promptId: 'prompt-103',
        traceToken: 'trace-103',
        commands: [{ isCommand: true, command: CommandEnum.LONG }],
      },
    } as any;

    await handler.handle(message, '4-0');

    expect(mockPipelineService.process).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.anything(),
      'No active accounts found for channel - skipping',
    );
  });

  it('should handle pipeline errors per command', async () => {
    const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT> = {
      version: '1.0',
      type: MessageType.TRANSLATE_MESSAGE_RESULT,
      payload: {
        receivedAt: Date.now() - 100,
        messageId: 104,
        channelId: 'chan-1',
        promptId: 'prompt-104',
        traceToken: 'trace-104',
        commands: [
          { isCommand: true, command: CommandEnum.LONG },
          { isCommand: true, command: CommandEnum.SHORT },
        ],
      },
    } as any;

    mockPipelineService.process
      .mockRejectedValueOnce(new Error('Pipeline failed'))
      .mockResolvedValueOnce(undefined);

    await handler.handle(message, '5-0');

    expect(mockPipelineService.process).toHaveBeenCalledTimes(2);
    expect(mockLogger.error).toHaveBeenCalled(); // For the first failed command
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ processedCount: 1, skippedCount: 1 }),
      expect.stringContaining('Translation result processing complete'),
    );
  });
});
