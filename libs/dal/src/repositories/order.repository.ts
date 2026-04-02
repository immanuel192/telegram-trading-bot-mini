/**
 * Order Repository
 *
 * Purpose:
 * Provides data access methods for Order entities, extending BaseRepository
 * with domain-specific query methods for finding orders by various criteria.
 *
 * Exports:
 * - OrderRepository: Repository class for Order CRUD operations
 *
 * Core Flow:
 * 1. Extends BaseRepository for standard CRUD operations
 * 2. Adds domain-specific methods for order queries
 * 3. Leverages database indexes for efficient lookups
 */

import { BaseRepository } from './base.repository';
import { Order, OrderStatus } from '../models/order.model';
import { COLLECTIONS, getSchema } from '../infra/db';

/**
 * Repository for Order entity operations
 *
 * Provides CRUD operations and domain-specific query methods for orders.
 * Inherits standard operations from BaseRepository (create, findById, update, delete).
 */
export class OrderRepository extends BaseRepository<Order> {
  /**
   * Get the MongoDB collection for orders
   * @returns MongoDB collection typed as Order
   */
  protected get collection() {
    return getSchema<Order>(COLLECTIONS.ORDERS);
  }

  /**
   * Find an order by its unique orderId
   *
   * Uses the unique index on orderId for O(1) lookup performance.
   *
   * @param orderId - Unique order identifier (generated via short-unique-id)
   * @returns Promise resolving to Order if found, null otherwise
   */
  async findByOrderId(orderId: string): Promise<Order | null> {
    return this.findOne({ orderId });
  }

  /**
   * Find all orders for a specific account
   *
   * Uses the index on accountId for efficient lookup.
   * Useful for account-level order queries and reporting.
   *
   * @param accountId - Account identifier linked to executor-service
   * @returns Promise resolving to array of orders (empty if none found)
   */
  async findByAccountId(accountId: string): Promise<Order[]> {
    return this.findAll({ accountId });
  }

  /**
   * Find all orders with a specific status
   *
   * Useful for monitoring order lifecycle and finding orders in specific states.
   *
   * @param status - Order status to filter by
   * @returns Promise resolving to array of orders (empty if none found)
   */
  async findByStatus(status: OrderStatus): Promise<Order[]> {
    return this.findAll({ status });
  }

  /**
   * Find all open orders
   *
   * Convenience method for finding orders currently active on the exchange.
   *
   * @returns Promise resolving to array of open orders
   */
  async findOpenOrders(): Promise<Order[]> {
    return this.findByStatus(OrderStatus.OPEN);
  }

  /**
   * Find all pending orders
   *
   * Convenience method for finding orders not yet submitted to exchange.
   *
   * @returns Promise resolving to array of pending orders
   */
  async findPendingOrders(): Promise<Order[]> {
    return this.findByStatus(OrderStatus.PENDING);
  }

  /**
   * Find orders by account and status
   *
   * Useful for account-specific order monitoring.
   * Uses the accountId index for efficient filtering.
   *
   * @param accountId - Account identifier
   * @param status - Order status to filter by
   * @returns Promise resolving to array of orders (empty if none found)
   */
  async findByAccountAndStatus(
    accountId: string,
    status: OrderStatus
  ): Promise<Order[]> {
    return this.findAll({ accountId, status });
  }

  /**
   * Count OPEN orders for a specific account
   *
   * @param accountId - Account identifier
   * @returns Number of open orders
   */
  async countOpenOrdersByAccountId(
    accountId: string,
    session?: any
  ): Promise<number> {
    return this.count({ accountId, status: OrderStatus.OPEN }, session);
  }

  /**
   * Find open orders sorted by _id ASC with a limit
   * Used for batched status synchronization jobs
   *
   * @param limit - Maximum number of orders to return
   * @returns Promise resolving to array of open orders
   */
  async findOpenOrdersBatched(limit: number): Promise<Order[]> {
    return this.collection
      .find({ status: OrderStatus.OPEN })
      .sort({ _id: 1 })
      .limit(limit)
      .toArray() as Promise<Order[]>;
  }
}

export const orderRepository = new OrderRepository();
