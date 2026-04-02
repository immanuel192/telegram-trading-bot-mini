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

  describe('CLOSE_ALL - Closing Positions', () => {
    it('should close all on HIT SL with quoted message', async () => {
      const messageText = 'Xauusd HIT SL - 100/ 40 PIP 😌😌';
      const result = await runTranslate(messageText, {
        quotedMessage: 'Sell nhỏ vàng 4312.xx\nSl 4320',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_ALL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.SELL,
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should close buy positions with "chốt kèo buy" pattern', async () => {
      const messageText = 'chốt kèo buy';
      const result = await runTranslate(messageText, {
        prevMessage: 'Buy lại nha mọi người',
        quotedMessage: 'Buy lại nha mọi người',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_ALL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY, // Extracted from "buy" in message
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should close sell positions with "chốt kèo sell" pattern', async () => {
      const messageText = 'chốt kèo sell lướt';
      const result = await runTranslate(messageText, {
        prevMessage: 'Sell nhỏ vàng 4312.xx\nSl 4320',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_ALL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.SELL, // Extracted from "sell" in message
            isImmediate: true,
          }),
        }),
      );
    }, 5000);
  });
});
