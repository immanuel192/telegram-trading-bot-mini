/**
 * Order Cache Service
 *
 * Purpose:
 * High-performance in-memory storage for active orders (PENDING/OPEN) in Trade Manager.
 * Stores only a subset of order fields required for real-time synchronization.
 *
 * Exports:
 * - OrderCacheService: Singleton service for order caching
 */

import { LoggerInstance } from '@telegram-trading-bot-mini/shared/utils';
import { OrderStatus, OrderRepository } from '@dal';
import { AccountService } from './account.service';

/**
 * Optimized subset of Order fields for in-memory caching
 */
export interface CachedOrder {
  orderId: string;
  accountId: string;
  symbol: string;
  side: string;
  messageId: number;
  channelId: string;
  lotSize: number;
  lotSizeRemaining: number;
  takeProfits: { price: number; isUsed?: boolean }[];
  /** Whether this order should be monitored for TP hits */
  isTpMonitoringAvailable?: boolean;
  /** Timestamp of the last update to prevent stale DB refreshes from overwriting reactive events */
  lastUpdated: number;
}

export class OrderCacheService {
  /**
   * Primary lookup map: OrderId -> CachedOrder
   */
  private readonly orders = new Map<string, CachedOrder>();

  /**
   * Account index: AccountId -> Set of OrderIds
   */
  private readonly accountOrders = new Map<string, Set<string>>();

