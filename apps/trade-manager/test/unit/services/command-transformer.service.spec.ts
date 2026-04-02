/**
 * Unit tests for CommandTransformerService
 * Focus: LONG and SHORT command transformation with validation
 */

import { CommandTransformerService } from '../../../src/services/command-transformer.service';
import { OrderService } from '../../../src/services/order.service';
import {
  CommandEnum,
  CommandSide,
} from '@telegram-trading-bot-mini/shared/utils';
import { OrderSide, OrderStatus } from '@dal';
import {
  fakeLogger,
  createTranslateResultCommand,
} from '@telegram-trading-bot-mini/shared/test-utils';

describe('CommandTransformerService', () => {
  let service: CommandTransformerService;
  let mockOrderService: jest.Mocked<OrderService>;
  let mockRedis: any;

  // Shared context for all tests
  const baseContext = {
    messageId: 100,
    channelId: 'test-channel',
    accountId: 'test-account',
    traceToken: 'test-trace',
  };

  /**
   * Helper to run transform with baseContext
   */
  const runTransform = async (
    command: any,
    accountConfig?: any,
    symbolConfig?: any,
    exchangeCode?: string,
  ) => {
    return await service.transform(
      command,
      baseContext.messageId,
      baseContext.channelId,
      baseContext.accountId,
      baseContext.traceToken,
      accountConfig,
      symbolConfig,
      exchangeCode,
    );
  };

  beforeEach(() => {
    mockOrderService = {
      createOrder: jest.fn(),
      findActiveOrdersByMessageContext: jest.fn().mockResolvedValue([]),
    } as any;

    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
    };

    service = new CommandTransformerService(
      mockOrderService,
      mockRedis,
      fakeLogger,
    );
  });

  describe('LONG Command Transformation', () => {
    it('should transform LONG market order with entry price', async () => {
      const command = createTranslateResultCommand({
        command: CommandEnum.LONG,
        reason: 'Test LONG market order with entry',
        extraction: {
          symbol: 'BTCUSDT',
          side: CommandSide.BUY,
          isImmediate: true,
          entry: 50000,
          stopLoss: { price: 49000 },
          takeProfits: [{ price: 51000 }, { price: 52000 }],
        },
      });

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0]).toMatchObject({
        messageId: 100,
        channelId: 'test-channel',
        accountId: 'test-account',
        symbol: 'BTCUSDT',
        command: CommandEnum.LONG,
        isImmediate: true,
        entry: 50000, // Market order preserves entry for lot size calculation
        lotSize: 0, // Executor calculates
        stopLoss: { price: 49000 },
        takeProfits: [{ price: 51000 }, { price: 52000 }],
      });
      expect(result![0].orderId).toBeDefined();
      expect(result![0].timestamp).toBeDefined();
    });

    it('should transform LONG market order without entry price', async () => {
      const command = createTranslateResultCommand({
        command: CommandEnum.LONG,
        reason: 'Test LONG market order without entry',
        extraction: {
          symbol: 'BTCUSDT',
          side: CommandSide.BUY,
          isImmediate: true,
          // No entry or entryZone provided
          stopLoss: { price: 49000 },
          takeProfits: [{ price: 51000 }],
        },
      });

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0]).toMatchObject({
        symbol: 'BTCUSDT',
        command: CommandEnum.LONG,
        isImmediate: true,
        entry: undefined, // No entry price - executor will use default lot size
        lotSize: 0,
        stopLoss: { price: 49000 },
        takeProfits: [{ price: 51000 }],
      });
    });

    it('should transform LONG limit order with entry price', async () => {
      const command = createTranslateResultCommand({
        command: CommandEnum.LONG,
        reason: 'Test LONG limit order',
        extraction: {
          entry: 50000,
          stopLoss: { price: 49000 },
          takeProfits: [{ price: 51000 }],
        },
      });

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0]).toMatchObject({
        symbol: 'BTCUSDT',
        command: CommandEnum.LONG,
        isImmediate: false,
        entry: 50000,
        stopLoss: { price: 49000 },
        takeProfits: [{ price: 51000 }],
      });
    });

    it('should transform LONG limit order with entry zone (pick first)', async () => {
      const command = createTranslateResultCommand({
        extraction: {
          entryZone: [50000, 49500, 49000], // Unsorted
          stopLoss: { price: 48000 },
          takeProfits: [{ price: 51000 }],
        },
      });

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result![0].entry).toBe(49000); // First from sorted zone
    });

    it('should pick best entry from zone for LONG when configured', async () => {
      const command = createTranslateResultCommand({
        extraction: {
          entryZone: [49000, 49500, 50000],
          stopLoss: { price: 48000 },
          takeProfits: [{ price: 51000 }],
        },
      });

      const symbolConfig = {
        pickBestEntryFromZone: true,
        pickBestEntryFromZoneDelta: 100,
      };

      const result = await runTransform(command, undefined, symbolConfig);

      expect(result).not.toBeNull();
      // LONG: highest price - delta = 50000 - 100 = 49900
      expect(result![0].entry).toBe(49900);
    });

    it('should reject LONG limit order without entry or entry zone', async () => {
      const command = createTranslateResultCommand({
        extraction: {
          // No entry or entryZone (entryZone defaults to [])
          stopLoss: { price: 49000 },
        },
      });

      const result = await runTransform(command);

      expect(result).toBeNull();
    });

    it('should reject LONG with missing symbol', async () => {
      const command = createTranslateResultCommand({
        extraction: {
          symbol: '', // Empty symbol
          isImmediate: true,
        },
      });

      const result = await runTransform(command);

      expect(result).toBeNull();
    });

    it('should validate and filter invalid stopLoss for LONG', async () => {
      const command = {
        isCommand: true,
        confidence: 0.95,
        reason: 'Test LONG with invalid SL',
        command: CommandEnum.LONG,
        extraction: {
          symbol: 'BTCUSDT',
          side: CommandSide.BUY,
          isImmediate: false,
          entry: 50000,
          stopLoss: { price: 51000 }, // Invalid: SL should be < entry for LONG
          takeProfits: [{ price: 52000 }],
          meta: {},
          entryZone: [],
          validationError: '',
        },
      };

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result![0].stopLoss).toBeUndefined(); // Invalid SL filtered out
    });

    it('should validate and filter invalid takeProfits for LONG', async () => {
      const command = {
        isCommand: true,
        confidence: 0.95,
        reason: 'Test LONG with invalid TP',
        command: CommandEnum.LONG,
        extraction: {
          symbol: 'BTCUSDT',
          side: CommandSide.BUY,
          isImmediate: false,
          entry: 50000,
          stopLoss: { price: 49000 },
          takeProfits: [
            { price: 51000 }, // Valid: TP > entry for LONG
            { price: 48000 }, // Invalid: TP should be > entry for LONG
            { price: 52000 }, // Valid
          ],
          meta: {},
          entryZone: [],
          validationError: '',
        },
      };

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result![0].takeProfits).toHaveLength(2); // Only valid TPs
      expect(result![0].takeProfits).toEqual([
        { price: 51000 },
        { price: 52000 },
      ]);
    });

    it('should preserve entry for LONG market order with entryZone', async () => {
      const command = {
        isCommand: true,
        confidence: 0.95,
        reason: 'Test LONG market with entryZone',
        command: CommandEnum.LONG,
        extraction: {
          symbol: 'BTCUSDT',
          side: CommandSide.BUY,
          isImmediate: true,
          entryZone: [49000, 50000, 49500], // Unsorted
          stopLoss: { price: 49000 },
          meta: {},
          validationError: '',
        },
      };

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result![0].entry).toBe(49000); // First from sorted zone for market order
    });

    it('should use first zone price for market order even with pickBestEntryFromZone=true', async () => {
      const command = createTranslateResultCommand({
        command: CommandEnum.LONG,
        extraction: {
          symbol: 'BTCUSDT',
          side: CommandSide.BUY,
          isImmediate: true,
          entryZone: [49000, 49500, 50000],
          stopLoss: { price: 48000 },
        },
      });

      const symbolConfig = {
        pickBestEntryFromZone: true,
        pickBestEntryFromZoneDelta: 100,
      };

      const result = await runTransform(command, undefined, symbolConfig);

      expect(result).not.toBeNull();
      // Market order should use first zone price (49000), NOT best entry (49900)
      expect(result![0].entry).toBe(49000);
    });

    it('should use first zone price for limit order with pickBestEntryFromZone=false', async () => {
      const command = createTranslateResultCommand({
        command: CommandEnum.LONG,
        extraction: {
          symbol: 'BTCUSDT',
          side: CommandSide.BUY,
          isImmediate: false,
          entryZone: [49000, 49500, 50000],
          stopLoss: { price: 48000 },
        },
      });

      const symbolConfig = {
        pickBestEntryFromZone: false,
      };

      const result = await runTransform(command, undefined, symbolConfig);

      expect(result).not.toBeNull();
      // Limit order with pickBestEntryFromZone=false should use first zone price
      expect(result![0].entry).toBe(49000);
    });
  });

  describe('SHORT Command Transformation', () => {
    it('should transform SHORT market order with entry price', async () => {
      const command = {
        isCommand: true,
        confidence: 0.92,
        reason: 'Test SHORT market order with entry',
        command: CommandEnum.SHORT,
        extraction: {
          symbol: 'ETHUSDT',
          side: CommandSide.SELL,
          isImmediate: true,
          entry: 3050,
          stopLoss: { price: 3100 },
          takeProfits: [{ price: 3000 }],
          meta: {},
          entryZone: [],
          validationError: '',
        },
      };

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0]).toMatchObject({
        symbol: 'ETHUSDT',
        command: CommandEnum.SHORT,
        isImmediate: true,
        entry: 3050, // Market order preserves entry
        stopLoss: { price: 3100 },
        takeProfits: [{ price: 3000 }],
      });
    });

    it('should transform SHORT market order without entry price', async () => {
      const command = {
        isCommand: true,
        confidence: 0.92,
        reason: 'Test SHORT market order without entry',
        command: CommandEnum.SHORT,
        extraction: {
          symbol: 'ETHUSDT',
          side: CommandSide.SELL,
          isImmediate: true,
          // No entry or entryZone provided
          stopLoss: { price: 3100 },
          takeProfits: [{ price: 3000 }],
          meta: {},
          entryZone: [],
          validationError: '',
        },
      };

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0]).toMatchObject({
        symbol: 'ETHUSDT',
        command: CommandEnum.SHORT,
        isImmediate: true,
        entry: undefined, // No entry price - executor will use default lot size
        stopLoss: { price: 3100 },
        takeProfits: [{ price: 3000 }],
      });
    });

    it('should transform SHORT limit order with entry price', async () => {
      const command = {
        isCommand: true,
        confidence: 0.92,
        reason: 'Test SHORT limit order',
        command: CommandEnum.SHORT,
        extraction: {
          symbol: 'ETHUSDT',
          side: CommandSide.SELL,
          isImmediate: false,
          entry: 3050,
          stopLoss: { price: 3100 },
          takeProfits: [{ price: 3000 }],
          meta: {},
          entryZone: [],
          validationError: '',
        },
      };

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0]).toMatchObject({
        symbol: 'ETHUSDT',
        command: CommandEnum.SHORT,
        isImmediate: false,
        entry: 3050,
        stopLoss: { price: 3100 },
        takeProfits: [{ price: 3000 }],
      });
    });

    it('should pick best entry from zone for SHORT when configured', async () => {
      const command = {
        isCommand: true,
        confidence: 0.92,
        reason: 'Test SHORT with best entry',
        command: CommandEnum.SHORT,
        extraction: {
          symbol: 'ETHUSDT',
          side: CommandSide.SELL,
          isImmediate: false,
          entryZone: [3000, 3050, 3100],
          stopLoss: { price: 3150 },
          takeProfits: [{ price: 2950 }],
          meta: {},
          validationError: '',
        },
      };

      const symbolConfig = {
        pickBestEntryFromZone: true,
        pickBestEntryFromZoneDelta: 10,
      };

      const result = await runTransform(command, undefined, symbolConfig);

      expect(result).not.toBeNull();
      // SHORT: lowest price + delta = 3000 + 10 = 3010
      expect(result![0].entry).toBe(3010);
    });

    it('should validate and filter invalid stopLoss for SHORT', async () => {
      const command = {
        isCommand: true,
        confidence: 0.92,
        reason: 'Test SHORT with invalid SL',
        command: CommandEnum.SHORT,
        extraction: {
          symbol: 'ETHUSDT',
          side: CommandSide.SELL,
          isImmediate: false,
          entry: 3050,
          stopLoss: { price: 3000 }, // Invalid: SL should be > entry for SHORT
          takeProfits: [{ price: 2950 }],
          meta: {},
          entryZone: [],
          validationError: '',
        },
      };

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result![0].stopLoss).toBeUndefined(); // Invalid SL filtered out
    });

    it('should validate and filter invalid takeProfits for SHORT', async () => {
      const command = {
        isCommand: true,
        confidence: 0.92,
        reason: 'Test SHORT with invalid TP',
        command: CommandEnum.SHORT,
        extraction: {
          symbol: 'ETHUSDT',
          side: CommandSide.SELL,
          isImmediate: false,
          entry: 3050,
          stopLoss: { price: 3100 },
          takeProfits: [
            { price: 3000 }, // Valid: TP < entry for SHORT
            { price: 3200 }, // Invalid: TP should be < entry for SHORT
            { price: 2950 }, // Valid
          ],
          meta: {},
          entryZone: [],
          validationError: '',
        },
      };

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result![0].takeProfits).toHaveLength(2); // Only valid TPs
      expect(result![0].takeProfits).toEqual([
        { price: 3000 },
        { price: 2950 },
      ]);
    });

    it('should handle stopLoss and takeProfit with pips only', async () => {
      const command = {
        isCommand: true,
        confidence: 0.92,
        reason: 'Test SHORT with pips',
        command: CommandEnum.SHORT,
        extraction: {
          symbol: 'ETHUSDT',
          side: CommandSide.SELL,
          isImmediate: false,
          entry: 3050,
          stopLoss: { pips: 50 }, // Pips only, no validation
          takeProfits: [{ pips: 100 }], // Pips only
          meta: {},
          entryZone: [],
          validationError: '',
        },
      };

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result![0].stopLoss).toEqual({ pips: 50 });
      expect(result![0].takeProfits).toEqual([{ pips: 100 }]);
    });
  });

  describe('Meta Field Handling (reduceLotSize and adjustEntry)', () => {
    it('should extract and pass meta field for LONG command', async () => {
      const command = {
        isCommand: true,
        confidence: 0.95,
        reason: 'Test LONG with meta',
        command: CommandEnum.LONG,
        extraction: {
          symbol: 'BTCUSDT',
          side: CommandSide.BUY,
          isImmediate: true,
          stopLoss: { price: 49000 },
          takeProfits: [{ price: 51000 }],
          meta: {
            reduceLotSize: true,
            adjustEntry: true,
          },
          entryZone: [],
          validationError: '',
        },
      };

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result![0].meta).toEqual({
        reduceLotSize: true,
        adjustEntry: true,
      });
    });

    it('should extract and pass meta field for SHORT command', async () => {
      const command = {
        isCommand: true,
        confidence: 0.92,
        reason: 'Test SHORT with meta',
        command: CommandEnum.SHORT,
        extraction: {
          symbol: 'ETHUSDT',
          side: CommandSide.SELL,
          isImmediate: false,
          entry: 3050,
          stopLoss: { price: 3100 },
          takeProfits: [{ price: 3000 }],
          meta: {
            reduceLotSize: false,
            adjustEntry: true,
          },
          entryZone: [],
          validationError: '',
        },
      };

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result![0].meta).toEqual({
        reduceLotSize: false,
        adjustEntry: true,
      });
    });

    it('should handle meta field with only reduceLotSize', async () => {
      const command = {
        isCommand: true,
        confidence: 0.95,
        reason: 'Test LONG with reduceLotSize only',
        command: CommandEnum.LONG,
        extraction: {
          symbol: 'BTCUSDT',
          side: CommandSide.BUY,
          isImmediate: true,
          stopLoss: { price: 49000 },
          meta: {
            reduceLotSize: true,
          },
          entryZone: [],
          validationError: '',
        },
      };

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result![0].meta).toEqual({
        reduceLotSize: true,
        adjustEntry: undefined,
      });
    });

    it('should handle meta field with only adjustEntry', async () => {
      const command = {
        isCommand: true,
        confidence: 0.95,
        reason: 'Test LONG with adjustEntry only',
        command: CommandEnum.LONG,
        extraction: {
          symbol: 'BTCUSDT',
          side: CommandSide.BUY,
          isImmediate: true,
          stopLoss: { price: 49000 },
          meta: {
            adjustEntry: true,
          },
          entryZone: [],
          validationError: '',
        },
      };

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result![0].meta).toEqual({
        reduceLotSize: undefined,
        adjustEntry: true,
      });
    });

    it('should handle missing meta field (undefined)', async () => {
      const command = {
        isCommand: true,
        confidence: 0.95,
        reason: 'Test LONG without meta',
        command: CommandEnum.LONG,
        extraction: {
          symbol: 'BTCUSDT',
          side: CommandSide.BUY,
          isImmediate: true,
          stopLoss: { price: 49000 },
          entryZone: [],
          validationError: '',
        },
      };

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result![0].meta).toBeUndefined();
    });

    it('should handle empty meta field', async () => {
      const command = {
        isCommand: true,
        confidence: 0.95,
        reason: 'Test LONG with empty meta',
        command: CommandEnum.LONG,
        extraction: {
          symbol: 'BTCUSDT',
          side: CommandSide.BUY,
          isImmediate: true,
          stopLoss: { price: 49000 },
          meta: {},
          entryZone: [],
          validationError: '',
        },
      };

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result![0].meta).toEqual({
        reduceLotSize: undefined,
        adjustEntry: undefined,
      });
    });
  });

  describe('MOVE_SL Command Transformation', () => {
    it('should transform MOVE_SL for LONG order with valid entry', async () => {
      // Mock order service to return a LONG order
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([
          {
            orderId: 'order-123',
            symbol: 'BTCUSDT',
            side: 'LONG',
            entry: { entryPrice: 50000 },
            messageId: 100,
            channelId: 'test-channel',
          },
        ]);

      const command = createTranslateResultCommand({
        command: CommandEnum.MOVE_SL,
      });

      const symbolConfig = {
        pickBestEntryFromZoneDelta: 100,
      };

      const result = await runTransform(command, undefined, symbolConfig);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0]).toMatchObject({
        orderId: 'order-123', // Uses existing order ID
        symbol: 'BTCUSDT',
        command: CommandEnum.MOVE_SL,
        stopLoss: { price: 50100 }, // LONG: entry + delta = 50000 + 100
      });
      expect(
        mockOrderService.findActiveOrdersByMessageContext,
      ).toHaveBeenCalledWith(100, 'test-channel', false);
    });

    it('should transform MOVE_SL for SHORT order with valid entry', async () => {
      // Mock order service to return a SHORT order
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([
          {
            orderId: 'order-456',
            symbol: 'ETHUSDT',
            side: 'SHORT',
            entry: { entryPrice: 3000 },
            messageId: 100,
            channelId: 'test-channel',
          },
        ]);

      const command = createTranslateResultCommand({
        command: CommandEnum.MOVE_SL,
      });

      const symbolConfig = {
        pickBestEntryFromZoneDelta: 50,
      };

      const result = await runTransform(command, undefined, symbolConfig);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0]).toMatchObject({
        orderId: 'order-456',
        symbol: 'ETHUSDT',
        command: CommandEnum.MOVE_SL,
        stopLoss: { price: 2950 }, // SHORT: entry - delta = 3000 - 50
      });
    });

    it('should transform MOVE_SL for multiple orders', async () => {
      // Mock order service to return multiple orders
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([
          {
            orderId: 'order-1',
            symbol: 'BTCUSDT',
            side: 'LONG',
            entry: { entryPrice: 50000 },
            messageId: 100,
            channelId: 'test-channel',
          },
          {
            orderId: 'order-2',
            symbol: 'BTCUSDT',
            side: 'LONG',
            entry: { entryPrice: 51000 },
            messageId: 100,
            channelId: 'test-channel',
          },
        ]);

      const command = createTranslateResultCommand({
        command: CommandEnum.MOVE_SL,
      });

      const symbolConfig = {
        pickBestEntryFromZoneDelta: 100,
      };

      const result = await runTransform(command, undefined, symbolConfig);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(2);
      expect(result![0].stopLoss).toEqual({ price: 50100 });
      expect(result![1].stopLoss).toEqual({ price: 51100 });
    });

    it('should use actualEntryPrice over entryPrice when available', async () => {
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([
          {
            orderId: 'order-789',
            symbol: 'BTCUSDT',
            side: 'LONG',
            entry: {
              entryPrice: 50000,
              actualEntryPrice: 50050, // Actual entry is different
            },
            messageId: 100,
            channelId: 'test-channel',
          },
        ]);

      const command = createTranslateResultCommand({
        command: CommandEnum.MOVE_SL,
      });

      const symbolConfig = {
        pickBestEntryFromZoneDelta: 100,
      };

      const result = await runTransform(command, undefined, symbolConfig);

      expect(result).not.toBeNull();
      expect(result![0].stopLoss).toEqual({ price: 50150 }); // Uses actualEntryPrice: 50050 + 100
    });

    it('should return null when no orders found', async () => {
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([]);

      const command = createTranslateResultCommand({
        command: CommandEnum.MOVE_SL,
      });

      const result = await runTransform(command);

      expect(result).toBeNull();
    });

    it('should filter out orders without valid entry price', async () => {
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([
          {
            orderId: 'order-1',
            symbol: 'BTCUSDT',
            side: 'LONG',
            entry: undefined, // No entry
            messageId: 100,
            channelId: 'test-channel',
          },
          {
            orderId: 'order-2',
            symbol: 'BTCUSDT',
            side: 'LONG',
            entry: { entryPrice: 0 }, // Zero entry
            messageId: 100,
            channelId: 'test-channel',
          },
          {
            orderId: 'order-3',
            symbol: 'BTCUSDT',
            side: 'LONG',
            entry: { entryPrice: 50000 }, // Valid entry
            messageId: 100,
            channelId: 'test-channel',
          },
        ]);

      const command = createTranslateResultCommand({
        command: CommandEnum.MOVE_SL,
      });

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1); // Only valid order
      expect(result![0].orderId).toBe('order-3');
    });

    it('should return null when all orders have invalid entry prices', async () => {
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([
          {
            orderId: 'order-1',
            symbol: 'BTCUSDT',
            side: 'LONG',
            entry: undefined,
            messageId: 100,
            channelId: 'test-channel',
          },
          {
            orderId: 'order-2',
            symbol: 'BTCUSDT',
            side: 'LONG',
            entry: { entryPrice: 0 },
            messageId: 100,
            channelId: 'test-channel',
          },
        ]);

      const command = createTranslateResultCommand({
        command: CommandEnum.MOVE_SL,
      });

      const result = await runTransform(command);

      expect(result).toBeNull();
    });

    it('should use delta of 0 when no symbol config provided', async () => {
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([
          {
            orderId: 'order-123',
            symbol: 'BTCUSDT',
            side: 'LONG',
            entry: { entryPrice: 50000 },
            messageId: 100,
            channelId: 'test-channel',
          },
        ]);

      const command = createTranslateResultCommand({
        command: CommandEnum.MOVE_SL,
      });

      const result = await runTransform(command); // No symbolConfig

      expect(result).not.toBeNull();
      expect(result![0].stopLoss).toEqual({ price: 50000 }); // entry + 0 = 50000
    });
  });

  describe('SET_TP_SL Command Transformation', () => {
    it('should transform SET_TP_SL with price for LONG order', async () => {
      // Mock order service to return a LONG order
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([
          {
            orderId: 'order-123',
            symbol: 'BTCUSDT',
            side: 'LONG',
            entry: { entryPrice: 50000 },
            sl: { slPrice: 49000 },
            tp: { tp1Price: 51000 },
            messageId: 100,
            channelId: 'test-channel',
          },
        ]);

      const command = createTranslateResultCommand({
        command: CommandEnum.SET_TP_SL,
        extraction: {
          stopLoss: { price: 49500 }, // Move SL up (valid for LONG)
          takeProfits: [{ price: 52000 }, { price: 53000 }],
        },
      });

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0]).toMatchObject({
        orderId: 'order-123',
        symbol: 'BTCUSDT',
        command: CommandEnum.SET_TP_SL,
        stopLoss: { price: 49500 },
        takeProfits: [{ price: 52000 }, { price: 53000 }],
      });
    });

    it('should transform SET_TP_SL with price for SHORT order', async () => {
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([
          {
            orderId: 'order-456',
            symbol: 'ETHUSDT',
            side: 'SHORT',
            entry: { entryPrice: 3000 },
            sl: { slPrice: 3100 },
            tp: { tp1Price: 2900 },
            messageId: 100,
            channelId: 'test-channel',
          },
        ]);

      const command = createTranslateResultCommand({
        command: CommandEnum.SET_TP_SL,
        extraction: {
          stopLoss: { price: 3050 }, // Move SL down (valid for SHORT)
          takeProfits: [{ price: 2800 }],
        },
      });

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0]).toMatchObject({
        orderId: 'order-456',
        symbol: 'ETHUSDT',
        command: CommandEnum.SET_TP_SL,
        stopLoss: { price: 3050 },
        takeProfits: [{ price: 2800 }],
      });
    });

    it('should reject SL that moves in wrong direction for LONG', async () => {
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([
          {
            orderId: 'order-123',
            symbol: 'BTCUSDT',
            side: 'LONG',
            entry: { entryPrice: 50000 },
            sl: { slPrice: 49500 }, // Existing SL
            messageId: 100,
            channelId: 'test-channel',
          },
        ]);

      const command = createTranslateResultCommand({
        command: CommandEnum.SET_TP_SL,
        extraction: {
          stopLoss: { price: 49000 }, // Try to move SL down (invalid for LONG)
          takeProfits: [{ price: 52000 }],
        },
      });

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      // SL should be filtered out, only TP remains
      expect(result![0].stopLoss).toBeUndefined();
      expect(result![0].takeProfits).toEqual([{ price: 52000 }]);
    });

    it('should reject SL that moves in wrong direction for SHORT', async () => {
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([
          {
            orderId: 'order-456',
            symbol: 'ETHUSDT',
            side: 'SHORT',
            entry: { entryPrice: 3000 },
            sl: { slPrice: 3050 }, // Existing SL
            messageId: 100,
            channelId: 'test-channel',
          },
        ]);

      const command = createTranslateResultCommand({
        command: CommandEnum.SET_TP_SL,
        extraction: {
          stopLoss: { price: 3100 }, // Try to move SL up (invalid for SHORT)
          takeProfits: [{ price: 2800 }],
        },
      });

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      // SL should be filtered out, only TP remains
      expect(result![0].stopLoss).toBeUndefined();
      expect(result![0].takeProfits).toEqual([{ price: 2800 }]);
    });

    it('should allow positive SL (above entry) for LONG', async () => {
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([
          {
            orderId: 'order-123',
            symbol: 'BTCUSDT',
            side: 'LONG',
            entry: { entryPrice: 50000 },
            sl: { slPrice: 50200 }, // SL already above entry
            messageId: 100,
            channelId: 'test-channel',
          },
        ]);

      const command = createTranslateResultCommand({
        command: CommandEnum.SET_TP_SL,
        extraction: {
          stopLoss: { price: 50500 }, // Move SL further up (valid)
        },
      });

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result![0].stopLoss).toEqual({ price: 50500 });
    });

    it('should allow positive SL (below entry) for SHORT', async () => {
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([
          {
            orderId: 'order-456',
            symbol: 'ETHUSDT',
            side: 'SHORT',
            entry: { entryPrice: 3000 },
            sl: { slPrice: 2950 }, // SL already below entry
            messageId: 100,
            channelId: 'test-channel',
          },
        ]);

      const command = createTranslateResultCommand({
        command: CommandEnum.SET_TP_SL,
        extraction: {
          stopLoss: { price: 2900 }, // Move SL further down (valid)
        },
      });

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result![0].stopLoss).toEqual({ price: 2900 });
    });

    it('should reject SL pips when order already has SL', async () => {
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([
          {
            orderId: 'order-123',
            symbol: 'BTCUSDT',
            side: 'LONG',
            entry: { entryPrice: 50000 },
            sl: { slPrice: 49000 }, // Order already has SL
            messageId: 100,
            channelId: 'test-channel',
          },
        ]);

      const command = createTranslateResultCommand({
        command: CommandEnum.SET_TP_SL,
        extraction: {
          stopLoss: { pips: 100 }, // Pips not allowed
          takeProfits: [{ price: 52000 }],
        },
      });

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      // SL should be filtered out, only TP remains
      expect(result![0].stopLoss).toBeUndefined();
      expect(result![0].takeProfits).toEqual([{ price: 52000 }]);
    });

    it('should allow SL pips when order has no SL yet', async () => {
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([
          {
            orderId: 'order-123',
            symbol: 'BTCUSDT',
            side: 'LONG',
            entry: { entryPrice: 50000 },
            // No sl field
            messageId: 100,
            channelId: 'test-channel',
          },
        ]);

      const command = createTranslateResultCommand({
        command: CommandEnum.SET_TP_SL,
        extraction: {
          stopLoss: { pips: 100 }, // Pips allowed for first time
        },
      });

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result![0].stopLoss).toEqual({ pips: 100 });
    });

    it('should reject TP pips when order already has TP', async () => {
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([
          {
            orderId: 'order-123',
            symbol: 'BTCUSDT',
            side: 'LONG',
            entry: { entryPrice: 50000 },
            tp: { tp1Price: 51000 }, // Order already has TP
            messageId: 100,
            channelId: 'test-channel',
          },
        ]);

      const command = createTranslateResultCommand({
        command: CommandEnum.SET_TP_SL,
        extraction: {
          stopLoss: { price: 49500 },
          takeProfits: [{ pips: 200 }], // Pips not allowed
        },
      });

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      // TP should be filtered out, only SL remains
      expect(result![0].stopLoss).toEqual({ price: 49500 });
      expect(result![0].takeProfits).toBeUndefined();
    });

    it('should allow TP pips when order has no TP yet', async () => {
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([
          {
            orderId: 'order-123',
            symbol: 'BTCUSDT',
            side: 'LONG',
            entry: { entryPrice: 50000 },
            // No tp field
            messageId: 100,
            channelId: 'test-channel',
          },
        ]);

      const command = createTranslateResultCommand({
        command: CommandEnum.SET_TP_SL,
        extraction: {
          takeProfits: [{ pips: 200 }, { pips: 300 }], // Pips allowed for first time
        },
      });

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result![0].takeProfits).toEqual([{ pips: 200 }, { pips: 300 }]);
    });

    it('should validate TP direction for LONG', async () => {
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([
          {
            orderId: 'order-123',
            symbol: 'BTCUSDT',
            side: 'LONG',
            entry: { entryPrice: 50000 },
            messageId: 100,
            channelId: 'test-channel',
          },
        ]);

      const command = createTranslateResultCommand({
        command: CommandEnum.SET_TP_SL,
        extraction: {
          takeProfits: [
            { price: 52000 }, // Valid: > entry
            { price: 48000 }, // Invalid: < entry
            { price: 53000 }, // Valid: > entry
          ],
        },
      });

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      // Only valid TPs should remain
      expect(result![0].takeProfits).toEqual([
        { price: 52000 },
        { price: 53000 },
      ]);
    });

    it('should validate TP direction for SHORT', async () => {
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([
          {
            orderId: 'order-456',
            symbol: 'ETHUSDT',
            side: 'SHORT',
            entry: { entryPrice: 3000 },
            messageId: 100,
            channelId: 'test-channel',
          },
        ]);

      const command = createTranslateResultCommand({
        command: CommandEnum.SET_TP_SL,
        extraction: {
          takeProfits: [
            { price: 2800 }, // Valid: < entry
            { price: 3200 }, // Invalid: > entry
            { price: 2700 }, // Valid: < entry
          ],
        },
      });

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      // Only valid TPs should remain
      expect(result![0].takeProfits).toEqual([
        { price: 2800 },
        { price: 2700 },
      ]);
    });

    it('should transform SET_TP_SL for multiple orders', async () => {
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([
          {
            orderId: 'order-1',
            symbol: 'BTCUSDT',
            side: 'LONG',
            entry: { entryPrice: 50000 },
            sl: { slPrice: 49000 },
            messageId: 100,
            channelId: 'test-channel',
          },
          {
            orderId: 'order-2',
            symbol: 'BTCUSDT',
            side: 'LONG',
            entry: { entryPrice: 51000 },
            sl: { slPrice: 50000 },
            messageId: 100,
            channelId: 'test-channel',
          },
        ]);

      const command = createTranslateResultCommand({
        command: CommandEnum.SET_TP_SL,
        extraction: {
          stopLoss: { price: 50000 },
          takeProfits: [{ price: 52000 }],
        },
      });

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(2);
      expect(result![0].orderId).toBe('order-1');
      expect(result![1].orderId).toBe('order-2');
    });

    it('should skip order if both SL and TP fail validation', async () => {
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([
          {
            orderId: 'order-123',
            symbol: 'BTCUSDT',
            side: 'LONG',
            entry: { entryPrice: 50000 },
            sl: { slPrice: 49500 },
            messageId: 100,
            channelId: 'test-channel',
          },
        ]);

      const command = createTranslateResultCommand({
        command: CommandEnum.SET_TP_SL,
        extraction: {
          stopLoss: { price: 49000 }, // Invalid: moving down for LONG
          takeProfits: [{ price: 48000 }], // Invalid: below entry for LONG
        },
      });

      const result = await runTransform(command);

      // Should return null as all validations failed
      expect(result).toBeNull();
    });

    it('should return null when no orders found', async () => {
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([]);

      const command = createTranslateResultCommand({
        command: CommandEnum.SET_TP_SL,
        extraction: {
          stopLoss: { price: 49000 },
        },
      });

      const result = await runTransform(command);

      expect(result).toBeNull();
    });

    it('should return null when neither SL nor TP provided', async () => {
      const command = createTranslateResultCommand({
        command: CommandEnum.SET_TP_SL,
        extraction: {
          symbol: 'BTCUSDT',
          stopLoss: undefined, // Explicitly undefined
          takeProfits: undefined, // Explicitly undefined
        },
      });

      const result = await runTransform(command);

      expect(result).toBeNull();
    });

    it('should use actualEntryPrice for TP validation when available', async () => {
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([
          {
            orderId: 'order-123',
            symbol: 'BTCUSDT',
            side: 'LONG',
            entry: {
              entryPrice: 50000,
              actualEntryPrice: 50100, // Actual entry is higher
            },
            messageId: 100,
            channelId: 'test-channel',
          },
        ]);

      const command = createTranslateResultCommand({
        command: CommandEnum.SET_TP_SL,
        extraction: {
          takeProfits: [
            { price: 50050 }, // Invalid: below actualEntryPrice
            { price: 51000 }, // Valid: above actualEntryPrice
          ],
        },
      });

      const result = await runTransform(command);

      expect(result).not.toBeNull();
      // Only TP above actualEntryPrice should remain
      expect(result![0].takeProfits).toEqual([{ price: 51000 }]);
    });
  });

  describe('CLOSE_ALL Command Transformation', () => {
    it('should transform CLOSE_ALL for single active order', async () => {
      const mockOrder = {
        orderId: 'order-1',
        messageId: 100,
        channelId: 'test-channel',
        symbol: 'BTCUSDT',
        side: OrderSide.LONG,
        status: OrderStatus.OPEN,
      };

      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([mockOrder]);

      const command = createTranslateResultCommand({
        command: CommandEnum.CLOSE_ALL,
        extraction: {
          symbol: 'BTCUSDT',
        },
      });

      const result = await runTransform(command);

      expect(result).toHaveLength(1);
      expect(result![0]).toMatchObject({
        orderId: 'order-1',
        messageId: 100,
        channelId: 'test-channel',
        accountId: 'test-account',
        symbol: 'BTCUSDT',
        command: CommandEnum.CLOSE_ALL,
      });
      expect(
        mockOrderService.findActiveOrdersByMessageContext,
      ).toHaveBeenCalledWith(100, 'test-channel', false);
    });

    it('should transform CLOSE_ALL for multiple active orders', async () => {
      const mockOrders = [
        {
          orderId: 'order-1',
          messageId: 100,
          channelId: 'test-channel',
          symbol: 'BTCUSDT',
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
        },
        {
          orderId: 'order-2',
          messageId: 100,
          channelId: 'test-channel',
          symbol: 'BTCUSDT',
          side: OrderSide.LONG,
          status: OrderStatus.PENDING,
        },
        {
          orderId: 'order-3',
          messageId: 100,
          channelId: 'test-channel',
          symbol: 'BTCUSDT',
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
        },
      ];

      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue(mockOrders);

      const command = createTranslateResultCommand({
        command: CommandEnum.CLOSE_ALL,
        extraction: {
          symbol: 'BTCUSDT',
        },
      });

      const result = await runTransform(command);

      expect(result).toHaveLength(3);
      expect(result![0].orderId).toBe('order-1');
      expect(result![1].orderId).toBe('order-2');
      expect(result![2].orderId).toBe('order-3');
      expect(result!.every((r) => r.command === CommandEnum.CLOSE_ALL)).toBe(
        true,
      );
    });

    it('should return null when no active orders found for CLOSE_ALL', async () => {
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([]);

      const command = createTranslateResultCommand({
        command: CommandEnum.CLOSE_ALL,
        extraction: {
          symbol: 'BTCUSDT',
        },
      });

      const result = await runTransform(command);

      expect(result).toBeNull();
    });

    it('should return null for CLOSE_ALL with missing symbol', async () => {
      const command = createTranslateResultCommand({
        command: CommandEnum.CLOSE_ALL,
        extraction: {
          symbol: '',
        },
      });

      const result = await runTransform(command);

      expect(result).toBeNull();
    });
  });

  describe('CANCEL Command Transformation', () => {
    it('should transform CANCEL for single pending order', async () => {
      const mockOrder = {
        orderId: 'order-1',
        messageId: 100,
        channelId: 'test-channel',
        symbol: 'BTCUSDT',
        side: OrderSide.LONG,
        status: OrderStatus.PENDING,
      };

      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([mockOrder]);

      const command = createTranslateResultCommand({
        command: CommandEnum.CANCEL,
        extraction: {
          symbol: 'BTCUSDT',
        },
      });

      const result = await runTransform(command);

      expect(result).toHaveLength(1);
      expect(result![0]).toMatchObject({
        orderId: 'order-1',
        messageId: 100,
        channelId: 'test-channel',
        accountId: 'test-account',
        symbol: 'BTCUSDT',
        command: CommandEnum.CANCEL,
      });
      expect(
        mockOrderService.findActiveOrdersByMessageContext,
      ).toHaveBeenCalledWith(100, 'test-channel', false);
    });

    it('should transform CANCEL for multiple pending orders', async () => {
      const mockOrders = [
        {
          orderId: 'order-1',
          messageId: 100,
          channelId: 'test-channel',
          symbol: 'BTCUSDT',
          side: OrderSide.LONG,
          status: OrderStatus.PENDING,
        },
        {
          orderId: 'order-2',
          messageId: 100,
          channelId: 'test-channel',
          symbol: 'BTCUSDT',
          side: OrderSide.LONG,
          status: OrderStatus.PENDING,
        },
      ];

      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue(mockOrders);

      const command = createTranslateResultCommand({
        command: CommandEnum.CANCEL,
        extraction: {
          symbol: 'BTCUSDT',
        },
      });

      const result = await runTransform(command);

      expect(result).toHaveLength(2);
      expect(result![0].orderId).toBe('order-1');
      expect(result![1].orderId).toBe('order-2');
      expect(result!.every((r) => r.command === CommandEnum.CANCEL)).toBe(true);
    });

    it('should filter out OPEN orders and only return PENDING orders for CANCEL', async () => {
      const mockOrders = [
        {
          orderId: 'order-pending',
          messageId: 100,
          channelId: 'test-channel',
          symbol: 'BTCUSDT',
          side: OrderSide.LONG,
          status: OrderStatus.PENDING,
        },
        {
          orderId: 'order-open',
          messageId: 100,
          channelId: 'test-channel',
          symbol: 'BTCUSDT',
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
        },
      ];

      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue(mockOrders);

      const command = createTranslateResultCommand({
        command: CommandEnum.CANCEL,
        extraction: {
          symbol: 'BTCUSDT',
        },
      });

      const result = await runTransform(command);

      // Should only return the PENDING order
      expect(result).toHaveLength(1);
      expect(result![0].orderId).toBe('order-pending');
    });

    it('should return null when no pending orders found for CANCEL', async () => {
      // Return only OPEN orders (no PENDING)
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([
          {
            orderId: 'order-open',
            status: OrderStatus.OPEN,
          },
        ]);

      const command = createTranslateResultCommand({
        command: CommandEnum.CANCEL,
        extraction: {
          symbol: 'BTCUSDT',
        },
      });

      const result = await runTransform(command);

      expect(result).toBeNull();
    });

    it('should return null for CANCEL with missing symbol', async () => {
      const command = createTranslateResultCommand({
        command: CommandEnum.CANCEL,
        extraction: {
          symbol: '',
        },
      });

      const result = await runTransform(command);

      expect(result).toBeNull();
    });
  });

  describe('CLOSE_BAD_POSITION Command Transformation', () => {
    it('should close bad LONG positions and keep the best one (lowest entry)', async () => {
      const mockOrders = [
        {
          orderId: 'order-1',
          messageId: 100,
          channelId: 'test-channel',
          symbol: 'BTCUSDT',
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
          entry: { entryPrice: 50000 }, // Best - lowest entry
        },
        {
          orderId: 'order-2',
          messageId: 100,
          channelId: 'test-channel',
          symbol: 'BTCUSDT',
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
          entry: { entryPrice: 51000 }, // Bad - higher entry
        },
        {
          orderId: 'order-3',
          messageId: 100,
          channelId: 'test-channel',
          symbol: 'BTCUSDT',
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
          entry: { entryPrice: 52000 }, // Worst - highest entry
        },
      ];

      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue(mockOrders);

      const command = createTranslateResultCommand({
        command: CommandEnum.CLOSE_BAD_POSITION,
        extraction: {
          symbol: 'BTCUSDT',
          side: CommandSide.BUY,
        },
      });

      const result = await runTransform(command);

      // Should close order-2 and order-3, keep order-1
      expect(result).toHaveLength(2);
      const orderIds = result!.map((r) => r.orderId);
      expect(orderIds).toContain('order-2');
      expect(orderIds).toContain('order-3');
      expect(orderIds).not.toContain('order-1'); // Best position kept
    });

    it('should close bad SHORT positions and keep the best one (highest entry)', async () => {
      const mockOrders = [
        {
          orderId: 'order-1',
          messageId: 100,
          channelId: 'test-channel',
          symbol: 'BTCUSDT',
          side: OrderSide.SHORT,
          status: OrderStatus.OPEN,
          entry: { entryPrice: 52000 }, // Best - highest entry
        },
        {
          orderId: 'order-2',
          messageId: 100,
          channelId: 'test-channel',
          symbol: 'BTCUSDT',
          side: OrderSide.SHORT,
          status: OrderStatus.OPEN,
          entry: { entryPrice: 51000 }, // Bad - lower entry
        },
        {
          orderId: 'order-3',
          messageId: 100,
          channelId: 'test-channel',
          symbol: 'BTCUSDT',
          side: OrderSide.SHORT,
          status: OrderStatus.OPEN,
          entry: { entryPrice: 50000 }, // Worst - lowest entry
        },
      ];

      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue(mockOrders);

      const command = createTranslateResultCommand({
        command: CommandEnum.CLOSE_BAD_POSITION,
        extraction: {
          symbol: 'BTCUSDT',
          side: CommandSide.SELL,
        },
      });

      const result = await runTransform(command);

      // Should close order-2 and order-3, keep order-1
      expect(result).toHaveLength(2);
      const orderIds = result!.map((r) => r.orderId);
      expect(orderIds).toContain('order-2');
      expect(orderIds).toContain('order-3');
      expect(orderIds).not.toContain('order-1'); // Best position kept
    });

    it('should filter out PENDING orders and only process OPEN orders', async () => {
      const mockOrders = [
        {
          orderId: 'order-open-1',
          messageId: 100,
          channelId: 'test-channel',
          symbol: 'BTCUSDT',
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
          entry: { entryPrice: 50000 },
        },
        {
          orderId: 'order-open-2',
          messageId: 100,
          channelId: 'test-channel',
          symbol: 'BTCUSDT',
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
          entry: { entryPrice: 51000 },
        },
        {
          orderId: 'order-pending',
          messageId: 100,
          channelId: 'test-channel',
          symbol: 'BTCUSDT',
          side: OrderSide.LONG,
          status: OrderStatus.PENDING,
          entry: { entryPrice: 49000 }, // Would be best if OPEN
        },
      ];

      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue(mockOrders);

      const command = createTranslateResultCommand({
        command: CommandEnum.CLOSE_BAD_POSITION,
        extraction: {
          symbol: 'BTCUSDT',
          side: CommandSide.BUY,
        },
      });

      const result = await runTransform(command);

      // Should only close order-open-2 (worse OPEN position)
      expect(result).toHaveLength(1);
      expect(result![0].orderId).toBe('order-open-2');
    });

    it('should return null when only one open order found', async () => {
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([
          {
            orderId: 'order-1',
            status: OrderStatus.OPEN,
            entry: { entryPrice: 50000 },
          },
        ]);

      const command = createTranslateResultCommand({
        command: CommandEnum.CLOSE_BAD_POSITION,
        extraction: {
          symbol: 'BTCUSDT',
        },
      });

      const result = await runTransform(command);

      // Nothing to close with only one position
      expect(result).toBeNull();
    });

    it('should return null when no open orders found', async () => {
      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue([
          {
            orderId: 'order-pending',
            status: OrderStatus.PENDING,
          },
        ]);

      const command = createTranslateResultCommand({
        command: CommandEnum.CLOSE_BAD_POSITION,
        extraction: {
          symbol: 'BTCUSDT',
        },
      });

      const result = await runTransform(command);

      expect(result).toBeNull();
    });

    it('should use actualEntryPrice as fallback when entryPrice not available', async () => {
      const mockOrders = [
        {
          orderId: 'order-1',
          messageId: 100,
          channelId: 'test-channel',
          symbol: 'BTCUSDT',
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
          entry: { actualEntryPrice: 50000 }, // Best
        },
        {
          orderId: 'order-2',
          messageId: 100,
          channelId: 'test-channel',
          symbol: 'BTCUSDT',
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
          entry: { actualEntryPrice: 51000 }, // Bad
        },
      ];

      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue(mockOrders);

      const command = createTranslateResultCommand({
        command: CommandEnum.CLOSE_BAD_POSITION,
        extraction: {
          symbol: 'BTCUSDT',
        },
      });

      const result = await runTransform(command);

      // Should close order-2, keep order-1
      expect(result).toHaveLength(1);
      expect(result![0].orderId).toBe('order-2');
    });

    it('should prioritize actualEntryPrice over entryPrice when both are present', async () => {
      const mockOrders = [
        {
          orderId: 'order-1',
          messageId: 100,
          channelId: 'test-channel',
          symbol: 'BTCUSDT',
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
          entry: {
            entryPrice: 51000, // Planned entry (worse)
            actualEntryPrice: 50000, // Actual entry (best) - should be used
          },
        },
        {
          orderId: 'order-2',
          messageId: 100,
          channelId: 'test-channel',
          symbol: 'BTCUSDT',
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
          entry: {
            entryPrice: 50500, // Planned entry (better)
            actualEntryPrice: 52000, // Actual entry (bad) - should be used
          },
        },
      ];

      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue(mockOrders);

      const command = createTranslateResultCommand({
        command: CommandEnum.CLOSE_BAD_POSITION,
        extraction: {
          symbol: 'BTCUSDT',
        },
      });

      const result = await runTransform(command);

      // Should close order-2 (actualEntryPrice: 52000) and keep order-1 (actualEntryPrice: 50000)
      // Even though order-2's entryPrice (50500) is better than order-1's entryPrice (51000)
      expect(result).toHaveLength(1);
      expect(result![0].orderId).toBe('order-2');
    });
  });

  describe('Edge Cases', () => {
    it('should return null for command without extraction', async () => {
      const command = {
        isCommand: true,
        confidence: 0.95,
        reason: 'Test without extraction',
        command: CommandEnum.LONG,
        // No extraction field
      };

      const result = await runTransform(command);

      expect(result).toBeNull();
    });

    it('should return null for unknown command', async () => {
      const command = {
        isCommand: true,
        confidence: 0.95,
        reason: 'Test unknown command',
        command: 'UNKNOWN' as any,
        extraction: {
          symbol: 'BTCUSDT',
          meta: {},
          entryZone: [],
          validationError: '',
        },
      };

      const result = await runTransform(command);

      expect(result).toBeNull();
    });

    it('should throw error for unsupported LIMIT_EXECUTED command', async () => {
      const command = createTranslateResultCommand({
        command: CommandEnum.LIMIT_EXECUTED,
        extraction: {
          symbol: 'BTCUSDT',
        },
      });

      await expect(runTransform(command)).rejects.toThrow(
        'Command LIMIT_EXECUTED is not supported yet',
      );
    });

    it('should sort LONG positions by live profit when price is available', async () => {
      const mockOrders = [
        {
          orderId: 'best-order',
          symbol: 'BTCUSDT',
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
          entry: { actualEntryPrice: 50000 }, // Priority
          lotSize: 1, // Profit = (55000 - 50000) * 1 = 5000
        },
        {
          orderId: 'worst-order',
          symbol: 'BTCUSDT',
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
          entry: { actualEntryPrice: 54000 },
          lotSize: 1, // Profit = (55000 - 54000) * 1 = 1000
        },
      ];

      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue(mockOrders);

      // Mock fresh price in Redis
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          bid: 55000,
          ask: 55100,
          ts: Date.now(),
        }),
      );

      const command = createTranslateResultCommand({
        command: CommandEnum.CLOSE_BAD_POSITION,
        extraction: { symbol: 'BTCUSDT', side: CommandSide.BUY },
      });

      const result = await runTransform(
        command,
        undefined,
        undefined,
        'test-exchange',
      );

      expect(result).toHaveLength(1);
      expect(result![0].orderId).toBe('worst-order');
    });

    it('should sort SHORT positions by live profit when price is available', async () => {
      const mockOrders = [
        {
          orderId: 'best-order',
          symbol: 'BTCUSDT',
          side: OrderSide.SHORT,
          status: OrderStatus.OPEN,
          entry: { entryPrice: 60000 },
          lotSize: 1, // Profit = (60000 - 55100) * 1 = 4900
        },
        {
          orderId: 'worst-order',
          symbol: 'BTCUSDT',
          side: OrderSide.SHORT,
          status: OrderStatus.OPEN,
          entry: { entryPrice: 56000 },
          lotSize: 1, // Profit = (56000 - 55100) * 1 = 900
        },
      ];

      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue(mockOrders);

      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          bid: 55000,
          ask: 55100,
          ts: Date.now(),
        }),
      );

      const command = createTranslateResultCommand({
        command: CommandEnum.CLOSE_BAD_POSITION,
        extraction: { symbol: 'BTCUSDT', side: CommandSide.SELL },
      });

      const result = await runTransform(
        command,
        undefined,
        undefined,
        'test-exchange',
      );

      expect(result).toHaveLength(1);
      expect(result![0].orderId).toBe('worst-order');
    });

    it('should fallback to entry price if price cache is stale', async () => {
      const mockOrders = [
        {
          orderId: 'better-entry',
          symbol: 'BTCUSDT',
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
          entry: { entryPrice: 50000 },
        },
        {
          orderId: 'worse-entry',
          symbol: 'BTCUSDT',
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
          entry: { entryPrice: 60000 },
        },
      ];

      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue(mockOrders);

      // Mock STALE price
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          bid: 55000,
          ask: 55100,
          ts: Date.now() - 3600000, // 1 hour ago
        }),
      );

      const command = createTranslateResultCommand({
        command: CommandEnum.CLOSE_BAD_POSITION,
        extraction: { symbol: 'BTCUSDT', side: CommandSide.BUY },
      });

      const result = await runTransform(
        command,
        undefined,
        undefined,
        'test-exchange',
      );

      // Should keep better-entry (50000), close worse-entry (60000)
      expect(result).toHaveLength(1);
      expect(result![0].orderId).toBe('worse-entry');
    });
  });
});
