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

  describe('SHORT - Sell Orders', () => {
    it('should classify bot SHORT signal', async () => {
      const messageText = 'Sell #Xauusd 4330.xx\nSl 4338';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SHORT,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.SELL,
            isImmediate: true,
            entry: 4330,
            stopLoss: { price: 4338 },
          }),
        }),
      );
    }, 5000);

    it('should classify human SHORT with "nhỏ"', async () => {
      const messageText = 'Sell nhỏ vàng 4312.xx\nSl 4320';
      const result = await runTranslate(messageText);
      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SHORT,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.SELL,
            entry: 4312,
            stopLoss: { price: 4320 },
            meta: { adjustEntry: false, reduceLotSize: true },
          }),
        }),
      );
    }, 5000);

    it('should detect fraction pattern "1/2" and set reduceLotSize flag', async () => {
      const messageText = 'Sell 1/2 4067\nsl 4075 mn chú ý lại sl nhé';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SHORT,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.SELL,
            entry: 4067,
            stopLoss: { price: 4075 },
            meta: { adjustEntry: false, reduceLotSize: true }, // 1/2 indicates reduced lot
          }),
        }),
      );
    }, 5000);

    it('should handle incomplete SL typo', async () => {
      const messageText = 'Sell lại 4323\nsl 433';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SHORT,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.SELL,
            entry: 4323,
            stopLoss: undefined,
            validationError: expect.stringContaining(''),
          }),
        }),
      );
    }, 5000);

    it('should detect "vol nhỏ" and set reduceLotSize flag', async () => {
      const messageText = 'Sell vol nhỏ #Xauusd 4312.xx\nSl 4320';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SHORT,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.SELL,
            entry: 4312,
            stopLoss: { price: 4320 },
            meta: { adjustEntry: false, reduceLotSize: true },
          }),
        }),
      );
    }, 5000);

    it('should detect "test" keyword and set reduceLotSize flag', async () => {
      // "Sell test" = experimental/test order (high risk)
      // Should trigger reduceLotSize=true
      const messageText = 'Sell test 4078\nsl 4086';
      const result = await runTranslate(messageText, {
        prevMessage: 'cậu khoảng này là ta cứ phải cẩn trọng',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SHORT,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.SELL,
            entry: 4078,
            stopLoss: { price: 4086 },
            meta: { adjustEntry: false, reduceLotSize: true }, // "test" indicates reduced lot
          }),
        }),
      );
    }, 5000);
  });
});
