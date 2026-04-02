/**
 * Close Bad Position command transformer
 * Transforms CLOSE_BAD_POSITION commands to close all positions except the best one
 */
import {
  ExecuteOrderRequestPayload,
  LoggerInstance,
  PriceCacheService,
  PriceData,
} from '@telegram-trading-bot-mini/shared/utils';
import { Order, OrderSide, OrderStatus } from '@dal';
import * as Sentry from '@sentry/node';
import { BaseTransformer } from './base.transformer';
import { TransformContext, TranslateMessageResultCommand } from './types';
import { Redis } from 'ioredis';
import { OrderService } from '../order.service';
import { config } from '../../config';

interface OrderProfit {
  order: Order;
  profit?: number;
}

/**
 * Transform CLOSE_BAD_POSITION command
 * Fetches all OPEN orders by messageId and channelId, then closes all except the best position.
 * Best position is determined by:
 * 1. REAL-TIME PROFIT: If live price is available and fresh.
 *    - LONG: (Bid - Entry) * LotSize
 *    - SHORT: (Entry - Ask) * LotSize
 * 2. ENTRY PRICE (Fallback):
 *    - LONG: Lower entry = Better
 *    - SHORT: Higher entry = Better
 */
export class CloseBadPositionCommandTransformer extends BaseTransformer {
  constructor(
    orderService: OrderService,
    private readonly redis: Redis,
    logger?: LoggerInstance,
  ) {
    super(orderService, logger);
  }

  async transform(
    command: TranslateMessageResultCommand,
    context: TransformContext,
  ): Promise<ExecuteOrderRequestPayload[] | null> {
    const extraction = command.extraction;
    if (!extraction?.symbol || extraction.symbol.trim() === '') {
      this.logValidationFailure(
        extraction ? 'Missing or empty symbol' : 'Command missing extraction',
        command.command,
        context,
      );
      return null;
    }

    const { messageId, channelId, traceToken, accountId } = context;

    this.logger?.debug(
      {
        command: command.command,
        symbol: extraction.symbol,
        messageId,
        channelId,
      },
      'Processing CLOSE_BAD_POSITION command - fetching open orders',
    );

    // 1. Fetch active orders
    const orders = await this.orderService.findActiveOrdersByMessageContext(
      messageId,
      channelId,
      false,
    );

    // 2. Filter for OPEN orders matching requested side
    const openOrders = orders.filter(
      (order) => order.status === OrderStatus.OPEN,
    );
    if (openOrders.length === 0) {
      this.logger?.warn(
        {
          command: command.command,
          symbol: extraction.symbol,
          messageId,
          channelId,
        },
        'No open orders found for CLOSE_BAD_POSITION',
      );
      return null;
    }

    const filteredOrders = this.filterOrdersBySide(
      openOrders,
      extraction.side,
      command.command,
      context,
    );

    if (filteredOrders.length === 0) {
      this.handleNoMatchingOrders(command, extraction, openOrders, context);
      return null;
    }

    if (filteredOrders.length === 1) {
      this.logger?.info(
        {
          command: command.command,
          symbol: extraction.symbol,
          orderId: filteredOrders[0].orderId,
        },
        'Only one open order found, nothing to close',
      );
      return null;
    }

    // 3. Sort orders to find the best one
    const sortedOrders = await this.sortOrders(
      filteredOrders,
      extraction.symbol,
      context,
    );

    // 4. Keep the best position, close the rest
    const bestOrder = sortedOrders[0];
    const badOrders = sortedOrders.slice(1);

    this.logger?.info(
      {
        command: command.command,
        symbol: extraction.symbol,
        bestOrderId: bestOrder.orderId,
        badOrderCount: badOrders.length,
        badOrderIds: badOrders.map((o) => o.orderId),
      },
      'Closing bad positions, keeping best position',
    );

    // 5. Build payloads
    return badOrders.map((order) => ({
      orderId: order.orderId,
      messageId,
      channelId,
      accountId,
      traceToken,
      symbol: order.symbol,
      command: command.command,
      timestamp: Date.now(),
    }));
  }

