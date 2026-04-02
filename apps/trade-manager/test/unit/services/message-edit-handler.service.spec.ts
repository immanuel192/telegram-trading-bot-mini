/**
 * Unit tests for MessageEditHandlerService
 * Tests edit detection, action determination, and payload generation
 */

import {
  CommandEnum,
  CommandSide,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  Order,
  OrderSide,
  OrderStatus,
  OrderExecutionType,
  TradeType,
} from '@dal';
import { MessageEditHandlerService } from '../../../src/services/message-edit-handler.service';
import { OrderService } from '../../../src/services/order.service';

// Mock OrderService
const mockOrderService = {
  findOrderByMessageId: jest.fn(),
  addEditAuditTrail: jest.fn(),
} as unknown as OrderService;

const mockLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as any;

const mockSession = {} as any;

const mockPushNotificationService = {
  send: jest.fn().mockResolvedValue(true),
} as any;

describe('MessageEditHandlerService', () => {
  let service: MessageEditHandlerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MessageEditHandlerService(
      mockOrderService,
      mockLogger,
      mockPushNotificationService,
    );
  });

  const createMockOrder = (overrides: Partial<Order> = {}): Order => ({
    orderId: 'order-123',
    accountId: 'account-1',
    messageId: 12345,
    channelId: 'channel-1',
    status: OrderStatus.OPEN,
    side: OrderSide.LONG,
    executionType: OrderExecutionType.market,
    tradeType: TradeType.FUTURE,
    symbol: 'XAUUSD',
    lotSize: 0.01,
    createdAt: new Date(),
    history: [],
    ...overrides,
  });

  const createContext = () => ({
    messageId: 12345,
    channelId: 'channel-1',
    accountId: 'account-1',
    traceToken: 'trace-123',
  });

  describe('handleMessageEdit - No Existing Order', () => {
    it('should return empty payloads when no order exists', async () => {
      (mockOrderService.findOrderByMessageId as jest.Mock).mockResolvedValue(
        null,
      );

      const result = await service.handleMessageEdit(
        { side: CommandSide.BUY, symbol: 'XAUUSD' },
        createContext(),
        mockSession,
      );

      expect(result).toEqual({
        payloads: [],
        skipNormalFlow: false,
      });
      expect(mockOrderService.findOrderByMessageId).toHaveBeenCalledWith(
        12345,
        'channel-1',
        'account-1',
        mockSession,
      );
    });
  });

  describe('handleMessageEdit - CLOSE_AND_RECREATE', () => {
    it('should generate CLOSE_ALL payload when side changes for OPEN order', async () => {
      const existingOrder = createMockOrder({
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
        symbol: 'XAUUSD',
      });
      (mockOrderService.findOrderByMessageId as jest.Mock).mockResolvedValue(
        existingOrder,
      );

      const result = await service.handleMessageEdit(
        { side: CommandSide.SELL, symbol: 'XAUUSD' }, // Side changed: BUY → SELL
        createContext(),
        mockSession,
      );

      expect(result.skipNormalFlow).toBe(false);
      expect(result.payloads).toHaveLength(1);
      expect(result.payloads[0]).toMatchObject({
        orderId: 'order-123',
        command: CommandEnum.CLOSE_ALL,
        symbol: 'XAUUSD',
        accountId: 'account-1',
      });
      expect(mockOrderService.addEditAuditTrail).toHaveBeenCalledWith(
        'order-123',
        'CLOSE_AND_RECREATE',
        expect.stringContaining('Side or symbol changed'),
        mockSession,
      );
      expect(mockPushNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          t: expect.stringContaining('Critical Order Edit: CLOSE AND RECREATE'),
          m: expect.stringContaining('Changes detected:'),
        }),
      );
    });

    it('should generate CLOSE_ALL payload when symbol changes for OPEN order', async () => {
      const existingOrder = createMockOrder({
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
        symbol: 'XAUUSD',
      });
      (mockOrderService.findOrderByMessageId as jest.Mock).mockResolvedValue(
        existingOrder,
      );

      const result = await service.handleMessageEdit(
        { side: CommandSide.BUY, symbol: 'EURUSD' }, // Symbol changed
        createContext(),
        mockSession,
      );

      expect(result.skipNormalFlow).toBe(false);
      expect(result.payloads).toHaveLength(1);
      expect(result.payloads[0].command).toBe(CommandEnum.CLOSE_ALL);
    });
  });

  describe('handleMessageEdit - CANCEL_AND_RECREATE', () => {
    it('should generate CANCEL payload when side changes for PENDING order', async () => {
      const existingOrder = createMockOrder({
        status: OrderStatus.PENDING,
        side: OrderSide.LONG,
        symbol: 'XAUUSD',
        executionType: OrderExecutionType.limit,
        entry: { entryPrice: 2000 },
      });
      (mockOrderService.findOrderByMessageId as jest.Mock).mockResolvedValue(
        existingOrder,
      );

      const result = await service.handleMessageEdit(
        { side: CommandSide.SELL, symbol: 'XAUUSD' }, // Side changed
        createContext(),
        mockSession,
      );

      expect(result.skipNormalFlow).toBe(false);
      expect(result.payloads).toHaveLength(1);
      expect(result.payloads[0]).toMatchObject({
        orderId: 'order-123',
        command: CommandEnum.CANCEL,
        symbol: 'XAUUSD',
      });
      expect(mockOrderService.addEditAuditTrail).toHaveBeenCalledWith(
        'order-123',
        'CANCEL_AND_RECREATE',
        expect.any(String),
        mockSession,
      );
      expect(mockPushNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          t: expect.stringContaining(
            'Critical Order Edit: CANCEL AND RECREATE',
          ),
        }),
      );
    });

    it('should generate CANCEL payload when entry changes for PENDING order', async () => {
      const existingOrder = createMockOrder({
        status: OrderStatus.PENDING,
        side: OrderSide.LONG,
        symbol: 'XAUUSD',
        executionType: OrderExecutionType.limit,
        entry: { entryPrice: 2000 },
      });
      (mockOrderService.findOrderByMessageId as jest.Mock).mockResolvedValue(
        existingOrder,
      );

      const result = await service.handleMessageEdit(
        {
          side: CommandSide.BUY,
          symbol: 'XAUUSD',
          entry: 2010, // Entry changed
        },
        createContext(),
        mockSession,
      );

      expect(result.skipNormalFlow).toBe(false);
      expect(result.payloads).toHaveLength(1);
      expect(result.payloads[0].command).toBe(CommandEnum.CANCEL);
    });
  });

  describe('handleMessageEdit - UPDATE_TP_SL', () => {
    it('should generate SET_TP_SL payload when only TP changes', async () => {
      const existingOrder = createMockOrder({
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
        symbol: 'XAUUSD',
        tp: { tp1Price: 2100 },
        sl: { slPrice: 1900 },
      });
      (mockOrderService.findOrderByMessageId as jest.Mock).mockResolvedValue(
        existingOrder,
      );

      const result = await service.handleMessageEdit(
        {
          side: CommandSide.BUY,
          symbol: 'XAUUSD',
          takeProfits: [{ price: 2150 }], // TP changed
          stopLoss: { price: 1900 }, // SL same
        },
        createContext(),
        mockSession,
      );

      expect(result.skipNormalFlow).toBe(true); // Don't create new order
      expect(result.payloads).toHaveLength(1);
      expect(result.payloads[0]).toMatchObject({
        orderId: 'order-123',
        command: CommandEnum.SET_TP_SL,
        takeProfits: [{ price: 2150 }],
        stopLoss: { price: 1900 },
      });
      expect(mockOrderService.addEditAuditTrail).toHaveBeenCalledWith(
        'order-123',
        'UPDATE_TP_SL',
        'TP/SL values changed in edited message',
        mockSession,
      );
    });

    it('should generate SET_TP_SL payload when only SL changes', async () => {
      const existingOrder = createMockOrder({
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
        symbol: 'XAUUSD',
        tp: { tp1Price: 2100 },
        sl: { slPrice: 1900 },
      });
      (mockOrderService.findOrderByMessageId as jest.Mock).mockResolvedValue(
        existingOrder,
      );

      const result = await service.handleMessageEdit(
        {
          side: CommandSide.BUY,
          symbol: 'XAUUSD',
          takeProfits: [{ price: 2100 }], // TP same
          stopLoss: { price: 1950 }, // SL changed
        },
        createContext(),
        mockSession,
      );

      expect(result.skipNormalFlow).toBe(true);
      expect(result.payloads).toHaveLength(1);
      expect(result.payloads[0].command).toBe(CommandEnum.SET_TP_SL);
    });

    it('should handle multiple TP levels', async () => {
      const existingOrder = createMockOrder({
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
        symbol: 'XAUUSD',
        tp: {
          tp1Price: 2100,
          tp2Price: 2150,
          tp3Price: 2200,
        },
      });
      (mockOrderService.findOrderByMessageId as jest.Mock).mockResolvedValue(
        existingOrder,
      );

      const result = await service.handleMessageEdit(
        {
          side: CommandSide.BUY,
          symbol: 'XAUUSD',
          takeProfits: [
            { price: 2100 },
            { price: 2160 }, // TP2 changed
            { price: 2200 },
          ],
        },
        createContext(),
        mockSession,
      );

      expect(result.skipNormalFlow).toBe(true);
      expect(result.payloads[0].takeProfits).toHaveLength(3);
    });
  });

  describe('handleMessageEdit - IGNORE', () => {
    it('should return empty payloads when no significant changes', async () => {
      const existingOrder = createMockOrder({
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
        symbol: 'XAUUSD',
        tp: { tp1Price: 2100 },
        sl: { slPrice: 1900 },
      });
      (mockOrderService.findOrderByMessageId as jest.Mock).mockResolvedValue(
        existingOrder,
      );

      const result = await service.handleMessageEdit(
        {
          side: CommandSide.BUY,
          symbol: 'XAUUSD',
          takeProfits: [{ price: 2100 }], // Same
          stopLoss: { price: 1900 }, // Same
        },
        createContext(),
        mockSession,
      );

      expect(result).toEqual({
        payloads: [],
        skipNormalFlow: true, // Skip because nothing changed
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 12345,
          orderId: 'order-123',
        }),
        expect.stringContaining('ignored'),
      );
    });

    it('should ignore when extraction is undefined', async () => {
      const existingOrder = createMockOrder();
      (mockOrderService.findOrderByMessageId as jest.Mock).mockResolvedValue(
        existingOrder,
      );

      const result = await service.handleMessageEdit(
        undefined, // No extraction
        createContext(),
        mockSession,
      );

      expect(result).toEqual({
        payloads: [],
        skipNormalFlow: true,
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle order with no TP/SL', async () => {
      const existingOrder = createMockOrder({
        status: OrderStatus.OPEN,
        side: OrderSide.LONG,
        symbol: 'XAUUSD',
        // No TP/SL
      });
      (mockOrderService.findOrderByMessageId as jest.Mock).mockResolvedValue(
        existingOrder,
      );

      const result = await service.handleMessageEdit(
        {
          side: CommandSide.BUY,
          symbol: 'XAUUSD',
          takeProfits: [{ price: 2100 }], // Adding TP
          stopLoss: { price: 1900 }, // Adding SL
        },
        createContext(),
        mockSession,
      );

      expect(result.skipNormalFlow).toBe(true);
      expect(result.payloads[0].command).toBe(CommandEnum.SET_TP_SL);
    });

    it('should handle SHORT orders correctly', async () => {
      const existingOrder = createMockOrder({
        status: OrderStatus.OPEN,
        side: OrderSide.SHORT,
        symbol: 'XAUUSD',
      });
      (mockOrderService.findOrderByMessageId as jest.Mock).mockResolvedValue(
        existingOrder,
      );

      const result = await service.handleMessageEdit(
        { side: CommandSide.BUY, symbol: 'XAUUSD' }, // SHORT → LONG
        createContext(),
        mockSession,
      );

      expect(result.payloads[0].command).toBe(CommandEnum.CLOSE_ALL);
    });

    it('should include all required fields in payload', async () => {
      const existingOrder = createMockOrder();
      (mockOrderService.findOrderByMessageId as jest.Mock).mockResolvedValue(
        existingOrder,
      );

      const context = createContext();
      const result = await service.handleMessageEdit(
        { side: CommandSide.SELL, symbol: 'XAUUSD' },
        context,
        mockSession,
      );

      const payload = result.payloads[0];
      expect(payload).toHaveProperty('orderId');
      expect(payload).toHaveProperty('messageId', context.messageId);
      expect(payload).toHaveProperty('channelId', context.channelId);
      expect(payload).toHaveProperty('accountId', context.accountId);
      expect(payload).toHaveProperty('traceToken', context.traceToken);
      expect(payload).toHaveProperty('symbol');
      expect(payload).toHaveProperty('command');
      expect(payload).toHaveProperty('timestamp');
      expect(typeof payload.timestamp).toBe('number');
    });
  });
});
