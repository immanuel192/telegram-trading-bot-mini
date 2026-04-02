import {
  StreamMessage,
  MessageType,
  LoggerInstance,
  IErrorCapture,
  RedisStreamPublisher,
  StreamTopic,
} from '@telegram-trading-bot-mini/shared/utils';
import { OrderSide } from '@dal';
import { OrderCacheService } from '../../services/order-cache.service';
import { AccountService } from '../../services/account.service';
import {
  generateTpTierMessageId,
  transformToClosePartialPayload,
} from '../../services/transformers/close-partial-command.transformer';

/**
 * Purpose: Handle LIVE_PRICE_UPDATE events from the stream.
 *
 * Logic:
 * 1. Log the received price update for monitoring.
 * 2. Detect price crossing Take Profit tiers for active orders.
 * 3. Trigger automated partial closures when a TP tier is hit.
 *
 * Inputs: LIVE_PRICE_UPDATE message containing current and previous prices.
 * Outputs: EXECUTE_ORDER_REQUEST message for CLOSE_PARTIAL closures.
 */
export class LivePriceUpdateHandler {
  constructor(
    private readonly logger: LoggerInstance,
    private readonly errorCapture: IErrorCapture,
    private readonly orderCacheService: OrderCacheService,
    private readonly accountService: AccountService,
    private readonly streamPublisher: RedisStreamPublisher,
  ) {}

  /**
   * Handle incoming LIVE_PRICE_UPDATE message
   */
  async handle(
    message: StreamMessage<MessageType.LIVE_PRICE_UPDATE>,
    streamId: string,
  ): Promise<void> {
    const { payload } = message;
    const { symbol, currentPrice, previousPrice } = payload;

    // Get all orders for this symbol from cache
    const orders = this.orderCacheService.getOrdersBySymbol(symbol);
    if (orders.length === 0) return;

    for (const order of orders) {
      // Check if monitoring is enabled for this order's account
      if (!order.isTpMonitoringAvailable) continue;

      // Extract relevant prices based on order side
      // LONG (BUY) is closed by SELLING (BID)
      // SHORT (SELL) is closed by BUYING (ASK)
      const isLong = order.side === OrderSide.LONG;
      const pPrev = isLong ? previousPrice.bid : previousPrice.ask;
      const pCurr = isLong ? currentPrice.bid : currentPrice.ask;

      // Check each Take Profit tier
      for (let i = 0; i < order.takeProfits.length; i++) {
        const tp = order.takeProfits[i];

        // Skip already used tiers
        if (tp.isUsed) continue;

        if (
          this.detectCrossing(order.side as OrderSide, pPrev, pCurr, tp.price)
        ) {
          this.logger.info(
            {
              orderId: order.orderId,
              symbol,
              side: order.side,
              tpPrice: tp.price,
              tierIndex: i + 1,
              prevPrice: pPrev,
              currPrice: pCurr,
            },
            'Take Profit crossing detected. Triggering partial closure.',
          );

          await this.triggerPartialClose(order, i + 1);
        } else {
          // Optimization: if the first available tier is not crossed,
          // assume further tiers are also not crossed.
          // LONG: price is moving up, tiers are in ascending order
          if (isLong && pCurr < tp.price) break;
          // SHORT: price is moving down, tiers are in descending order
          if (!isLong && pCurr > tp.price) break;
        }
      }
    }
  }

  /**
   * Initiate an automated partial close for a specific TP tier
   */
  private async triggerPartialClose(
    order: any,
    tierIndex: number,
  ): Promise<void> {
    try {
      // Logic: originalMessageId * 100 + tierIndex
      const tierMessageId = generateTpTierMessageId(order.messageId, tierIndex);

      // Calculate lot size: 10% of total (as per spec 4.3 scenario)
      // Note: In real app, this should come from account/symbol config (Task 2.1)
      const closeAmount = parseFloat((order.lotSize * 0.1).toFixed(5));

      const payload = transformToClosePartialPayload({
        orderId: order.orderId,
        messageId: tierMessageId,
        channelId: order.channelId,
        accountId: order.accountId,
        traceToken: `tp-auto-${order.orderId}-${tierIndex}`,
        symbol: order.symbol,
        lotSize: closeAmount,
        timestamp: Date.now(),
      });

      await this.streamPublisher.publish(StreamTopic.ORDER_EXECUTION_REQUESTS, {
        version: '1.0',
        type: MessageType.EXECUTE_ORDER_REQUEST,
        payload,
      });

      this.logger.info(
        { orderId: order.orderId, tierIndex, lotSize: closeAmount },
        'Automated partial close command published',
      );
    } catch (error) {
      this.logger.error(
        { error, orderId: order.orderId, tierIndex },
        'Failed to trigger automated partial close',
      );
      this.errorCapture.captureException(error as Error, {
        orderId: order.orderId,
        tierIndex,
      });
    }
  }

  /**
   * Crossing detection algorithm (Task 4.1)
   * LONG: Cross Up (prev < tierPrice, curr >= tierPrice)
   * SHORT: Cross Down (prev > tierPrice, curr <= tierPrice)
   */
  private detectCrossing(
    side: OrderSide,
    prevPrice: number,
    currPrice: number,
    tierPrice: number,
  ): boolean {
    if (side === OrderSide.LONG) {
      return prevPrice < tierPrice && currPrice >= tierPrice;
    } else {
      return prevPrice > tierPrice && currPrice <= tierPrice;
    }
  }
}
