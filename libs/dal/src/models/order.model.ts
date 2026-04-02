/**
 * Order Model
 *
 * Purpose:
 * Tracks trading orders from intent to execution. Provides audit trail and
 * coordination between trade-manager and executor-service.
 *
 * Exports:
 * - OrderSide, OrderExecutionType, OrderStatus, OrderHistoryStatus
 * - Order, OrderHistory interfaces
 *
 * Order Lifecycle Flow:
 * =====================
 * 1. Trade-Manager: Creates Order (PENDING) → Publishes EXECUTE_ORDER_REQUEST
 * 2. Executor-Service: Executes → Updates Order (OPEN) → Publishes RESULT
 * 3. Trade-Manager: Updates final status (CLOSED/CANCELED)
 * 4. Cleanup Job: Marks orphaned PENDING orders as CANCELED
 *
 * LinkedOrders: Circular relationships for DCA/related orders
 * History: Full audit trail with service attribution and command tracking
 */

import { Document, ObjectId } from 'mongodb';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils/interfaces';

/**
 * Order side/direction type
 * Aligned with CommandSide concept - represents the trading action
 */
export enum OrderSide {
  /** Long position (buy) - aligned with CommandSide.BUY */
  LONG = 'LONG',
  /** Short position (sell) - aligned with CommandSide.SELL */
  SHORT = 'SHORT',
}

/**
 * Order execution method
 */
export enum OrderExecutionType {
  /** Execute at market price immediately */
  market = 'market',
  /** Execute at specified limit price */
  limit = 'limit',
}

/**
 * Trade type classification
 * Determines the market type for the order
 */
export enum TradeType {
  /** Spot trading - immediate exchange of assets */
  SPOT = 'SPOT',
  /** Futures trading - contracts for future delivery with leverage */
  FUTURE = 'FUTURE',
  /** Gold CFD (Contract for Difference) trading */
  GOLD_CFD = 'GOLD_CFD',
}

/**
 * Order lifecycle status
 * Tracks the current state of an order from creation to completion
 */
export enum OrderStatus {
  /** Order created but not yet submitted to exchange */
  PENDING = 'pending',
  /** Order is active on the exchange */
  OPEN = 'open',
  /** Order has been closed (TP hit, SL hit, or manually closed) */
  CLOSED = 'closed',
  /** Order was canceled before execution */
  CANCELED = 'canceled',
}

/**
 * Order history event status
 * Tracks specific events in the order lifecycle for audit trail
 *
 * Full Order History Lifecycle:
 * ==============================
 * 1. INTEND (trade-manager) - Order created, intent recorded
 * 2. OPEN (executor-service) - Order executed on exchange
 * 3. UPDATE (executor-service) - Order parameters modified (SL/TP moved)
 * 4. TAKE_PROFIT (executor-service) - TP target hit
 * 5. STOP_LOSS (executor-service) - SL triggered
 * 6. CLOSED (executor-service) - Order closed (generic closure)
 * 7. CANCELED (executor-service) - Order canceled, including cancel pending orders
 */
export enum OrderHistoryStatus {
  /**
   * Order intent created by trade-manager
   * First event in order lifecycle, marks order creation
   */
  INTEND = 'intend',
  /** Order opened on exchange */
  OPEN = OrderStatus.OPEN,
  /** Order closed (generic closure) */
  CLOSED = OrderStatus.CLOSED,
  /** Order canceled before execution */
  CANCELED = OrderStatus.CANCELED,
  /**
   * Take profit target hit
   * Note: Currently requires executor-service to inform us
   * Future: Auto-detect when TP is hit
   */
  TAKE_PROFIT = 'take_profit',
  /**
   * Stop loss triggered
   * Note: Currently requires executor-service to inform us
   * Future: Auto-detect when SL is hit
   */
  STOP_LOSS = 'stop_loss',
  /**
   * Order parameters updated (SL, TP, or move SL to entry)
   * Used when modifying existing order parameters
   */
  UPDATE = 'update',
  /**
   * Failure operation
   * Used when automated cleanup (e.g., pending order cleanup job) fails
   */
  ERROR = 'error',
  /**
   * Message edited
   * Used when the Telegram message representing this order was edited
   * Records corrective actions taken (close/cancel/update TP-SL)
   */
  MESSAGE_EDITED = 'message_edited',
  /**
   * Order skipped
   * Used when order is skipped due to broker operation hours
   */
  SKIPPED = 'skipped',
  /**
   * Informational event
   * Used for non-critical informational events in order processing
   * Examples: using cached live price, automatic adjustments, system decisions
   */
  INFO = 'info',
}

