import { Collection, ClientSession } from 'mongodb';
import {
  TelegramMessage,
  TelegramMessageHistory,
} from '../models/telegram-message.model';
import { COLLECTIONS, getSchema } from '../infra/db';
import { BaseRepository } from './base.repository';

export class TelegramMessageRepository extends BaseRepository<TelegramMessage> {
  protected get collection(): Collection<TelegramMessage> {
    return getSchema<TelegramMessage>(COLLECTIONS.TELEGRAM_MESSAGES);
  }

  /**
   * Find a message by channelId and messageId
   */
  async findByChannelAndMessageId(
    channelId: string,
    messageId: number
  ): Promise<TelegramMessage | null> {
    return this.findOne({ channelId, messageId });
  }

  /**
   * Find the latest message in a channel before a given messageId
   */
  async findLatestBefore(
    channelId: string,
    messageId: number
  ): Promise<TelegramMessage | null> {
    const messages = await this.collection
      .find({
        channelId,
        messageId: { $lt: messageId },
        deletedAt: { $exists: false },
      })
      .sort({ messageId: -1 })
      .limit(1)
      .toArray();

    return messages.length > 0 ? (messages[0] as TelegramMessage) : null;
  }

  /**
   * Mark a message as deleted
   */
  async markAsDeleted(channelId: string, messageId: number): Promise<boolean> {
    const result = await this.collection.updateOne(
      { channelId, messageId },
      { $set: { deletedAt: new Date() } }
    );
    return result.modifiedCount > 0;
  }

  /**
   * Update a message when it's edited.
   * Stores the current message as originalMessage (if not already set) and updates with new text.
   *
   * @param channelId - Channel ID
   * @param messageId - Message ID
   * @param currentMessage - Current message text (to be stored as originalMessage)
   * @param newMessage - New message text
   * @param updatedAt - Timestamp of the edit
   * @returns true if message was updated, false if not found
   */
  async updateMessageEdit(
    channelId: string,
    messageId: number,
    currentMessage: string,
    newMessage: string,
    updatedAt: Date
  ): Promise<boolean> {
    const result = await this.collection.updateOne(
      { channelId, messageId },
      {
        $set: {
          message: newMessage,
          updatedAt,
          originalMessage: currentMessage,
        },
      }
    );
    return result.modifiedCount > 0;
  }

  /**
   * Atomically append a history entry to a message's history array.
   * Uses MongoDB $push operator to ensure the history is persisted even if
   * subsequent operations (like stream publishing) fail.
   *
   * Philosophy: Services add new history entries, never update old ones.
   * This creates a complete audit trail of message processing.
   *
   * @param channelId - Channel ID
   * @param messageId - Message ID
   * @param historyEntry - History entry to add
   * @param session - Optional MongoDB session for transaction support
   * @returns true if message was updated, false if not found
   */
  async addHistoryEntry(
    channelId: string,
    messageId: number,
    historyEntry: TelegramMessageHistory,
    session?: ClientSession
  ): Promise<boolean> {
    const result = await this.collection.updateOne(
      { channelId, messageId },
      {
        $push: { history: historyEntry } as any,
      },
      session ? { session } : {}
    );
    return result.modifiedCount > 0;
  }

  /**
   * Atomically update the meta.livePrice and meta.extractedCommand fields of a message.
   * Uses MongoDB $set operator with dot notation for nested update.
   *
   * This field is populated by trade-manager when processing TRANSLATE_MESSAGE_RESULT events.
   *
   * @param channelId - Channel ID
   * @param messageId - Message ID
   * @param livePrice - Live market price (mid-price from bid/ask)
   * @param extractedCommand - The command that was extracted
   * @param session - Optional MongoDB session for transaction support
   * @returns true if message was updated, false if not found
   */
  async updateAuditMetadata(
    channelId: string,
    messageId: number,
    livePrice: { bid: number; ask: number },
    extractedCommand: string,
    session?: ClientSession
  ): Promise<boolean> {
    const result = await this.collection.updateOne(
      { channelId, messageId },
      {
        $set: {
          'meta.livePrice': livePrice,
          'meta.extractedCommand': extractedCommand,
        },
      },
      session ? { session } : {}
    );
    return result.modifiedCount > 0;
  }
}

export const telegramMessageRepository = new TelegramMessageRepository();
