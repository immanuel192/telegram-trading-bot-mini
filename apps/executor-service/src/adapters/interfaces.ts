/**
 * Purpose: Define broker adapter interfaces for order execution
 * Exports: Parameter interfaces, result interfaces, and IBrokerAdapter
 * Core Flow: Consumer translates ExecuteOrderRequestPayload → calls appropriate adapter method
 *
 * This file defines the contract that all broker adapters must implement.
 * The interfaces are independent of the event payload structure, allowing
 * the consumer layer to translate between message formats and adapter calls.
 */

import { OrderSide } from '@dal';
import { CommandSide } from '@telegram-trading-bot-mini/shared/utils';

/**
 * Parameters for opening a new order (LONG/SHORT commands)
 * Maps from ExecuteOrderRequestPayload for LONG/SHORT commands
 */
export interface OpenOrderParams {
  orderId: string;
  symbol: string;
  side: CommandSide;
  lotSize: number;
  isImmediate: boolean; // true = market order, false = limit order
  entry?: number; // Required for limit orders (isImmediate=false)
  stopLoss?: {
    price?: number;
    pips?: number;
  };
  takeProfits?: Array<{
    price?: number;
    pips?: number;
  }>;
  leverage?: number;
  meta?: {
    reduceLotSize?: boolean;
    adjustEntry?: boolean;
  };
  traceToken: string;
}

/**
 * Parameters for closing an existing order (CLOSE_ALL/CLOSE_BAD_POSITION commands)
 */
export interface CloseOrderParams {
  orderId: string; // Our internal order ID from Order model
  symbol: string;
  amount?: number; // Optional amount to close for partial closures
  traceToken: string;
}

/**
 * Parameters for canceling a pending order (CANCEL command)
 * Only applies to PENDING orders, not OPEN positions
 */
export interface CancelOrderParams {
  orderId: string; // Internal order ID from Order model
  symbol: string;
  traceToken: string;
}

/**
 * Parameters for setting stop loss (MOVE_SL/SET_TP_SL commands)
 * Note: Stop loss in pips is only available during order creation, not when setting stop loss
 */
export interface SetStopLossParams {
  orderId: string;
  symbol: string;
  price?: number; // Stop loss price
  pips?: number; // Stop loss in pips (only for order creation)
  traceToken: string;
}

/**
 * Parameters for setting take profit (SET_TP_SL command)
 */
export interface SetTakeProfitParams {
  orderId: string;
  symbol: string;
  price: number;
  traceToken: string;
}

/**
 * Result returned after setting stop loss
 */
export interface SetStopLossResult {
  slOrderId: string; // Exchange's new SL order ID
}

/**
 * Result returned after setting take profit
 */
export interface SetTakeProfitResult {
  tpOrderId: string; // Exchange's new TP order ID
}

/**
 * Result returned after opening an order
 */
export interface OpenOrderResult {
  exchangeOrderId: string; // Broker's order ID
  executedPrice: number; // Actual fill price
  executedLots: number; // Actual filled lots
  executedAt: number; // Timestamp of execution
  stopLossOrderId?: string; // Broker's SL order ID (if SL was set)
  takeProfitOrderId?: string; // Broker's TP order ID (if TP was set)
}

/**
 * Result returned after closing an order
 */
export interface CloseOrderResult {
  exchangeOrderId: string; // Broker's order ID for the close operation
  closedPrice: number; // Price at which position was closed
  closedLots: number; // Lots that were closed
  closedAt: number; // Timestamp of closure
}

/**
 * Price ticker data from broker
 */
export interface PriceTicker {
  symbol: string;
  bid: number;
  ask: number;
  timestamp: number;
}

/**
 * Account information from broker
 */
export interface AccountInfo {
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
}

/**
 * Parameters for fetching transaction history
 */
export interface GetTransactionParams {
  /**
   * Start date for the transaction search.
   * Note: Filter support (date vs ID) varies by broker.
   */
  from?: Date;
  /**
   * End date for the transaction search.
   * Defaults to current date if not provided.
   */
  to?: Date;
  /**
   * Filter transactions starting from a specific broker-side ID.
   */
  fromId?: string;
}

/**
 * Normalized status of a transaction item
 */
export enum TransactionStatus {
  /** Order created but not yet filled (e.g., LIMIT_ORDER or pending TP/SL) */
  PENDING = 'pending',
  /** Order has been filled and the trade is currently active */
  OPEN = 'open',
  /** Trade has been closed (liquidated or exited) */
  CLOSED = 'closed',
}

/**
 * Specific reason why a transaction state was reached (primarily for 'CLOSED' status)
 */
export enum TransactionCloseReason {
  TP = 'tp', // Take Profit triggered
  SL = 'sl', // Stop Loss triggered
  MANUALLY = 'manually', // Manual closure or specific TRADE_CLOSE intent
}

/**
 * Categorization of transaction items
 */
export enum TransactionItemType {
  POSITION = 'position', // Full trade/position execution
  TAKE_PROFIT = 'tp', // Take profit execution
  STOP_LOSS = 'sl', // Stop loss execution
}

/**
 * Normalized transaction record from a broker
 */
