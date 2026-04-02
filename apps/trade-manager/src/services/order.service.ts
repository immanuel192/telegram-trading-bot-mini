/**
 * Purpose: Service for managing Order entities
 * Exports: OrderService class
 * Core Flow: Accept order data → Handle linkedOrders → Create Order → Save to DB
 *
 * This service encapsulates order management logic including:
 * - Handling linkedOrders relationships (DCA, related orders)
 * - Creating Order entities with proper initial state
 * - Adding INTEND history entry
 * - Using $push for atomic linkedOrders updates
 */

import { ObjectId, ClientSession } from 'mongodb';
import {
  Order,
  OrderStatus,
  OrderHistoryStatus,
  OrderRepository,
  TelegramMessageRepository,
} from '@dal';
import {
  LoggerInstance,
  CommandEnum,
  ServiceName,
} from '@telegram-trading-bot-mini/shared/utils';

/**
 * Input for creating an order
 * Contains all necessary data from the transformation step
 */
export interface CreateOrderInput {
  orderId: string;
  accountId: string;
  messageId: number;
  channelId: string;
  symbol: string;
  side: Order['side'];
  executionType: Order['executionType'];
  tradeType: Order['tradeType'];
  lotSize: number;
  isLinkedWithPrevious?: boolean;
  entry?: number;
  traceToken: string;
  /** Trading command that triggered this order creation (LONG, SHORT, etc.) */
  command: CommandEnum;
}

/**
 * Service for managing Order entities
 */
