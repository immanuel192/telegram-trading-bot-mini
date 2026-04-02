/**
 * Purpose: Define TRANSLATE_MESSAGE_REQUEST message type for requesting message translation.
 * Exports: TranslateMessageRequestPayload type, TypeBox schemas.
 * Core Flow: trade-manager publishes → interpret-service consumes → LLM translates message to commands.
 */

import { Type, Static } from '@sinclair/typebox';

/**
 * TypeBox schema for TRANSLATE_MESSAGE_REQUEST payload validation
 */
export const TranslateMessageRequestPayloadSchema = Type.Object({
  /**
   * Prompt rule ID for AI translation
   * References a PromptRule document in the database
   */
  promptId: Type.String({ minLength: 1 }),
  /**
   * Telegram message ID
   */
  messageId: Type.Integer({ minimum: 1 }),
  /**
   * Telegram channel ID
   */
  channelId: Type.String({ minLength: 1 }),
  /**
   * Trace token for tracking this message across services
   * Format: {messageId}{channelId}
   */
  traceToken: Type.String({ minLength: 1 }),
  /**
   * Timestamp when telegram-service originally received the message (milliseconds since epoch)
   * Forwarded from NEW_MESSAGE for end-to-end duration tracking
   */
  receivedAt: Type.Integer({ minimum: 1 }),
  /**
   * Expiry timestamp in milliseconds
   * Default: current time + 10s
   */
  exp: Type.Integer({ minimum: 1 }),
  /**
   * Raw message text to translate
   */
  messageText: Type.String({ minLength: 1 }),
  /**
   * Previous message text for context
   */
  prevMessage: Type.String(),
  /**
   * Quoted message text (optional)
   */
  quotedMessage: Type.Optional(Type.String()),
  /**
   * First message in quote chain (optional)
   */
  quotedFirstMessage: Type.Optional(Type.String()),
});

/**
 * Payload type for TRANSLATE_MESSAGE_REQUEST
 */
export type TranslateMessageRequestPayload = Static<
  typeof TranslateMessageRequestPayloadSchema
>;
