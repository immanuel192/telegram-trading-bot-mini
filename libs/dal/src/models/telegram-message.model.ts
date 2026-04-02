/**
 * Purpose: Define the TelegramMessage entity for archiving messages.
 * Exports: TelegramMessage, TelegramMessageHistory, MessageHistoryTypeEnum
 * Core Flow: Extends MongoDB Document, stores message content, context (reply/prev), timestamps, and edit history.
 */

import { Document, ObjectId } from 'mongodb';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils/interfaces';

export interface TelegramMessage extends Document {
  _id?: ObjectId;
  /**
   * Code of the channel where the message was sent
   */
  channelCode: string;
  /**
   * Telegram Channel ID (format: -1003409608482)
   * This is Telegram's internal identifier for the channel
   */
  channelId: string;
  /**
   * Telegram's internal message ID
   */
  messageId: number;
  /**
   * Current text content of the message
   */
  message: string;
  /**
   * Original text content before the first edit (if message was edited)
   * This preserves the initial message for audit purposes
   */
  originalMessage?: string;
  /**
   * Indicates if the message contains media
   */
  hasMedia: boolean;
  /**
   * Type of media in the message (if any)
   */
  mediaType?:
    | 'photo'
    | 'video'
    | 'document'
    | 'audio'
    | 'voice'
    | 'sticker'
    | 'animation'
    | 'other';
  /**
   * Hashtags extracted from the message text (lowercase)
   * Example: ["#btc", "#eth", "#crypto"]
   */
  hashTags: string[];
  /**
   * Context: The message this one is replying to
   */
  quotedMessage?: {
    id: number;
    message: string;
    hasMedia: boolean;
    /**
     * ID of the first message in the reply chain (if this is a threaded reply)
     */
    replyToTopId?: number;
    /**
     * The message text of the first message in the reply chain (if available in DB)
     */
    replyToTopMessage?: string;
  };
  /**
   * Context: The message immediately preceding this one in the channel
   */
  prevMessage?: {
    id: number;
    message: string;
  };
  /**
   * Timestamp when the message was sent on Telegram
   */
  sentAt: Date;
  /**
   * Timestamp when the service received/processed the message
   */
  receivedAt: Date;
  /**
   * Timestamp when the message was last edited (if applicable)
   */
  updatedAt?: Date;
  /**
   * Timestamp when the message was deleted (if applicable)
   */
  deletedAt?: Date;
  /**
   * Additional metadata (parsed results, trade orders, etc.)
   */
  meta?: {
    /**
     * Trace token for tracking this message across all services
     * Format: {messageId}{channelId}
     * Used for end-to-end tracing and debugging
     */
    traceToken: string;
    /**
     * Live market price at the time of message processing (mid-price from bid/ask)
     *
     * This field is populated by trade-manager when processing TRANSLATE_MESSAGE_RESULT events.
     * The price is fetched from Oanda (or any available exchange) using the symbol extracted
     * by the AI interpretation service.
     *
     * **Purpose:** For human manual audit only. Used when auditing and evaluating the accuracy
     * and quality of trading signals from different channels.
     *
     * **Timing:** Captured when TranslateResultHandler processes the first command with a symbol
     * (typically 1-2 seconds after message receipt). Only one price is stored per message.
     *
     */
    livePrice?: {
      bid: number;
      ask: number;
    };
    /**
     * Last extracted command for this message
     *
     * **Purpose:** For human manual audit. Helps track what the AI interpreted for this message.
     * Combined with livePrice, it provides a full snapshot of the signal at processing time.
     */
    extractedCommand?: CommandEnum;
  };

  /**
   * To keep track the message's processing history, entire process from start all the way to the end
   * For audit and bug tracking purposes
   */
  history: TelegramMessageHistory[];
}

/**
 * Enum for message history event types
 * This distinguishes between different types of processing events (not to be confused with MessageType for Redis streams)
 */
export enum MessageHistoryTypeEnum {
  /**
   * Initial message receipt and processing
   */
  NEW_MESSAGE = 'new-message',
  /**
   * Message was edited by user
   */
  EDIT_MESSAGE = 'edit-message',
  /**
   * Message sent to interpret-service for translation
   */
  TRANSLATE_MESSAGE = 'translate-message',
  /**
   * Translation result received from interpret-service
   */
  TRANSLATE_RESULT = 'translate-result',
  /**
   * Execution request sent to executor-service
   */
  EXECUTE_REQUEST = 'execute-request',
}

/**
 * Purpose: Define the TelegramMessageHistory entity for tracking message processing history.
 */
export interface TelegramMessageHistory {
  /**
   * Type of history event (new message, edit, etc.)
   * This is the history event type, not the Redis stream message type
   */
  type: MessageHistoryTypeEnum;
  /**
   * Timestamp when the history entry was created
   * The service that firing this message shall update this field
   */
  createdAt: Date;
  /**
   * Service that emit the event
   */
  fromService: string;
  /**
   * Service that receive the event and process it
   */
  targetService: string;
  /**
   * Trace token for tracking this message across all services
   * Format: {messageId}{channelId}
   * Mandatory for end-to-end tracing and log correlation
   */
  traceToken: string;
  /**
   * Error message if the message was not processed successfully
   */
  errorMessage?: string;
  /**
   * stream event info when we emit
   */
  streamEvent?: {
    /**
     * Type of the event that we emit
     */
    messageEventType: string;
    /**
     * ID of the message that we emit
     */
    messageId: string;
  };
  /**
   * Optional audit notes (e.g., AI responses, debug info)
   * Used to store additional context about the processing step
   * Can be any structured object or primitive value
   */
  notes?: any;
}
