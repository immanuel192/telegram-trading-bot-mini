/**
 * Purpose: Define EXECUTE_ORDER_RESULT message type for order execution results.
 * Exports: ExecuteOrderResultPayload type, TypeBox schema.
 * Core Flow: executor-service publishes → trade-manager consumes → updates Order.history.
 */

import { Type, Static } from '@sinclair/typebox';

/**
 * Result types for execution
 */
export enum ExecuteOrderResultType {
  OTHERS = 0,
  OrderOpen = 1,
  /** Strictly means 100% position closure */
  OrderClosed = 2,
  OrderUpdatedTpSl = 3,
}

/**
 * TypeBox schema for EXECUTE_ORDER_RESULT payload validation
 */
export const ExecuteOrderResultPayloadSchema = Type.Object({
  /**
   * Unique order identifier (matches the request)
   */
  orderId: Type.String({ minLength: 1 }),
  /**
   * Account ID that executed the order
   */
  accountId: Type.String({ minLength: 1 }),
  /**
   * Trace token for tracking (matches the request)
   */
  traceToken: Type.String({ minLength: 1 }),
  /**
   * Telegram message ID that triggered this order
   * Required for updating Order.history with complete audit trail
   */
  messageId: Type.Integer({ minimum: 1 }),
  /**
   * Telegram channel ID where the message originated
   * Required for updating Order.history with complete audit trail
   */
  channelId: Type.String({ minLength: 1 }),
  /**
   * Whether the order execution was successful
   */
  success: Type.Boolean(),
  /**
   * Universal instrument symbol name of the order (e.g., BTC/USDT)
   */
  symbol: Type.Optional(Type.String({ minLength: 1 })),
  /**
   * Execution result type
   */
  type: Type.Enum(ExecuteOrderResultType),
  /**
   * Order side (LONG or SHORT)
   */
  side: Type.Optional(Type.String()),
  /**
   * Initial position size in lots/contracts
   */
  lotSize: Type.Optional(Type.Number()),
  /**
   * Current remaining position size in lots/contracts
   */
  lotSizeRemaining: Type.Optional(Type.Number()),
  /**
   * Current take profit tiers
   */
  takeProfits: Type.Optional(
    Type.Array(
      Type.Object({
        price: Type.Number(),
        isUsed: Type.Optional(Type.Boolean()),
      })
    )
  ),
  /**
   * Error message (optional, only if failed)
   */
  error: Type.Optional(Type.String()),
  /**
   * Error code (optional, only if failed)
   */
  errorCode: Type.Optional(Type.String()),
});

/**
 * Payload type for EXECUTE_ORDER_RESULT
 */
export type ExecuteOrderResultPayload = Static<
  typeof ExecuteOrderResultPayloadSchema
>;
