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

  describe('LONG - Buy Orders', () => {
    it('should classify bot LONG signal', async () => {
      const messageText = 'Buy #Xauusd 4329.xx\nSl 4321';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          confidence: expect.any(Number),
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
            isImmediate: true,
            entry: 4329,
            stopLoss: { price: 4321 },
            takeProfits: [],
            meta: { adjustEntry: false, reduceLotSize: false },
          }),
        }),
      );
    }, 5000);

    it('should classify human LONG signal', async () => {
      const messageText = 'Buy vàng 4213\nsl 4205';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
            isImmediate: true,
            entry: 4213,
            stopLoss: { price: 4205 },
          }),
        }),
      );
    }, 5000);

    it('should classify LONG with abbreviated price', async () => {
      const messageText = 'Buy vàng 4327.x \nSl 4319';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
            isImmediate: true,
            entry: 4327,
            stopLoss: { price: 4319 },
          }),
        }),
      );
    }, 5000);

    it('should classify LONG with LIMIT keyword', async () => {
      const messageText = 'Buy LIMIT vàng 4213\nsl 4205';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
            isImmediate: false,
            entry: 4213,
            stopLoss: { price: 4205 },
          }),
        }),
      );
    }, 5000);

    it('should extract stopLoss as pips for "sl trên X giá" pattern', async () => {
      const messageText = 'Buy vàng 4327.x\nsl trên 8 giá';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
            entry: 4327,
            stopLoss: { pips: 80 }, // 8 giá = 80 pips
          }),
        }),
      );
    }, 5000);

    it('should extract stopLoss as pips for "sl dưới X giá" pattern', async () => {
      const messageText = 'Buy vàng 4327.x\nsl dưới 10 giá';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
            entry: 4327,
            stopLoss: { pips: 100 }, // 10 giá = 100 pips
          }),
        }),
      );
    }, 5000);

    it('should infer abbreviated stopLoss from entry price (not pips)', async () => {
      // Test case: "buy lại 4248\nsl 40" should infer SL as 4240 (price), not 40 pips
      // This verifies that without "giá"/"pip"/"pips" keywords, abbreviated numbers are treated as prices
      const messageText = 'buy lại 4248\\nsl 40';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
            entry: 4248,
            stopLoss: { price: 4240 }, // Inferred from entry 4248, NOT pips: 40
          }),
        }),
      );
    }, 5000);

    it('should NOT hallucinate stopLoss from context when message has no SL', async () => {
      const messageText = 'Buy vòng nữa 4064';
      const result = await runTranslate(messageText, {
        prevMessage: 'Buy vàng 4067',
        quotedFirstMessage: 'Buy vàng 4067',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
            entry: 4064,
            stopLoss: undefined, // No "sl" in message, converted from null to undefined
          }),
        }),
      );
    }, 5000);

    it('should handle ambiguous buy without clear entry price', async () => {
      const messageText = 'Buy luôn giá hiện tại mn';
      const result = await runTranslate(messageText, {
        prevMessage: 'Đặt tạm lệnh chờ nhé mn',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
            entry: undefined, // No clear entry price
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should infer 2-digit SL as abbreviated price, not pips', async () => {
      // "sl 90" should be inferred as 4190 (from entry 4197), NOT 90 pips
      const messageText = 'Buy vàng 4197\\nsl 90';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
            entry: 4197,
            stopLoss: { price: 4190 }, // Inferred from entry, NOT pips: 90
          }),
        }),
      );
    }, 5000);
  });
});