/**
 * Order entity representing a virtual trading order
 *
 * Virtual orders bridge the gap between interpreted trading commands
 * and executor-service requests, providing audit trail and coordination.
 */
export interface Order extends Document {
  /**
   * MongoDB document ID
   */
  _id?: ObjectId;

  /**
   * Account ID for order execution
   * Links to executor-service account that will execute this order
   */
  accountId: string;

  /**
   * Unique order identifier
   * Generated using short-unique-id package for human-readable IDs
   */
  orderId: string;

  /**
   * Original Telegram message ID that triggered this order
   * Links back to the message for traceability and debugging
   */
  messageId: number;

  /**
   * Original Telegram channel ID where the message was posted
   * Links back to the channel for traceability
   */
  channelId: string;

  /**
   * Array of related order IDs (optional)
   * Used to link orders that are related to each other
   * Examples:
   * - DCA orders linked to the main position
   * - Partial close orders linked to the original order
   * - Orders from the same trading signal
   * @default []
   */
  linkedOrders?: string[];

  /**
   * Order status tracking
   * Lifecycle: PENDING → OPEN → CLOSED/CANCELED
   * @default OrderStatus.PENDING
   */
  status: OrderStatus;

  /**
   * Order side/direction (LONG or SHORT)
   * Indicates whether this is a buy or sell order
   * Aligned with CommandSide from command extraction
   */
  side: OrderSide;

  /**
   * Order execution method (market or limit)
   * Determines how the order should be executed
   */
  executionType: OrderExecutionType;

  /**
   * Trade type classification (SPOT, FUTURE, GOLD_CFD)
   * Determines market type and affects leverage availability
   */
  tradeType: TradeType;

  /**
   * Order creation timestamp
   * Set when order is first created in the system
   */
  createdAt: Date;

  /**
   * Order closure timestamp
   * Set when order reaches CLOSED or CANCELED status
   */
  closedAt?: Date;

  /**
   * Trading symbol from interpret-service
   * Original symbol as interpreted from the Telegram message
   */
  symbol: string;

  /**
   * Leverage multiplier for FUTURE trades
   * Only applicable when tradeType is FUTURE
   * @example 50 for 50x leverage
   */
  leverage?: number;

  /**
   * Resolved symbol from executor-service
   * Actual symbol used by the broker, may differ from interpreted symbol
   * Useful for tracking symbol resolution and debugging mapping issues
   * @example symbol: "BTC" → actualSymbol: "BTCUSD"
   */
  actualSymbol?: string;

  /**
   * Initial position size in lots/contracts
   * Amount to trade, calculation depends on account settings and risk management
   */
  lotSize: number;

  /**
   * Current remaining position size in lots/contracts
   * Tracked for partial closures
   */
  lotSizeRemaining?: number;

  /**
   * Entry price information (optional)
   * Tracks both intended and actual entry prices
   * Populated by executor-service after order execution
   */
  entry?: {
    /**
     * Intended entry price from signal
     * - For market orders: expected entry price from signal
     * - For limit orders: limit price to execute at
     */
    entryPrice: number;

    /**
     * Actual entry price from exchange
     * The real price at which the order was filled
     * May differ from entryPrice due to slippage or market conditions
     */
    actualEntryPrice?: number;

    /**
     * Exchange internal order ID
     * The order ID returned by the exchange after successful order placement
     * Used for tracking and referencing the order on the exchange
     */
    entryOrderId?: string;
  };

  /**
   * Exit price information (optional)
   * Tracks both intended and actual exit prices
   * Populated by executor-service when order is closed
   */
  exit?: {
    /**
     * Actual exit price from exchange
     * The real price at which the position was closed
     * May differ from exitPrice due to slippage
     */
    actualExitPrice?: number;
  };

  /**
   * Profit and Loss tracking (optional)
   * Calculated when order is closed
   * Populated by executor-service
   */
  pnl?: {
    /**
     * Realized profit or loss
     * Calculated as: (exitPrice - entryPrice) * lotSize * direction
     * Positive for profit, negative for loss
     * Only populated when order status is CLOSED
     */
    pnl?: number;
  };

