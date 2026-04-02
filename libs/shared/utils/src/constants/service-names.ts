/**
 * Purpose: Centralized enum for service names across the system
 * Exports: ServiceName enum
 * Core Flow: Provides type-safe service identifiers for message processing history tracking
 */

/**
 * Enum of all services in the Telegram Auto Trading Bot system.
 * Used for tracking message processing history across the service pipeline.
 */
export enum ServiceName {
  /**
   * Telegram service - receives messages from Telegram API and publishes to stream
   */
  TELEGRAM_SERVICE = 'telegram-service',

  /**
   * Interpret service - processes messages and extracts trading signals
   */
  INTERPRET_SERVICE = 'interpret-service',

  /**
   * Trade manager - executes trades based on interpreted signals
   */
  TRADE_MANAGER = 'trade-manager',

  /**
   * Executor service
   */
  EXECUTOR_SERVICE = 'executor-service',

  /**
   * Pending order cleanup job - automatically cleans up stale pending orders
   */
  PENDING_ORDER_CLEANUP_JOB = 'pending-order-cleanup-job',

  AUTO_SYNC_TP_SL_LINKED_ORDER_JOB = 'auto-sync-tp-sl-linked-order-job',
  AUTO_UPDATE_ORDER_STATUS_JOB = 'auto-update-order-status-job',
}
