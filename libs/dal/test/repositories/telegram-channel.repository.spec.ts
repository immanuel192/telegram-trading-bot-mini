/**
 * Purpose: Integration tests for TelegramChannelRepository operations.
 * Prerequisites: MongoDB running (via 'npm run stack:up').
 * Core Flow: Test channel CRUD operations → Test active channel filtering → Test channel resolution → Cleanup.
 */

import { telegramChannelRepository } from '../../src/repositories/telegram-channel.repository';
import { TelegramChannel } from '../../src/models/telegram-channel.model';
import {
  suiteName,
  setupDb,
  teardownDb,
  cleanupDb,
  COLLECTIONS,
} from '@telegram-trading-bot-mini/shared/test-utils';

describe(suiteName(__filename), () => {
  beforeAll(async () => {
    await setupDb();
  });

  afterAll(async () => {
    await teardownDb();
  });

  beforeEach(async () => {
    await cleanupDb(null, [COLLECTIONS.TELEGRAM_CHANNELS]);
  });

  afterEach(async () => {
    await cleanupDb(null, [COLLECTIONS.TELEGRAM_CHANNELS]);
  });

  describe('findByChannelCode', () => {
    it('should find a channel by channelCode', async () => {
      const channel: TelegramChannel = {
        channelCode: 'test-channel',
        url: 'https://t.me/testchannel',
        channelId: '-1001234567890',
        accessHash: '1234567890',
        isActive: true,
        createdOn: new Date(),
      };

      await telegramChannelRepository.create(channel);
      const found =
        await telegramChannelRepository.findByChannelCode('test-channel');

      expect(found).toBeDefined();
      expect(found?.channelCode).toBe('test-channel');
      expect(found?.url).toBe('https://t.me/testchannel');
    });

    it('should return null if channelCode not found', async () => {
      const found =
        await telegramChannelRepository.findByChannelCode('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('findByChannelId', () => {
    it('should find a channel by channelId', async () => {
      const channel: TelegramChannel = {
        channelCode: 'test-channel-id',
        url: 'https://t.me/testchannelid',
        channelId: '-1001234567890',
        accessHash: '1234567890',
        isActive: true,
        createdOn: new Date(),
      };

      await telegramChannelRepository.create(channel);
      const found =
        await telegramChannelRepository.findByChannelId('-1001234567890');

      expect(found).toBeDefined();
      expect(found?.channelId).toBe('-1001234567890');
      expect(found?.channelCode).toBe('test-channel-id');
      expect(found?.url).toBe('https://t.me/testchannelid');
    });

    it('should return null if channelId not found', async () => {
      const found =
        await telegramChannelRepository.findByChannelId('-1009999999999');
      expect(found).toBeNull();
    });

    it('should find correct channel when multiple channels exist', async () => {
      const channel1: TelegramChannel = {
        channelCode: 'channel-1',
        url: 'https://t.me/channel1',
        channelId: '-1001111111111',
        accessHash: '1111111111',
        isActive: true,
        createdOn: new Date(),
      };

      const channel2: TelegramChannel = {
        channelCode: 'channel-2',
        url: 'https://t.me/channel2',
        channelId: '-1002222222222',
        accessHash: '2222222222',
        isActive: true,
        createdOn: new Date(),
      };

      await telegramChannelRepository.create(channel1);
      await telegramChannelRepository.create(channel2);

      const found =
        await telegramChannelRepository.findByChannelId('-1002222222222');

      expect(found).toBeDefined();
      expect(found?.channelId).toBe('-1002222222222');
      expect(found?.channelCode).toBe('channel-2');
    });
  });

  describe('findActiveChannels', () => {
    it('should return only active channels', async () => {
      const activeChannel1: TelegramChannel = {
        channelCode: 'active-1',
        url: 'https://t.me/active1',
        channelId: '-1001234567891',
        accessHash: '1234567891',
        isActive: true,
        createdOn: new Date(),
      };

      const activeChannel2: TelegramChannel = {
        channelCode: 'active-2',
        url: 'https://t.me/active2',
        channelId: '-1001234567892',
        accessHash: '1234567892',
        isActive: true,
        createdOn: new Date(),
      };

      const inactiveChannel: TelegramChannel = {
        channelCode: 'inactive-1',
        url: 'https://t.me/inactive1',
        channelId: '-1001234567893',
        accessHash: '1234567893',
        isActive: false,
        createdOn: new Date(),
      };

      await telegramChannelRepository.create(activeChannel1);
      await telegramChannelRepository.create(activeChannel2);
      await telegramChannelRepository.create(inactiveChannel);

      const activeChannels =
        await telegramChannelRepository.findActiveChannels();

      expect(activeChannels).toHaveLength(2);
      expect(activeChannels.every((ch) => ch.isActive)).toBe(true);
      expect(activeChannels.map((ch) => ch.channelCode)).toContain('active-1');
      expect(activeChannels.map((ch) => ch.channelCode)).toContain('active-2');
      expect(activeChannels.map((ch) => ch.channelCode)).not.toContain(
        'inactive-1',
      );
    });

    it('should return empty array when no active channels exist', async () => {
      const inactiveChannel: TelegramChannel = {
        channelCode: 'inactive-1',
        url: 'https://t.me/inactive1',
        channelId: '-1001234567894',
        accessHash: '1234567894',
        isActive: false,
        createdOn: new Date(),
      };

      await telegramChannelRepository.create(inactiveChannel);

      const activeChannels =
        await telegramChannelRepository.findActiveChannels();

      expect(activeChannels).toHaveLength(0);
    });
  });

  describe('BaseRepository methods', () => {
    it('should support findById', async () => {
      const channel: TelegramChannel = {
        channelCode: 'find-by-id-channel',
        url: 'https://t.me/findbyid',
        channelId: '-1001234567896',
        accessHash: '1234567896',
        isActive: true,
        createdOn: new Date(),
      };

      const created = await telegramChannelRepository.create(channel);
      const found = await telegramChannelRepository.findById(
        created._id!.toString(),
      );

      expect(found).toBeDefined();
      expect(found?.channelCode).toBe('find-by-id-channel');
    });

    it('should support findAll', async () => {
      await telegramChannelRepository.create({
        channelCode: 'channel1',
        url: 'https://t.me/channel1',
        channelId: '-1001234567897',
        accessHash: '1234567897',
        isActive: true,
        createdOn: new Date(),
      });

      await telegramChannelRepository.create({
        channelCode: 'channel2',
        url: 'https://t.me/channel2',
        channelId: '-1001234567898',
        accessHash: '1234567898',
        isActive: false,
        createdOn: new Date(),
      });

      const all = await telegramChannelRepository.findAll();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    it('should support update', async () => {
      const channel: TelegramChannel = {
        channelCode: 'update-channel',
        url: 'https://t.me/update',
        channelId: '-1001234567899',
        accessHash: '1234567899',
        isActive: true,
        createdOn: new Date(),
      };

      const created = await telegramChannelRepository.create(channel);
      const updated = await telegramChannelRepository.update(
        created._id!.toString(),
        {
          isActive: false,
        },
      );

      expect(updated).toBe(true);

      const found =
        await telegramChannelRepository.findByChannelCode('update-channel');
      expect(found?.isActive).toBe(false);
    });

    it('should support delete', async () => {
      const channel: TelegramChannel = {
        channelCode: 'delete-channel',
        url: 'https://t.me/delete',
        channelId: '-1001234567800',
        accessHash: '1234567800',
        isActive: true,
        createdOn: new Date(),
      };

      const created = await telegramChannelRepository.create(channel);
      const deleted = await telegramChannelRepository.delete(
        created._id!.toString(),
      );

      expect(deleted).toBe(true);

      const found =
        await telegramChannelRepository.findByChannelCode('delete-channel');
      expect(found).toBeNull();
    });
  });
});
