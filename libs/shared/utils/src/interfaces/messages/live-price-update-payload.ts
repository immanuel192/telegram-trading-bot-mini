/**
 * Purpose: Define LIVE_PRICE_UPDATE message type for live price updates.
 * Exports: LivePriceUpdatePayload type, TypeBox schema.
 * Core Flow: executor-service publishes → trade-manager consumes → updates price context.
 */

import { Type, Static } from '@sinclair/typebox';

/**
 * TypeBox schema for LIVE_PRICE_UPDATE payload validation
 */
export const LivePriceUpdatePayloadSchema = Type.Object({
  /**
   * Fake account Id.
   * Since the nature of the live price update, we dont have the right value for accountId
   * Instead we will use the Adapter account Id just to fill up the value
   */
  accountId: Type.String({ minLength: 1 }),
  /**
   * Fake channelId
   * Because we dont have the channelId, we will just send fake value for this field
   */
  channelId: Type.String({ minLength: 1 }),
  /**
   * Universal trading symbol
   */
  symbol: Type.String({ minLength: 1 }),
  /**
   * Current price
   */
  currentPrice: Type.Object({
    /**
     * Bid price (buy price)
     */
    bid: Type.Number({ minimum: 0 }),
    /**
     * Ask price (sell price)
     */
    ask: Type.Number({ minimum: 0 }),
  }),
  /**
   * Previous price
   */
  previousPrice: Type.Object({
    /**
     * Bid price (buy price)
     */
    bid: Type.Number({ minimum: 0 }),
    /**
     * Ask price (sell price)
     */
    ask: Type.Number({ minimum: 0 }),
  }),
  /**
   * Price update timestamp
   */
  timestamp: Type.Integer({ minimum: 1 }),
});

/**
 * Payload type for LIVE_PRICE_UPDATE
 */
export type LivePriceUpdatePayload = Static<
  typeof LivePriceUpdatePayloadSchema
>;
