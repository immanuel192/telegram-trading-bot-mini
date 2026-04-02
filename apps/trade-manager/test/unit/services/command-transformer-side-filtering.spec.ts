/**
 * Side Filtering Tests for CommandTransformerService
 * Tests the side filtering feature across CLOSE_ALL, CANCEL, and CLOSE_BAD_POSITION commands
 */

import { CommandTransformerService } from '../../../src/services/command-transformer.service';
import { OrderService } from '../../../src/services/order.service';
import {
  CommandEnum,
  CommandSide,
} from '@telegram-trading-bot-mini/shared/utils';
import { OrderSide, OrderStatus } from '@dal';

describe('CommandTransformerService - Side Filtering', () => {
  let service: CommandTransformerService;
  let mockOrderService: Partial<OrderService>;

  const createTranslateResultCommand = (data: any) => ({
    isCommand: true,
    command: data.command,
    reason: data.reason || 'Test reason',
    confidence: data.confidence || 0.95,
    extraction: data.extraction,
  });

  beforeEach(() => {
    mockOrderService = {
      createOrder: jest.fn(),
      findActiveOrdersByMessageContext: jest.fn().mockResolvedValue([]),
    } as any;

    service = new CommandTransformerService(mockOrderService as any, null);
  });

  describe('CLOSE_ALL with side filter', () => {
    it('should only close LONG orders when side=BUY is specified', async () => {
      const mockOrders = [
        {
          orderId: 'long-1',
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
          symbol: 'BTCUSDT',
        },
        {
          orderId: 'long-2',
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
          symbol: 'BTCUSDT',
        },
        {
          orderId: 'short-1',
          side: OrderSide.SHORT,
          status: OrderStatus.OPEN,
          symbol: 'BTCUSDT',
        },
      ];

      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue(mockOrders);

      const command = createTranslateResultCommand({
        command: CommandEnum.CLOSE_ALL,
        extraction: {
          symbol: 'BTCUSDT',
          side: CommandSide.BUY, // Filter for LONG only
        },
      });

      const result = await service.transform(
        command,
        100,
        'test-channel',
        'test-account',
        'test-trace',
      );

      expect(result).toHaveLength(2);
      const orderIds = result!.map((r) => r.orderId);
      expect(orderIds).toContain('long-1');
      expect(orderIds).toContain('long-2');
      expect(orderIds).not.toContain('short-1');
    });

    it('should only close SHORT orders when side=SELL is specified', async () => {
      const mockOrders = [
        {
          orderId: 'long-1',
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
          symbol: 'BTCUSDT',
        },
        {
          orderId: 'short-1',
          side: OrderSide.SHORT,
          status: OrderStatus.OPEN,
          symbol: 'BTCUSDT',
        },
        {
          orderId: 'short-2',
          side: OrderSide.SHORT,
          status: OrderStatus.OPEN,
          symbol: 'BTCUSDT',
        },
      ];

      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue(mockOrders);

      const command = createTranslateResultCommand({
        command: CommandEnum.CLOSE_ALL,
        extraction: {
          symbol: 'BTCUSDT',
          side: CommandSide.SELL, // Filter for SHORT only
        },
      });

      const result = await service.transform(
        command,
        100,
        'test-channel',
        'test-account',
        'test-trace',
      );

      expect(result).toHaveLength(2);
      const orderIds = result!.map((r) => r.orderId);
      expect(orderIds).toContain('short-1');
      expect(orderIds).toContain('short-2');
      expect(orderIds).not.toContain('long-1');
    });

    it('should return null when side filter excludes all orders', async () => {
      const mockOrders = [
        {
          orderId: 'long-1',
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
          symbol: 'BTCUSDT',
        },
        {
          orderId: 'long-2',
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
          symbol: 'BTCUSDT',
        },
      ];

      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue(mockOrders);

      const command = createTranslateResultCommand({
        command: CommandEnum.CLOSE_ALL,
        extraction: {
          symbol: 'BTCUSDT',
          side: CommandSide.SELL, // All orders are LONG, so filter returns empty
        },
      });

      const result = await service.transform(
        command,
        100,
        'test-channel',
        'test-account',
        'test-trace',
      );

      expect(result).toBeNull();
    });
  });

  describe('CANCEL with side filter', () => {
    it('should only cancel LONG pending orders when side=BUY is specified', async () => {
      const mockOrders = [
        {
          orderId: 'long-pending',
          side: OrderSide.LONG,
          status: OrderStatus.PENDING,
          symbol: 'BTCUSDT',
        },
        {
          orderId: 'short-pending',
          side: OrderSide.SHORT,
          status: OrderStatus.PENDING,
          symbol: 'BTCUSDT',
        },
      ];

      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue(mockOrders);

      const command = createTranslateResultCommand({
        command: CommandEnum.CANCEL,
        extraction: {
          symbol: 'BTCUSDT',
          side: CommandSide.BUY,
        },
      });

      const result = await service.transform(
        command,
        100,
        'test-channel',
        'test-account',
        'test-trace',
      );

      expect(result).toHaveLength(1);
      expect(result![0].orderId).toBe('long-pending');
    });

    it('should only cancel SHORT pending orders when side=SELL is specified', async () => {
      const mockOrders = [
        {
          orderId: 'long-pending',
          side: OrderSide.LONG,
          status: OrderStatus.PENDING,
          symbol: 'BTCUSDT',
        },
        {
          orderId: 'short-pending-1',
          side: OrderSide.SHORT,
          status: OrderStatus.PENDING,
          symbol: 'BTCUSDT',
        },
        {
          orderId: 'short-pending-2',
          side: OrderSide.SHORT,
          status: OrderStatus.PENDING,
          symbol: 'BTCUSDT',
        },
      ];

      mockOrderService.findActiveOrdersByMessageContext = jest
        .fn()
        .mockResolvedValue(mockOrders);

      const command = createTranslateResultCommand({
        command: CommandEnum.CANCEL,
        extraction: {
          symbol: 'BTCUSDT',
          side: CommandSide.SELL,
        },
      });

      const result = await service.transform(
        command,
        100,
        'test-channel',
        'test-account',
        'test-trace',
      );

      expect(result).toHaveLength(2);
      const orderIds = result!.map((r) => r.orderId);
      expect(orderIds).toContain('short-pending-1');
      expect(orderIds).toContain('short-pending-2');
      expect(orderIds).not.toContain('long-pending');
    });
  });

  describe('CLOSE_BAD_POSITION with side filter', () => {
    it('should only process LONG orders when side=BUY is specified', async () => {
      const mockOrders = [
        {
          orderId: 'long-1',
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
          symbol: 'BTCUSDT',
          entry: { entryPrice: 50000 }, // Best LONG
        },
        {
          orderId: 'long-2',
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
          symbol: 'BTCUSDT',
          entry: { entryPrice: 51000 }, // Bad LONG
        },
        {
          orderId: 'short-1',
          side: OrderSide.SHORT,
          status: OrderStatus.OPEN,
          symbol: 'BTCUSDT',
          entry: { entryPrice: 52000 }, // Would be best SHORT, but filtered out
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

      const result = await service.transform(
        command,
        100,
        'test-channel',
        'test-account',
        'test-trace',
      );

      // Should close long-2, keep long-1, ignore short-1
      expect(result).toHaveLength(1);
      expect(result![0].orderId).toBe('long-2');
    });

    it('should only process SHORT orders when side=SELL is specified', async () => {
      const mockOrders = [
        {
          orderId: 'long-1',
          side: OrderSide.LONG,
          status: OrderStatus.OPEN,
          symbol: 'BTCUSDT',
          entry: { entryPrice: 50000 }, // Would be best LONG, but filtered out
        },
        {
          orderId: 'short-1',
          side: OrderSide.SHORT,
          status: OrderStatus.OPEN,
          symbol: 'BTCUSDT',
          entry: { entryPrice: 52000 }, // Best SHORT
        },
        {
          orderId: 'short-2',
          side: OrderSide.SHORT,
          status: OrderStatus.OPEN,
          symbol: 'BTCUSDT',
          entry: { entryPrice: 51000 }, // Bad SHORT
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

      const result = await service.transform(
        command,
        100,
        'test-channel',
        'test-account',
        'test-trace',
      );

      // Should close short-2, keep short-1, ignore long-1
      expect(result).toHaveLength(1);
      expect(result![0].orderId).toBe('short-2');
    });
  });
});
