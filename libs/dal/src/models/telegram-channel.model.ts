/**
 * Purpose: Define the TelegramChannel entity for managing monitored channels.
 * Exports: TelegramChannel (main entity).
 * Core Flow: Extends MongoDB Document, stores channel details, access credentials, and monitoring status.
 */

import { Document, ObjectId } from 'mongodb';

export interface TelegramChannel extends Document {
  _id?: ObjectId;
  /**
   * Internal unique identifier for the channel
   */
  channelCode: string;
  /**
   * Telegram Channel ID (format: -1003409608482)
   * This is Telegram's internal identifier for the channel
   */
  channelId: string;
  /**
   * Access Hash for the channel
   * Required for API calls to access the channel
   */
  accessHash: string;
  /**
   * Whether the channel is currently being monitored
   */
  isActive: boolean;
  /**
   * Timestamp when the channel was added
   */
  createdOn: Date;
}
