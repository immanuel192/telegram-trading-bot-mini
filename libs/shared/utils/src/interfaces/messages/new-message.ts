import { Type, Static } from '@sinclair/typebox';

/**
 * TypeBox schema for NEW_MESSAGE payload validation
 */
export const NewMessagePayloadSchema = Type.Object({
  /**
   * Telegram Channel Code (business identifier)
   */
  channelCode: Type.String({ minLength: 1 }),
  /**
   * Telegram Channel ID where the message originated
   */
  channelId: Type.String({ minLength: 1 }),
  /**
   * Message ID within the channel
   */
  messageId: Type.Integer({ minimum: 1 }),
  /**
   * Trace token for tracking this message across services
   * Format: {messageId}{channelId}
   */
  traceToken: Type.String({ minLength: 1 }),
  /**
   * Timestamp when telegram-service received the message (milliseconds since epoch)
   * Used for calculating end-to-end processing duration
   */
  receivedAt: Type.Integer({ minimum: 1 }),
  /**
   * Expiry timestamp in milliseconds
   */
  exp: Type.Integer({ minimum: 1 }),
});

/**
 * Payload schema for NEW_MESSAGE type
 */
export type NewMessagePayload = Static<typeof NewMessagePayloadSchema>;