export interface TransactionItem {
  /**
   * Broker-side execution or order ID
   */
  orderId: string;
  /**
   * Our internal order ID (sent via client extensions) if available
   */
  clientOrderId?: string;
  /**
   * Trading symbol (universal format)
   */
  symbol: string;
  /**
   * Timestamp when the trade was opened
   */
  openTime?: Date;
  /**
   * Timestamp when the trade was closed
   */
  closeTime?: Date;
  /**
   * Realized profit and loss for the transaction
   */
  pnl?: number;
  /**
   * Execution price for the transaction (exit price for CLOSED)
   */
  closedPrice?: number;
  /**
   * Type of transaction item
   */
  type: TransactionItemType;
  /**
   * Current status of the transaction record
   */
  status: TransactionStatus;
  /**
   * Reason for closure (only if status is CLOSED)
   */
  closeReason?: TransactionCloseReason;
}

/**
 * Exchange position information
 * Represents an open position on the exchange
 */
export interface ExchangePosition {
  /**
   * Position ID from exchange
   */
  id: string;
  /**
   * Position side (long or short)
   */
  side: OrderSide;
  /**
   * Number of contracts/lots in the position
   */
  contracts: number;
}

/**
 * Exchange order information
 * Represents a pending order on the exchange
 */
export interface ExchangeOrder {
  /**
   * Order ID from exchange
   */
  id: string;
  /**
   * Order price
   */
  price: number;
  /**
   * Order amount/units
   */
  amount: number;
  /**
   * Order type (e.g., LIMIT, STOP_LOSS, TAKE_PROFIT)
   */
  type?: string;
}

/**
 * Base interface all broker adapters must implement
 *
 * Command mapping:
 * - LONG/SHORT → openOrder()
 * - CLOSE_ALL/CLOSE_BAD_POSITION → closeOrder()
 * - CANCEL → cancelOrder() (for PENDING orders only)
 * - MOVE_SL/SET_TP_SL → updateStopLoss()/updateTakeProfit()
 */
export interface IBrokerAdapter {
  // Lifecycle
  init(): Promise<void>;
  close(): Promise<void>;
  ready(): boolean;

  // Token management
  /**
   * Get unique token key for this adapter instance
   * Used by TokenManager to identify which adapters share the same token
   *
   * Examples:
   * - XM: All accounts with same JWT share tokens → key by JWT hash
   * - Exness: Each account has unique tokens → key by accountId
   * - API Key brokers: No token refresh needed → static key
   */
  getTokenKey(): string;

  // Order execution
  /**
   * Open a new position (market or limit order)
   * Used for LONG and SHORT commands
   */
  openOrder(params: OpenOrderParams): Promise<OpenOrderResult>;

  /**
   * Close an existing OPEN position
   * Used for CLOSE_ALL and CLOSE_BAD_POSITION commands
   */
  closeOrder(params: CloseOrderParams): Promise<CloseOrderResult>;

  /**
   * Cancel a PENDING order (not yet filled)
   * Used for CANCEL command
   */
  cancelOrder(params: CancelOrderParams): Promise<void>;

  /**
   * Set stop loss for an existing order
   * Used for MOVE_SL and SET_TP_SL commands
   * Returns the new SL order ID from the exchange
   */
  setStopLoss(params: SetStopLossParams): Promise<SetStopLossResult>;

  /**
   * Set take profit for an existing order
   * Used for SET_TP_SL command
   * Returns the new TP order ID from the exchange
   */
  setTakeProfit(params: SetTakeProfitParams): Promise<SetTakeProfitResult>;

  // Market data
  /**
   * Fetch price data for one or more symbols
   * Supports batch fetching for efficiency in background jobs
   *
   * @param symbols - Array of universal symbol format (e.g., ['XAUUSD', 'EURUSD'])
   * @returns Array of price tickers, one per symbol
   */
  fetchPrice(symbols: string[]): Promise<PriceTicker[]>;

  // Account info
  getAccountInfo(): Promise<AccountInfo>;

  // Exchange data
  /**
   * Fetch open positions for a specific symbol
   * Returns all open positions/trades for the given symbol
   */
  fetchPositions(symbol: string): Promise<ExchangePosition[]>;

  /**
   * Fetch pending orders for a specific symbol
   * Returns all pending (not yet filled) orders for the given symbol
   */
  fetchOpenOrders(symbol: string): Promise<ExchangeOrder[]>;

  /**
   * Fetch transaction history from the broker
   * Supports filtering by date range or starting ID
   */
  getTransactions(params: GetTransactionParams): Promise<TransactionItem[]>;

  // Metrics
  /**
   * Emit broker API performance metric
   * Called by OrderExecutorService to track broker API latency
   *
   * @param operation - Operation name (e.g., 'openOrder', 'closeOrder')
   * @param duration - Duration in milliseconds
   * @param symbol - Trading symbol
   * @param status - Operation status ('success' or 'error')
   * @param additionalAttributes - Optional additional attributes
   */
  emitMetric(
    operation: string,
    duration: number,
    symbol: string,
    status: 'success' | 'error',
    additionalAttributes?: Record<string, string>,
  ): void;

  // Metadata
  getName(): string;

  /**
   * Get exchange code for this adapter
   * Used for constructing cache keys (e.g., price:oanda:XAUUSD)
   * @returns Exchange code (e.g., 'oanda', 'mock')
   */
  get exchangeCode(): string;

  /**
   * Get account ID for this adapter
   * Used for constructing cache keys (e.g., balance:oanda:acc-123)
   * @returns Internal account identifier
   */
  get accountId(): string;

  // Leverage management
  /**
   * Set leverage for a symbol on the exchange
   * Handles caching internally to avoid redundant API calls
   *
   * @param symbol - Trading symbol
   * @param leverage - Leverage value (e.g., 50 for 50x)
   */
  setLeverage(symbol: string, leverage: number): Promise<void>;
}
