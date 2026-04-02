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

  describe('CLOSE_BAD_POSITION - Closing Less Profitable Positions', () => {
    it('should close bad positions above threshold', async () => {
      const messageText = 'Chốt giá xấu trên 4112.xx';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_BAD_POSITION,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: undefined,
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should close bad positions below threshold', async () => {
      const messageText = 'Chốt giá xấu dưới 4071.xx 🤭🤭';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_BAD_POSITION,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: undefined,
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should close bad positions without specific threshold', async () => {
      const messageText = 'Chốt giá xấu đi cả nhà';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_BAD_POSITION,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: undefined,
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should detect "Chốt bớt phần lớn lợi nhuận" as CLOSE_BAD_POSITION', async () => {
      const messageText = 'Chốt bớt phần lớn lợi nhuận cho an toàn cả nhà';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_BAD_POSITION,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: undefined,
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should detect "Chốt phần lớn lợi nhuận" as CLOSE_BAD_POSITION', async () => {
      const messageText = 'Chốt phần lớn lợi nhuận';
      const result = await runTranslate(messageText, {
        prevMessage: 'Xauusd 4094.xx + 50pip 😘😘',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_BAD_POSITION,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: undefined,
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should detect "Chốt bớt lợi nhuận cho an toàn" as CLOSE_BAD_POSITION', async () => {
      const messageText = 'Chốt bớt lợi nhuận cho an toàn cả nhà nhé';
      const result = await runTranslate(messageText, {
        prevMessage: 'Tp xauusd \nTp 4082\nTp 4078\nTp 4073\nTp 4065',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_BAD_POSITION,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: undefined,
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should detect "Tỉa bớt giá xấu" (trim bad prices) as CLOSE_BAD_POSITION', async () => {
      // "Tỉa bớt giá xấu" = "Trim/prune bad prices"
      // This is a gardening metaphor commonly used in Vietnamese trading
      // Message also includes profit update context (4336.xx 😍😍)
      const messageText = 'Xauusd 4336.xx 😍😍 tỉa bớt giá xấu đi cả nhà';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_BAD_POSITION,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: undefined,
            isImmediate: true,
          }),
        }),
      );
    }, 5000);
  });
});