export class OrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly telegramMessageRepository: TelegramMessageRepository,
    private readonly logger?: LoggerInstance,
  ) {}

  /**
   * Create an Order entity
   * Handles linkedOrders logic and saves to database
   *
   * @param input - Order creation data
   * @param session - Optional MongoDB session for transaction support
   * @returns Created order with orderId and linkedOrderIds
   */
  async createOrder(
    input: CreateOrderInput,
    session?: ClientSession,
  ): Promise<{ orderId: string; linkedOrderIds?: string[] }> {
    const {
      orderId,
      accountId,
      messageId,
      channelId,
      symbol,
      side,
      executionType,
      tradeType,
      lotSize,
      isLinkedWithPrevious,
      entry,
      traceToken,
      command,
    } = input;

    // Handle linkedOrders logic
    let linkedOrderIds: string[] | undefined;
    if (isLinkedWithPrevious) {
      const orphanOrder = await this.findOrphanOrder(
        accountId,
        channelId,
        session,
      );
      if (orphanOrder) {
        // Create circular relationship
        linkedOrderIds = [orphanOrder.orderId];

        // Update orphan order to link back to this order using $push
        await this.orderRepository.updateOne(
          { _id: orphanOrder._id },
          {
            $push: { linkedOrders: orderId },
          } as any, // UpdateFilter type doesn't include MongoDB operators
          session,
        );

        this.logger?.debug(
          {
            orderId,
            linkedToOrphan: orphanOrder.orderId,
            traceToken,
          },
          'Linked order to previous orphan order',
        );
      }
    }

    // Create Order entity
    // Note: SL/TP fields (sl, tp) are NOT set here - they're set by executor-service
    // when the order is opened on the exchange
    const order: Order = {
      accountId,
      orderId,
      messageId,
      channelId,
      ...(linkedOrderIds && { linkedOrders: linkedOrderIds }), // Only set if defined
      status: OrderStatus.PENDING,
      side,
      executionType,
      tradeType,
      createdAt: new Date(),
      symbol,
      lotSize,
      ...(entry !== undefined && { entry: { entryPrice: entry } }),
      history: [
        {
          _id: new ObjectId(),
          status: OrderHistoryStatus.INTEND,
          service: 'trade-manager',
          ts: new Date(),
          traceToken,
          messageId,
          channelId,
          command,
        },
      ],
    };

    // Save to database
    await this.orderRepository.create(order, session);

    this.logger?.info(
      {
        orderId,
        side,
        symbol,
        linkedOrderIds,
        traceToken,
      },
      'Order created',
    );

    return { orderId, linkedOrderIds };
  }

  /**
   * Find the most recent orphan order (linkedOrders empty/undefined)
   * for the given account and channel
   */
  private async findOrphanOrder(
    accountId: string,
    channelId: string,
    session?: ClientSession,
  ): Promise<Order | null> {
    // Find orders with empty or undefined linkedOrders
    const orphans = await this.orderRepository.findAll(
      {
        accountId,
        channelId,
        status: {
          $in: [OrderStatus.PENDING, OrderStatus.OPEN],
        },
        $or: [
          { linkedOrders: { $exists: false } },
          { linkedOrders: { $size: 0 } },
        ],
      },
      session,
    );

    if (orphans.length === 0) {
      return null;
    }

    // Return most recent orphan (by createdAt)
    return orphans.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    )[0];
  }

  /**
   * Find all ACTIVE orders related to a message context
   *
   * This retrieves ACTIVE orders (status = PENDING or OPEN) that are linked to:
   * - The current message
   * - Previous message (prevMessage)
   * - Quoted message (quotedMessage)
   * - First message in quote chain (quotedFirstMessage via replyToTopId)
   *
   * Priority: message > quotedMessage > quotedFirstMessage > prevMessage
   *
   * LinkedOrders are always fetched and deduplicated (circular relationships).
   * The includeHistory parameter controls whether to fetch the order.history field
   * from MongoDB using projection for optimal performance.
   *
   * @param messageId - Current message ID
   * @param channelId - Channel ID
   * @param includeHistory - Whether to include order history field (default: false)
   * @returns Array of ACTIVE orders sorted by priority
   */
  async findActiveOrdersByMessageContext(
    messageId: number,
    channelId: string,
    includeHistory: boolean = false,
  ): Promise<Order[]> {
    // Step 1: Retrieve the telegram message
    const telegramMessage =
      await this.telegramMessageRepository.findByChannelAndMessageId(
        channelId,
        messageId,
      );

    if (!telegramMessage) {
      this.logger?.debug(
        { messageId, channelId },
        'No telegram message found for context',
      );
      return [];
    }

    // Step 2: Collect all related message IDs with priority
    const messageIdMap = new Map<number, number>(); // messageId -> priority

    // Priority 1: Current message
    messageIdMap.set(telegramMessage.messageId, 1);

    // Priority 2: Quoted message
    if (telegramMessage.quotedMessage?.id) {
      messageIdMap.set(telegramMessage.quotedMessage.id, 2);
    }

    // Priority 3: First message in quote chain (quotedFirstMessage)
    if (telegramMessage.quotedMessage?.replyToTopId) {
      messageIdMap.set(telegramMessage.quotedMessage.replyToTopId, 3);
    }

    // Priority 4: Previous message
    if (telegramMessage.prevMessage?.id) {
      messageIdMap.set(telegramMessage.prevMessage.id, 4);
    }

    const relatedMessageIds = Array.from(messageIdMap.keys());

    this.logger?.debug(
      { messageId, channelId, relatedMessageIds },
      'Collected related message IDs for order lookup',
    );

    // Step 3: Batch query ACTIVE orders by messageId and channelId to find candidates
    // Filter for PENDING or OPEN status only
    // Use projection to exclude history field if not needed
    const projection = includeHistory ? undefined : { history: 0 };

    const candidateOrders = await this.orderRepository.findAll(
      {
        channelId,
        messageId: { $in: relatedMessageIds },
        status: { $in: [OrderStatus.PENDING, OrderStatus.OPEN] },
      },
      undefined, // session
      projection,
    );

    if (candidateOrders.length === 0) {
      this.logger?.debug(
        { messageId, channelId, relatedMessageIds },
        'No active orders found for any message in context',
      );
      return [];
    }

    // Step 4: Sort candidates by priority to find the "first" matched order
    candidateOrders.sort((a, b) => {
      const priorityA = messageIdMap.get(a.messageId) ?? 999;
      const priorityB = messageIdMap.get(b.messageId) ?? 999;
      return priorityA - priorityB;
    });

    // Take the highest priority order as the primary record
    const primaryOrder = candidateOrders[0];
    const finalOrders = [primaryOrder];

    this.logger?.debug(
      {
        messageId: primaryOrder.messageId,
        orderId: primaryOrder.orderId,
        priority: messageIdMap.get(primaryOrder.messageId),
        status: primaryOrder.status,
      },
      'Selected primary active order from message context',
    );

    // Step 5: Collect linked order IDs ONLY from this primary record
    const linkedOrderIds = primaryOrder.linkedOrders || [];

    // Step 6: Batch query those specific linked orders (also filter for active status)
    // Use the same projection to exclude history if not needed
    if (linkedOrderIds.length > 0) {
      const linkedOrders = await this.orderRepository.findAll(
        {
          orderId: { $in: linkedOrderIds },
          status: { $in: [OrderStatus.PENDING, OrderStatus.OPEN] },
        },
        undefined, // session
        projection,
      );

      this.logger?.debug(
        {
          primaryOrderId: primaryOrder.orderId,
          linkedCount: linkedOrders.length,
        },
        'Retrieved active linked orders for primary record',
      );

      // Merge linked orders, ensuring we don't duplicate the primary order if it's in its own linked list
      linkedOrders.forEach((linkedOrder) => {
        if (linkedOrder.orderId !== primaryOrder.orderId) {
          finalOrders.push(linkedOrder);
        }
      });
    }

    this.logger?.info(
      {
        messageId,
        channelId,
        primaryOrderId: primaryOrder.orderId,
        totalOrders: finalOrders.length,
        includeHistory,
      },
      'Retrieved focused active order chain by message context',
    );

    return finalOrders;
  }

  /**
   * Find a single order by messageId and channelId
   *
   * This is a simple query for edit detection - it checks if ANY active order
   * exists for a specific message, without the complex linkedOrders logic.
   *
   * Use this instead of findActiveOrdersByMessageContext when you only need
   * to detect if an order exists (e.g., for message edit detection).
   *
   * @param messageId - Telegram message ID
   * @param channelId - Telegram channel ID
   * @param session - Optional MongoDB session for transaction support
   * @returns The first matching active order, or null if none found
   */
  async findOrderByMessageId(
    messageId: number,
    channelId: string,
    accountId: string,
    session?: ClientSession,
  ): Promise<Order | null> {
    return this.orderRepository.findOne(
      {
        messageId,
        channelId,
        accountId,
        status: { $in: [OrderStatus.PENDING, OrderStatus.OPEN] },
      },
      session,
    );
  }

  /**
   * ========================================
   * MESSAGE EDIT HANDLING METHODS
   * ========================================
   * These methods handle corrective actions when a Telegram message
   * representing a trading signal is edited after an order was placed.
   */

  /**
   * Add audit trail entry for message edit
   * Records the edit action in order history for compliance and debugging
   */
  async addEditAuditTrail(
    orderId: string,
    action: string,
    reason: string,
    session?: ClientSession,
  ): Promise<void> {
    await this.orderRepository.updateOne(
      { orderId },
      {
        $push: {
          history: {
            _id: new ObjectId(),
            status: OrderHistoryStatus.MESSAGE_EDITED,
            service: ServiceName.TRADE_MANAGER,
            ts: new Date(),
            info: {
              reason,
              action,
            },
          },
        } as any, // Type assertion needed for $push operator
      },
      session,
    );

    this.logger.info(
      {
        orderId,
        action,
        reason,
      },
      'Edit audit trail added to order',
    );
  }

  /**
   * Close OPEN order and mark for recreation
   * Used when message edit requires closing existing position
   *
   * Note: This only marks the order for closure. The actual close
   * will be handled by executor-service via CLOSE_ORDER command.
   * The new order will be created through normal flow (re-interpretation).
   */
  async closeAndRecreate(
    order: Order,
    reason: string,
    session?: ClientSession,
  ): Promise<void> {
    this.logger.info(
      {
        orderId: order.orderId,
        messageId: order.messageId,
        channelId: order.channelId,
        reason,
      },
      'Closing order due to message edit - will recreate via re-interpretation',
    );

    // Add audit trail
    await this.addEditAuditTrail(
      order.orderId,
      'CLOSE_AND_RECREATE',
      reason,
      session,
    );

    // TODO: Phase 2 - Publish CLOSE_ORDER execution request
    // This will be implemented when wiring up the action execution
    // For now, just log the intent
    this.logger.warn(
      {
        orderId: order.orderId,
        reason,
      },
      'CLOSE_AND_RECREATE action logged - execution not yet implemented',
    );
  }

  /**
   * Cancel PENDING order and mark for recreation
   * Used when message edit requires canceling pending limit order
   *
   * Note: This only marks the order for cancellation. The actual cancel
   * will be handled by executor-service via CANCEL_ORDER command.
   * The new order will be created through normal flow (re-interpretation).
   */
  async cancelAndRecreate(
    order: Order,
    reason: string,
    session?: ClientSession,
  ): Promise<void> {
    this.logger.info(
      {
        orderId: order.orderId,
        messageId: order.messageId,
        channelId: order.channelId,
        reason,
      },
      'Canceling pending order due to message edit - will recreate via re-interpretation',
    );

    // Add audit trail
    await this.addEditAuditTrail(
      order.orderId,
      'CANCEL_AND_RECREATE',
      reason,
      session,
    );

    // TODO: Phase 2 - Publish CANCEL_ORDER execution request
    // This will be implemented when wiring up the action execution
    // For now, just log the intent
    this.logger.warn(
      {
        orderId: order.orderId,
        reason,
      },
      'CANCEL_AND_RECREATE action logged - execution not yet implemented',
    );
  }

  /**
   * Update TP/SL on existing OPEN order
   * Used when only TP/SL values changed (same side, symbol, entry)
   *
   * Note: This only marks the order for TP/SL update. The actual update
   * will be handled by executor-service via SET_TP_SL command.
   */
  async updateTpSl(
    order: Order,
    newTp: Array<{ price?: number; pips?: number }>,
    newSl: { price?: number; pips?: number } | undefined,
    session?: ClientSession,
  ): Promise<void> {
    this.logger.info(
      {
        orderId: order.orderId,
        messageId: order.messageId,
        channelId: order.channelId,
        oldTp: order.tp,
        newTp,
        oldSl: order.sl,
        newSl,
      },
      'Updating TP/SL due to message edit',
    );

    // Add audit trail
    await this.addEditAuditTrail(
      order.orderId,
      'UPDATE_TP_SL',
      'TP/SL values changed in edited message',
      session,
    );

    // TODO: Phase 2 - Publish SET_TP_SL execution request
    // This will be implemented when wiring up the action execution
    // For now, just log the intent
    this.logger.warn(
      {
        orderId: order.orderId,
        newTp,
        newSl,
      },
      'UPDATE_TP_SL action logged - execution not yet implemented',
    );
  }
}
