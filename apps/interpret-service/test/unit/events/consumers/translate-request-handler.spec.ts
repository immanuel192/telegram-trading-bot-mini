import { TranslateRequestHandler } from '../../../../src/events/consumers/translate-request-handler';
import { IAIService } from '../../../../src/services/ai/ai-service.interface';
import { TranslationResult } from '../../../../src/services/ai/types';
import {
  IStreamPublisher,
  MessageType,
  ServiceName,
  StreamTopic,
  CommandEnum,
} from '@telegram-trading-bot-mini/shared/utils';
import { TelegramMessageRepository, MessageHistoryTypeEnum } from '@dal';
import { fakeLogger } from '@telegram-trading-bot-mini/shared/test-utils';

describe('TranslateRequestHandler', () => {
  let handler: TranslateRequestHandler;
  let mockAiService: jest.Mocked<IAIService>;
  let mockStreamPublisher: jest.Mocked<IStreamPublisher>;
  let mockTelegramMessageRepository: jest.Mocked<TelegramMessageRepository>;
  let mockErrorCapture: any;

  const mockStreamMessageId = '1678888888888-0';
  const mockPayload = {
    promptId: 'test-prompt-id',
    traceToken: 'trace-12345-test-channel',
    messageId: 12345,
    channelId: 'test-channel',
    messageText: 'LONG BTC 50000',
    prevMessage: 'some prev message',
    quotedMessage: undefined,
    quotedFirstMessage: undefined,
    receivedAt: Date.now(),
    exp: Date.now() + 60000,
  };

  const mockStreamMessage: any = {
    payload: mockPayload,
  };

  const mockTranslationResult: TranslationResult = {
    isCommand: true,
    command: CommandEnum.LONG,
    confidence: 0.9,
    reason: 'Matched pattern',
    extraction: {
      symbol: 'BTC',
      isImmediate: true,
      entry: 50000,
      entryZone: null,
      stopLoss: { price: 49000 },
      takeProfits: [{ price: 51000 }],
      validationError: null,
    },
  };

  beforeEach(() => {
    mockAiService = {
      translateMessage: jest.fn(),
    } as any;

    mockStreamPublisher = {
      publish: jest.fn().mockResolvedValue('result-stream-id'),
    } as any;

    mockTelegramMessageRepository = {
      addHistoryEntry: jest.fn(),
    } as any;

    mockErrorCapture = jest.fn();

    handler = new TranslateRequestHandler(
      mockAiService,
      mockStreamPublisher,
      mockTelegramMessageRepository,
      fakeLogger,
      mockErrorCapture,
    );
  });

  it('should successfully process a translation request', async () => {
    // Arrange - AI service now returns array
    mockAiService.translateMessage.mockResolvedValue([mockTranslationResult]);

    // Act
    await handler.handle(mockStreamMessage, mockStreamMessageId);

    // Assert
    // 1. Translate with channelId and promptId
    expect(mockAiService.translateMessage).toHaveBeenCalledWith(
      'LONG BTC 50000',
      expect.objectContaining({
        prevMessage: 'some prev message',
      }),
      'test-channel',
      'test-prompt-id',
      'trace-12345-test-channel',
    );

    // 2. Publish result with commands array (no legacy fields)
    expect(mockStreamPublisher.publish).toHaveBeenCalledWith(
      StreamTopic.TRANSLATE_RESULTS,
      expect.objectContaining({
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: expect.objectContaining({
          promptId: 'test-prompt-id',
          traceToken: 'trace-12345-test-channel',
          commands: [
            {
              isCommand: true,
              command: CommandEnum.LONG,
              confidence: 0.9,
              reason: 'Matched pattern',
              extraction: expect.objectContaining({
                symbol: 'BTC',
                isImmediate: true,
              }),
            },
          ],
        }),
      }),
    );

    // 3. Record history with array result
    expect(mockTelegramMessageRepository.addHistoryEntry).toHaveBeenCalledWith(
      'test-channel',
      12345,
      expect.objectContaining({
        type: MessageHistoryTypeEnum.TRANSLATE_RESULT,
        fromService: ServiceName.INTERPRET_SERVICE,
        targetService: ServiceName.TRADE_MANAGER,
        traceToken: 'trace-12345-test-channel',
        notes: expect.objectContaining({
          promptId: 'test-prompt-id',
          result: [mockTranslationResult],
          duration: expect.any(Number),
        }),
      }),
    );
  });

  it('should handle AI service error', async () => {
    // Arrange
    const error = new Error('AI Error');
    mockAiService.translateMessage.mockRejectedValue(error);

    // Act & Assert
    await expect(
      handler.handle(mockStreamMessage, mockStreamMessageId),
    ).rejects.toThrow('AI Error');

    expect(mockStreamPublisher.publish).not.toHaveBeenCalled();

    // Should record error history with traceToken
    expect(mockTelegramMessageRepository.addHistoryEntry).toHaveBeenCalledWith(
      'test-channel',
      12345,
      expect.objectContaining({
        errorMessage: 'AI Error',
        traceToken: 'trace-12345-test-channel',
        notes: expect.objectContaining({
          promptId: 'test-prompt-id',
          error: 'AI Error',
          stack: expect.any(String),
        }),
      }),
    );
  });
});
