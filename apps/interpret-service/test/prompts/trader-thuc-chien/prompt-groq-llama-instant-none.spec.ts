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
    it('Skipping prompt tests - AI_GROQ_API_KEY not set', () => {
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

  describe('NONE - Informational Messages', () => {
    it('should classify progress update as NONE', async () => {
      const messageText = 'Xauusd + 20 pip 😘😘😘';
      const result = await runTranslate(messageText);
      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: false,
          command: CommandEnum.NONE,
          confidence: expect.any(Number),
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            isImmediate: true,
            side: undefined,
            validationError: expect.any(String),
          }),
        }),
      );
    }, 5000);

    it('should classify TP hit notification as NONE', async () => {
      const messageText = '#XAUUSD HIT TP1 🥳🥳🥳';
      const result = await runTranslate(messageText, {
        quotedMessage: 'Tp xauusd \nTp 4327\nTp 4322\nTp 4312\nTp 4280',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: false,
          command: CommandEnum.NONE,
          confidence: expect.any(Number),
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should classify trade summary (KÈO) as NONE', async () => {
      const messageText =
        'KÈO 1 : #SELL KHỚP 4330.xx - 4309.xx + 210 PIP ❤️❤️❤️';
      const result = await runTranslate(messageText, {
        quotedMessage: 'Sell #Xauusd 4330.xx\nSl 4338',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: false,
          command: CommandEnum.NONE,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should classify trade summary (KÈO) with hit sl as NONE', async () => {
      // This is a trade summary report, NOT a close command
      const messageText = 'KÈO 27: hit sl -80 pip😞';
      const result = await runTranslate(messageText, {
        quotedMessage: 'buy tiếp 4372\nsl 4364',
        prevMessage: 'KÈO 26: #BUY khớp 4368-4374+60. PIP🥰👏🏻👏🏻',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: false,
          command: CommandEnum.NONE,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should classify greeting as NONE', async () => {
      const messageText =
        'CHÚC CẢ NHÀ NGÀY MỚI TỐT LÀNH, GIAO DỊCH THUẬN LỢI ☘️☘️☘️';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: false,
          command: CommandEnum.NONE,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should classify result reporting as NONE', async () => {
      const messageText = 'vòng 2 sl - 70 pip😞';
      const result = await runTranslate(messageText, {
        prevMessage: 'Khoảng này ta chủ động khi có lợi nhuận nhé',
        quotedMessage: 'ai còn lệnh cài sl vào nhé',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: false,
          command: CommandEnum.NONE,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should classify conversational message as NONE', async () => {
      const messageText = 'ad ân mảnh trước 1 giá nhé';
      const result = await runTranslate(messageText, {
        prevMessage: 'Buy vàng 4125\nsl 4117 ad nhầm sl 🤭',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: false,
          command: CommandEnum.NONE,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should classify "Gỡ ngay" (recover immediately) as NONE', async () => {
      // "Gỡ ngay cho cả nhà nhé" = "I'll recover (from loss) for everyone immediately"
      // This is an informational message about trader's intention, not a command
      const messageText = 'Gỡ ngay cho cả nhà nhé 🤭🤭🤭';
      const result = await runTranslate(messageText, {
        prevMessage: '#Xauusd 4286.xx + 80 PIP 🤩🤩🤩',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: false,
          command: CommandEnum.NONE,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should classify "Gỡ kèo" (recover position) as NONE', async () => {
      // "Đợi chút ad gỡ kèo cho cả nhà nhé" = "Wait a bit, I'll recover the position for everyone"
      // This is an informational message about trader's plan, not a command
      const messageText = 'Đợi chút ad gỡ kèo cho cả nhà nhé';
      const result = await runTranslate(messageText, {
        prevMessage: 'Cậu quét nhanh quá',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: false,
          command: CommandEnum.NONE,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should classify price-only report with "luôn" as NONE (not LONG)', async () => {
      // "#XAUUSD 4604.xx luôn" = Price report saying "XAUUSD is at 4604 already"
      // This is NOT a BUY command - it's just a price update
      // CRITICAL: This pattern caused 6 incorrect orders in production
      // "luôn" alone does NOT make it a command - MUST have action verb (buy/sell)
      const messageText = '#XAUUSD 4604.xx luôn';
      const result = await runTranslate(messageText, {
        prevMessage: '#XAUUSD 4603.xx ❤️❤️',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: false,
          command: CommandEnum.NONE,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should classify price-only report with "luôn" and emojis as NONE', async () => {
      // "#Xauusd 4604.xx luôn 😘😘😘" = Price report with emojis
      // This is NOT a BUY command - it's just a price update with celebration
      // CRITICAL: This pattern caused incorrect orders in production
      const messageText = '#Xauusd 4604.xx luôn 😘😘😘';
      const result = await runTranslate(messageText, {
        prevMessage: '#Xauusd 4603.xx ❤️❤️',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: false,
          command: CommandEnum.NONE,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should classify price-only report with checkmarks as NONE (ignore quoted message)', async () => {
      // "#XAUUSD 6408.x ✅✅" = Price report with checkmarks
      // This is NOT a BUY command - it's just a price update
      // CRITICAL: This pattern caused incorrect orders in production
      // Even though quotedMessage contains "Buy vàng", current message is price-only → NONE
      const messageText = '#XAUUSD 6408.x ✅✅';
      const result = await runTranslate(messageText, {
        quotedMessage: 'Chốt sell \nBuy vàng 4602.x \nSl 4594',
        prevMessage: '#XAUUSD  + 70 pip ✅✅✅',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: false,
          command: CommandEnum.NONE,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            isImmediate: true,
          }),
        }),
      );
    }, 5000);
  });
});
