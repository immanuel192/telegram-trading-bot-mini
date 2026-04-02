/**
 * Purpose: Prompt test for Hang Moon (XAUUSD) trading signals using Groq AI
 * Tests: AI prompt effectiveness with real-world scenarios from hang-moon channel
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
  const promptId = 'hang-moon-test-prompt';
  const channelId = 'test-channel';
  let systemPrompt: string;

  const TEST_MODEL = 'meta-llama/llama-4-maverick-17b-128e-instruct';

  beforeAll(async () => {
    const promptPath = path.join(
      __dirname,
      '../../../prompts/hang-moon/prompt.txt',
    );

    systemPrompt = fs.readFileSync(promptPath, 'utf-8');
    console.log(`\n📝 Using hang-moon prompt.txt for model: ${TEST_MODEL}\n`);

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
        name: 'Hang Moon XAUUSD',
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

    // Return all commands (array)
    return results;
  };

  describe('NONE - Informational Messages', () => {
    it('should classify progress update as NONE', async () => {
      const messageText = '@Gold +20 Pips running ✅🚀';
      const result = await runTranslate(messageText, {
        quotedMessage:
          '💥GOLD Buy 4202.6- 4200.6\n\n✅TP  4205.6\n✅TP  4220.6\n\n💢SL  4197',
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

    it('should classify TP hit notification as NONE', async () => {
      const messageText = 'GOLD - TP HIT 30 +Pips ✅✅';
      const result = await runTranslate(messageText, {
        quotedMessage:
          '💥GOLD Buy 4202.6- 4200.6\n\n✅TP  4205.6\n✅TP  4220.6\n\n💢SL  4197',
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

    it('should classify SL hit as CLOSE_ALL', async () => {
      const messageText = 'SL hit';
      const result = await runTranslate(messageText, {
        quotedMessage:
          '💥GOLD Buy 4203- 4201\n\n✅TP  4206\n✅TP  4223\n\n💢SL  4198',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_ALL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should classify ready signal as NONE', async () => {
      const messageText = 'ready signal';
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

    it('should classify general chat as NONE', async () => {
      const messageText =
        'Ae tạm nghỉ, ad đánh giá lại cấu trúc thị trường nhé';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: false,
          command: CommandEnum.NONE,
        }),
      );
    }, 5000);

    it.skip('should classify empty message as NONE with validation error', async () => {
      const messageText = '';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: false,
          command: CommandEnum.NONE,
          extraction: expect.objectContaining({
            validationError: expect.stringContaining('empty'),
          }),
        }),
      );
    }, 5000);

    it('should classify standalone price as NONE', async () => {
      const messageText = '71.6';
      const result = await runTranslate(messageText, {
        prevMessage: 'Gold sell now',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: false,
          command: CommandEnum.NONE,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
          }),
        }),
      );
    }, 5000);
  });

  describe('LONG - Buy Signals', () => {
    it('should classify "Gold buy now" as LONG (first message)', async () => {
      const messageText = 'Gold buy now';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          confidence: 1.0,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
            isImmediate: true,
            entry: undefined,
            entryZone: [],
            stopLoss: undefined,
            takeProfits: [],
            meta: expect.objectContaining({
              adjustEntry: false,
              reduceLotSize: false,
            }),
            isLinkedWithPrevious: false,
            validationError: '',
          }),
        }),
      );
    }, 5000);

    it('should classify detailed BUY signal with entry zone', async () => {
      const messageText =
        '💥GOLD Buy 4202.6- 4200.6\n\n✅TP  4205.6\n✅TP  4220.6\n\n💢SL  4197';
      const result = await runTranslate(messageText, {
        prevMessage: 'Gold buy now',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          confidence: 1.0,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
            isImmediate: true,
            entry: undefined,
            entryZone: [4202.6, 4200.6],
            stopLoss: { price: 4197 },
            takeProfits: [{ price: 4205.6 }, { price: 4220.6 }],
            isLinkedWithPrevious: true,
          }),
        }),
      );
    }, 5000);

    it('should handle bullet point separator in entry zone', async () => {
      const messageText =
        '💥GOLD Buy 4320.6 • 4318.6\n\n✅TP  4323.6\n✅TP  4340.6\n\n💢SL  4315';
      const result = await runTranslate(messageText, {
        prevMessage: 'Gold buy now',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
            entryZone: expect.arrayContaining([
              expect.any(Number),
              expect.any(Number),
            ]),
            stopLoss: { price: 4315 },
          }),
        }),
      );
    }, 5000);

    it('should handle typo "Gd buy now"', async () => {
      const messageText = 'Gd buy now';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should handle typo "Gold buy noww"', async () => {
      const messageText = 'Gold buy noww';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
          }),
        }),
      );
    }, 5000);
  });

  describe('SHORT - Sell Signals', () => {
    it('should classify "Gold sell now" as SHORT (first message)', async () => {
      const messageText = 'Gold sell now';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SHORT,
          confidence: 1.0,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.SELL,
            isImmediate: true,
            entry: undefined,
            stopLoss: undefined,
            takeProfits: [],
          }),
        }),
      );
    }, 5000);

    it('should classify detailed SELL signal with entry zone', async () => {
      const messageText =
        '💥GOLD Sell 4195.3- 4197.3\n\n✅TP  4192.3\n✅TP  4175.3\n\n💢SL  4201';
      const result = await runTranslate(messageText, {
        prevMessage: 'Gold sell now',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SHORT,
          confidence: 1.0,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.SELL,
            isImmediate: true,
            entry: undefined,
            entryZone: [4195.3, 4197.3],
            stopLoss: { price: 4201 },
            takeProfits: [{ price: 4192.3 }, { price: 4175.3 }],
            isLinkedWithPrevious: true,
          }),
        }),
      );
    }, 5000);

    it('should handle standalone price after "Gold sell now"', async () => {
      const messageText = '95.3';
      const result = await runTranslate(messageText, {
        prevMessage: 'Gold sell now',
      });

      // This should be NONE (standalone price), not SHORT
      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: false,
          command: CommandEnum.NONE,
        }),
      );
    }, 5000);
  });

  describe('CLOSE_BAD_POSITION - Partial Close', () => {
    it('should classify "Close X hold Y" pattern', async () => {
      const messageText = 'Close 10.2 hold 8.2';
      const result = await runTranslate(messageText, {
        quotedMessage:
          '💥GOLD Buy 4210.2- 4208.2\n\n✅TP  4213.2\n✅TP  4230.2\n\n💢SL  4205',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_BAD_POSITION,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should classify Vietnamese "Đóng X hold Y" pattern', async () => {
      const messageText = 'Đóng 10 hold 08';
      const result = await runTranslate(messageText, {
        quotedMessage:
          '💥GOLD Buy 4210- 4208\n\n✅TP  4213\n✅TP  4230\n\n💢SL  4205',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_BAD_POSITION,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
          }),
        }),
      );
    }, 5000);

    it('should classify Vietnamese "Đóng X giữ Y" pattern', async () => {
      const messageText = 'Đóng 23 giữ 21';
      const result = await runTranslate(messageText, {
        quotedMessage:
          '💥GOLD Buy 4223- 4221\n\n✅TP  4226\n✅TP  4243\n\n💢SL  4218',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_BAD_POSITION,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
          }),
        }),
      );
    }, 5000);

    it('should classify lowercase "đóng X giữ Y" pattern', async () => {
      const messageText = 'đóng 26 giữ 28';
      const result = await runTranslate(messageText, {
        quotedMessage:
          '💥GOLD Sell 4326• 4328\n\n✅TP  4323\n✅TP  4306\n\n💢SL  4331',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_BAD_POSITION,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.SELL,
          }),
        }),
      );
    }, 5000);

    it('should handle typo "Cloze X hold Y"', async () => {
      const messageText = 'Cloze 59.5 hold 61.5';
      const result = await runTranslate(messageText, {
        quotedMessage:
          '💥GOLD Sell 4159.5- 4161.5\n\n✅TP  4156.5\n✅TP  4139.5\n\n💢SL  4165',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_BAD_POSITION,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.SELL,
          }),
        }),
      );
    }, 5000);

    it('should handle typo "holx" instead of "hold"', async () => {
      const messageText = 'Close 11.6 holx 09.6';
      const result = await runTranslate(messageText, {
        quotedMessage:
          '💥GOLD Buy 4211.6- 4209.6\n\n✅TP  4214.6\n✅TP  4231.6\n\n💢SL  4206',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_BAD_POSITION,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
          }),
        }),
      );
    }, 5000);
  });

  describe('CLOSE_ALL - Close All Positions', () => {
    it('should classify "Chốt lệnh này" (Close this order)', async () => {
      const messageText = 'Chốt lệnh này';
      const result = await runTranslate(messageText, {
        quotedMessage:
          '💥GOLD Sell 4158- 4160\n\n✅TP  4155\n✅TP  4138\n\n💢SL  4163',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_ALL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.SELL,
          }),
        }),
      );
    }, 5000);

    it('should classify "Đóng lệnh này" (Close this order)', async () => {
      const messageText = 'Đóng lệnh này -10pips';
      const result = await runTranslate(messageText, {
        quotedMessage:
          '💥GOLD Sell 4159.5- 4161.5\n\n✅TP  4156.5\n✅TP  4139.5\n\n💢SL  4165',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_ALL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.SELL,
          }),
        }),
      );
    }, 5000);

    it('should classify "Tạm đóng lệnh này" (Temporarily close this order)', async () => {
      const messageText = 'Tạm đóng lệnh này âm tí ae';
      const result = await runTranslate(messageText, {
        quotedMessage:
          '💥GOLD Sell 4158- 4160\n\n✅TP  4155\n✅TP  4138\n\n💢SL  4163',
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

    it('should classify "Đóng hòa lệnh này" (Close this order at breakeven)', async () => {
      const messageText = 'Đóng hòa lệnh này';
      const result = await runTranslate(messageText, {
        quotedMessage:
          '💥GOLD Buy 4206.6- 4204.6\n\n✅TP  4209.6\n✅TP  4226.6\n\n💢SL  4201',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_ALL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
          }),
        }),
      );
    }, 5000);

    it('should classify "Chốt hòa lệnh này" (Close this order at breakeven)', async () => {
      const messageText = 'Chốt hòa lệnh này';
      const result = await runTranslate(messageText, {
        quotedMessage:
          '💥GOLD Sell 4210.5- 4212.5\n\n✅TP  4207.5\n✅TP  4190.5\n\n💢SL  4216',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_ALL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.SELL,
          }),
        }),
      );
    }, 5000);

    it('should classify "close gold buy" command', async () => {
      const messageText = 'close gold buy';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_ALL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
          }),
        }),
      );
    }, 5000);

    it('should classify "AE còn Sell đóng" (Close remaining sell orders)', async () => {
      const messageText = 'AE còn Sell đóng';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_ALL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.SELL,
          }),
        }),
      );
    }, 5000);
  });

  describe('MOVE_SL - Move Stop Loss', () => {
    it('should classify "Rời SL về entry" as MOVE_SL', async () => {
      const messageText = 'Rời SL về entry lệnh này\nMove SL entry';
      const result = await runTranslate(messageText, {
        quotedMessage:
          '💥GOLD Buy 4137.4- 4135.4\n\n✅TP  4140.4\n\n✅TP  4157.4\n\n💢SL  4132',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.MOVE_SL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should classify "dời sl về entry" as MOVE_SL', async () => {
      const messageText = 'dời sl về entry';
      const result = await runTranslate(messageText, {
        quotedMessage:
          '💥GOLD Sell 4195- 4197\n\n✅TP  4192\n\n✅TP  4175\n\n💢SL  4201',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.MOVE_SL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.SELL,
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should classify "move sl entry" as MOVE_SL', async () => {
      const messageText = 'move sl entry';
      const result = await runTranslate(messageText, {
        quotedMessage:
          '💥GOLD Buy 4202- 4200\n\n✅TP  4205\n\n✅TP  4220\n\n💢SL  4197',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.MOVE_SL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.BUY,
          }),
        }),
      );
    }, 5000);
  });

  describe('Multi-Command Messages', () => {
    it('should handle "Close gold buy\\nGold sell now" as two commands', async () => {
      const messageText = 'Close gold buy\nGold sell now';
      const result = await runTranslate(messageText);

      // Should return 2 commands
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_ALL,
          extraction: expect.objectContaining({
            side: CommandSide.BUY,
          }),
        }),
      );
      expect(result[1]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SHORT,
          extraction: expect.objectContaining({
            side: CommandSide.SELL,
          }),
        }),
      );
    }, 5000);
  });

  describe('Edge Cases', () => {
    it('should handle message with detailed price after "Gold sell now"', async () => {
      // This is a 3-message pattern: "Gold sell now" -> "95.3" -> detailed signal
      const messageText =
        '💥GOLD Sell 4195.3- 4197.3\n\n✅TP  4192.3\n✅TP  4175.3\n\n💢SL  4201';
      const result = await runTranslate(messageText, {
        prevMessage: '95.3',
        quotedFirstMessage: 'Gold sell now',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SHORT,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.SELL,
            entryZone: [4195.3, 4197.3],
            stopLoss: { price: 4201 },
            takeProfits: [{ price: 4192.3 }, { price: 4175.3 }],
          }),
        }),
      );
    }, 5000);

    it('should handle wrong quotedMessage context', async () => {
      // quotedMessage contains details of a different trade
      const messageText = 'Close 58 hold 60';
      const result = await runTranslate(messageText, {
        quotedMessage:
          '💥GOLD Sell 4158- 4160\n\n✅TP  4155\n\n✅TP  4138\n\n💢SL  4163',
        prevMessage:
          '💥GOLD Buy 4160- 4158\n\n✅TP  4163\n\n✅TP  4180\n\n💢SL  4155',
      });

      // AI correctly extracts side from quotedMessage (SELL), not prevMessage
      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_BAD_POSITION,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
            side: CommandSide.SELL, // From quotedMessage (correct behavior)
            isImmediate: true,
          }),
        }),
      );
    }, 5000);

    it('should handle complex Vietnamese instruction with typo', async () => {
      const messageText = 'Dongs hòa 2 entry tại 11';
      const result = await runTranslate(messageText);

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_ALL,
          extraction: expect.objectContaining({
            symbol: 'XAUUSD',
          }),
        }),
      );
    }, 5000);
  });

  describe('Context Handling', () => {
    it('should link detailed signal with previous "Gold buy now"', async () => {
      const messageText =
        '💥GOLD Buy 4202.6- 4200.6\n\n✅TP  4205.6\n✅TP  4220.6\n\n💢SL  4197';
      const result = await runTranslate(messageText, {
        prevMessage: 'Gold buy now',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          extraction: expect.objectContaining({
            isLinkedWithPrevious: true,
          }),
        }),
      );
    }, 5000);

    it('should extract side from quotedMessage for close commands', async () => {
      const messageText = 'Close 88 hold 90';
      const result = await runTranslate(messageText, {
        quotedMessage:
          '💥GOLD Sell 4188- 4190\n\n✅TP  4185\n✅TP  4168\n\n💢SL  4193',
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_BAD_POSITION,
          extraction: expect.objectContaining({
            side: CommandSide.SELL,
          }),
        }),
      );
    }, 5000);
  });
});
