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

  describe('CANCEL - Cancel Pending Orders', () => {
    it('should cancel limit order with side from quotedMessage', async () => {
      const messageText = 'Kèo limit ta cứ tạm xoá đã mn nha';
      const result = await runTranslate(messageText, {
        prevMessage: '#XAUUSD hit TP 2 ✅✅✅',
        quotedMessage: '#XAUUSD Sell limit 4230\\nsl 4238',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CANCEL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.SELL, // Inferred from "Sell" in quotedMessage
            isImmediate: true,
          }),
        }),
      );
    }, 5000);
  });
});
