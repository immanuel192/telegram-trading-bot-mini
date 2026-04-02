/**
 * Purpose: Prompt test for Futu Color trading signals using Groq AI
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
  const promptId = 'futu-color-test-prompt';
  const channelId = 'test-channel';
  let systemPrompt: string;

  // Model configuration - change this to test different models
  const TEST_MODEL = 'llama-3.1-8b-instant';
  // const TEST_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
  // const TEST_MODEL = 'llama-4-scout-17b-16e-instruct';
  // const TEST_MODEL = 'llama-4-maverick-17b-128e-instruct';

  // Model-to-prompt mapping
  const MODEL_PROMPT_MAP: Record<string, string> = {
    'llama-3.1-8b-instant': 'prompt-v3-llama-3.1-8b.txt',
    // 'llama-3.1-8b-instant': 'prompt-v3-llama-4-maverick.txt',
    'meta-llama/llama-4-scout-17b-16e-instruct':
      'prompt-v3-llama-4-maverick.txt', // Use same as 8b for now
    // 'meta-llama/llama-4-maverick-17b-128e-instruct': 'prompt-v2-llama-4-maverick.txt',
    'meta-llama/llama-4-maverick-17b-128e-instruct':
      'prompt-v3-llama-4-maverick.txt',
  };

  beforeAll(async () => {
    // Determine which prompt file to load based on model
    const promptFileName = MODEL_PROMPT_MAP[TEST_MODEL] || 'prompt.txt';

    const promptPath = path.join(
      __dirname,
      '../../../prompts/futu-color',
      promptFileName,
    );

    // Check if optimized prompt exists, fallback to original
    if (fs.existsSync(promptPath)) {
      systemPrompt = fs.readFileSync(promptPath, 'utf-8');
      console.log(
        `\n📝 Using prompt: ${promptFileName} for model: ${TEST_MODEL}\n`,
      );
    } else {
      // Fallback to original prompt
      const fallbackPath = path.join(
        __dirname,
        '../../../prompts/futu-color/prompt.txt',
      );
      systemPrompt = fs.readFileSync(fallbackPath, 'utf-8');
      console.warn(
        `\n⚠️  Prompt ${promptFileName} not found, using prompt.txt\n`,
      );
    }

    // Mock PromptCacheService to return our loaded prompt
    promptCacheService = {
      getPrompt: jest.fn().mockResolvedValue({
        promptId,
        systemPrompt,
        promptHash: 'test-hash',
      }),
      getPromptById: jest.fn().mockResolvedValue({
        promptId,
        systemPrompt,
        name: 'Futu Color Test',
        description: 'Test prompt for Futu Color signals',
      }),
      getCachedPrompt: jest.fn().mockResolvedValue({
        promptId,
        systemPrompt,
        promptHash: 'test-hash',
      }),
    } as any;

    // Initialize AI service with real Groq API
    const apiKey = process.env.AI_GROQ_API_KEY!;

    aiService = new GroqAIService(
      apiKey,
      TEST_MODEL,
      promptCacheService,
      fakeLogger,
    );
  });

  afterEach(async () => {
    // Rate limiting: 250ms between tests to avoid API throttling
    await sleep(250);
  });

  const runTranslate = async (
    messageText: string,
    contextParams?: Parameters<typeof buildTestContext>[0],
  ) => {
    const result = await aiService.translateMessage(
      messageText,
      buildTestContext(contextParams),
      channelId,
      promptId,
      'test-trace',
    );

    // console.log(result);
    return result;
  };

  describe('non-command', () => {
    it('should classify non-command message', async () => {
      const messageText = 'Good morning! Market looks bullish today.';
      const result = await runTranslate(messageText);

      expect(result).toEqual(
        expect.objectContaining({
          isCommand: false,
          command: CommandEnum.NONE,
          confidence: expect.any(Number),
          extraction: {
            entry: undefined,
            entryZone: [],
            isImmediate: true,
            meta: { adjustEntry: false, reduceLotSize: false },
            stopLoss: undefined,
            symbol: '',
            takeProfits: [],
            validationError: expect.any(String),
          },
        }),
      );
    }, 5000);

    it('should classify non-command Vietnamese message', async () => {
      const messageText = 'ae đừng quên #tips5 cho mấy con bơm láo nhé';
      const result = await runTranslate(messageText);

      expect(result).toEqual(
        expect.objectContaining({
          isCommand: false,
          command: CommandEnum.NONE,
          confidence: expect.any(Number),
          extraction: {
            entry: undefined,
            entryZone: [],
            isImmediate: true,
            meta: { adjustEntry: false, reduceLotSize: false },
            stopLoss: undefined,
            symbol: '',
            takeProfits: [],
            validationError: expect.any(String),
          },
        }),
      );
    }, 5000);

    it('should classify non-command Vietnamese long message', async () => {
      const messageText =
        '🤯 #btc 8/12\n➖ Sau khi BTC có nhịp điều chỉnh về lại vùng 87 rồi bật leenm ngay trong đêm để chạm lại vùng 91k. Nhưng chưa đạt đến kỳ vọng của chúng ta ở móc 868 nên bị miss nhịp long dài này hơi buồn xíu . Sau khio giá lên chạm 915 thì ngay lập tức có phản ứng và giá lại điều chỉnh nhẹ về lại 88x ( đây được xem như là vùng DM khá cuwnsgc ho nhịp này sau khi đã quét râu khu vực phía dưới và dần tạo những cú HIT để đẩy giá đi lên .\n➖ Vậy thì kỳ vọng hôm nay của a BTC sẽ có nhịp chỉnh nhẹ về test lại 895( đây đang là vùng SP của nhịp tăng và giảm trong đêm qua) sau đó bật mạnh lên 936 ( đây cũng là vùng SP cứng của nhịp tăng vừa rồi khi chưa thực sự phá đc vùng 94) rồi mới điều chỉnh tiếp được .\n➖ #eth cũng tương tự BTC khi nhịp hôm qua mình kỳ vụng 288 nên không đón được cú hồi phục đó thì hôm nay giá cũng có thể test nhẹ về lại 303 sau đó hồi phhujc mạnh lên 320 rồi bắt đầu điều chỉnh trở lại';
      const result = await runTranslate(messageText);

      expect(result).toEqual(
        expect.objectContaining({
          isCommand: false,
          command: CommandEnum.NONE,
          confidence: expect.any(Number),
          extraction: {
            entry: undefined,
            entryZone: [],
            isImmediate: expect.any(Boolean),
            meta: { adjustEntry: false, reduceLotSize: false },
            stopLoss: undefined,
            symbol: '',
            takeProfits: [],
            validationError: expect.any(String),
          },
        }),
      );
    }, 5000);

    it('should classify non-command empty message', async () => {
      const messageText = '';
      const result = await runTranslate(messageText);

      expect(result).toEqual(
        expect.objectContaining({
          isCommand: false,
          command: CommandEnum.NONE,
          confidence: expect.any(Number),
          extraction: {
            entry: undefined,
            entryZone: [],
            isImmediate: true,
            meta: { adjustEntry: false, reduceLotSize: false },
            stopLoss: undefined,
            symbol: '',
            takeProfits: [],
            validationError: expect.any(String),
          },
        }),
      );
    }, 5000);
  });

  describe('LONG', () => {
    /**
     * @todo This case is very confusing. Keep failing the test. Will need to double check
     */
    it('should classify LONG command symbol in hashtag', async () => {
      // generate 3 char random for the symbol but not number
      const symbol = [...Array(4)]
        .map(() => Math.random().toString(36)[2])
        .join('');
      const messageText =
        'long limit #' + symbol + ' 0.005968 sl 0.005696 tp 0.009009';
      const result = await runTranslate(messageText);

      // Validate response structure using expect.objectContaining
      expect(result).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          confidence: expect.any(Number),
          reason: expect.any(String),
          extraction: expect.objectContaining({
            entry: 0.005968,
            entryZone: [],
            isImmediate: false,
            meta: { adjustEntry: false, reduceLotSize: false },
            stopLoss: { price: 0.005696 },
            symbol: `${symbol.toUpperCase()}USDT`,
            takeProfits: [
              {
                price: 0.009009,
              },
            ],
            validationError: expect.any(String),
          }),
        }),
      );
    }, 5000);

    it.only('should classify LONG command with entry zone typo', async () => {
      const messageText = 'long limit #velo 0,005968 sl 0.005696 tp 0,009009';
      const result = await runTranslate(messageText);

      // Validate response structure using expect.objectContaining
      expect(result).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          confidence: expect.any(Number),
          reason: expect.any(String),
          extraction: expect.objectContaining({
            entry: 0.005968,
            entryZone: [],
            isImmediate: false,
            meta: { adjustEntry: false, reduceLotSize: false },
            stopLoss: { price: 0.005696 },
            symbol: 'VELOUSDT',
            takeProfits: [
              {
                price: 0.009009,
              },
            ],
            validationError: expect.any(String),
          }),
        }),
      );
    }, 5000);

    it('should classify LONG command as bot instruction', async () => {
      const messageText =
        '📉 Long #Pippin  (LIMIT)\n\n🛒 Entry: 0,177 ( SET CHÊNH XÍU KẺO K ĐÓN )\n\n📩SL: 0,162 ( SET Trừ  hao chút đi)\n\n💱TP: 0,192💵\n\n🆘 NOTE : entry stl nới ra tránh k đón và quét chung 1 stl . Khi đạt tp1 tự chủ động chốt dời sl entry';
      const result = await runTranslate(messageText);

      // Validate response structure using expect.objectContaining
      expect(result).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          confidence: expect.any(Number),
          reason: expect.any(String),
          extraction: expect.objectContaining({
            entry: 0.177,
            entryZone: [],
            isImmediate: false,
            meta: { adjustEntry: true, reduceLotSize: false },
            stopLoss: { price: 0.162 },
            symbol: 'PIPPINUSDT',
            takeProfits: [
              {
                price: 0.192,
              },
            ],
            validationError: expect.any(String),
          }),
        }),
      );
    }, 5000);
  });

  describe('SHORT', () => {
    it('should classify SHORT command with take profit ending with range', async () => {
      const messageText =
        'short #idol 0,03404 sl 0.03543 tp 0,03266-0,03122-0,02975-0,02678-0,02424';
      const result = await runTranslate(messageText);

      // Validate response structure using expect.objectContaining
      expect(result).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SHORT,
          confidence: expect.any(Number),
          reason: expect.any(String),
          extraction: expect.objectContaining({
            entry: 0.03404,
            entryZone: [],
            isImmediate: true,
            meta: { adjustEntry: false, reduceLotSize: false },
            stopLoss: { price: 0.03543 },
            symbol: 'IDOLUSDT',
            takeProfits: [
              {
                price: 0.03266,
              },
              {
                price: 0.03122,
              },
              {
                price: 0.02975,
              },
              {
                price: 0.02678,
              },
              {
                price: 0.02424,
              },
            ],
            validationError: expect.any(String),
          }),
        }),
      );
    }, 5000);

    it('should classify LONG command as bot instruction', async () => {
      const messageText =
        '📉 Short #ICNT  (LIMIT)\n\n🛒 Entry: 0,27 ( SET CHÊNH XÍU KẺO K ĐÓN )\n\n📩SL: 0,285 ( SET Trừ  hao chút đi)\n\n💱TP: 0,255-0,24💵\n\n🆘 NOTE : entry stl nới ra tránh k đón và quét chung 1 stl . Khi đạt tp1 tự chủ động chốt dời sl entry';
      const result = await runTranslate(messageText);

      // Validate response structure using expect.objectContaining
      expect(result).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SHORT,
          confidence: expect.any(Number),
          reason: expect.any(String),
          extraction: expect.objectContaining({
            entry: 0.27,
            entryZone: [],
            isImmediate: false,
            meta: { adjustEntry: true, reduceLotSize: false },
            stopLoss: { price: 0.285 },
            symbol: 'ICNTUSDT',
            takeProfits: [
              {
                price: 0.255,
              },
              {
                price: 0.24,
              },
            ],
            validationError: expect.any(String),
          }),
        }),
      );
    }, 5000);
  });

  describe('MOVE_SL', () => {
    it('should classify MOVE_SL command', async () => {
      const messageText = '#idol đón rồi sl entry ôm thôi';
      const result = await runTranslate(messageText);

      // Validate response structure using expect.objectContaining
      expect(result).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.MOVE_SL,
          confidence: expect.any(Number),
          reason: expect.any(String),
          extraction: expect.objectContaining({
            entry: undefined,
            entryZone: [],
            isImmediate: expect.any(Boolean),
            meta: { adjustEntry: false, reduceLotSize: false },
            stopLoss: undefined,
            symbol: 'IDOLUSDT',
            takeProfits: [],
            validationError: expect.any(String),
          }),
        }),
      );
    }, 5000);

    it('should classify MOVE_SL - case 2', async () => {
      const messageText = 'lại sl entry gồng thôi #irys.';
      const result = await runTranslate(messageText);

      // Validate response structure using expect.objectContaining
      expect(result).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.MOVE_SL,
          confidence: expect.any(Number),
          reason: expect.any(String),
          extraction: expect.objectContaining({
            entry: undefined,
            entryZone: [],
            isImmediate: expect.any(Boolean),
            meta: { adjustEntry: false, reduceLotSize: false },
            stopLoss: undefined,
            symbol: 'IRYSUSDT',
            takeProfits: [],
            validationError: expect.any(String),
          }),
        }),
      );
    }, 5000);
  });

  describe('CANCEL', () => {
    it('should not cancel when they said something related', async () => {
      const messageText = 'chính phủ hủy tùm lum';
      const result = await runTranslate(messageText, {});

      // Validate response structure using expect.objectContaining
      expect(result).toEqual(
        expect.objectContaining({
          isCommand: expect.any(Boolean),
          command: CommandEnum.NONE,
          confidence: expect.any(Number),
          reason: expect.any(String),
          extraction: expect.objectContaining({
            entry: undefined,
            entryZone: [],
            isImmediate: expect.any(Boolean),
            meta: { adjustEntry: false, reduceLotSize: false },
            stopLoss: undefined,
            symbol: expect.any(String),
            takeProfits: [],
            validationError: expect.any(String),
          }),
        }),
      );
    }, 5000);

    it('should cancel when mention about the trading pair', async () => {
      const messageText = 'huỷ #bob';
      const result = await runTranslate(messageText, {});

      // Validate response structure using expect.objectContaining
      expect(result).toEqual(
        expect.objectContaining({
          isCommand: expect.any(Boolean),
          command: CommandEnum.CANCEL,
          confidence: expect.any(Number),
          reason: expect.any(String),
          extraction: expect.objectContaining({
            entry: undefined,
            entryZone: [],
            isImmediate: true,
            meta: { adjustEntry: false, reduceLotSize: false },
            stopLoss: undefined,
            symbol: 'BOBUSDT',
            takeProfits: [],
            validationError: expect.any(String),
          }),
        }),
      );
    }, 5000);

    it('should cancel when not mention anything', async () => {
      const messageText = 'huỷ hết lệnh nha anh em';
      const result = await runTranslate(messageText, {});

      // Validate response structure using expect.objectContaining
      expect(result).toEqual(
        expect.objectContaining({
          isCommand: expect.any(Boolean),
          command: CommandEnum.CANCEL,
          confidence: expect.any(Number),
          reason: expect.any(String),
          extraction: expect.objectContaining({
            entry: undefined,
            entryZone: [],
            isImmediate: true,
            meta: { adjustEntry: false, reduceLotSize: false },
            stopLoss: undefined,
            symbol: '',
            takeProfits: [],
            validationError: expect.any(String),
          }),
        }),
      );
    }, 5000);
  });

  describe('CLOSE_ALL', () => {
    it('should close all current orders when quoting symbol', async () => {
      const messageText = 'cân nhắc chốt hết đi anh em';
      const result = await runTranslate(messageText, {
        quotedMessage: 'long tí vol nhỏ BTC now đi ae  90101 slll 88501',
      });

      // Validate response structure using expect.objectContaining
      expect(result).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_ALL,
          confidence: expect.any(Number),
          reason: expect.any(String),
          extraction: expect.objectContaining({
            entry: undefined,
            entryZone: [],
            isImmediate: expect.any(Boolean),
            meta: { adjustEntry: false, reduceLotSize: false },
            stopLoss: undefined,
            symbol: 'BTCUSDT',
            takeProfits: [],
            validationError: expect.any(String),
          }),
        }),
      );
    }, 5000);

    it('should close all current orders', async () => {
      const messageText =
        'Tối nay có tin non-farm. Anh em cẩn thận. Ai còn đang có lệnh thì cân nhắc thoát hàng hết đi';
      const result = await runTranslate(messageText, {});

      // Validate response structure using expect.objectContaining
      expect(result).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.CLOSE_ALL,
          confidence: expect.any(Number),
          reason: expect.any(String),
          extraction: expect.objectContaining({
            entry: undefined,
            entryZone: [],
            isImmediate: expect.any(Boolean),
            meta: { adjustEntry: false, reduceLotSize: false },
            stopLoss: undefined,
            symbol: '',
            takeProfits: [],
            validationError: expect.any(String),
          }),
        }),
      );
    }, 5000);
  });

  describe('Inform - information', () => {
    it('should not do anything when inform TP', async () => {
      const messageText = '#irys tp1';
      const result = await runTranslate(messageText, {});

      // Validate response structure using expect.objectContaining
      expect(result).toEqual(
        expect.objectContaining({
          isCommand: expect.any(Boolean),
          command: CommandEnum.NONE,
          confidence: expect.any(Number),
          reason: expect.any(String),
          extraction: expect.objectContaining({
            entry: undefined,
            entryZone: [],
            isImmediate: expect.any(Boolean),
            meta: { adjustEntry: false, reduceLotSize: false },
            stopLoss: undefined,
            symbol: expect.any(String),
            takeProfits: [],
            validationError: expect.any(String),
          }),
        }),
      );
    }, 5000);
  });

  describe('Standard test cases', () => {
    it('long #irys 0,03436 stl 0.03322 tp 0,042', async () => {
      const messageText = 'long #irys 0,03436 stl 0.03322 tp 0,042';
      const result = await runTranslate(messageText);

      // Validate response structure using expect.objectContaining
      expect(result).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.LONG,
          confidence: expect.any(Number),
          reason: expect.any(String),
          extraction: expect.objectContaining({
            entry: 0.03436,
            entryZone: [],
            isImmediate: true,
            meta: { adjustEntry: false, reduceLotSize: false },
            stopLoss: { price: 0.03322 },
            symbol: 'IRYSUSDT',
            takeProfits: [
              {
                price: 0.042,
              },
            ],
            validationError: expect.any(String),
          }),
        }),
      );
    }, 5000);

    it('short #idol 0,03404 sl 0.03543 tp 0,03266-0,03122-0,02975-0,02678-0,02424', async () => {
      const messageText =
        'short #idol 0,03404 sl 0.03543 tp 0,03266-0,03122-0,02975-0,02678-0,02424';
      const result = await runTranslate(messageText);

      // Validate response structure using expect.objectContaining
      expect(result).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SHORT,
          confidence: expect.any(Number),
          reason: expect.any(String),
          extraction: expect.objectContaining({
            entry: 0.03404,
            entryZone: [],
            isImmediate: true,
            meta: { adjustEntry: false, reduceLotSize: false },
            stopLoss: { price: 0.03543 },
            symbol: 'IDOLUSDT',
            takeProfits: [
              {
                price: 0.03266,
              },
              {
                price: 0.03122,
              },
              {
                price: 0.02975,
              },
              {
                price: 0.02678,
              },
              {
                price: 0.02424,
              },
            ],
            validationError: expect.any(String),
          }),
        }),
      );
    }, 5000);

    it('short #idol 0,03404 sl 0.03543 tp 0,03266-0,03122-0,02975-0,02678-0,02424', async () => {
      const messageText =
        'short #idol 0,03404 sl 0.03543 tp 0,03266-0,03122-0,02975-0,02678-0,02424';
      const result = await runTranslate(messageText);

      // Validate response structure using expect.objectContaining
      expect(result).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SHORT,
          confidence: expect.any(Number),
          reason: expect.any(String),
          extraction: expect.objectContaining({
            entry: 0.03404,
            entryZone: [],
            isImmediate: true,
            meta: { adjustEntry: false, reduceLotSize: false },
            stopLoss: { price: 0.03543 },
            symbol: 'IDOLUSDT',
            takeProfits: [
              {
                price: 0.03266,
              },
              {
                price: 0.03122,
              },
              {
                price: 0.02975,
              },
              {
                price: 0.02678,
              },
              {
                price: 0.02424,
              },
            ],
            validationError: expect.any(String),
          }),
        }),
      );
    }, 5000);

    it('lại sl entry gồng thôi #irys', async () => {
      const messageText = 'lại sl entry gồng thôi #irys';
      const result = await runTranslate(messageText, {});

      // Validate response structure using expect.objectContaining
      expect(result).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.MOVE_SL,
          confidence: expect.any(Number),
          reason: expect.any(String),
          extraction: expect.objectContaining({
            entry: undefined,
            entryZone: [],
            isImmediate: true,
            meta: { adjustEntry: false, reduceLotSize: false },
            stopLoss: undefined,
            symbol: 'IRYSUSDT',
            takeProfits: [],
            validationError: expect.any(String),
          }),
        }),
      );
    }, 5000);

    it('Short #beat now\nsl: 1,78\ntp: 1,57-1,47', async () => {
      const messageText = 'Short #beat now\nsl: 1,78\ntp: 1,57-1,47';
      const result = await runTranslate(messageText, {});

      // Validate response structure using expect.objectContaining
      expect(result).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SHORT,
          confidence: expect.any(Number),
          reason: expect.any(String),
          extraction: expect.objectContaining({
            entry: undefined,
            entryZone: [],
            isImmediate: true,
            meta: { adjustEntry: false, reduceLotSize: false },
            stopLoss: { price: 1.78 },
            symbol: 'BEATUSDT',
            takeProfits: [
              {
                price: 1.57,
              },
              {
                price: 1.47,
              },
            ],
            validationError: expect.any(String),
          }),
        }),
      );
    }, 5000);

    it('short #la 0,351 sl 0.3665 tp 0,3365-0,320-0,305-0,2828', async () => {
      const messageText =
        'short #la 0,351 sl 0.3665 tp 0,3365-0,320-0,305-0,2828';
      const result = await runTranslate(messageText, {});

      // Validate response structure using expect.objectContaining
      expect(result).toEqual(
        expect.objectContaining({
          isCommand: true,
          command: CommandEnum.SHORT,
          confidence: expect.any(Number),
          reason: expect.any(String),
          extraction: expect.objectContaining({
            entry: 0.351,
            entryZone: [],
            isImmediate: true,
            meta: { adjustEntry: false, reduceLotSize: false },
            stopLoss: { price: 0.3665 },
            symbol: 'LAUSDT',
            takeProfits: [
              {
                price: 0.3365,
              },
              {
                price: 0.32,
              },
              {
                price: 0.305,
              },
              {
                price: 0.2828,
              },
            ],
            validationError: expect.any(String),
          }),
        }),
      );
    }, 5000);

    it('long tí vol nhỏ BTC ETH now đi ae  901xx 309x slll 88501 - 3058', async () => {
      const messageText =
        'long tí vol nhỏ BTC ETH now đi ae  901xx 309x slll 88501 - 3058';
      const result = await runTranslate(messageText, {});

      // Validate response structure using expect.objectContaining
      expect(result).toEqual(
        expect.objectContaining({
          isCommand: false,
          command: CommandEnum.NONE,
          confidence: expect.any(Number),
          reason: expect.any(String),
          extraction: expect.objectContaining({
            entry: undefined,
            entryZone: [],
            isImmediate: expect.any(Boolean),
            meta: { adjustEntry: false, reduceLotSize: true },
            stopLoss: undefined,
            symbol: '',
            takeProfits: [],
            validationError: expect.any(String),
          }),
        }),
      );
    }, 5000);

    it('#velo k đón hủy luôn nhé', async () => {
      const messageText = '#velo k đón hủy luôn nhé';
      const result = await runTranslate(messageText, {});

      // Validate response structure using expect.objectContaining
      expect(result).toEqual(
        expect.objectContaining({
          isCommand: expect.any(Boolean),
          command: CommandEnum.CANCEL,
          confidence: expect.any(Number),
          reason: expect.any(String),
          extraction: expect.objectContaining({
            entry: undefined,
            entryZone: [],
            isImmediate: true,
            meta: { adjustEntry: false, reduceLotSize: false },
            stopLoss: undefined,
            symbol: 'VELOUSDT',
            takeProfits: [],
            validationError: expect.any(String),
          }),
        }),
      );
    }, 5000);
  });
});
