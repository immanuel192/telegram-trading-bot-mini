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
    return results;
  };

  describe('SET_TP_SL - Setting Take Profit / Stop Loss', () => {
    it('should set TP after order', async () => {
      const messageText = '#XAUUSD tp 4216 tp 4220 tp 4230';
      const result = await runTranslate(messageText, {
        prevMessage: 'Buy vàng 4213\nsl 4205',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SET_TP_SL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            takeProfits: [{ price: 4216 }, { price: 4220 }, { price: 4230 }],
          }),
        }),
      );
    }, 5000);

    it('should set TP with standard format', async () => {
      const messageText = 'Tp xauusd \nTp 4327\nTp 4322\nTp 4312\nTp 4280';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SET_TP_SL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            takeProfits: [
              { price: 4327 },
              { price: 4322 },
              { price: 4312 },
              { price: 4280 },
            ],
          }),
        }),
      );
    }, 5000);

    it('should handle "to" typo as "tp"', async () => {
      const messageText = '#XAUUSD tp 4045\nto 4049\ntp 4055\ntp 4068';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SET_TP_SL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            takeProfits: [
              { price: 4045 },
              { price: 4049 }, // "to" treated as "tp"
              { price: 4055 },
              { price: 4068 },
            ],
          }),
        }),
      );
    }, 5000);

    it('should correct SL typo', async () => {
      const messageText = 'sl 4331';
      const result = await runTranslate(messageText, {
        prevMessage: 'Sell lại 4323\nsl 433',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SET_TP_SL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            stopLoss: { price: 4331 },
          }),
        }),
      );
    }, 5000);

    it('should ignore TP comments in parentheses', async () => {
      const messageText =
        '#XAUUSD tp 4320\ntp 4315\ntp 4310\ntp 4290\ntp 4279(tp79 mà ad ghi nhầm 89 nè 🤭)';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SET_TP_SL,
          extraction: expect.objectContaining({
            takeProfits: expect.arrayContaining([
              { price: 4320 },
              { price: 4315 },
              { price: 4310 },
              { price: 4290 },
              { price: 4279 },
            ]),
          }),
        }),
      );
    }, 5000);

    it('should handle "Sl X giá" pattern as pips after previous order', async () => {
      // "Sl 8 giá" = 8 giá = 80 pips
      // Note: AI may or may not return 'side' field due to non-determinism
      // The critical part is the pips conversion: 8 giá = 80 pips
      const messageText = 'Sl 8 giá';
      const result = await runTranslate(messageText, {
        prevMessage: 'Buy xauusd giá hiện tại',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SET_TP_SL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            isImmediate: true,
            stopLoss: { pips: 80 }, // 8 giá = 80 pips
            /**
             * @todo interesting that this case the side is null but on the playground it return the side.
             */
          }),
        }),
      );
    }, 5000);

    it('should handle "Cài thêm tp" (add more TP) pattern', async () => {
      // "Cài thêm tp" = "Add more TP levels"
      // This is a variation of setting TP, showing AI can handle different Vietnamese phrases
      const messageText = 'Cài thêm tp \nTp 4330\nTp 4350';
      const result = await runTranslate(messageText, {
        prevMessage: '#XAUUSD 4328.xx + 380/210 PIP ☺️☺️☺️',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SET_TP_SL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            isImmediate: true,
            takeProfits: [{ price: 4330 }, { price: 4350 }],
          }),
        }),
      );
    }, 5000);

    it('should extract TP from previous message when current is reminder ("cài tp vào")', async () => {
      // "cài tp vào mn nhé" = "set TP everyone" (reminder)
      // Actual TP values are in the previous message
      // AI should extract TP from prevMessage context
      const messageText = 'cài tp vào mn nhé';
      const result = await runTranslate(messageText, {
        prevMessage: '#XAUUSD tp 4327\ntp 4323\ntp 4312\ntp 4301',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SET_TP_SL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            isImmediate: true,
            takeProfits: [
              { price: 4327 },
              { price: 4323 },
              { price: 4312 },
              { price: 4301 },
            ],
          }),
        }),
      );
    }, 5000);

    it('should extract TP from quoted message when confirming reuse ("Vẫn tp này")', async () => {
      // "Vẫn tp này nhé" = "Still use this TP" (confirmation/reuse)
      // Actual TP values are in the quoted message
      // AI should extract TP from quotedMessage context
      const messageText = 'Vẫn tp này nhé';
      const result = await runTranslate(messageText, {
        quotedMessage: '#XAUUSD tp 4210\ntp 4216\ntp 4230',
        prevMessage: 'Vòng 2 nào cả nhà',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SET_TP_SL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            isImmediate: true,
            takeProfits: [{ price: 4210 }, { price: 4216 }, { price: 4230 }],
          }),
        }),
      );
    }, 5000);

    it('should classify "dịch sl" with specific price as SET_TP_SL (not MOVE_SL)', async () => {
      // "Dịch sl xuống 4196" = "Move SL down to 4196" (specific price)
      // Even though it has "dịch sl" keyword, it specifies a SPECIFIC PRICE
      // MOVE_SL is only for verbal/relative movements (to entry, break-even, etc.)
      // SET_TP_SL is for setting SL to a specific price
      const messageText = 'Dịch sl xuống 4196';
      const result = await runTranslate(messageText, {
        quotedMessage: 'Buy tiếp 4206.x \nSl 4198',
        prevMessage: 'Cả nhà Vào thêm giá 02.x',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SET_TP_SL, // Should be SET_TP_SL, not MOVE_SL
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            // Note: side may or may not be inferred from quoted message
            // The critical part is: SET_TP_SL (not MOVE_SL) with specific price
            isImmediate: true,
            stopLoss: { price: 4196 }, // Specific price
          }),
        }),
      );
    }, 5000);
  });
});
