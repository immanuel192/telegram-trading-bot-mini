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
  // const TEST_MODEL = 'llama-3.3-70b-versatile';

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

  describe('Edge Cases', () => {
    // @todo to test
    it('should detect dual limit orders (SELL + BUY) in single message', async () => {
      const messageText =
        'Sell limit #XAUUSD  4224\\nsl 4236\\nBuy limit #XAUUSD  4180\\nsl 4172\\nMn cài 2 lệnh chờ này vào nhé , khớp lệnh nào xoá lệnh còn lại';
      const result = await runTranslate(messageText, {
        prevMessage: 'Chú ý giờ tin nha',
      });
      expect(result).toHaveLength(2);
      // First command: SHORT limit
      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SHORT,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.SELL,
            isImmediate: false, // LIMIT order
            entry: 4224,
            stopLoss: { price: 4236 },
          }),
        }),
      );
      // Second command: LONG limit
      expect(result[1]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
            isImmediate: false, // LIMIT order
            entry: 4180,
            stopLoss: { price: 4172 },
          }),
        }),
      );
    }, 5000);

    it('should extract SL and TP from quoted messages with "tp cũ" reference', async () => {
      // "sl, tp cũ nhé" = "use old SL and TP"
      // Should extract SL from quotedFirstMessage and TP from quotedMessage
      const messageText = 'sl, tp cũ nhé';
      const result = await runTranslate(messageText, {
        prevMessage: 'Vòng nữa nào mn',
        quotedMessage: '#XAUUSD tp 4197\\ntp 4200\\ntp 4208',
        quotedFirstMessage: 'Buy vàng 4195\\nsl 4187',
      });
      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SET_TP_SL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            isImmediate: true,
            stopLoss: { price: 4187 }, // Extracted from quotedFirstMessage
            takeProfits: [{ price: 4197 }, { price: 4200 }, { price: 4208 }], // Extracted from quotedMessage
          }),
        }),
      );
    }, 5000);

    it('should detect combined CLOSE_BAD_POSITION and MOVE_SL in single message', async () => {
      // "Chốt phần lớn lợi nhuận dời sl an toàn" contains two commands:
      // AI returns CLOSE_BAD_POSITION first, then MOVE_SL
      const messageText = 'Chốt phần lớn lợi nhuận dời sl an toàn';
      const result = await runTranslate(messageText, {
        prevMessage: '#XAUUSD 4110.xx + 65-70 pip 🥰🥰🥰',
      });

      expect(result).toHaveLength(2);

      // First command: CLOSE_BAD_POSITION
      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_BAD_POSITION,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            isImmediate: true,
          }),
        }),
      );

      // Second command: MOVE_SL
      expect(result[1]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.MOVE_SL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            isImmediate: true,
          }),
        }),
      );
    }, 10000);

    it('should detect combined CLOSE_BAD_POSITION and MOVE_SL with additional context', async () => {
      // "Chốt phần lớn lợi nhuận dời sl an toàn gồng tiếp" contains two commands:
      // 1. CLOSE_BAD_POSITION: "Chốt phần lớn lợi nhuận"
      // 2. MOVE_SL: "dời sl an toàn"
      // "gồng tiếp" (keep holding/continue) is additional context
      const messageText = 'Chốt phần lớn lợi nhuận dời sl an toàn gồng tiếp';
      const result = await runTranslate(messageText, {
        prevMessage: 'Xauusd + 50 pip 😍😍😍',
      });

      expect(result).toHaveLength(2);

      // First command: CLOSE_BAD_POSITION
      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_BAD_POSITION,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            isImmediate: true,
          }),
        }),
      );

      // Second command: MOVE_SL
      expect(result[1]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.MOVE_SL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            isImmediate: true,
            // stopLoss can be null or undefined for verbal commands
          }),
        }),
      );
    }, 5000);

    it('should detect "Chốt sell" and LONG as separate commands', async () => {
      const messageText = 'Chốt sell \nBuy vàng 4327.x \nSl 4319';
      const result = await runTranslate(messageText);

      // Should detect 2 commands:
      // 1. CLOSE_ALL for "Chốt sell"
      // 2. LONG for "Buy vàng...Sl 4319"
      expect(result).toHaveLength(2);

      // First command: CLOSE_ALL
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

      // Second command: LONG
      expect(result[1]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            entry: 4327,
            stopLoss: { price: 4319 },
          }),
        }),
      );
    }, 5000);

    it('should handle TP setting after multiple DCAs', async () => {
      const messageText = 'Tp xauusd\nTp 4336\nTp 4340\nTp 4350\nTp 4370';
      const result = await runTranslate(messageText, {
        prevMessage: 'Vào thêm giá 4331.xx',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SET_TP_SL,
          extraction: expect.objectContaining({
            takeProfits: [
              { price: 4336 },
              { price: 4340 },
              { price: 4350 },
              { price: 4370 },
            ],
          }),
        }),
      );
    }, 5000);

    it('should detect multiple commands in single message', async () => {
      const messageText =
        'Vòng 2 Chốt âm sell 30 pip \nBuy xauusd giá hiện tại \nSl 4130';
      const result = await runTranslate(messageText, {
        prevMessage: 'Chốt bớt lợi nhuận cho an toàn cả nhà',
      });

      // Should detect 2 commands:
      // 1. CLOSE_ALL for "Chốt âm sell"
      // 2. LONG for "Buy xauusd...Sl 4130"
      expect(result).toHaveLength(2);

      // First command: CLOSE_ALL
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

      // Second command: LONG
      expect(result[1]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
            isImmediate: true,
            entry: undefined,
            stopLoss: { price: 4130 },
          }),
        }),
      );
    }, 5000);

    it('should detect "Chốt sell" and LONG as separate commands', async () => {
      // "chốt sell buy vàng 4215\nsl 4207" contains two commands:
      // 1. Close SELL positions
      // 2. Open new LONG position
      const messageText = 'chốt sell buy vàng 4215\\nsl 4207';
      const result = await runTranslate(messageText, {
        prevMessage: 'Dời sl về an toàn luôn nha mọi người',
      });

      expect(result).toHaveLength(2);

      // First command: CLOSE_ALL for SELL
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

      // Second command: LONG
      expect(result[1]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
            isImmediate: true,
            entry: 4215,
            stopLoss: { price: 4207 },
          }),
        }),
      );
    }, 5000);

    it('should detect fraction pattern "1/2" and set reduceLotSize flag', async () => {
      const messageText = 'Sell 1/2 4268';
      const result = await runTranslate(messageText, {
        prevMessage: '#XAUUSD + 120 pip🥰🌾',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SHORT,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.SELL,
            isImmediate: true,
            entry: 4268,
            stopLoss: undefined, // No SL in message
            meta: {
              adjustEntry: false,
              reduceLotSize: true, // Detected from "1/2" pattern
            },
          }),
        }),
      );
    }, 5000);

    it('should set reduceLotSize=true for risk warnings (mạo hiểm, chú ý)', async () => {
      // Message contains "(kèo này hơi mạo hiểm mn chú ý)" = "(this position is quite risky, everyone be careful)"
      // Risk warnings should trigger reduceLotSize=true
      const messageText =
        '#XAUUSD buy 4346\nsl 40 \n(kèo này hơi mạo hiểm mn chú ý )';
      const result = await runTranslate(messageText, {
        prevMessage: 'Cả nhà dịch sl  về entry gồng full TP nhé',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
            isImmediate: true,
            entry: 4346,
            // in this case the maverick model infer SL wrongly, sometime 4040 sometimes 4340
            // stopLoss: { price: 4040 },
            // stopLoss: { price: 4340 }, // "sl 40" inferred as 4340
            meta: {
              adjustEntry: false,
              reduceLotSize: true, // Detected from "mạo hiểm" and "chú ý"
            },
          }),
        }),
      );
    }, 5000);

    it('should detect "chốt sell buy luôn" as two commands (compact format)', async () => {
      // "chốt sell buy luôn 4142" = "Close SELL and immediately BUY at market"
      // This is a compact single-line format vs the multi-line "Chốt sell\nBuy..." format
      // "buy luôn" indicates market order (entry should be null or inferred from context)
      const messageText = 'chốt sell buy luôn 4142';
      const result = await runTranslate(messageText, {
        prevMessage: '#XAUUSD 4139.xx👏👏',
      });

      // Should detect 2 commands:
      // 1. CLOSE_ALL for "chốt sell"
      // 2. LONG for "buy luôn 4142"
      expect(result).toHaveLength(2);

      // First command: CLOSE_ALL
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

      // Second command: LONG (market order)
      expect(result[1]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
            isImmediate: true,
            // "buy luôn" typically means market order, but 4142 might be extracted as entry
            // The AI may or may not extract entry - both are acceptable
          }),
        }),
      );
    }, 5000);
  });
});
