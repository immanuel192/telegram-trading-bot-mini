/**
 * Purpose: Prompt test for Trader Thuc Chien (XAUUSD) trading signals using Groq AI
 * Tests: AI prompt effectiveness with real-world scenarios
 * Note: Requires AI_GROQ_API_KEY environment variable
 */

import { sleep, suiteName } from '@telegram-trading-bot-mini/shared/test-utils';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';
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

  describe('MOVE_SL - Moving Stop Loss', () => {
    it('should move SL with explicit price', async () => {
      const messageText = 'Dời sl 4322';
      const result = await runTranslate(messageText, {
        prevMessage: 'Vào thêm giá 4315.xx',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.MOVE_SL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            stopLoss: { price: 4322 },
          }),
        }),
      );
    }, 5000);

    it('should handle verbal SL ("an toàn")', async () => {
      const messageText = 'Dời sl an toàn';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.MOVE_SL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            stopLoss: undefined,
          }),
        }),
      );
    }, 5000);

    it('should return null for abbreviated SL (trade-manager will infer)', async () => {
      const messageText = 'Cả nhà dịch sl xuống 17';
      const result = await runTranslate(messageText, {
        prevMessage: 'Sell nhỏ vàng 4312.xx\nSl 4320',
      });

      // Abbreviated "17" is too ambiguous for AI to reliably infer.
      // Return null and let trade-manager infer full price from order context.
      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.MOVE_SL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            stopLoss: undefined, // null converted to undefined
          }),
        }),
      );
    }, 5000);

    it('should handle MOVE_SL with pips format', async () => {
      const messageText = 'dời sl trên 5 giá';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.MOVE_SL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            isImmediate: true,
            stopLoss: { pips: 50 }, // 5 giá = 50 pips
          }),
        }),
      );
    }, 5000);

    it('should handle unclear/contradictory MOVE_SL with null stopLoss', async () => {
      const messageText = 'Dịch sl lên xuống 51';
      const result = await runTranslate(messageText, {
        prevMessage: 'Cả nhà vào thêm giá 56',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.MOVE_SL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            isImmediate: true,
            stopLoss: undefined, // Contradictory direction, null converted to undefined
          }),
        }),
      );
    }, 5000);

    it('should extract MOVE_SL from multi-part conversational message', async () => {
      // Message has two parts:
      // 1. "Ai sạch lệnh ngắm chút nhé!" (conversational - who has closed orders, wait a bit)
      // 2. "ai còn lệnh dịch sl dương gồng cho thoải mái mn nha" (command - those with orders, move SL to positive)
      // AI should filter out the conversational part and extract the MOVE_SL command
      const messageText =
        'Ai sạch lệnh ngắm chút nhé!\nai còn lệnh dịch sl dương gồng cho thoải mái mn nha';
      const result = await runTranslate(messageText, {
        prevMessage: '#XAUUSD 4074.xx + 100 PIP 🥳🥳🥳',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.MOVE_SL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            isImmediate: true,
            // "dịch sl dương" = move SL to positive territory (verbal command, no specific price)
            stopLoss: undefined,
          }),
        }),
      );
    }, 5000);
  });
});