  /**
   * Stop Loss configuration (optional)
   * Enforced to minimize potential losses
   * SL is mandatory for risk management
   * Populated by executor-service after order execution
   */
  sl?: {
    /**
     * Stop loss price level
     * Order will be closed if price reaches this level
     * Calculated based on risk management rules
     */
    slPrice: number;

    /**
     * Exchange's internal SL order ID
     * Reference to the stop-loss order placed with the exchange
     * Used for tracking and modification
     */
    slOrderId?: string;
  };

  /**
   * Take Profit configuration (optional)
   * Supports up to 3 TP levels for partial profit taking
   * Populated by executor-service after order execution
   *
   * TP can be specified as:
   * - Exact price levels
   * - Pips from entry (requires conversion to price)
   *
   * Note: Some signals provide 3 TP levels, others may say "TP > 80 pips"
   * requiring calculation based on entry price
   */
  tp?: {
    /**
     * First take profit price (required)
     * Exact price level for TP1
     * Must account for entryPrice vs actualEntryPrice difference
     */
    tp1Price: number;

    /**
     * Second take profit price (optional)
     * Exact price level for TP2
     * Must account for entryPrice vs actualEntryPrice difference
     */
    tp2Price?: number;

    /**
     * Third take profit price (optional)
     * Exact price level for TP3
     * Must account for entryPrice vs actualEntryPrice difference
     */
    tp3Price?: number;

    /**
     * Exchange's internal TP1 order ID
     * Reference to the TP1 limit order placed with the exchange
     */
    tp1OrderId?: string;

    /**
     * Exchange's internal TP2 order ID
     * Reference to the TP2 limit order placed with the exchange
     */
    tp2OrderId?: string;

    /**
     * Exchange's internal TP3 order ID
     * Reference to the TP3 limit order placed with the exchange
     */
    tp3OrderId?: string;
  };

  /**
   * Error flag for invalid orders
   * When true, order should not be sent to exchange
   * Used to track orders that failed validation or have data issues
   * @default false
   */
  isErrorOrder?: boolean;

  /**
   * Order metadata for internal processing
   */
  meta?: {
    /**
     * All identified take profit tiers from the signal, sorted by profitability.
     * Used for multi-tier TP monitoring.
     */
    takeProfitTiers?: {
      /** Target exit price */
      price: number;
      /** Whether this tier has been reached/triggered */
      isUsed?: boolean;
    }[];
  };

  /**
   * Order lifecycle history
   * Chronological record of all events affecting this order
   * Used for audit trail, debugging, and compliance
   */
  history: OrderHistory[];
}

/**
 * Order history entry
 * Records a single event in the order's lifecycle
 * Each entry represents a state change or significant action
 */
export interface OrderHistory {
  /**
   * Unique identifier for this history entry
   */
  _id: ObjectId;

  /**
   * Event status/type
   * Indicates what happened in this event (OPEN, CLOSED, UPDATE, etc.)
   */
  status: OrderHistoryStatus;

  /**
   * Service that created this history entry
   * Tracks which service performed the action for audit trail
   * Use ServiceName enum
   * Examples: 'trade-manager', 'executor-service', 'pending-order-cleanup-job'
   */
  service: string;

  /**
   * Event timestamp
   * When this event occurred
   */
  ts: Date;

  /**
   * Trace token for request tracking
   * Links this event to the originating request for distributed tracing
   */
  traceToken: string;

  /**
   * Telegram message ID associated with this event
   * Links back to the message that triggered this action
   */
  messageId: number;

  /**
   * Telegram channel ID associated with this event
   * Links back to the channel where the message was posted
   */
  channelId: string;

  /**
   * Trading command that triggered this history entry
   * Indicates which command (LONG, SHORT, MOVE_SL, SET_TP_SL, CLOSE_BAD_POSITION,
   * CLOSE_ALL, CANCEL, LIMIT_EXECUTED, NONE) created or modified this order.
   * Set to CommandEnum.NONE for automated actions not triggered by user commands.
   */
  command: CommandEnum;

  /**
   * Additional event-specific information
   * Flexible structure to store context for each event type
   * Examples: price changes, lot adjustments, error details
   */
  info?: {
    [k: string]: any;
  };
}
