/**
 * Purpose: Integration tests for TelegramMessageRepository.
 * Prerequisites: MongoDB running (via 'npm run stack:up').
 * Core Flow: Create message → Add history entry → Verify history persistence.
 */

import { init, close } from '../../src/infra/db';
import { telegramMessageRepository } from '../../src/repositories/telegram-message.repository';
import {
  TelegramMessage,
  TelegramMessageHistory,
  MessageHistoryTypeEnum,
} from '../../src/models/telegram-message.model';
import {
  createConfig,
  ServiceName,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  fakeLogger,
  suiteName,
} from '@telegram-trading-bot-mini/shared/test-utils';

describe(suiteName(__filename), () => {
  beforeAll(async () => {
    try {
      const config = createConfig();
      await init(config, fakeLogger);
    } catch (e) {
      console.error(
        'Failed to connect to MongoDB. Make sure it is running.',
        e,
      );
      throw e;
    }
  });

  afterAll(async () => {
    // Cleanup: remove all test messages
    await telegramMessageRepository.deleteMany({});
    await close();
  });

  afterEach(async () => {
    // Clean up after each test
    await telegramMessageRepository.deleteMany({});
  });

  describe('addHistoryEntry', () => {
    it('should atomically append a history entry to the message', async () => {
      // 1. Create a message
      const message: TelegramMessage = {
        channelCode: 'test-channel',
        channelId: '-1001234567890',
        messageId: 123,
        message: 'Test Message',
        sentAt: new Date(),
        receivedAt: new Date(),
        history: [],
      } as TelegramMessage;

      await telegramMessageRepository.create(message);

      // 2. Add history entry
      const historyEntry: TelegramMessageHistory = {
        type: MessageHistoryTypeEnum.NEW_MESSAGE,
        createdAt: new Date(),
        fromService: ServiceName.TELEGRAM_SERVICE,
        targetService: ServiceName.INTERPRET_SERVICE,
        traceToken: 'test-trace-token-1',
        streamEvent: {
          messageEventType: 'NEW_MESSAGE',
          messageId: 'stream-id-123',
        },
      };

      const success = await telegramMessageRepository.addHistoryEntry(
        '-1001234567890',
        123,
        historyEntry,
      );

      expect(success).toBe(true);

      // 3. Verify history persistence
      const updatedMessage =
        await telegramMessageRepository.findByChannelAndMessageId(
          '-1001234567890',
          123,
        );

      expect(updatedMessage).toBeDefined();
      expect(updatedMessage?.history).toHaveLength(1);
      expect(updatedMessage?.history[0].fromService).toBe(
        ServiceName.TELEGRAM_SERVICE,
      );
      expect(updatedMessage?.history[0].targetService).toBe(
        ServiceName.INTERPRET_SERVICE,
      );
      expect(updatedMessage?.history[0].streamEvent?.messageId).toBe(
        'stream-id-123',
      );
    });

    it('should append multiple history entries in order', async () => {
      // 1. Create a message
      const message: TelegramMessage = {
        channelCode: 'test-channel',
        channelId: '-1001234567890',
        messageId: 456,
        message: 'Test Message 2',
        sentAt: new Date(),
        receivedAt: new Date(),
        history: [],
      } as TelegramMessage;

      await telegramMessageRepository.create(message);

      // 2. Add first history entry
      const entry1: TelegramMessageHistory = {
        type: MessageHistoryTypeEnum.NEW_MESSAGE,
        createdAt: new Date(),
        fromService: ServiceName.TELEGRAM_SERVICE,
        targetService: ServiceName.INTERPRET_SERVICE,
        traceToken: 'test-trace-token-2',
      };
      await telegramMessageRepository.addHistoryEntry(
        '-1001234567890',
        456,
        entry1,
      );

      // 3. Add second history entry
      const entry2: TelegramMessageHistory = {
        type: MessageHistoryTypeEnum.NEW_MESSAGE,
        createdAt: new Date(),
        fromService: ServiceName.INTERPRET_SERVICE,
        targetService: ServiceName.TRADE_MANAGER,
        traceToken: 'test-trace-token-3',
      };
      await telegramMessageRepository.addHistoryEntry(
        '-1001234567890',
        456,
        entry2,
      );

      // 4. Verify order
      const updatedMessage =
        await telegramMessageRepository.findByChannelAndMessageId(
          '-1001234567890',
          456,
        );

      expect(updatedMessage?.history).toHaveLength(2);
      expect(updatedMessage?.history[0].fromService).toBe(
        ServiceName.TELEGRAM_SERVICE,
      );
      expect(updatedMessage?.history[1].fromService).toBe(
        ServiceName.INTERPRET_SERVICE,
      );
    });

    it('should return false if message not found', async () => {
      const historyEntry: TelegramMessageHistory = {
        type: MessageHistoryTypeEnum.NEW_MESSAGE,
        createdAt: new Date(),
        fromService: ServiceName.TELEGRAM_SERVICE,
        targetService: ServiceName.INTERPRET_SERVICE,
        traceToken: 'test-trace-token-4',
      };

      const success = await telegramMessageRepository.addHistoryEntry(
        'non-existent-channel-id',
        999,
        historyEntry,
      );

      expect(success).toBe(false);
    });

    it('should persist notes field in history entry', async () => {
      // 1. Create a message
      const message: TelegramMessage = {
        channelCode: 'test-channel',
        channelId: '-1001234567890',
        messageId: 789,
        message: 'Test Message with Notes',
        sentAt: new Date(),
        receivedAt: new Date(),
        history: [],
      } as TelegramMessage;

      await telegramMessageRepository.create(message);

      // 2. Add history entry with notes
      const aiResponse = {
        classification: { isCommand: true, confidence: 0.95 },
        extraction: { symbol: 'BTCUSDT', action: 'LONG' },
      };
      const historyEntry: TelegramMessageHistory = {
        type: MessageHistoryTypeEnum.TRANSLATE_RESULT,
        createdAt: new Date(),
        fromService: ServiceName.INTERPRET_SERVICE,
        targetService: ServiceName.TRADE_MANAGER,
        traceToken: 'test-trace-token-5',
        notes: JSON.stringify(aiResponse),
      };

      const success = await telegramMessageRepository.addHistoryEntry(
        '-1001234567890',
        789,
        historyEntry,
      );

      expect(success).toBe(true);

      // 3. Verify notes persistence
      const updatedMessage =
        await telegramMessageRepository.findByChannelAndMessageId(
          '-1001234567890',
          789,
        );

      expect(updatedMessage).toBeDefined();
      expect(updatedMessage?.history).toHaveLength(1);
      expect(updatedMessage?.history[0].notes).toBeDefined();
      expect(updatedMessage?.history[0].notes).toBe(JSON.stringify(aiResponse));

      // Verify we can parse the notes back
      const parsedNotes = JSON.parse(updatedMessage!.history[0].notes!);
      expect(parsedNotes.classification.isCommand).toBe(true);
      expect(parsedNotes.classification.confidence).toBe(0.95);
      expect(parsedNotes.extraction.symbol).toBe('BTCUSDT');
    });
  });

  describe('findByChannelAndMessageId', () => {
    it('should find a message by channelId and messageId', async () => {
      const message: TelegramMessage = {
        channelCode: 'test-channel',
        channelId: '-1001234567890',
        messageId: 100,
        message: 'Test Message',
        sentAt: new Date(),
        receivedAt: new Date(),
        history: [],
      } as TelegramMessage;

      await telegramMessageRepository.create(message);

      const found = await telegramMessageRepository.findByChannelAndMessageId(
        '-1001234567890',
        100,
      );

      expect(found).toBeDefined();
      expect(found?.channelId).toBe('-1001234567890');
      expect(found?.messageId).toBe(100);
      expect(found?.message).toBe('Test Message');
    });

    it('should return null if message not found', async () => {
      const found = await telegramMessageRepository.findByChannelAndMessageId(
        '-1001234567890',
        999,
      );

      expect(found).toBeNull();
    });

    it('should distinguish between different channels', async () => {
      await telegramMessageRepository.create({
        channelCode: 'channel-1',
        channelId: '-1001111111111',
        messageId: 100,
        message: 'Channel 1 Message',
        sentAt: new Date(),
        receivedAt: new Date(),
        history: [],
      } as TelegramMessage);

      await telegramMessageRepository.create({
        channelCode: 'channel-2',
        channelId: '-1002222222222',
        messageId: 100,
        message: 'Channel 2 Message',
        sentAt: new Date(),
        receivedAt: new Date(),
        history: [],
      } as TelegramMessage);

      const found1 = await telegramMessageRepository.findByChannelAndMessageId(
        '-1001111111111',
        100,
      );
      const found2 = await telegramMessageRepository.findByChannelAndMessageId(
        '-1002222222222',
        100,
      );

      expect(found1?.message).toBe('Channel 1 Message');
      expect(found2?.message).toBe('Channel 2 Message');
    });
  });

  describe('findLatestBefore', () => {
    beforeEach(async () => {
      // Create multiple messages in sequence
      const messages = [
        { messageId: 10, message: 'Message 10' },
        { messageId: 20, message: 'Message 20' },
        { messageId: 30, message: 'Message 30' },
        { messageId: 40, message: 'Message 40' },
      ];

      for (const msg of messages) {
        await telegramMessageRepository.create({
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: msg.messageId,
          message: msg.message,
          sentAt: new Date(),
          receivedAt: new Date(),
          history: [],
        } as TelegramMessage);
      }
    });

    it('should find the latest message before given messageId', async () => {
      const found = await telegramMessageRepository.findLatestBefore(
        '-1001234567890',
        40,
      );

      expect(found).toBeDefined();
      expect(found?.messageId).toBe(30);
      expect(found?.message).toBe('Message 30');
    });

    it('should return null if no messages before given messageId', async () => {
      const found = await telegramMessageRepository.findLatestBefore(
        '-1001234567890',
        10,
      );

      expect(found).toBeNull();
    });

    it('should not return deleted messages', async () => {
      // Mark message 30 as deleted
      await telegramMessageRepository.markAsDeleted('-1001234567890', 30);

      const found = await telegramMessageRepository.findLatestBefore(
        '-1001234567890',
        40,
      );

      // Should skip deleted message 30 and return message 20
      expect(found).toBeDefined();
      expect(found?.messageId).toBe(20);
    });

    it('should return null if all previous messages are deleted', async () => {
      // Delete all messages before 40
      await telegramMessageRepository.markAsDeleted('-1001234567890', 10);
      await telegramMessageRepository.markAsDeleted('-1001234567890', 20);
      await telegramMessageRepository.markAsDeleted('-1001234567890', 30);

      const found = await telegramMessageRepository.findLatestBefore(
        '-1001234567890',
        40,
      );

      expect(found).toBeNull();
    });

    it('should work with different channels', async () => {
      await telegramMessageRepository.create({
        channelCode: 'other-channel',
        channelId: '-1009999999999',
        messageId: 25,
        message: 'Other Channel Message',
        sentAt: new Date(),
        receivedAt: new Date(),
        history: [],
      } as TelegramMessage);

      const found = await telegramMessageRepository.findLatestBefore(
        '-1001234567890',
        40,
      );

      // Should not return message from other channel
      expect(found?.messageId).toBe(30);
      expect(found?.channelId).toBe('-1001234567890');
    });
  });

  describe('markAsDeleted', () => {
    beforeEach(async () => {
      await telegramMessageRepository.create({
        channelCode: 'test-channel',
        channelId: '-1001234567890',
        messageId: 100,
        message: 'Test Message',
        sentAt: new Date(),
        receivedAt: new Date(),
        history: [],
      } as TelegramMessage);
    });

    it('should mark a message as deleted', async () => {
      const success = await telegramMessageRepository.markAsDeleted(
        '-1001234567890',
        100,
      );

      expect(success).toBe(true);

      const message = await telegramMessageRepository.findByChannelAndMessageId(
        '-1001234567890',
        100,
      );

      expect(message?.deletedAt).toBeDefined();
      expect(message?.deletedAt).toBeInstanceOf(Date);
    });

    it('should return false if message not found', async () => {
      const success = await telegramMessageRepository.markAsDeleted(
        '-1001234567890',
        999,
      );

      expect(success).toBe(false);
    });

    it('should update deletedAt timestamp', async () => {
      const beforeDelete = new Date();
      await telegramMessageRepository.markAsDeleted('-1001234567890', 100);
      const afterDelete = new Date();

      const message = await telegramMessageRepository.findByChannelAndMessageId(
        '-1001234567890',
        100,
      );

      expect(message?.deletedAt).toBeDefined();
      expect(message!.deletedAt!.getTime()).toBeGreaterThanOrEqual(
        beforeDelete.getTime(),
      );
      expect(message!.deletedAt!.getTime()).toBeLessThanOrEqual(
        afterDelete.getTime(),
      );
    });
  });

  describe('updateMessageEdit', () => {
    beforeEach(async () => {
      await telegramMessageRepository.create({
        channelCode: 'test-channel',
        channelId: '-1001234567890',
        messageId: 100,
        message: 'Original Message',
        sentAt: new Date(),
        receivedAt: new Date(),
        history: [],
      } as TelegramMessage);
    });

    it('should update message with edit', async () => {
      const updatedAt = new Date();
      const success = await telegramMessageRepository.updateMessageEdit(
        '-1001234567890',
        100,
        'Original Message',
        'Edited Message',
        updatedAt,
      );

      expect(success).toBe(true);

      const message = await telegramMessageRepository.findByChannelAndMessageId(
        '-1001234567890',
        100,
      );

      expect(message?.message).toBe('Edited Message');
      expect(message?.originalMessage).toBe('Original Message');
      expect(message?.updatedAt).toEqual(updatedAt);
    });

    it('should return false if message not found', async () => {
      const success = await telegramMessageRepository.updateMessageEdit(
        '-1001234567890',
        999,
        'Original',
        'Edited',
        new Date(),
      );

      expect(success).toBe(false);
    });

    it('should preserve original message on subsequent edits', async () => {
      // First edit
      await telegramMessageRepository.updateMessageEdit(
        '-1001234567890',
        100,
        'Original Message',
        'First Edit',
        new Date(),
      );

      // Second edit
      await telegramMessageRepository.updateMessageEdit(
        '-1001234567890',
        100,
        'First Edit',
        'Second Edit',
        new Date(),
      );

      const message = await telegramMessageRepository.findByChannelAndMessageId(
        '-1001234567890',
        100,
      );

      expect(message?.message).toBe('Second Edit');
      // Original message should still be the first one
      expect(message?.originalMessage).toBe('First Edit');
    });

    it('should update timestamp on edit', async () => {
      const editTime = new Date('2024-01-15T10:00:00Z');
      await telegramMessageRepository.updateMessageEdit(
        '-1001234567890',
        100,
        'Original Message',
        'Edited Message',
        editTime,
      );

      const message = await telegramMessageRepository.findByChannelAndMessageId(
        '-1001234567890',
        100,
      );

      expect(message?.updatedAt).toEqual(editTime);
    });
  });

  describe('updateAuditMetadata', () => {
    beforeEach(async () => {
      await telegramMessageRepository.create({
        channelCode: 'test-channel',
        channelId: '-1001234567890',
        messageId: 100,
        message: 'Original Message',
        sentAt: new Date(),
        receivedAt: new Date(),
        history: [],
      } as TelegramMessage);
    });

    it('should atomically update livePrice and extractedCommand fields', async () => {
      const livePrice = { bid: 2650.75, ask: 2651.25 };
      const command = 'LONG';
      const success = await telegramMessageRepository.updateAuditMetadata(
        '-1001234567890',
        100,
        livePrice,
        command,
      );

      expect(success).toBe(true);

      const message = await telegramMessageRepository.findByChannelAndMessageId(
        '-1001234567890',
        100,
      );

      expect(message?.meta?.livePrice).toEqual(livePrice);
      expect(message?.meta?.extractedCommand).toBe(command);
    });

    it('should return false if message not found', async () => {
      const success = await telegramMessageRepository.updateAuditMetadata(
        '-1001234567890',
        999,
        { bid: 2650.75, ask: 2651.25 },
        'LONG',
      );

      expect(success).toBe(false);
    });

    it('should support updating fields multiple times (atomic $set)', async () => {
      // First update
      await telegramMessageRepository.updateAuditMetadata(
        '-1001234567890',
        100,
        { bid: 2650.75, ask: 2651.25 },
        'LONG',
      );

      // Second update
      await telegramMessageRepository.updateAuditMetadata(
        '-1001234567890',
        100,
        { bid: 2655.25, ask: 2656.0 },
        'CLOSE_ALL',
      );

      const message = await telegramMessageRepository.findByChannelAndMessageId(
        '-1001234567890',
        100,
      );

      expect(message?.meta?.livePrice).toEqual({
        bid: 2655.25,
        ask: 2656.0,
      });
      expect(message?.meta?.extractedCommand).toBe('CLOSE_ALL');
    });
  });
});
