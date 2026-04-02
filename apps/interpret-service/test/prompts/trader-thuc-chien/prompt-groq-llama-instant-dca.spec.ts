/**
 * Purpose: Prompt test for Trader Thuc Chien (XAUUSD) trading signals using Groq AI
 * Tests: AI prompt effectiveness with real-world scenarios
 * Note: Requires AI_GROQ_API_KEY environment variable
 */

import { sleep, suiteName } from '@telegram-trading-bot-mini/shared/test-utils';
import {
  CommandEnum,
  CommandSide,
} from '@telegram-trading-bot-mini/shared/utils';
import { buildTestContext } from '../utils/context-builder';
import { GroqAIService } from '../../../src/services/ai/providers/groq/groq-ai.service';
import { PromptCacheService } from '../../../src/services/prompt-cache.service';
import { IAIService } from '../../../src/services/ai/ai-service.interface';
import { fakeLogger } from '@telegram-trading-bot-mini/shared/test-utils';
import * as fs from 'fs';
import * as path from 'path';

describe(suiteName(__filename), () => {
  // Skip tests if no API key
  const skipTests = !process.env.AI_GROQ_API_KEY;

  if (skipTests) {
    it.skip('Skipping prompt tests - AI_GROQ_API_KEY not set', () => {
      // Placeholder test
    });
    return;
  }

  let aiService: IAIService;
  let promptCacheService: PromptCacheService;
  const promptId = 'trader-thuc-chien-test-prompt';
  const channelId = 'test-channel';
  let systemPrompt: string;

  // const TEST_MODEL = 'llama-3.1-8b-instant';
  const TEST_MODEL = 'meta-llama/llama-4-maverick-17b-128e-instruct';

  beforeAll(async () => {
    const promptPath = path.join(
      __dirname,
      '../../../prompts/trader-thuc-chien/prompt.txt',
    );

    systemPrompt = fs.readFileSync(promptPath, 'utf-8');
    console.log(
      `\n📝 Using trader-thuc-chien prompt.txt for model: ${TEST_MODEL}\n`,
    );

    // Mock PromptCacheService
    promptCacheService = {
      getPrompt: jest.fn().mockResolvedValue({
        promptId,
        systemPrompt,
        promptHash: 'test-hash',
      }),
      getPromptById: jest.fn().mockResolvedValue({
        promptId,
        systemPrompt,
        name: 'Trader Thuc Chien XAUUSD',
        description: 'Test prompt for XAUUSD signals',
      }),
      getCachedPrompt: jest.fn().mockResolvedValue({
        promptId,
        systemPrompt,
        promptHash: 'test-hash',
      }),
    } as any;

    const apiKey = process.env.AI_GROQ_API_KEY!;

    aiService = new GroqAIService(
      apiKey,
      TEST_MODEL,
      promptCacheService,
      fakeLogger,
    );
  });

  afterEach(async () => {
    // Rate limiting: 250ms between tests
    await sleep(250);
  });

  const runTranslate = async (
    messageText: string,
    contextParams?: Parameters<typeof buildTestContext>[0],
  ) => {
    const results = await aiService.translateMessage(
      messageText,
      buildTestContext(contextParams),
      channelId,
      promptId,
      'test-trace',
    );

    // Return all commands (array) - will support multiple commands soon
    return results;
  };

  describe('DCA - Dollar Cost Averaging', () => {
    it('should classify DCA SHORT order', async () => {
      const messageText = 'Vào thêm giá 4315.xx';
      const result = await runTranslate(messageText, {
        prevMessage: 'Sell nhỏ vàng 4312.xx\nSl 4320',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SHORT,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            entry: 4315,
            entryZone: [],
            side: CommandSide.SELL,
            isImmediate: true,
            stopLoss: { price: 4320 },
            takeProfits: [],
            meta: {
              adjustEntry: false,
              reduceLotSize: true,
            },
          }),
        }),
      );
    }, 5000);

    it('should classify DCA LONG order', async () => {
      const messageText = 'Vào thêm giá 4333.xx';
      const result = await runTranslate(messageText, {
        prevMessage: 'Buy #Xauusd 4335.xx\nSl 4327',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            entry: 4333,
            isImmediate: true,
            stopLoss: { price: 4327 },
            takeProfits: [],
            meta: {
              adjustEntry: false,
              reduceLotSize: false,
            },
          }),
        }),
      );
    }, 5000);

    it('should handle abbreviated DCA price', async () => {
      const messageText = 'Vào thêm 26 nhé';
      const result = await runTranslate(messageText, {
        prevMessage: 'Sell lại 4323\nsl 433',
      });

      // AI should infer:
      // - command=SHORT (from prevMessage "Sell")
      // - entry=4326 (inferred from "26" + context "4323")
      // - stopLoss=4330 (inferred from "433" → "33" with entry prefix "43")
      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SHORT,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            entry: 4326,
            isImmediate: true,
            stopLoss: { price: 4330 }, // Inferred from abbreviated "433" → "33" → 4330
            takeProfits: [],
            meta: {
              adjustEntry: false,
              reduceLotSize: false,
            },
          }),
        }),
      );
    }, 5000);

    it('should classify "Buy tiếp" as DCA', async () => {
      const messageText = 'Buy tiếp 4323.x \nSl 4315';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            entry: 4323,
            isImmediate: true,
            stopLoss: { price: 4315 },
            takeProfits: [],
            meta: {
              adjustEntry: false,
              reduceLotSize: false,
            },
          }),
        }),
      );
    }, 5000);

    it('should return NONE for DCA without clear order context', async () => {
      const messageText = 'vào thêm giá 76';
      const result = await runTranslate(messageText, {
        prevMessage:
          'Cậu đang biên độ sw nên mn vào kèo chú ý có lợi nhuận canh lướt là chủ yếu đã nhé .',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: false,
          command: CommandEnum.NONE,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            validationError: expect.stringContaining(
              'DCA order without clear previous order context',
            ),
          }),
        }),
      );
    }, 5000);

    it('should correctly interpret DCA from quoted message context (maverick improvement)', async () => {
      const messageText = 'Làm vòng nữa nhé cả nhà';
      const result = await runTranslate(messageText, {
        prevMessage: 'Xauusd 4142.xx 🥰🥰🥰',
        quotedMessage:
          'Vòng 2 Chốt âm sell 30 pip \\nBuy xauusd giá hiện tại \\nSl 4130',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          confidence: expect.any(Number),
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: 'BUY',
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should return NONE for DCA with abbreviated price but no clear order context', async () => {
      // prevMessage is a progress update (not a clear order with Buy/Sell + price + SL)
      // According to DCA validation rules, this should return NONE
      const messageText = 'Vào thêm giá 35.xx';
      const result = await runTranslate(messageText, {
        prevMessage: 'Xauusd + 20 pip 🤭🤭',
        quotedMessage: '',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: false,
          command: CommandEnum.NONE,
          confidence: expect.any(Number),
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            isImmediate: true,
            // Accept either DCA-specific error or general "Not a trading command"
            validationError: expect.stringMatching(
              /DCA order without clear previous order context|Not a trading command/,
            ),
          }),
        }),
      );
    }, 5000);

    it('should classify "Vòng 2 nào" as DCA from quotedMessage', async () => {
      // "Vòng 2 nào cả nhà" = "Let's do round 2" = DCA signal
      // Should infer direction from quotedMessage
      const messageText = 'Vòng 2 nào cả nhà';
      const result = await runTranslate(messageText, {
        prevMessage: '#XAUUSD hit TP 1 ✅✅✅',
        quotedMessage: 'Buy vàng 4207.x \\nSl 4199',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY, // Inferred from "Buy" in quotedMessage
            isImmediate: true,
            entry: undefined, // No price in current message
          }),
        }),
      );
    }, 5000);
  });
});
