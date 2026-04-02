import {
  brokerCloseOrder,
  calculateOrderPnl,
  finalizeOrderClosure,
  publishCloseResult,
} from '../../../../../src/services/order-handlers/close-order/close-order.helper';
import { OrderSide, OrderStatus, OrderHistoryStatus } from '@dal';
import { OrderNotFoundError } from '../../../../../src/adapters/errors';
import {
  MessageType,
  StreamTopic,
} from '@telegram-trading-bot-mini/shared/utils';

describe('CloseOrderHelper', () => {
  describe('calculateOrderPnl', () => {
    const mockOrder: any = {
      side: OrderSide.LONG,
      entry: { actualEntryPrice: 100 },
    };

    it('should calculate positive PNL for LONG position', () => {
      const pnl = calculateOrderPnl(mockOrder, 110, 1);
      expect(pnl).toBe(10);
    });

    it('should calculate negative PNL for LONG position', () => {
      const pnl = calculateOrderPnl(mockOrder, 90, 1);
      expect(pnl).toBe(-10);
    });

    it('should calculate positive PNL for SHORT position', () => {
      const shortOrder = { ...mockOrder, side: OrderSide.SHORT };
      const pnl = calculateOrderPnl(shortOrder, 90, 1);
      expect(pnl).toBe(10);
    });

    it('should use entryPrice if actualEntryPrice is missing', () => {
      const order = { ...mockOrder, entry: { entryPrice: 100 } };
      const pnl = calculateOrderPnl(order, 110, 1);
      expect(pnl).toBe(10);
    });
  });

  describe('brokerCloseOrder', () => {
    let adapter: any;

    beforeEach(() => {
      adapter = {
        closeOrder: jest.fn(),
        emitMetric: jest.fn(),
      };
    });

    it('should return result on success', async () => {
      const mockResult = {
        exchangeOrderId: 'ex-1',
        closedPrice: 100,
        closedLots: 1,
        closedAt: Date.now(),
      };
      adapter.closeOrder.mockResolvedValue(mockResult);

      const res = await brokerCloseOrder(
        adapter,
        'order-1',
        'BTCUSD',
        'trace-1',
      );

      expect(res.result).toBe(mockResult);
      expect(res.isNotFound).toBe(false);
      expect(adapter.emitMetric).toHaveBeenCalledWith(
        'closeOrder',
        expect.any(Number),
        'BTCUSD',
        'success',
      );
    });

    it('should handle OrderNotFoundError', async () => {
      adapter.closeOrder.mockRejectedValue(new OrderNotFoundError('order-1'));

      const res = await brokerCloseOrder(
        adapter,
        'order-1',
        'BTCUSD',
        'trace-1',
      );

      expect(res.isNotFound).toBe(true);
      expect(res.result?.exchangeOrderId).toBe('N/A');
      expect(adapter.emitMetric).toHaveBeenCalledWith(
        'closeOrder',
        expect.any(Number),
        'BTCUSD',
        'success',
      );
    });

    it('should return error on other broker errors', async () => {
      const error = new Error('Network error');
      adapter.closeOrder.mockRejectedValue(error);

      const res = await brokerCloseOrder(
        adapter,
        'order-1',
        'BTCUSD',
        'trace-1',
      );

      expect(res.error).toBe(error);
      expect(res.isNotFound).toBe(false);
      expect(adapter.emitMetric).toHaveBeenCalledWith(
        'closeOrder',
        expect.any(Number),
        'BTCUSD',
        'error',
      );
    });
  });

  describe('finalizeOrderClosure', () => {
    let ctx: any;
    let params: any;

    beforeEach(() => {
      ctx = {
        payload: { orderId: 'main-order-1' },
        container: {
          orderRepository: {
            updateOne: jest.fn().mockResolvedValue(true),
          },
        },
        session: 'mock-session',
        logger: { info: jest.fn() },
        addOrderHistory: jest.fn(),
      };

      params = {
        orderId: 'main-order-1',
        closePayload: { traceToken: 'trace-1' },
        result: {
          exchangeOrderId: 'ex-1',
          closedPrice: 110,
          closedLots: 1,
          closedAt: Date.now(),
        },
        isNotFound: false,
        pnlValue: 10,
      };
    });

    it('should update main order correctly', async () => {
      await finalizeOrderClosure(ctx, params);

      expect(ctx.addOrderHistory).toHaveBeenCalledWith(
        OrderHistoryStatus.CLOSED,
        expect.objectContaining({
          exchangeOrderId: 'ex-1',
          pnl: 10,
        }),
      );
      expect(ctx.container.orderRepository.updateOne).toHaveBeenCalledWith(
        { orderId: 'main-order-1' },
        {
          $inc: { 'pnl.pnl': 10 },
          $set: expect.objectContaining({
            status: OrderStatus.CLOSED,
          }),
        },
        'mock-session',
      );
    });

    it('should update secondary order correctly', async () => {
      params.orderId = 'secondary-order-1';
      await finalizeOrderClosure(ctx, params);

      expect(ctx.addOrderHistory).not.toHaveBeenCalled();
      expect(ctx.container.orderRepository.updateOne).toHaveBeenCalledWith(
        { orderId: 'secondary-order-1' },
        expect.objectContaining({
          $push: {
            history: expect.objectContaining({
              status: OrderHistoryStatus.CLOSED,
            }),
          },
          $set: expect.objectContaining({ status: OrderStatus.CLOSED }),
        }),
        'mock-session',
      );
    });

    it('should handle isNotFound for main order', async () => {
      params.isNotFound = true;
      params.result.exchangeOrderId = 'N/A';

      await finalizeOrderClosure(ctx, params);

      expect(ctx.addOrderHistory).toHaveBeenCalledWith(
        OrderHistoryStatus.CLOSED,
        expect.objectContaining({
          reason: 'Order already closed (not found on exchange)',
        }),
      );
    });
  });

  describe('publishCloseResult', () => {
    it('should publish result to stream', async () => {
      const ctx: any = {
        container: {
          streamPublisher: { publish: jest.fn() },
        },
      };
      const result = {
        exchangeOrderId: 'ex-1',
        closedPrice: 110,
        closedLots: 1,
        closedAt: 12345,
      };
      const payload = {
        accountId: 'acc-1',
        traceToken: 'trace-1',
        messageId: 'msg-1',
        channelId: 'chan-1',
      };
      ctx.state = {
        order: { side: 'LONG', lotSize: 1, lotSizeRemaining: 0 },
      };

      await publishCloseResult(ctx, 'order-1', result as any, payload as any);

      expect(ctx.container.streamPublisher.publish).toHaveBeenCalledWith(
        StreamTopic.ORDER_EXECUTION_RESULTS,
        {
          version: '1.0.0',
          type: MessageType.EXECUTE_ORDER_RESULT,
          payload: expect.objectContaining({
            orderId: 'order-1',
            success: true,
          }),
        },
      );
    });
  });
});
