/**
 * Unit tests for TelegramClientService
 * Tests service methods with mocked dependencies
 */

import {
  ConfigRepository,
  TelegramChannelRepository,
  TelegramMessageRepository,
} from '@dal';
import {
  TelegramChannel,
  TelegramMessage,
  MessageHistoryTypeEnum,
} from '@dal/models';
import { DeleteMessageUpdate, Message, User } from '@mtcute/core';
import { TelegramClient } from '@mtcute/node';
import * as Sentry from '@sentry/node';
import {
  fakeLogger,
  suiteName,
} from '@telegram-trading-bot-mini/shared/test-utils';
import {
  LoggerInstance,
  ServiceName,
} from '@telegram-trading-bot-mini/shared/utils';

import {
  TELEGRAM_SESSION_KEY_ID,
  TelegramClientService,
} from '../../../src/services/telegram-client.service';

describe(suiteName(__filename), () => {
  let service: TelegramClientService;
  let mockConfigRepository: jest.Mocked<ConfigRepository>;
  let mockTelegramChannelRepository: jest.Mocked<TelegramChannelRepository>;
  let mockTelegramMessageRepository: jest.Mocked<TelegramMessageRepository>;
  let mockStreamPublisher: any;
  let mockLogger: LoggerInstance;
  let mockTelegramClient: jest.Mocked<TelegramClient>;
  let mockPushNotificationService: any;

  // Mock mtcute instance methods
  const mockClientInstance = {
    importSession: jest.fn(),
    start: jest.fn(),
    getMe: jest.fn(),
    destroy: jest.fn(),
    resolvePeer: jest.fn(),
    onNewMessage: {
      add: jest.fn(),
    },
    onEditMessage: {
      add: jest.fn(),
    },
    onDeleteMessage: {
      add: jest.fn(),
    },
  };

  beforeEach(() => {
    // Set environment variables for config
    process.env.TELEGRAM_API_ID = '12345';
    process.env.TELEGRAM_API_HASH = 'test-hash';
    process.env.TELEGRAM_SESSION = 'test-session-string';

    // Reset mocks
    jest.clearAllMocks();

    // Override global TelegramClient mock to return our controllable instance
    (TelegramClient as unknown as jest.Mock).mockImplementation(
      () => mockClientInstance,
    );

    // Create mock repositories
    mockConfigRepository = {
      getValue: jest.fn(),
    } as any;

    mockTelegramChannelRepository = {
      findActiveChannels: jest.fn(),
    } as any;

    mockTelegramMessageRepository = {
      findByChannelAndMessageId: jest.fn(),
      findLatestBefore: jest.fn(),
      markAsDeleted: jest.fn(),
      updateMessageEdit: jest.fn(),
      create: jest.fn(),
      addHistoryEntry: jest.fn(),
    } as any;

    // Create mock stream publisher
    mockStreamPublisher = {
      publish: jest.fn().mockResolvedValue('test-stream-id'),
      close: jest.fn().mockResolvedValue(undefined),
    };

    // Create mock logger
    mockLogger = fakeLogger;

    // Reset mock client methods
    Object.values(mockClientInstance).forEach((fn) => {
      if (jest.isMockFunction(fn)) {
        fn.mockReset();
      }
    });

    // Create mock push notification service
    mockPushNotificationService = {
      send: jest.fn().mockResolvedValue(undefined),
    };

    // Create service instance
    service = new TelegramClientService(
      mockConfigRepository,
      mockTelegramChannelRepository,
      mockTelegramMessageRepository,
      mockStreamPublisher,
      mockLogger,
      mockPushNotificationService,
    );

    // Use the shared mock client instance
    mockTelegramClient =
      mockClientInstance as unknown as jest.Mocked<TelegramClient>;
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.TELEGRAM_API_ID;
    delete process.env.TELEGRAM_API_HASH;
    delete process.env.TELEGRAM_SESSION;
    delete process.env.NOTIFICATION_ALERT_WHEN_TELEGRAM_MESSAGE_HAS_MEDIA;
  });

  describe('constructor', () => {
    it('should create service instance with dependencies', () => {
      expect(service).toBeInstanceOf(TelegramClientService);
    });
  });

  describe('connect', () => {
    const mockUser: User = {
      id: 123456789,
      username: 'testuser',
      displayName: 'Test User',
    } as User;

    beforeEach(() => {
      mockConfigRepository.getValue.mockResolvedValue('db-session-string');
      mockTelegramClient.importSession.mockResolvedValue(undefined);
      mockTelegramClient.start.mockResolvedValue(mockUser);
      mockTelegramClient.getMe.mockResolvedValue(mockUser);
      mockTelegramChannelRepository.findActiveChannels.mockResolvedValue([]);
    });

    it('should connect successfully with session from database', async () => {
      await service.connect();

      expect(mockConfigRepository.getValue).toHaveBeenCalledWith(
        TELEGRAM_SESSION_KEY_ID,
      );
      expect(TelegramClient).toHaveBeenCalledWith({
        apiId: 12345,
        apiHash: 'test-hash',
        storage: 'memory',
      });
      expect(mockTelegramClient.importSession).toHaveBeenCalledWith(
        'db-session-string',
      );
      expect(mockTelegramClient.start).toHaveBeenCalled();
      expect(mockTelegramClient.getMe).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Session imported successfully',
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Connected to Telegram');
    });

    it('should use environment session if database session is not available', async () => {
      mockConfigRepository.getValue.mockResolvedValue(null);

      await service.connect();

      expect(mockTelegramClient.importSession).toHaveBeenCalledWith(
        'test-session-string',
      );
    });

    it('should resolve and load active channels on connect', async () => {
      const mockChannels: TelegramChannel[] = [
        {
          channelCode: 'test-channel',
          url: 'https://t.me/c/2899092445/1',
          isActive: true,
          createdOn: new Date(),
          channelId: '123456789',
          accessHash: '987654321',
        } as TelegramChannel,
      ];

      mockTelegramChannelRepository.findActiveChannels.mockResolvedValue(
        mockChannels,
      );

      await service.connect();

      expect(
        mockTelegramChannelRepository.findActiveChannels,
      ).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        { count: 1 },
        'Loading active channels from database',
      );
    });

    it('should handle connection errors and report to Sentry', async () => {
      const error = new Error('Connection failed');
      mockTelegramClient.start.mockRejectedValue(error);

      await expect(service.connect()).rejects.toThrow('Connection failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        { err: error },
        'Failed to connect to Telegram',
      );
      expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });
  });

  describe('disconnect', () => {
    it('should disconnect successfully when client is connected', async () => {
      // First connect to set up client
      mockConfigRepository.getValue.mockResolvedValue('session');
      mockTelegramClient.importSession.mockResolvedValue(undefined);
      mockTelegramClient.start.mockResolvedValue({} as User);
      mockTelegramClient.getMe.mockResolvedValue({} as User);
      mockTelegramChannelRepository.findActiveChannels.mockResolvedValue([]);

      await service.connect();
      await service.disconnect();

      expect(mockTelegramClient.destroy).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Disconnected from Telegram',
      );
    });

    it('should handle disconnect errors and report to Sentry', async () => {
      mockConfigRepository.getValue.mockResolvedValue('session');
      mockTelegramClient.importSession.mockResolvedValue(undefined);
      mockTelegramClient.start.mockResolvedValue({} as User);
      mockTelegramClient.getMe.mockResolvedValue({} as User);
      mockTelegramChannelRepository.findActiveChannels.mockResolvedValue([]);

      await service.connect();

      const error = new Error('Disconnect failed');
      mockTelegramClient.destroy.mockRejectedValue(error);

      await expect(service.disconnect()).rejects.toThrow('Disconnect failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        { err: error },
        'Error during disconnect',
      );
      expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });

    it('should do nothing when client is not connected', async () => {
      await service.disconnect();

      expect(mockTelegramClient.destroy).not.toHaveBeenCalled();
    });
  });

  describe('getMe', () => {
    const mockUser: User = {
      id: 123456789,
      username: 'testuser',
      displayName: 'Test User',
    } as User;

    beforeEach(() => {
      mockConfigRepository.getValue.mockResolvedValue('session');
      mockTelegramClient.importSession.mockResolvedValue(undefined);
      mockTelegramClient.start.mockResolvedValue(mockUser);
      mockTelegramClient.getMe.mockResolvedValue(mockUser);
      mockTelegramChannelRepository.findActiveChannels.mockResolvedValue([]);
    });

    it('should return current user when connected', async () => {
      await service.connect();

      const user = await service.getMe();

      expect(user).toEqual(mockUser);
      expect(mockTelegramClient.getMe).toHaveBeenCalled();
    });

    it('should return cached user on subsequent calls', async () => {
      await service.connect();

      const user1 = await service.getMe();
      const user2 = await service.getMe();

      expect(user1).toEqual(mockUser);
      expect(user2).toEqual(mockUser);
      // getMe should only be called once during connect, not again
      expect(mockTelegramClient.getMe).toHaveBeenCalledTimes(1);
    });

    it('should throw error when client is not connected', async () => {
      await expect(service.getMe()).rejects.toThrow(
        'Client not connected. Call connect() first.',
      );
    });

    it('should handle getMe errors and report to Sentry', async () => {
      await service.connect();

      const error = new Error('Failed to get user');
      mockTelegramClient.getMe.mockRejectedValue(error);

      // Clear the cached user
      (service as any).currentUser = null;

      await expect(service.getMe()).rejects.toThrow('Failed to get user');

      expect(mockLogger.error).toHaveBeenCalledWith(
        { err: error },
        'Failed to get current user',
      );
      expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });
  });

  describe('processMessage', () => {
    const mockChannel: TelegramChannel = {
      channelCode: 'test-channel',
      url: 'https://t.me/test',
      isActive: true,
      createdOn: new Date(),
      channelId: '12345',
      accessHash: 'hash',
    } as TelegramChannel;

    const mockMessage = {
      id: 100,
      date: new Date(),
      text: 'Hello World',
      chat: { id: 12345 },
    };

    beforeEach(() => {
      mockTelegramMessageRepository.findByChannelAndMessageId.mockResolvedValue(
        null,
      );
      mockTelegramMessageRepository.findLatestBefore.mockResolvedValue(null);
      mockTelegramMessageRepository.create.mockResolvedValue({} as any);
      mockTelegramMessageRepository.addHistoryEntry = jest
        .fn()
        .mockResolvedValue(true);
    });

    it('should process text message and persist with new fields', async () => {
      await (service as any).processMessage({
        message: mockMessage,
        channel: mockChannel,
      });

      expect(mockTelegramMessageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          channelCode: 'test-channel',
          channelId: '12345',
          messageId: 100,
          message: 'Hello World',
          hasMedia: false,
          hashTags: [],
          meta: expect.objectContaining({
            traceToken: expect.stringContaining('100'), // traceToken format: {messageId}{channelId}
          }),
          history: [], // Verify history initialization
        }),
      );
    });

    it('should process non-text message and persist', async () => {
      const nonTextMessage = {
        ...mockMessage,
        text: undefined,
      };

      await (service as any).processMessage({
        message: nonTextMessage,
        channel: mockChannel,
      });

      expect(mockTelegramMessageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          channelCode: 'test-channel',
          channelId: '12345',
          messageId: 100,
          message: '', // Should be empty string
          hasMedia: false,
          hashTags: [],
        }),
      );
    });

    it('should handle errors and finish transaction', async () => {
      const error = new Error('Processing failed');
      mockTelegramMessageRepository.create.mockRejectedValue(error);

      await expect(
        (service as any).processMessage({
          message: mockMessage,
          channel: mockChannel,
        }),
      ).rejects.toThrow('Processing failed');

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should publish message to Redis Stream and track history on success', async () => {
      await (service as any).processMessage({
        message: mockMessage,
        channel: mockChannel,
      });

      // Verify stream publisher was called with channelId and traceToken in payload
      expect(mockStreamPublisher.publish).toHaveBeenCalledWith(
        'messages',
        expect.objectContaining({
          version: '1.0',
          type: 'NEW_MESSAGE',
          payload: expect.objectContaining({
            channelCode: 'test-channel',
            channelId: '12345',
            messageId: 100,
            traceToken: expect.stringContaining('100'), // traceToken format: {messageId}{channelId}
          }),
        }),
      );

      // Verify history tracking uses channelId and includes traceToken
      expect(
        mockTelegramMessageRepository.addHistoryEntry,
      ).toHaveBeenCalledWith(
        '12345', // channelId, not channelCode
        100,
        expect.objectContaining({
          fromService: 'telegram-service',
          targetService: 'interpret-service',
          traceToken: expect.stringContaining('100'),
          streamEvent: expect.objectContaining({
            messageEventType: 'NEW_MESSAGE',
            messageId: 'test-stream-id',
          }),
        }),
      );
    });

    it('should track history with error when stream publishing fails', async () => {
      const streamError = new Error('Stream publish failed');
      mockStreamPublisher.publish.mockRejectedValue(streamError);

      await (service as any).processMessage({
        message: mockMessage,
        channel: mockChannel,
      });

      // Verify stream publisher was called
      expect(mockStreamPublisher.publish).toHaveBeenCalled();

      // Verify history tracking with error uses channelId
      expect(
        mockTelegramMessageRepository.addHistoryEntry,
      ).toHaveBeenCalledWith(
        '12345', // channelId, not channelCode
        100,
        expect.objectContaining({
          fromService: 'telegram-service',
          targetService: 'interpret-service',
          errorMessage: 'Stream publish failed',
        }),
      );

      // Verify error logging
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: streamError }),
        'Failed to publish message to stream',
      );
    });

    it('should not publish to stream if persistence fails', async () => {
      const error = new Error('Database error');
      mockTelegramMessageRepository.create.mockRejectedValue(error);

      await expect(
        (service as any).processMessage({
          message: mockMessage,
          channel: mockChannel,
        }),
      ).rejects.toThrow('Database error');

      // Stream publisher should not be called if persistence fails
      expect(mockStreamPublisher.publish).not.toHaveBeenCalled();
      // History tracking should not be called
      expect(
        mockTelegramMessageRepository.addHistoryEntry,
      ).not.toHaveBeenCalled();
    });

    it('should not publish to stream if message text is empty (media-only message)', async () => {
      const emptyTextMessage = {
        ...mockMessage,
        text: '', // Empty text (e.g., media-only message)
        media: {
          type: 'photo',
        } as any,
      };

      await (service as any).processMessage({
        message: emptyTextMessage as any,
        channel: mockChannel,
      });

      // Message should be persisted
      expect(mockTelegramMessageRepository.create).toHaveBeenCalled();

      // Stream publisher should NOT be called for empty messages
      expect(mockStreamPublisher.publish).not.toHaveBeenCalled();

      // History tracking should NOT be called
      expect(
        mockTelegramMessageRepository.addHistoryEntry,
      ).not.toHaveBeenCalled();

      // Debug log should indicate skipping
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          channelCode: 'test-channel',
          messageId: 100,
          hasMedia: true,
        }),
        'Skipping NEW_MESSAGE event - empty message text (likely media-only message)',
      );
    });

    describe('push notifications', () => {
      it('should send notification when config enabled and media detected', async () => {
        // Enable notification config
        process.env.NOTIFICATION_ALERT_WHEN_TELEGRAM_MESSAGE_HAS_MEDIA = 'yes';

        const messageWithMedia = {
          ...mockMessage,
          media: {
            type: 'photo',
          } as any,
        };

        await (service as any).processMessage({
          message: messageWithMedia as any,
          channel: mockChannel,
        });

        expect(mockPushNotificationService.send).toHaveBeenCalledWith({
          m: 'test-channel - photo detected in message',
          t: 'Telegram Media Alert',
          d: 'a',
          v: '1',
          traceToken: 'telegram-test-channel-100',
        });
      });

      it('should NOT send notification when config disabled', async () => {
        // Disable notification config
        process.env.NOTIFICATION_ALERT_WHEN_TELEGRAM_MESSAGE_HAS_MEDIA = 'no';

        const messageWithMedia = {
          ...mockMessage,
          media: {
            type: 'photo',
          } as any,
        };

        await (service as any).processMessage({
          message: messageWithMedia as any,
          channel: mockChannel,
        });

        expect(mockPushNotificationService.send).not.toHaveBeenCalled();
      });

      it('should NOT send notification when no media', async () => {
        // Enable notification config
        process.env.NOTIFICATION_ALERT_WHEN_TELEGRAM_MESSAGE_HAS_MEDIA = 'yes';

        await (service as any).processMessage({
          message: mockMessage as any, // No media
          channel: mockChannel,
        });

        expect(mockPushNotificationService.send).not.toHaveBeenCalled();
      });

      it('should handle notification errors gracefully', async () => {
        // Enable notification config
        process.env.NOTIFICATION_ALERT_WHEN_TELEGRAM_MESSAGE_HAS_MEDIA = 'yes';

        const notificationError = new Error('Notification failed');
        mockPushNotificationService.send.mockRejectedValue(notificationError);

        const messageWithMedia = {
          ...mockMessage,
          media: {
            type: 'video',
          } as any,
        };

        // Should not throw - error is handled gracefully
        await expect(
          (service as any).processMessage({
            message: messageWithMedia as any,
            channel: mockChannel,
          }),
        ).resolves.not.toThrow();

        // Message should still be processed and published
        expect(mockTelegramMessageRepository.create).toHaveBeenCalled();
        expect(mockStreamPublisher.publish).toHaveBeenCalled();

        // Warning should be logged
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            err: notificationError,
          }),
          'Failed to send media alert notification',
        );
      });
    });
  });

  describe('handleEditMessage', () => {
    const mockChannel: TelegramChannel = {
      channelCode: 'test-channel',
      url: 'https://t.me/test',
      isActive: true,
      createdOn: new Date(),
      channelId: '123456789',
      accessHash: 'hash',
    } as TelegramChannel;

    const mockExistingMessage: TelegramMessage = {
      channelCode: 'test-channel',
      channelId: '123456789',
      messageId: 100,
      message: 'Original message text',
      hasMedia: false,
      hashTags: [],
      sentAt: new Date(),
      receivedAt: new Date(),
      history: [],
    } as TelegramMessage;

    beforeEach(async () => {
      // Set up service with active channel
      mockConfigRepository.getValue.mockResolvedValue('session');
      mockTelegramClient.importSession.mockResolvedValue(undefined);
      mockTelegramClient.start.mockResolvedValue({} as User);
      mockTelegramClient.getMe.mockResolvedValue({} as User);
      mockTelegramChannelRepository.findActiveChannels.mockResolvedValue([
        mockChannel,
      ]);

      await service.connect();

      // Reset mocks after connect
      jest.clearAllMocks();
    });

    it('should update message edit, add history, and re-publish for re-interpretation', async () => {
      const mockEditMessage = {
        id: 100,
        text: 'Edited message text',
        date: new Date(),
        chat: { id: 123456789 },
      } as unknown as Message;

      mockTelegramMessageRepository.findByChannelAndMessageId.mockResolvedValue(
        mockExistingMessage,
      );
      mockTelegramMessageRepository.updateMessageEdit.mockResolvedValue(true);
      mockTelegramMessageRepository.addHistoryEntry.mockResolvedValue(true);

      // Mock publishMessageEvent (it's a private method, so we spy on streamPublisher)
      mockStreamPublisher.publish.mockResolvedValue('stream-message-id');

      await (service as any).handleEditMessage(mockEditMessage);

      // Verify message update
      expect(
        mockTelegramMessageRepository.findByChannelAndMessageId,
      ).toHaveBeenCalledWith('123456789', 100);
      expect(
        mockTelegramMessageRepository.updateMessageEdit,
      ).toHaveBeenCalledWith(
        '123456789',
        100,
        'Original message text',
        'Edited message text',
        expect.any(Date),
      );

      // Verify edit history entry
      expect(
        mockTelegramMessageRepository.addHistoryEntry,
      ).toHaveBeenCalledWith(
        '123456789',
        100,
        expect.objectContaining({
          type: MessageHistoryTypeEnum.EDIT_MESSAGE,
          fromService: ServiceName.TELEGRAM_SERVICE,
          targetService: ServiceName.TELEGRAM_SERVICE,
        }),
      );

      // Verify message re-published for re-interpretation
      expect(mockStreamPublisher.publish).toHaveBeenCalledWith(
        'messages',
        expect.objectContaining({
          version: '1.0',
          type: 'NEW_MESSAGE',
          payload: expect.objectContaining({
            channelCode: 'test-channel',
            channelId: '123456789',
            messageId: 100,
          }),
        }),
      );

      // Verify notification is NOT sent (removed in favor of automatic handling)
      expect(mockPushNotificationService.send).not.toHaveBeenCalled();

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          channelCode: 'test-channel',
          channelId: '123456789',
          messageId: 100,
        }),
        'Message edit event received',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          channelCode: 'test-channel',
        }),
        'Message edit processed successfully',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          channelCode: 'test-channel',
          messageId: 100,
        }),
        'Edited message re-published for re-interpretation',
      );
    });

    it('should ignore edit event for message not in database', async () => {
      const mockEditMessage = {
        id: 100,
        text: 'Edited message text',
        date: new Date(),
        chat: { id: 123456789 },
      } as unknown as Message;

      mockTelegramMessageRepository.findByChannelAndMessageId.mockResolvedValue(
        null,
      );

      await (service as any).handleEditMessage(mockEditMessage);

      expect(
        mockTelegramMessageRepository.findByChannelAndMessageId,
      ).toHaveBeenCalledWith('123456789', 100);
      expect(
        mockTelegramMessageRepository.updateMessageEdit,
      ).not.toHaveBeenCalled();
      expect(
        mockTelegramMessageRepository.addHistoryEntry,
      ).not.toHaveBeenCalled();
      expect(mockPushNotificationService.send).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          channelCode: 'test-channel',
          channelId: '123456789',
          messageId: 100,
        }),
        'Edit event for message not in database - ignoring',
      );
    });

    it('should ignore edit event for non-active channel', async () => {
      const mockEditMessage = {
        id: 100,
        text: 'Edited message text',
        date: new Date(),
        chat: { id: '999999999' }, // Different channel
      } as unknown as Message;

      await (service as any).handleEditMessage(mockEditMessage);

      expect(
        mockTelegramMessageRepository.findByChannelAndMessageId,
      ).not.toHaveBeenCalled();
      expect(
        mockTelegramMessageRepository.updateMessageEdit,
      ).not.toHaveBeenCalled();
      expect(mockPushNotificationService.send).not.toHaveBeenCalled();
    });

    it('should return early when message has no channelId', async () => {
      const mockEditMessage = {
        id: 100,
        text: 'Edited message text',
        date: new Date(),
        chat: null,
      } as unknown as Message;

      await (service as any).handleEditMessage(mockEditMessage);

      expect(
        mockTelegramMessageRepository.findByChannelAndMessageId,
      ).not.toHaveBeenCalled();
      expect(
        mockTelegramMessageRepository.updateMessageEdit,
      ).not.toHaveBeenCalled();
    });

    it('should handle database update failure gracefully', async () => {
      const mockEditMessage = {
        id: 100,
        text: 'Edited message text',
        date: new Date(),
        chat: { id: 123456789 },
      } as unknown as Message;

      mockTelegramMessageRepository.findByChannelAndMessageId.mockResolvedValue(
        mockExistingMessage,
      );
      mockTelegramMessageRepository.updateMessageEdit.mockResolvedValue(false);

      await (service as any).handleEditMessage(mockEditMessage);

      expect(
        mockTelegramMessageRepository.updateMessageEdit,
      ).toHaveBeenCalled();
      expect(
        mockTelegramMessageRepository.addHistoryEntry,
      ).not.toHaveBeenCalled();
      expect(mockPushNotificationService.send).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          channelCode: 'test-channel',
          channelId: '123456789',
          messageId: 100,
        }),
        'Failed to update message edit in database',
      );
    });

    it('should handle errors and report to Sentry', async () => {
      const mockEditMessage = {
        id: 100,
        text: 'Edited message text',
        date: new Date(),
        chat: { id: 123456789 },
      } as unknown as Message;

      const error = new Error('Database error');
      mockTelegramMessageRepository.findByChannelAndMessageId.mockRejectedValue(
        error,
      );

      await (service as any).handleEditMessage(mockEditMessage);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: error, messageId: 100 }),
        'Error handling edit message',
      );
      expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });

    it('should handle message with empty text', async () => {
      const mockEditMessage = {
        id: 100,
        text: undefined,
        date: new Date(),
        chat: { id: 123456789 },
      } as unknown as Message;

      mockTelegramMessageRepository.findByChannelAndMessageId.mockResolvedValue(
        mockExistingMessage,
      );
      mockTelegramMessageRepository.updateMessageEdit.mockResolvedValue(true);
      mockTelegramMessageRepository.addHistoryEntry.mockResolvedValue(true);

      await (service as any).handleEditMessage(mockEditMessage);

      expect(
        mockTelegramMessageRepository.updateMessageEdit,
      ).toHaveBeenCalledWith(
        '123456789',
        100,
        'Original message text',
        '', // Empty string when text is undefined
        expect.any(Date),
      );
    });

    it('should ignore edit event when message content is unchanged', async () => {
      const mockEditMessage = {
        id: 100,
        text: 'Original message text', // Same as existing message
        date: new Date(),
        chat: { id: 123456789 },
      } as unknown as Message;

      mockTelegramMessageRepository.findByChannelAndMessageId.mockResolvedValue(
        mockExistingMessage,
      );

      await (service as any).handleEditMessage(mockEditMessage);

      expect(
        mockTelegramMessageRepository.findByChannelAndMessageId,
      ).toHaveBeenCalledWith('123456789', 100);
      expect(
        mockTelegramMessageRepository.updateMessageEdit,
      ).not.toHaveBeenCalled();
      expect(
        mockTelegramMessageRepository.addHistoryEntry,
      ).not.toHaveBeenCalled();
      expect(mockPushNotificationService.send).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          channelCode: 'test-channel',
          channelId: '123456789',
          messageId: 100,
        }),
        'Edit event received but message content unchanged - ignoring',
      );
    });

    it('should handle re-publish errors gracefully (non-fatal)', async () => {
      const mockEditMessage = {
        id: 100,
        text: 'Edited message text',
        date: new Date(),
        chat: { id: 123456789 },
      } as unknown as Message;

      mockTelegramMessageRepository.findByChannelAndMessageId.mockResolvedValue(
        mockExistingMessage,
      );
      mockTelegramMessageRepository.updateMessageEdit.mockResolvedValue(true);
      mockTelegramMessageRepository.addHistoryEntry.mockResolvedValue(true);

      // Mock re-publish failure
      const publishError = new Error('Stream publish failed');
      mockStreamPublisher.publish.mockRejectedValue(publishError);

      // Should not throw - error is handled gracefully
      await expect(
        (service as any).handleEditMessage(mockEditMessage),
      ).resolves.not.toThrow();

      // Verify message was still updated and history added
      expect(
        mockTelegramMessageRepository.updateMessageEdit,
      ).toHaveBeenCalled();
      expect(mockTelegramMessageRepository.addHistoryEntry).toHaveBeenCalled();

      // Verify error was logged (from publishMessageEvent)
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: publishError,
          channelId: '123456789',
          messageId: 100,
        }),
        'Failed to publish message to stream',
      );

      // Verify Sentry was notified
      expect(Sentry.captureException).toHaveBeenCalledWith(
        publishError,
        expect.objectContaining({
          extra: expect.objectContaining({
            channelId: '123456789',
            messageId: 100,
          }),
        }),
      );
    });
  });

  describe('handleMessageDeletion', () => {
    const mockChannel: TelegramChannel = {
      channelCode: 'test-channel',
      url: 'https://t.me/test',
      isActive: true,
      createdOn: new Date(),
      channelId: '123456789',
      accessHash: 'hash',
    } as TelegramChannel;

    beforeEach(async () => {
      // Set up service with active channel
      mockConfigRepository.getValue.mockResolvedValue('session');
      mockTelegramClient.importSession.mockResolvedValue(undefined);
      mockTelegramClient.start.mockResolvedValue({} as User);
      mockTelegramClient.getMe.mockResolvedValue({} as User);
      mockTelegramChannelRepository.findActiveChannels.mockResolvedValue([
        mockChannel,
      ]);

      await service.connect();

      // Reset mocks after connect
      jest.clearAllMocks();
    });

    it('should mark messages as deleted for active channel', async () => {
      const mockDeleteUpdate: DeleteMessageUpdate = {
        channelId: 123456789,
        messageIds: [100, 101, 102],
      } as DeleteMessageUpdate;

      mockTelegramMessageRepository.markAsDeleted
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true);

      await (service as any).handleMessageDeletion(mockDeleteUpdate);

      expect(mockTelegramMessageRepository.markAsDeleted).toHaveBeenCalledTimes(
        3,
      );
      expect(mockTelegramMessageRepository.markAsDeleted).toHaveBeenCalledWith(
        '123456789',
        100,
      );
      expect(mockTelegramMessageRepository.markAsDeleted).toHaveBeenCalledWith(
        '123456789',
        101,
      );
      expect(mockTelegramMessageRepository.markAsDeleted).toHaveBeenCalledWith(
        '123456789',
        102,
      );
      expect(mockLogger.debug).toHaveBeenCalledTimes(3);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          channelCode: 'test-channel',
          channelId: '123456789',
          messageId: 100,
        }),
        'Message marked as deleted',
      );
    });

    it('should ignore deletion for non-active channel', async () => {
      const mockDeleteUpdate: DeleteMessageUpdate = {
        channelId: 999999999, // Different channel
        messageIds: [100],
      } as DeleteMessageUpdate;

      await (service as any).handleMessageDeletion(mockDeleteUpdate);

      expect(
        mockTelegramMessageRepository.markAsDeleted,
      ).not.toHaveBeenCalled();
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should handle multiple message IDs in deletion update', async () => {
      const mockDeleteUpdate: DeleteMessageUpdate = {
        channelId: 123456789,
        messageIds: [200, 201],
      } as DeleteMessageUpdate;

      mockTelegramMessageRepository.markAsDeleted
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false); // Second one fails

      await (service as any).handleMessageDeletion(mockDeleteUpdate);

      expect(mockTelegramMessageRepository.markAsDeleted).toHaveBeenCalledTimes(
        2,
      );
      // Only first one should log debug (second returned false)
      expect(mockLogger.debug).toHaveBeenCalledTimes(1);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: 200 }),
        'Message marked as deleted',
      );
    });

    it('should handle database markAsDeleted failure gracefully', async () => {
      const mockDeleteUpdate: DeleteMessageUpdate = {
        channelId: 123456789,
        messageIds: [300],
      } as DeleteMessageUpdate;

      const error = new Error('Database error');
      mockTelegramMessageRepository.markAsDeleted.mockRejectedValue(error);

      await (service as any).handleMessageDeletion(mockDeleteUpdate);

      expect(mockTelegramMessageRepository.markAsDeleted).toHaveBeenCalledWith(
        '123456789',
        300,
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: error, update: mockDeleteUpdate }),
        'Error handling message deletion',
      );
      expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });

    it('should handle deletion update with null channelId', async () => {
      const mockDeleteUpdate: DeleteMessageUpdate = {
        channelId: null as any,
        messageIds: [100],
      } as DeleteMessageUpdate;

      await (service as any).handleMessageDeletion(mockDeleteUpdate);

      // Should convert null to empty string and not find channel
      expect(
        mockTelegramMessageRepository.markAsDeleted,
      ).not.toHaveBeenCalled();
    });

    it('should handle empty messageIds array', async () => {
      const mockDeleteUpdate: DeleteMessageUpdate = {
        channelId: 123456789,
        messageIds: [],
      } as DeleteMessageUpdate;

      await (service as any).handleMessageDeletion(mockDeleteUpdate);

      expect(
        mockTelegramMessageRepository.markAsDeleted,
      ).not.toHaveBeenCalled();
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });
  });

  describe('Helper Methods', () => {
    describe('extractChannelId', () => {
      it('should return channelId as string when chat.id exists', () => {
        const message = {
          id: 100,
          chat: { id: 123456789 },
        } as unknown as Message;

        const result = (service as any).extractChannelId(message);
        expect(result).toBe('123456789');
      });

      it('should return null when chat is missing', () => {
        const message = {
          id: 100,
          chat: null,
        } as unknown as Message;

        const result = (service as any).extractChannelId(message);
        expect(result).toBeNull();
      });

      it('should throw error when chat.id is missing', () => {
        const message = {
          id: 100,
          chat: {},
        } as unknown as Message;

        expect(() => (service as any).extractChannelId(message)).toThrow();
      });

      it('should convert numeric channelId to string', () => {
        const message = {
          id: 100,
          chat: { id: 987654321 },
        } as unknown as Message;

        const result = (service as any).extractChannelId(message);
        expect(result).toBe('987654321');
        expect(typeof result).toBe('string');
      });
    });

    describe('extractMessageText', () => {
      it('should return text when message.text exists', () => {
        const message = {
          id: 100,
          text: 'Hello World',
        } as unknown as Message;

        const result = (service as any).extractMessageText(message);
        expect(result).toBe('Hello World');
      });

      it('should return null when message.text is missing', () => {
        const message = {
          id: 100,
          text: undefined,
        } as unknown as Message;

        const result = (service as any).extractMessageText(message);
        expect(result).toBeNull();
      });

      it('should return null for non-text messages', () => {
        const message = {
          id: 100,
          // No text property
        } as unknown as Message;

        const result = (service as any).extractMessageText(message);
        expect(result).toBeNull();
      });
    });

    describe('extractHashTags', () => {
      it('should extract hashtags from text', () => {
        const text = 'Check out #BTC and #ETH prices';
        const result = (service as any).extractHashTags(text);
        expect(result).toEqual(['#btc', '#eth']);
      });

      it('should return lowercase hashtags', () => {
        const text = '#Bitcoin #Ethereum #Litecoin';
        const result = (service as any).extractHashTags(text);
        expect(result).toEqual(['#bitcoin', '#ethereum', '#litecoin']);
      });

      it('should return empty array for text without hashtags', () => {
        const text = 'This is a regular message without hashtags';
        const result = (service as any).extractHashTags(text);
        expect(result).toEqual([]);
      });

      it('should return empty array for empty string', () => {
        const result = (service as any).extractHashTags('');
        expect(result).toEqual([]);
      });

      it('should return empty array for null text', () => {
        const result = (service as any).extractHashTags(null as any);
        expect(result).toEqual([]);
      });

      it('should handle multiple hashtags', () => {
        const text = '#crypto #trading #bitcoin #ethereum #defi';
        const result = (service as any).extractHashTags(text);
        expect(result).toEqual([
          '#crypto',
          '#trading',
          '#bitcoin',
          '#ethereum',
          '#defi',
        ]);
      });

      it('should handle hashtags with underscores', () => {
        const text = 'Check #test_tag and #another_tag';
        const result = (service as any).extractHashTags(text);
        expect(result).toEqual(['#test_tag', '#another_tag']);
      });

      it('should handle hashtags with numbers', () => {
        const text = 'Version #2.0 and #3_0';
        const result = (service as any).extractHashTags(text);
        expect(result).toEqual(['#2', '#3_0']);
      });
    });

    describe('extractMediaInfo', () => {
      it('should return hasMedia: false when no media', () => {
        const message = {
          id: 100,
          text: 'No media',
        } as unknown as Message;

        const result = (service as any).extractMediaInfo(message);
        expect(result).toEqual({ hasMedia: false });
      });

      it('should detect photo media type', () => {
        const message = {
          id: 100,
          media: { type: 'photo' },
        } as unknown as Message;

        const result = (service as any).extractMediaInfo(message);
        expect(result).toEqual({ hasMedia: true, mediaType: 'photo' });
      });

      it('should detect video media type', () => {
        const message = {
          id: 100,
          media: { type: 'video' },
        } as unknown as Message;

        const result = (service as any).extractMediaInfo(message);
        expect(result).toEqual({ hasMedia: true, mediaType: 'video' });
      });

      it('should detect document media type', () => {
        const message = {
          id: 100,
          media: { type: 'document' },
        } as unknown as Message;

        const result = (service as any).extractMediaInfo(message);
        expect(result).toEqual({ hasMedia: true, mediaType: 'document' });
      });

      it('should detect audio media type', () => {
        const message = {
          id: 100,
          media: { type: 'audio' },
        } as unknown as Message;

        const result = (service as any).extractMediaInfo(message);
        expect(result).toEqual({ hasMedia: true, mediaType: 'audio' });
      });

      it('should detect voice media type', () => {
        const message = {
          id: 100,
          media: { type: 'voice' },
        } as unknown as Message;

        const result = (service as any).extractMediaInfo(message);
        expect(result).toEqual({ hasMedia: true, mediaType: 'voice' });
      });

      it('should detect sticker media type', () => {
        const message = {
          id: 100,
          media: { type: 'sticker' },
        } as unknown as Message;

        const result = (service as any).extractMediaInfo(message);
        expect(result).toEqual({ hasMedia: true, mediaType: 'sticker' });
      });

      it('should detect animation media type via document attributes in default case', () => {
        const message = {
          id: 100,
          media: {
            type: 'unknown_type', // Not 'document', so goes to default case
            document: {
              attributes: [{ _: 'documentAttributeAnimated' }],
            },
          },
        } as unknown as Message;

        const result = (service as any).extractMediaInfo(message);
        expect(result).toEqual({ hasMedia: true, mediaType: 'animation' });
      });

      it('should return other for unknown media types', () => {
        const message = {
          id: 100,
          media: { type: 'unknown_type' },
        } as unknown as Message;

        const result = (service as any).extractMediaInfo(message);
        expect(result).toEqual({ hasMedia: true, mediaType: 'other' });
      });

      it('should return document for document with non-animation attributes', () => {
        const message = {
          id: 100,
          media: {
            type: 'document',
            document: {
              attributes: [{ _: 'documentAttributeVideo' }],
            },
          },
        } as unknown as Message;

        const result = (service as any).extractMediaInfo(message);
        expect(result).toEqual({ hasMedia: true, mediaType: 'document' });
      });

      it('should return document for document without attributes', () => {
        const message = {
          id: 100,
          media: {
            type: 'document',
            document: {},
          },
        } as unknown as Message;

        const result = (service as any).extractMediaInfo(message);
        expect(result).toEqual({ hasMedia: true, mediaType: 'document' });
      });
    });
  });

  describe('resolveChannels', () => {
    const mockUser: User = {
      id: 123456789,
      username: 'testuser',
      displayName: 'Test User',
    } as User;

    beforeEach(() => {
      mockConfigRepository.getValue.mockResolvedValue('session');
      mockTelegramClient.importSession.mockResolvedValue(undefined);
      mockTelegramClient.start.mockResolvedValue(mockUser);
      mockTelegramClient.getMe.mockResolvedValue(mockUser);
    });

    it('should skip channel missing channelId', async () => {
      const channels: TelegramChannel[] = [
        {
          channelCode: 'test-channel',
          url: 'https://t.me/test',
          isActive: true,
          createdOn: new Date(),
          channelId: undefined as any,
          accessHash: 'hash',
        } as TelegramChannel,
      ];

      mockTelegramChannelRepository.findActiveChannels.mockResolvedValue(
        channels,
      );

      await service.connect();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { channelCode: 'test-channel' },
        'Channel missing channelId or accessHash - skipping',
      );
      expect((service as any).activeChannels.size).toBe(0);
    });

    it('should skip channel missing accessHash', async () => {
      const channels: TelegramChannel[] = [
        {
          channelCode: 'test-channel',
          url: 'https://t.me/test',
          isActive: true,
          createdOn: new Date(),
          channelId: '123456789',
          accessHash: undefined as any,
        } as TelegramChannel,
      ];

      mockTelegramChannelRepository.findActiveChannels.mockResolvedValue(
        channels,
      );

      await service.connect();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { channelCode: 'test-channel' },
        'Channel missing channelId or accessHash - skipping',
      );
      expect((service as any).activeChannels.size).toBe(0);
    });

    it('should skip channel missing both channelId and accessHash', async () => {
      const channels: TelegramChannel[] = [
        {
          channelCode: 'test-channel',
          url: 'https://t.me/test',
          isActive: true,
          createdOn: new Date(),
          channelId: undefined as any,
          accessHash: undefined as any,
        } as TelegramChannel,
      ];

      mockTelegramChannelRepository.findActiveChannels.mockResolvedValue(
        channels,
      );

      await service.connect();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { channelCode: 'test-channel' },
        'Channel missing channelId or accessHash - skipping',
      );
      expect((service as any).activeChannels.size).toBe(0);
    });

    it('should handle repository error and report to Sentry', async () => {
      const error = new Error('Database connection failed');
      mockTelegramChannelRepository.findActiveChannels.mockRejectedValue(error);

      await expect(service.connect()).rejects.toThrow(
        'Database connection failed',
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        { err: error },
        'Failed to resolve channels',
      );
      expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });

    it('should handle empty active channels list gracefully', async () => {
      mockTelegramChannelRepository.findActiveChannels.mockResolvedValue([]);

      await service.connect();

      expect(mockLogger.info).toHaveBeenCalledWith(
        { count: 0 },
        'Loading active channels from database',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        { count: 0 },
        'Active channels loaded into memory',
      );
      expect((service as any).activeChannels.size).toBe(0);
    });

    it('should handle channel loading error for individual channel', async () => {
      const channels: TelegramChannel[] = [
        {
          channelCode: 'test-channel',
          url: 'https://t.me/test',
          isActive: true,
          createdOn: new Date(),
          channelId: '123456789',
          accessHash: 'hash',
        } as TelegramChannel,
      ];

      mockTelegramChannelRepository.findActiveChannels.mockResolvedValue(
        channels,
      );

      // Mock an error when trying to access channel property
      // This simulates an error during channel processing
      const originalSet = Map.prototype.set;
      jest.spyOn(Map.prototype, 'set').mockImplementationOnce(() => {
        throw new Error('Failed to set channel');
      });

      await service.connect();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.any(Error),
          channelCode: 'test-channel',
        }),
        'Failed to load channel',
      );
      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          extra: { channelCode: 'test-channel' },
        }),
      );

      // Restore original implementation
      Map.prototype.set = originalSet;
    });

    it('should load valid channels successfully', async () => {
      const channels: TelegramChannel[] = [
        {
          channelCode: 'test-channel-1',
          url: 'https://t.me/test1',
          isActive: true,
          createdOn: new Date(),
          channelId: '111111111',
          accessHash: 'hash1',
        } as TelegramChannel,
        {
          channelCode: 'test-channel-2',
          url: 'https://t.me/test2',
          isActive: true,
          createdOn: new Date(),
          channelId: '222222222',
          accessHash: 'hash2',
        } as TelegramChannel,
      ];

      mockTelegramChannelRepository.findActiveChannels.mockResolvedValue(
        channels,
      );

      await service.connect();

      expect((service as any).activeChannels.size).toBe(2);
      expect((service as any).activeChannels.get('111111111')).toBeDefined();
      expect((service as any).activeChannels.get('222222222')).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        { count: 2 },
        'Active channels loaded into memory',
      );
    });

    it('should skip invalid channels but load valid ones', async () => {
      const channels: TelegramChannel[] = [
        {
          channelCode: 'invalid-channel',
          url: 'https://t.me/invalid',
          isActive: true,
          createdOn: new Date(),
          channelId: undefined as any,
          accessHash: 'hash',
        } as TelegramChannel,
        {
          channelCode: 'valid-channel',
          url: 'https://t.me/valid',
          isActive: true,
          createdOn: new Date(),
          channelId: '123456789',
          accessHash: 'hash',
        } as TelegramChannel,
      ];

      mockTelegramChannelRepository.findActiveChannels.mockResolvedValue(
        channels,
      );

      await service.connect();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { channelCode: 'invalid-channel' },
        'Channel missing channelId or accessHash - skipping',
      );
      expect((service as any).activeChannels.size).toBe(1);
      expect((service as any).activeChannels.get('123456789')).toBeDefined();
    });
  });
});
