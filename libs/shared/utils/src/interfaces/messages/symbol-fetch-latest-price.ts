/**
 * Purpose: Define SYMBOL_FETCH_LATEST_PRICE message type for fetching latest symbol prices.
 * Exports: SymbolFetchLatestPricePayload type, TypeBox schema.
 * Core Flow: trade-manager publishes → trade-executor consumes → returns current market price.
 */

import { Type, Static } from '@sinclair/typebox';
import { MessageType } from './message-type';

/**
 * TypeBox schema for SYMBOL_FETCH_LATEST_PRICE payload validation
 */
export const SymbolFetchLatestPricePayloadSchema = Type.Object({
  /**
   * Trading symbol to fetch price for
   */
  symbol: Type.String({ minLength: 1 }),
  /**
   * Originating message ID for correlation
   */
  messageId: Type.Integer({ minimum: 1 }),
  /**
   * Originating channel ID for correlation
   */
  channelId: Type.String({ minLength: 1 }),
});

/**
 * Payload type for SYMBOL_FETCH_LATEST_PRICE
 */
export type SymbolFetchLatestPricePayload = Static<
  typeof SymbolFetchLatestPricePayloadSchema
>;
