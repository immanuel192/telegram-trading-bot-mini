/**
 * Purpose: Define the mapping between MessageType enum values and their payload types.
 * Exports: MessageTypePayloadMap interface.
 * Core Flow: Used by StreamMessage to ensure type-safe payload access based on message type.
 */

import { MessageType } from './message-type';
import { NewMessagePayload } from './new-message';
import { TranslateMessageRequestPayload } from './translate-message-request';
import { TranslateMessageResultPayload } from './translate-message-result';
import { SymbolFetchLatestPricePayload } from './symbol-fetch-latest-price';
import { ExecuteOrderRequestPayload } from './execute-order-request-payload';
import { ExecuteOrderResultPayload } from './execute-order-result-payload';
import { LivePriceUpdatePayload } from './live-price-update-payload';

/**
 * Message type to payload mapping
 * Maps each MessageType enum value to its corresponding payload interface
 * Used for type-safe message handling across the system
 */
export interface MessageTypePayloadMap {
  [MessageType.NEW_MESSAGE]: NewMessagePayload;
  [MessageType.TRANSLATE_MESSAGE_REQUEST]: TranslateMessageRequestPayload;
  [MessageType.TRANSLATE_MESSAGE_RESULT]: TranslateMessageResultPayload;
  [MessageType.SYMBOL_FETCH_LATEST_PRICE]: SymbolFetchLatestPricePayload;
  [MessageType.EXECUTE_ORDER_REQUEST]: ExecuteOrderRequestPayload;
  [MessageType.EXECUTE_ORDER_RESULT]: ExecuteOrderResultPayload;
  [MessageType.LIVE_PRICE_UPDATE]: LivePriceUpdatePayload;
}
