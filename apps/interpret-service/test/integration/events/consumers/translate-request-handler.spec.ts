import {
  suiteName,
  setupDb,
  teardownDb,
  cleanupDb,
  fakeLogger,
} from '@telegram-trading-bot-mini/shared/test-utils';
import { TranslateRequestHandler } from '../../../../src/events/consumers/translate-request-handler';
import {
  TelegramMessageRepository,
  PromptRuleRepository,
  MessageHistoryTypeEnum,
} from '@dal';
import { PromptRule } from '@dal/models/prompt-rule.model';
import { TelegramMessage } from '@dal/models/telegram-message.model';
import {
  IStreamPublisher,
  MessageType,
  StreamTopic,
  ServiceName,
  CommandEnum,
} from '@telegram-trading-bot-mini/shared/utils';
import { IAIService } from '../../../../src/services/ai/ai-service.interface';
import { TranslationResult } from '../../../../src/services/ai/types';

describe(suiteName(__filename), () => {
  let handler: TranslateRequestHandler;
  let telegramMessageRepository: TelegramMessageRepository;
  let promptRuleRepository: PromptRuleRepository;
  let mockStreamPublisher: jest.Mocked<IStreamPublisher>;
  let mockAiService: jest.Mocked<IAIService>;
  let mockErrorCapture: any;

  // Test data
  const channelId = 'test-channel-123';
  const messageId = 1001;
  const promptId = 'test-prompt-001';
  const streamMessageId = '1678888888888-0';

  const testPrompt: Partial<PromptRule> = {
    promptId,
    name: 'Test Prompt',
    description: 'Integration Test Prompt',
    systemPrompt: 'Classify this...\n\nExtract this...',
  };

  const testMessage: Partial<TelegramMessage> = {
    channelId,
    messageId,
    message: 'LONG BTC 50000',
    date: new Date(),
    createdAt: new Date(),
    history: [],
  };

  const mockTranslationResult: TranslationResult = {
    isCommand: true,
    command: CommandEnum.LONG,
    confidence: 0.95,
    reason: 'Clearly a long position',
    extraction: {
      symbol: 'BTCUSD',
      isImmediate: true,
      entry: 50000,
      entryZone: null,
      stopLoss: { price: 49000 },
      takeProfits: [{ price: 51000 }],
      validationError: null,
    },
  };

  beforeAll(async () => {
    await setupDb();

    telegramMessageRepository = new TelegramMessageRepository();
    promptRuleRepository = new PromptRuleRepository();

    mockStreamPublisher = {
      publish: jest.fn().mockResolvedValue('result-stream-id'),
      close: jest.fn(),
    };

    mockAiService = {
      translateMessage: jest.fn(),
    };

    mockErrorCapture = jest.fn();

    handler = new TranslateRequestHandler(
      mockAiService,
      mockStreamPublisher,
      telegramMessageRepository,
      fakeLogger,
      mockErrorCapture,
    );
  });

  afterAll(async () => {
    await teardownDb();
  });

  beforeEach(async () => {
    await cleanupDb();
    jest.clearAllMocks();

    // Seed data
    await promptRuleRepository.create({ ...testPrompt } as PromptRule);
    await telegramMessageRepository.create({
      ...testMessage,
    } as TelegramMessage);
  });

  it('should process request, translate via AI, publish result, and update history', async () => {
    // Arrange - AI service returns array
    mockAiService.translateMessage.mockResolvedValue([mockTranslationResult]);

    const requestMessage = {
      payload: {
        promptId,
        messageId: messageId,
        channelId,
        messageText: 'LONG BTC 50000',
        prevMessage: '',
        traceToken: 'trace-test',
        receivedAt: Date.now(),
        exp: Date.now() + 60000,
      },
    } as any;

    // Verify prompt exists
    const prompt = await promptRuleRepository.findByPromptId(promptId);
    if (!prompt) {
      console.error('Prompt not found in DB:', promptId);
      // Re-create if missing (should be there from beforeEach)
      await promptRuleRepository.create({ ...testPrompt } as PromptRule);
    }

    // Act
    await handler.handle(requestMessage, streamMessageId);

    // Assert
    // 1. AI Service called with channelId and promptId
    expect(mockAiService.translateMessage).toHaveBeenCalledWith(
      'LONG BTC 50000',
      expect.anything(),
      channelId,
      promptId,
      'trace-test',
    );

    // 2. Result published with commands array
    expect(mockStreamPublisher.publish).toHaveBeenCalledWith(
      StreamTopic.TRANSLATE_RESULTS,
      expect.objectContaining({
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: expect.objectContaining({
          promptId,
          messageId: messageId,
          channelId,
          commands: [
            {
              isCommand: true,
              command: CommandEnum.LONG,
              confidence: 0.95,
              reason: 'Clearly a long position',
              extraction: expect.objectContaining({
                symbol: 'BTCUSD',
                isImmediate: true,
                entry: 50000,
                stopLoss: { price: 49000 },
              }),
            },
          ],
        }),
      }),
    );

    // 3. History updated in DB
    const updatedMessage =
      await telegramMessageRepository.findByChannelAndMessageId(
        channelId,
        messageId,
      );

    expect(updatedMessage).toBeDefined();
    expect(updatedMessage!.history).toHaveLength(1);
    const historyEntry = updatedMessage!.history[0];

    expect(historyEntry).toMatchObject({
      type: MessageHistoryTypeEnum.TRANSLATE_RESULT,
      fromService: ServiceName.INTERPRET_SERVICE,
      targetService: ServiceName.TRADE_MANAGER,
    });

    const notes = historyEntry.notes;
    expect(notes.promptId).toBe(promptId);
    expect(notes.result).toBeDefined();
    expect(notes.result).toHaveLength(1); // Array of results
    expect(notes.result[0].isCommand).toBe(true);
    expect(notes.result[0].command).toBe(CommandEnum.LONG);
    expect(notes.duration).toBeDefined();
  });

  it('should handle missing prompt by returning error classification', async () => {
    // Arrange
    const unknownPromptId = 'unknown-prompt';

    // Mock AI service to return error classification (as it would when prompt not found)
    const errorResult: TranslationResult = {
      isCommand: false,
      command: CommandEnum.NONE,
      confidence: 0,
      reason: 'Error: Prompt rule not found: unknown-prompt',
      extraction: null,
    };
    mockAiService.translateMessage.mockResolvedValue([errorResult]);

    const requestMessage = {
      payload: {
        promptId: unknownPromptId,
        messageId: messageId,
        channelId,
        messageText: 'LONG BTC',
        prevMessage: '',
        traceToken: 'trace-test',
        receivedAt: Date.now(),
        exp: Date.now() + 60000,
      },
    } as any;

    // Act
    await handler.handle(requestMessage, streamMessageId);

    // Assert
    // AI service should still be called (it handles the error internally)
    expect(mockAiService.translateMessage).toHaveBeenCalledWith(
      'LONG BTC',
      expect.anything(),
      channelId,
      unknownPromptId,
      'trace-test',
    );

    // Result should be published with error classification in commands array
    expect(mockStreamPublisher.publish).toHaveBeenCalledWith(
      StreamTopic.TRANSLATE_RESULTS,
      expect.objectContaining({
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: expect.objectContaining({
          promptId: unknownPromptId,
          commands: [
            {
              isCommand: false,
              command: CommandEnum.NONE,
              confidence: 0,
              reason: expect.stringContaining('Prompt rule not found'),
              extraction: null,
            },
          ],
        }),
      }),
    );

    // Verify DB history shows the error
    const updatedMessage =
      await telegramMessageRepository.findByChannelAndMessageId(
        channelId,
        messageId,
      );

    expect(updatedMessage).toBeDefined();
    expect(updatedMessage!.history).toHaveLength(1);
    const historyEntry = updatedMessage!.history[0];

    expect(historyEntry.type).toBe(MessageHistoryTypeEnum.TRANSLATE_RESULT);
    const notes = historyEntry.notes;
    expect(notes.result).toHaveLength(1);
    expect(notes.result[0].reason).toContain('Prompt rule not found');
  });

  it('should handle MOVE_SL command with minimal fields (only required fields)', async () => {
    // Arrange - AI returns minimal extraction (only symbol, isImmediate, stopLoss)
    const minimalResult: TranslationResult = {
      isCommand: true,
      command: CommandEnum.MOVE_SL,
      confidence: 0.95,
      reason: 'User wants to move stop loss',
      extraction: {
        symbol: 'XAUUSD',
        isImmediate: false,
        // Optional fields omitted by AI
        stopLoss: { price: 4287 },
        // These will be undefined in the parsed response
        entry: null,
        entryZone: null,
        takeProfits: [],
        validationError: null,
      },
    };
    mockAiService.translateMessage.mockResolvedValue([minimalResult]);

    const requestMessage = {
      payload: {
        promptId,
        messageId: messageId,
        channelId,
        messageText: 'rời sl 4287 nhé',
        prevMessage: 'vào thêm giá 80 mn',
        traceToken: 'trace-test-minimal',
        receivedAt: Date.now(),
        exp: Date.now() + 60000,
      },
    } as any;

    // Act
    await handler.handle(requestMessage, streamMessageId);

    // Assert - Result published with commands array
    expect(mockStreamPublisher.publish).toHaveBeenCalledWith(
      StreamTopic.TRANSLATE_RESULTS,
      expect.objectContaining({
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: expect.objectContaining({
          commands: [
            {
              isCommand: true,
              command: CommandEnum.MOVE_SL,
              confidence: 0.95,
              reason: 'User wants to move stop loss',
              extraction: expect.objectContaining({
                symbol: 'XAUUSD',
                isImmediate: false,
                stopLoss: { price: 4287 },
              }),
            },
          ],
        }),
      }),
    );

    // Verify extraction is passed through correctly in commands array
    const publishCall = mockStreamPublisher.publish.mock.calls[0];
    const payload = publishCall[1].payload as any;

    expect(payload.commands).toHaveLength(1);
    expect(payload.commands[0].extraction).toBeDefined();
    expect(payload.commands[0].extraction.symbol).toBe('XAUUSD');
    expect(payload.commands[0].extraction.stopLoss).toEqual({ price: 4287 });
  });
});