  /**
   * Sort orders to determine the "best" position.
   * Attempts profit-based sorting if live price is available, otherwise falls back to entry price.
   */
  private async sortOrders(
    orders: Order[],
    symbol: string,
    context: TransformContext,
  ): Promise<Order[]> {
    const livePrice = await this.fetchLivePrice(symbol, context);

    if (livePrice) {
      this.logger?.debug(
        { symbol, bid: livePrice.bid, ask: livePrice.ask },
        'Sorting orders by live profit',
      );
      return this.sortByProfit(orders, livePrice);
    }

    this.logger?.debug({ symbol }, 'Falling back to entry price sorting');
    return this.sortByEntryPrice(orders);
  }

  /**
   * Sort by real-time profit (highest profit first)
   */
  private sortByProfit(orders: Order[], price: PriceData): Order[] {
    const profits: OrderProfit[] = orders.map((order) => ({
      order,
      profit: this.calculateProfit(order, price),
    }));

    return profits
      .sort((a, b) => (b.profit || 0) - (a.profit || 0))
      .map((p) => p.order);
  }

  /**
   * Sort by entry price (best potential first)
   */
  private sortByEntryPrice(orders: Order[]): Order[] {
    return [...orders].sort((a, b) => {
      const entryA = a.entry?.actualEntryPrice || a.entry?.entryPrice || 0;
      const entryB = b.entry?.actualEntryPrice || b.entry?.entryPrice || 0;
      const side = a.side;

      return side === OrderSide.LONG ? entryA - entryB : entryB - entryA;
    });
  }

  /**
   * Calculate signed profit for an order based on current live price
   */
  private calculateProfit(order: Order, price: PriceData): number {
    const entry = order.entry?.actualEntryPrice || order.entry?.entryPrice || 0;
    const lotSize = order.lotSize || 0;

    if (order.side === OrderSide.LONG) {
      // For LONG: Profit = (Bid - Entry) * LotSize
      return (price.bid - entry) * lotSize;
    } else {
      // For SHORT: Profit = (Entry - Ask) * LotSize
      return (entry - price.ask) * lotSize;
    }
  }

  /**
   * Fetch live price from cache if available and fresh
   */
  private async fetchLivePrice(
    symbol: string,
    context: TransformContext,
  ): Promise<PriceData | null> {
    if (!this.redis || !context.exchangeCode) {
      return null;
    }

    try {
      const priceCache = new PriceCacheService(
        context.exchangeCode,
        this.redis,
      );
      const cachedData = await priceCache.getPrice(symbol);

      if (cachedData) {
        const cacheAgeSeconds = (Date.now() - cachedData.ts) / 1000;
        const ttl = config('PRICE_CACHE_TTL_SECONDS');

        if (cacheAgeSeconds <= ttl) {
          return cachedData;
        }

        this.logger?.warn(
          { symbol, age: Math.round(cacheAgeSeconds), ttl },
          'Price cache stale for CLOSE_BAD_POSITION',
        );
      }
    } catch (error) {
      this.logger?.warn({ symbol, error }, 'Failed to fetch price cache');
    }

    return null;
  }

  /**
   * Handle case where no orders match the side requested in the command
   */
  private handleNoMatchingOrders(
    command: TranslateMessageResultCommand,
    extraction: any,
    openOrders: Order[],
    context: TransformContext,
  ): void {
    const { messageId, channelId, traceToken } = context;
    this.logger?.error(
      {
        command: command.command,
        symbol: extraction.symbol,
        requestedSide: extraction.side,
        totalOpenOrders: openOrders.length,
        messageId,
        channelId,
        traceToken,
      },
      'No open orders found matching requested side for CLOSE_BAD_POSITION',
    );

    Sentry.captureException(
      new Error('CLOSE_BAD_POSITION: No open orders matching requested side'),
      {
        tags: { command: 'CLOSE_BAD_POSITION', service: 'trade-manager' },
        extra: {
          symbol: extraction.symbol,
          requestedSide: extraction.side,
          totalOpenOrders: openOrders.length,
          messageId,
          channelId,
          traceToken,
        },
      },
    );
  }
}