  /**
   * Symbol index: Symbol -> Set of OrderIds
   */
  private readonly symbolOrders = new Map<string, Set<string>>();

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly accountService: AccountService,
    private readonly logger: LoggerInstance,
  ) {}

  /**
   * Refresh the in-memory cache from the database
   * Loads all active (OPEN) orders
   */
  public async refreshCache(): Promise<void> {
    this.logger.info('Refreshing order cache from database...');
    const refreshStartTime = Date.now();

    try {
      // Fetch OPEN orders only. Use inclusion projection to get only needed fields.
      const activeOrders = await this.orderRepository.findAll(
        { status: OrderStatus.OPEN },
        undefined,
        {
          orderId: 1,
          accountId: 1,
          symbol: 1,
          side: 1,
          messageId: 1,
          channelId: 1,
          lotSize: 1,
          lotSizeRemaining: 1,
          'meta.takeProfitTiers': 1,
        },
      );

      const dbOrderIds = new Set(activeOrders.map((o) => o.orderId));

      // 1. Remove orders no longer active in DB
      // Note: We only remove if the cache entry wasn't just updated by a fresh event
      for (const orderId of this.orders.keys()) {
        const cached = this.orders.get(orderId);
        if (
          !dbOrderIds.has(orderId) &&
          cached &&
          cached.lastUpdated < refreshStartTime
        ) {
          this.internalRemove(orderId);
        }
      }

      // 2. Add or Update active orders
      for (const order of activeOrders) {
        await this.internalAdd(
          {
            orderId: order.orderId,
            accountId: order.accountId,
            symbol: order.symbol,
            side: order.side,
            messageId: order.messageId,
            channelId: order.channelId,
            lotSize: order.lotSize,
            lotSizeRemaining: order.lotSizeRemaining ?? order.lotSize,
            takeProfits:
              order.meta?.takeProfitTiers?.map((tp) => ({
                price: tp.price,
                isUsed: tp.isUsed,
              })) || [],
            lastUpdated: refreshStartTime,
          },
          true,
        ); // Allow refresh to overwrite
      }

      this.logger.info(
        {
          activeInDb: activeOrders.length,
          cacheSize: this.orders.size,
        },
        'Order cache refreshed successfully',
      );
    } catch (error) {
      this.logger.error({ error }, 'Failed to refresh order cache');
      throw error;
    }
  }

  /**
   * Add a new order to the cache.
   * Called primarily when OrderOpen result is received.
   */
  public async addOrder(
    orderId: string,
    accountId: string,
    symbol: string,
    side: string,
    messageId: number,
    channelId: string,
    lotSize: number,
    takeProfits: { price: number; isUsed?: boolean }[] = [],
  ): Promise<void> {
    await this.internalAdd({
      orderId,
      accountId,
      symbol,
      side,
      messageId,
      channelId,
      lotSize,
      lotSizeRemaining: lotSize,
      takeProfits,
      lastUpdated: Date.now(),
    });
  }

  /**
   * Update an existing cached order.
   * Support updating remaining lots and/or TP tiers.
   */
  public updateOrder(
    orderId: string,
    update: {
      lotSizeRemaining?: number;
      takeProfits?: { price: number; isUsed?: boolean }[];
    },
  ): void {
    const order = this.orders.get(orderId);
    if (!order) {
      this.logger.warn({ orderId }, 'Attempted to update non-cached order');
      return;
    }

    // Atomic update within the event tick
    if (update.lotSizeRemaining !== undefined) {
      order.lotSizeRemaining = update.lotSizeRemaining;
    }
    if (update.takeProfits !== undefined) {
      order.takeProfits = update.takeProfits;
    }
    order.lastUpdated = Date.now();
  }

  /**
   * Remove an order from the cache.
   */
  public removeOrder(orderId: string): void {
    this.internalRemove(orderId);
  }

  /**
   * Get all orders currently in the cache
   */
  public getOrders(): CachedOrder[] {
    return Array.from(this.orders.values());
  }

  /**
   * Find an order by its unique Order ID
   */
  public getOrder(orderId: string): CachedOrder | undefined {
    return this.orders.get(orderId);
  }

  /**
   * Get all order IDs associated with a specific account
   */
  public getAccountOrderIds(accountId: string): Set<string> {
    return this.accountOrders.get(accountId) || new Set<string>();
  }

  /**
   * Get all CachedOrder objects associated with a specific account
   */
  public getAccountOrders(accountId: string): CachedOrder[] {
    const ids = this.getAccountOrderIds(accountId);
    const result: CachedOrder[] = [];

    for (const id of ids) {
      const order = this.orders.get(id);
      if (order) {
        result.push(order);
      }
    }

    return result;
  }

  /**
   * Get all CachedOrder objects associated with a specific symbol
   */
  public getOrdersBySymbol(symbol: string): CachedOrder[] {
    const ids = this.symbolOrders.get(symbol) || new Set<string>();
    const result: CachedOrder[] = [];

    for (const id of ids) {
      const order = this.orders.get(id);
      if (order) {
        result.push(order);
      }
    }

    return result;
  }

  /**
   * Helper to add an order to both maps
   * @param isFromRefresh - If true, it won't overwrite if existing entry is newer
   */
  protected async internalAdd(
    order: CachedOrder,
    isFromRefresh = false,
  ): Promise<void> {
    const { orderId, accountId } = order;

    const existing = this.orders.get(orderId);
    if (
      existing &&
      isFromRefresh &&
      existing.lastUpdated >= order.lastUpdated
    ) {
      // Don't overwrite newer data from a reactive event with stale refresh data
      return;
    }

    // Populate monitoring eligibility flag from account config
    const account =
      await this.accountService.getAccountByIdWithCache(accountId);
    order.isTpMonitoringAvailable =
      account?.configs?.enableTpMonitoring ?? false;

    // Ensure cleanup of indices if it existed elsewhere (unique orderId)
    this.internalRemove(orderId);

    this.orders.set(orderId, order);

    if (!this.accountOrders.has(accountId)) {
      this.accountOrders.set(accountId, new Set<string>());
    }
    this.accountOrders.get(accountId)!.add(orderId);

    if (!this.symbolOrders.has(order.symbol)) {
      this.symbolOrders.set(order.symbol, new Set<string>());
    }
    this.symbolOrders.get(order.symbol)!.add(orderId);
  }

  /**
   * Helper to remove an order from both maps
   */
  protected internalRemove(orderId: string): void {
    const order = this.orders.get(orderId);
    if (!order) return;

    const { accountId } = order;

    this.orders.delete(orderId);

    const accountSet = this.accountOrders.get(accountId);
    if (accountSet) {
      accountSet.delete(orderId);
      if (accountSet.size === 0) {
        this.accountOrders.delete(accountId);
      }
    }

    const symbolSet = this.symbolOrders.get(order.symbol);
    if (symbolSet) {
      symbolSet.delete(orderId);
      if (symbolSet.size === 0) {
        this.symbolOrders.delete(order.symbol);
      }
    }
  }

  /**
   * Get current cache statistics
   */
  public getStats() {
    return {
      totalOrders: this.orders.size,
      totalAccounts: this.accountOrders.size,
      totalSymbols: this.symbolOrders.size,
    };
  }
}
