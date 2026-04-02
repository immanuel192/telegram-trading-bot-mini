import {
  MessageType,
  StreamMessage,
  StreamTopic,
} from '@telegram-trading-bot-mini/shared/utils';
import { OrderSide } from '@dal';
import { LivePriceUpdateHandler } from '../../../../src/events/consumers/live-price-update-handler';

describe('LivePriceUpdateHandler', () => {
  let handler: LivePriceUpdateHandler;
  let logger: any;
  let errorCapture: any;
  let orderCacheService: any;
  let accountService: any;
  let streamPublisher: any;

  beforeEach(() => {
    logger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    errorCapture = {
      captureException: jest.fn(),
    };
    orderCacheService = {
      getOrdersBySymbol: jest.fn(),
    };
    accountService = {
      getAccountByIdWithCache: jest.fn(),
    };
    streamPublisher = {
      publish: jest.fn().mockResolvedValue('msg-123'),
    };
    handler = new LivePriceUpdateHandler(
      logger,
      errorCapture,
      orderCacheService,
      accountService,
      streamPublisher,
    );
  });

  describe('Handle LIVE_PRICE_UPDATE', () => {
    const symbol = 'XAUUSD';
    const baseMessage: StreamMessage<MessageType.LIVE_PRICE_UPDATE> = {
      version: '1.0',
      type: MessageType.LIVE_PRICE_UPDATE,
      payload: {
        accountId: 'acc-1',
        channelId: 'chan-1',
        symbol,
        currentPrice: { bid: 2650.5, ask: 2650.7 },
        previousPrice: { bid: 2650.4, ask: 2650.6 },
        timestamp: Date.now(),
      },
    };

    it('should detect LONG TP hitting and trigger CLOSE_PARTIAL', async () => {
      const order = {
        orderId: 'order-1',
        accountId: 'acc-1',
        messageId: 100,
        channelId: 'chan-1',
        side: OrderSide.LONG,
        symbol,
        lotSize: 0.1,
        isTpMonitoringAvailable: true,
        takeProfits: [{ price: 2650.45 }], // Crosses from 2650.4 to 2650.5
      };
      orderCacheService.getOrdersBySymbol.mockReturnValue([order]);

      await handler.handle(baseMessage, 'stream-1');

      // 1. Verify publication
      expect(streamPublisher.publish).toHaveBeenCalledWith(
        StreamTopic.ORDER_EXECUTION_REQUESTS,
        expect.objectContaining({
          type: MessageType.EXECUTE_ORDER_REQUEST,
          payload: expect.objectContaining({
            command: 'CLOSE_PARTIAL',
            orderId: 'order-1',
            messageId: 10001, // 100 * 100 + 1
            lotSize: 0.01, // 10% of 0.1
          }),
        }),
      );
    });

    it('should apply break optimization for LONG (price far below TP)', async () => {
      const order = {
        orderId: 'order-1',
        side: OrderSide.LONG,
        symbol,
        isTpMonitoringAvailable: true,
        takeProfits: [
          { price: 2700 }, // TP1 - Not hit (curr price is 2650.5)
          { price: 2800 }, // TP2 - Should not even be checked
        ],
      };
      orderCacheService.getOrdersBySymbol.mockReturnValue([order]);

      const spyDetect = jest.spyOn(handler as any, 'detectCrossing');

      await handler.handle(baseMessage, 'stream-1');

      // Should have checked TP1 and then broken
      expect(spyDetect).toHaveBeenCalledTimes(1);
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.anything(),
        'Take Profit crossing detected. Triggering partial closure.',
      );
    });

    it('should detect multiples crossings in one price tick (gap jump)', async () => {
      const gapMessage = {
        ...baseMessage,
        payload: {
          ...baseMessage.payload,
          currentPrice: { bid: 2750, ask: 2750 },
          previousPrice: { bid: 2600, ask: 2600 },
        },
      };
      const order = {
        orderId: 'order-gap',
        messageId: 100,
        side: OrderSide.LONG,
        symbol,
        lotSize: 0.1,
        isTpMonitoringAvailable: true,
        takeProfits: [
          { price: 2650 }, // Hit
          { price: 2700 }, // Hit
          { price: 2800 }, // Not hit -> Break
        ],
      };
      orderCacheService.getOrdersBySymbol.mockReturnValue([order]);

      await handler.handle(gapMessage as any, 'stream-1');

      // Should trigger both TP1 and TP2
      expect(streamPublisher.publish).toHaveBeenCalledTimes(2);
      expect(streamPublisher.publish).toHaveBeenCalledWith(
        StreamTopic.ORDER_EXECUTION_REQUESTS,
        expect.objectContaining({
          payload: expect.objectContaining({ messageId: 10001 }),
        }),
      );
      expect(streamPublisher.publish).toHaveBeenCalledWith(
        StreamTopic.ORDER_EXECUTION_REQUESTS,
        expect.objectContaining({
          payload: expect.objectContaining({ messageId: 10002 }),
        }),
      );
    });

    it('should skip already used tiers', async () => {
      const order = {
        orderId: 'order-1',
        side: OrderSide.LONG,
        symbol,
        isTpMonitoringAvailable: true,
        takeProfits: [{ price: 2650.45, isUsed: true }],
      };
      orderCacheService.getOrdersBySymbol.mockReturnValue([order]);

      await handler.handle(baseMessage, 'stream-1');

      expect(streamPublisher.publish).not.toHaveBeenCalled();
    });
  });
});
