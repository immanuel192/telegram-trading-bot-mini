import { Collection } from 'mongodb';
import { TelegramChannel } from '../models/telegram-channel.model';
import { COLLECTIONS, getSchema } from '../infra/db';
import { BaseRepository } from './base.repository';

export class TelegramChannelRepository extends BaseRepository<TelegramChannel> {
  protected get collection(): Collection<TelegramChannel> {
    return getSchema<TelegramChannel>(COLLECTIONS.TELEGRAM_CHANNELS);
  }

  /**
   * Find all active channels
   */
  async findActiveChannels(): Promise<TelegramChannel[]> {
    return this.findAll({ isActive: true });
  }

  /**
   * Find a channel by its channelCode
   */
  async findByChannelCode(
    channelCode: string
  ): Promise<TelegramChannel | null> {
    return this.findOne({ channelCode });
  }

  /**
   * Find a channel by its Telegram channel ID
   */
  async findByChannelId(channelId: string): Promise<TelegramChannel | null> {
    return this.findOne({ channelId });
  }
}

export const telegramChannelRepository = new TelegramChannelRepository();
