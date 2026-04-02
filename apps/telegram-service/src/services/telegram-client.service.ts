import {
  ConfigRepository,
  TelegramChannelRepository,
  TelegramMessageRepository,
} from '@dal';
import {
  TelegramChannel,
  TelegramMessage,
  TelegramMessageHistory,
  MessageHistoryTypeEnum,
} from '@dal/models';
import { DeleteMessageUpdate, Message, User } from '@mtcute/core';
import { TelegramClient, tl } from '@mtcute/node';
import * as Sentry from '@sentry/node';
import {
  createQueue,
  LoggerInstance,
  Queue,
  IStreamPublisher,
  StreamTopic,
  ServiceName,
  PushNotificationService,
  ConfigYesNo,
  generateTraceToken,
} from '@telegram-trading-bot-mini/shared/utils';

import { config } from '../config';
import { TelegramSessionNotFoundError } from '../errors/telegram-session-not-found.error';
import { ITelegramClientService } from '../interfaces';
import { parseTelegramConfig, TelegramConfig } from '../types';
import { MessageType } from '@telegram-trading-bot-mini/shared/utils/interfaces/messages/message-type';

interface MessageTask {
  message: Message;
  channel: TelegramChannel;
}

export const TELEGRAM_SESSION_KEY_ID = 'telegram-session';

export class TelegramClientService implements ITelegramClientService {
  private client: TelegramClient | null = null;
  // Map between channelId (Telegram's identifier) and TelegramChannel
  private activeChannels: Map<string, TelegramChannel> = new Map();
  // Map between channelId and queue of messages to be processed
  private channelQueues: Map<string, Queue<MessageTask>> = new Map();
  private currentUser: User | null = null;

  constructor(
    private readonly configRepository: ConfigRepository,
    private readonly telegramChannelRepository: TelegramChannelRepository,
    private readonly telegramMessageRepository: TelegramMessageRepository,
    private readonly streamPublisher: IStreamPublisher,
    private readonly logger: LoggerInstance,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  async connect(): Promise<void> {
    try {
      const telegramConfig = await this.getTelegramConfig();

      // Initialize mtcute client
      this.client = new TelegramClient({
        apiId: telegramConfig.apiId,
        apiHash: telegramConfig.apiHash,
        storage: 'memory',
      });

      // Import the session string
      await this.client.importSession(telegramConfig.session!);
      this.logger.info('Session imported successfully');

      // Connect to Telegram
      await this.client.start();
      this.logger.info('Connected to Telegram');

      // Get current user info
      this.currentUser = await this.client.getMe();
      this.logger.info(
        {
          userId: this.currentUser.id,
          username: this.currentUser.username,
          displayName: this.currentUser.displayName,
        },
        'Connected to Telegram',
      );

      // Resolve and load active channels
      await this.resolveChannels();

      // Initialize message queues and event listeners
      await this.initializeMessageProcessing();
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to connect to Telegram');
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Get Telegram configuration from database or environment
   * @throws TelegramSessionNotFoundError if session is not found
   */
  private async getTelegramConfig(): Promise<TelegramConfig> {
    const sessionFromDb = await this.configRepository.getValue(
      TELEGRAM_SESSION_KEY_ID,
    );
    const telegramConfig = parseTelegramConfig({
      TELEGRAM_API_ID: config('TELEGRAM_API_ID'),
      TELEGRAM_API_HASH: config('TELEGRAM_API_HASH'),
      TELEGRAM_SESSION: sessionFromDb || config('TELEGRAM_SESSION'),
    });

    if (!telegramConfig.session) {
      throw new TelegramSessionNotFoundError();
    }

    return telegramConfig;
  }

  private async resolveChannels(): Promise<void> {
    if (!this.client) {
      throw new Error('Client not connected. Call connect() first.');
    }

    try {
      const activeChannels =
        await this.telegramChannelRepository.findActiveChannels();
      this.logger.info(
        { count: activeChannels.length },
        'Loading active channels from database',
      );

      for (const channel of activeChannels) {
        try {
          // Validate that channel has required fields
          if (!channel.channelId || !channel.accessHash) {
            this.logger.warn(
              { channelCode: channel.channelCode },
              'Channel missing channelId or accessHash - skipping',
            );
            continue;
          }

          // Add to activeChannels map (keyed by channelId)
          this.activeChannels.set(channel.channelId, channel);
        } catch (error) {
          this.logger.error(
            { err: error, channelCode: channel.channelCode },
            'Failed to load channel',
          );
          Sentry.captureException(error, {
            extra: { channelCode: channel.channelCode },
          });
        }
      }

      this.logger.info(
        { count: this.activeChannels.size },
        'Active channels loaded into memory',
      );
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to resolve channels');
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Initialize message processing: create queues and set up event listeners
   */
  private async initializeMessageProcessing(): Promise<void> {
    if (!this.client) {
      throw new Error('Client not connected. Call connect() first.');
    }

    // Create queues for each active channel (keyed by channelId)
    for (const [channelId, channel] of this.activeChannels.entries()) {
      this.logger.info(`Creating queue for channel ${channel.channelCode}`);
      const queue = createQueue<MessageTask>(
        (task) => this.processMessage(task),
        {
          concurrency: 1, // Process messages sequentially per channel
          logger: this.logger,
          onError: (err, task) => {
            this.logger.error(
              {
                err,
                channelCode: task?.channel?.channelCode,
                channelId: task?.channel?.channelId,
                messageId: task?.message?.id,
              },
              `Error processing message: ${err?.message || 'Unknown error'}`,
            );

            Sentry.captureException(err, {
              extra: {
                channelCode: task?.channel?.channelCode,
                channelId: task?.channel?.channelId,
                messageId: task?.message?.id,
              },
            });
          },
        },
      );
      this.channelQueues.set(channelId, queue);
    }

    this.logger.info(
      { count: this.channelQueues.size },
      'Message queues initialized',
    );

    // Set up event listeners
    this.setupMessageListeners();
  }

  /**
   * Set up mtcute event listeners for new messages and deletions
   */
  private setupMessageListeners(): void {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    // Listen for new messages
    this.client.onNewMessage.add((message: Message) => {
      this.handleNewMessage(message);
    });

    // Listen for message edits
    this.client.onEditMessage.add((message: Message) => {
      this.handleEditMessage(message);
    });

    // Listen for message deletions
    this.client.onDeleteMessage.add((update: DeleteMessageUpdate) => {
      this.handleMessageDeletion(update);
    });

    this.logger.info('Message event listeners registered');
  }

  /**
   * Handle incoming new message from mtcute
   */
  private handleNewMessage(message: Message): void {
    try {
      // Skip comments: Comments on channel posts are automatically forwarded
      // to the linked discussion group. We don't want to process these.
      if (message.isAutomaticForward) {
        // This is a comment forwarded to discussion group, skip it
        return;
      }

      // Extract channelId from message (Telegram's channel identifier)
      const channelId = this.extractChannelId(message);
      if (!channelId) {
        return;
      }

      // Check if this channel is in our active channels (keyed by channelId)
      const channel = this.activeChannels.get(channelId);
      if (!channel) {
        // Not monitoring this channel, ignore
        return;
      }

      // Get the queue for this channel (keyed by channelId)
      const queue = this.channelQueues.get(channelId);
      if (!queue) {
        this.logger.warn(
          { channelCode: channel.channelCode, channelId },
          'No queue found for channel',
        );
        return;
      }

      // Enqueue the message for processing
      // This will process:
      // - Regular channel posts (isChannelPost === true)
      // - Topic messages (isTopicMessage === true, but chat.id is still channelId)
      // - Messages from everyone within the channel/topic
      // But NOT comments (filtered out by isAutomaticForward)
      // The queue's error handler will catch any failures
      queue.push({ message, channel });
    } catch (error) {
      this.logger.error(
        { err: error, messageId: message.id },
        'Error handling new message',
      );
      Sentry.captureException(error);
    }
  }

  /**
   * Handle incoming edit message event from mtcute
   */
  private async handleEditMessage(message: Message): Promise<void> {
    try {
      // Extract channelId from message
      const channelId = this.extractChannelId(message);
      if (!channelId) {
        return;
      }

      // Check if this channel is in our active channels
      const channel = this.activeChannels.get(channelId);
      if (!channel) {
        // Not monitoring this channel, ignore
        return;
      }

      const messageId = message.id;
      const newText = this.extractMessageText(message) || '';

      // Generate trace token for logging
      const traceToken = generateTraceToken(messageId, channelId);

      this.logger.info(
        {
          channelCode: channel.channelCode,
          channelId,
          messageId,
          traceToken,
        },
        'Message edit event received',
      );

      // Find existing message in database
      const existingMessage =
        await this.telegramMessageRepository.findByChannelAndMessageId(
          channelId,
          messageId,
        );

      if (!existingMessage) {
        this.logger.warn(
          {
            channelCode: channel.channelCode,
            channelId,
            messageId,
            traceToken,
          },
          'Edit event for message not in database - ignoring',
        );
        return;
      }

      // Check if the message content actually changed
      if (existingMessage.message === newText) {
        this.logger.debug(
          {
            channelCode: channel.channelCode,
            channelId,
            messageId,
            traceToken,
          },
          'Edit event received but message content unchanged - ignoring',
        );
        return;
      }

      // Update message with edit
      const updated = await this.telegramMessageRepository.updateMessageEdit(
        channelId,
        messageId,
        existingMessage.message, // Store current message as original
        newText, // Update with new text
        new Date(), // Set updatedAt timestamp
      );

      if (!updated) {
        this.logger.error(
          {
            channelCode: channel.channelCode,
            channelId,
            messageId,
            traceToken,
          },
          'Failed to update message edit in database',
        );
        return;
      }

      this.logger.info(
        {
          channelCode: channel.channelCode,
          channelId,
          messageId,
          traceToken,
        },
        'Message edit processed successfully',
      );

      // Add history entry for the edit
      const historyEntry: TelegramMessageHistory = {
        type: MessageHistoryTypeEnum.EDIT_MESSAGE,
        createdAt: new Date(),
        fromService: ServiceName.TELEGRAM_SERVICE,
        targetService: ServiceName.TELEGRAM_SERVICE,
        traceToken,
      };

      await this.telegramMessageRepository.addHistoryEntry(
        channelId,
        messageId,
        historyEntry,
      );

      // Re-trigger pipeline by publishing as NEW_MESSAGE
      // This reuses existing flow - interpret-service will re-analyze
      // History will append to same message record
      // Trade-manager will detect existing order and determine corrective action
      try {
        await this.publishMessageEvent(
          channel.channelCode,
          channelId,
          messageId,
          traceToken,
          new Date(), // receivedAt for this edit
        );

        this.logger.info(
          {
            channelCode: channel.channelCode,
            channelId,
            messageId,
            traceToken,
          },
          'Edited message re-published for re-interpretation',
        );
      } catch (publishError) {
        this.logger.error(
          {
            err: publishError,
            channelCode: channel.channelCode,
            channelId,
            messageId,
            traceToken,
          },
          'Failed to re-publish edited message (non-fatal)',
        );
        Sentry.captureException(publishError, {
          extra: { channelCode: channel.channelCode, messageId, traceToken },
        });
      }
    } catch (error) {
      this.logger.error(
        { err: error, messageId: message.id },
        'Error handling edit message',
      );
      Sentry.captureException(error);
    }
  }

  /**
   * Extract channelId from message
   *
   * In Telegram:
   * - For channels: message.chat.id is the channelId
   * - For topics: message.chat.id is still the channelId (topics are within channels)
   * - For discussion groups (comments): message.chat.id is the discussion group's chatId (different from channelId)
   *
   * This method extracts the chat.id which, for channel messages and topic messages,
   * corresponds to the channelId we use for filtering.
   */
  private extractChannelId(message: Message): string | null {
    if (!message.chat) {
      return null;
    }

    // chat.id is the channelId for both regular channel posts and topic messages
    // (marked ID), convert to string
    return message.chat.id.toString();
  }

  /**
   * Process a message: extract fields, populate context, persist, and publish
   * Called by the internal queue
   */
  private async processMessage(task: MessageTask): Promise<void> {
    const { message, channel } = task;

    try {
      // Extract channelId from message
      const channelId = this.extractChannelId(message);
      if (!channelId) {
        this.logger.warn({ messageId: message.id }, 'Message has no channelId');
        return;
      }

      // Extract message text (handle different message types)
      const messageText = this.extractMessageText(message) || '';

      const messageId = message.id;
      const sentAt = message.date; // message.date is already a Date object
      const receivedAt = new Date();

      // Generate trace token for tracking this message across services
      const traceToken = generateTraceToken(messageId, channelId);

      this.logger.info(
        {
          channelCode: channel.channelCode,
          channelId,
          messageId,
          traceToken,
        },
        'Processing new message',
      );

      // Extract hashtags from message text
      const hashTags = this.extractHashTags(messageText);

      // Extract media information
      const mediaInfo = this.extractMediaInfo(message);

      // Extract replyToTopId from raw data if available
      const replyToTopId = (message.raw as any)?.replyTo?.replyToTopId;

      // Populate quotedMessage if this is a reply
      let quotedMessage: TelegramMessage['quotedMessage'] | undefined;
      if (message.replyToMessage && message.replyToMessage.id) {
        const replyToMsgId = message.replyToMessage.id;
        const quoted =
          await this.telegramMessageRepository.findByChannelAndMessageId(
            channelId,
            replyToMsgId,
          );
        if (quoted) {
          quotedMessage = {
            id: quoted.messageId,
            message: quoted.message,
            hasMedia: quoted.hasMedia,
            replyToTopId,
          };

          // Populate replyToTopMessage if replyToTopId exists
          if (replyToTopId) {
            const topMsg =
              await this.telegramMessageRepository.findByChannelAndMessageId(
                channelId,
                replyToTopId,
              );
            if (topMsg) {
              quotedMessage.replyToTopMessage = topMsg.message;
            }
          }
        }
      }

      // Populate prevMessage (latest message before this one)
      let prevMessage: TelegramMessage['prevMessage'] | undefined;
      const prev = await this.telegramMessageRepository.findLatestBefore(
        channelId,
        messageId,
      );
      if (prev) {
        prevMessage = {
          id: prev.messageId,
          message: prev.message,
        };
      }

      // Create TelegramMessage document (raw field removed)
      const telegramMessage: TelegramMessage = {
        channelCode: channel.channelCode,
        channelId,
        messageId,
        message: messageText,
        hasMedia: mediaInfo.hasMedia,
        mediaType: mediaInfo.mediaType,
        hashTags,
        quotedMessage,
        prevMessage,
        sentAt,
        receivedAt,
        meta: {
          traceToken,
          // Reserved for future use by interpret-service and trade-manager
        },
        history: [], // Initialize history as empty array
      };

      // Persist to database
      await this.telegramMessageRepository.create(telegramMessage);

      this.logger.debug(
        {
          channelCode: channel.channelCode,
          channelId,
          messageId,
          traceToken,
          hasMedia: mediaInfo.hasMedia,
          hashTags,
        },
        'Message processed and persisted',
      );

      // Skip publishing to stream if message text is empty (e.g., media-only messages)
      // This avoids wasting downstream resources on messages that will fail validation
      if (!messageText || messageText.trim() === '') {
        this.logger.debug(
          {
            channelCode: channel.channelCode,
            channelId,
            messageId,
            traceToken,
            hasMedia: mediaInfo.hasMedia,
          },
          'Skipping NEW_MESSAGE event - empty message text (likely media-only message)',
        );
        return; // Exit early, message is persisted but not published
      }

      // Publish message event and track history
      try {
        await this.publishMessageEvent(
          channel.channelCode,
          channelId,
          messageId,
          traceToken,
          receivedAt,
        );
      } catch (publishError) {
        // Log but don't fail the entire message processing
        this.logger.error(
          {
            err: publishError,
            channelCode: channel.channelCode,
            channelId,
            messageId,
            traceToken,
          },
          'Failed to publish message event (non-fatal)',
        );
        Sentry.captureException(publishError, {
          extra: { channelCode: channel.channelCode, messageId, traceToken },
        });
      }

      // Send push notification if media detected
      if (mediaInfo.hasMedia) {
        try {
          await this.sendNotificationMessageHasMedia(
            channel,
            messageId,
            mediaInfo,
          );
        } catch (notificationError) {
          // Log but don't fail the entire message processing
          this.logger.warn(
            {
              err: notificationError,
              channelCode: channel.channelCode,
              messageId,
            },
            'Failed to send media notification (non-fatal)',
          );
        }
      }
    } catch (error) {
      // Generate trace token for error logging if not already generated
      const channelId = this.extractChannelId(message);
      const traceToken = channelId
        ? generateTraceToken(message.id, channelId)
        : undefined;

      this.logger.error(
        {
          err: error,
          channelCode: channel.channelCode,
          messageId: message.id,
          traceToken,
        },
        'Error processing message',
      );
      throw error; // Re-throw to trigger queue error handler
    }
  }

  /**
   * Publish message event to Redis stream and atomically track history.
   *
   * Philosophy: Services add new history entries when emitting events to the next service.
   * History is persisted even if stream publishing fails, creating a complete audit trail.
   */
  private async publishMessageEvent(
    channelCode: string,
    channelId: string,
    messageId: number,
    traceToken: string,
    receivedAt: Date,
  ): Promise<void> {
    // Prepare history entry - will be populated in try/catch/finally
    const historyEntry: TelegramMessageHistory = {
      type: MessageHistoryTypeEnum.NEW_MESSAGE,
      createdAt: new Date(),
      fromService: ServiceName.TELEGRAM_SERVICE,
      targetService: ServiceName.INTERPRET_SERVICE,
      traceToken,
    };

    try {
      const expiryMs = parseInt(config('STREAM_MESSAGE_TTL_IN_SEC'), 10) * 1000;
      const streamMessageId = await this.streamPublisher.publish(
        StreamTopic.MESSAGES,
        {
          version: '1.0',
          type: MessageType.NEW_MESSAGE,
          payload: {
            channelCode,
            channelId,
            messageId,
            traceToken,
            receivedAt: receivedAt.getTime(),
            exp: Date.now() + expiryMs,
          },
        },
      );

      // Populate stream event details on success
      historyEntry.streamEvent = {
        messageEventType: MessageType.NEW_MESSAGE,
        messageId: streamMessageId,
      };

      this.logger.debug(
        {
          channelId,
          messageId,
          traceToken,
          streamMessageId,
          exp: expiryMs,
        },
        'Message published to stream',
      );
    } catch (error) {
      // Populate error message on failure
      historyEntry.errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        {
          err: error,
          channelId,
          messageId,
          traceToken,
        },
        'Failed to publish message to stream',
      );
      Sentry.captureException(error, {
        extra: { channelId, messageId, traceToken },
      });
    } finally {
      // Always persist history entry, regardless of success or failure
      // This creates a complete audit trail of all message processing attempts
      await this.telegramMessageRepository.addHistoryEntry(
        channelId,
        messageId,
        historyEntry,
      );
    }
  }

  /**
   * Extract text content from message
   */
  private extractMessageText(message: Message): string | null {
    // Handle different message types
    if (message.text) {
      return message.text;
    }

    // Handle other message types if needed
    // For now, only process text messages
    return null;
  }

  /**
   * Extract hashtags from message text
   * Returns lowercase hashtags (e.g., ["#btc", "#eth"])
   */
  private async sendNotificationMessageHasMedia(
    channel: TelegramChannel,
    messageId: number,
    mediaInfo: { hasMedia: boolean; mediaType?: string },
  ): Promise<void> {
    if (
      config('NOTIFICATION_ALERT_WHEN_TELEGRAM_MESSAGE_HAS_MEDIA') ===
      ConfigYesNo.YES
    ) {
      try {
        await this.pushNotificationService.send({
          m: `${channel.channelCode} - ${
            mediaInfo.mediaType || 'unknown'
          } detected in message`,
          t: 'Telegram Media Alert',
          d: 'a', // Send to all devices
          v: '1', // Enable vibration
          traceToken: `telegram-${channel.channelCode}-${messageId}`, // Trace token
        });
        this.logger.debug(
          {
            channelCode: channel.channelCode,
            messageId,
            mediaType: mediaInfo.mediaType,
          },
          'Media alert notification sent',
        );
      } catch (error) {
        // Log error but don't fail message processing
        this.logger.warn(
          { err: error, channelCode: channel.channelCode, messageId },
          'Failed to send media alert notification',
        );
      }
    }
  }

  /**
   * Send push notification when a message is edited
   */
  private async sendEditNotification(
    channel: TelegramChannel,
    messageId: number,
    oldMessage: string,
    newMessage: string,
    traceToken: string,
  ): Promise<void> {
    try {
      await this.pushNotificationService.send({
        m: `Message edited in ${channel.channelCode}\nOld: ${oldMessage}\n→ New: ${newMessage}`,
        t: `Message Edited - ${channel.channelCode}`,
        d: 'a', // Send to all devices
        v: '1', // Enable vibration
        traceToken,
      });
      this.logger.debug(
        {
          channelCode: channel.channelCode,
          messageId,
          traceToken,
        },
        'Edit notification sent',
      );
    } catch (error) {
      // Log error but don't fail edit processing
      this.logger.warn(
        { err: error, channelCode: channel.channelCode, messageId, traceToken },
        'Failed to send edit notification',
      );
    }
  }

  private extractHashTags(text: string): string[] {
    if (!text) {
      return [];
    }
    const hashtagRegex = /#[a-zA-Z0-9_]+/g;
    const matches = text.match(hashtagRegex);
    return matches ? matches.map((tag) => tag.toLowerCase()) : [];
  }

  /**
   * Extract media information from message
   * Based on tested implementation in message-fetcher.ts
   */
  private extractMediaInfo(message: Message): {
    hasMedia: boolean;
    mediaType?:
      | 'photo'
      | 'video'
      | 'document'
      | 'audio'
      | 'voice'
      | 'sticker'
      | 'animation'
      | 'other';
  } {
    if (!message.media) {
      return { hasMedia: false };
    }

    // Map mtcute media types to our simplified types
    let mediaType:
      | 'photo'
      | 'video'
      | 'document'
      | 'audio'
      | 'voice'
      | 'sticker'
      | 'animation'
      | 'other' = 'other';

    const type = message.media.type;
    switch (type) {
      case 'photo':
        mediaType = 'photo';
        break;
      case 'video':
        mediaType = 'video';
        break;
      case 'document':
        mediaType = 'document';
        break;
      case 'audio':
        mediaType = 'audio';
        break;
      case 'voice':
        mediaType = 'voice';
        break;
      case 'sticker':
        mediaType = 'sticker';
        break;
      // Animation might be represented as document or other type in mtcute
      default:
        // Check if it's an animation by looking at raw data
        if (
          (message.media as any).document?.attributes?.some(
            (attr: any) => attr._ === 'documentAttributeAnimated',
          )
        ) {
          mediaType = 'animation';
        } else {
          mediaType = 'other';
        }
    }

    return {
      hasMedia: true,
      mediaType,
    };
  }

  /**
   * Handle message deletion update
   */
  private async handleMessageDeletion(
    update: DeleteMessageUpdate,
  ): Promise<void> {
    try {
      const channelId = update.channelId;
      const channel = this.activeChannels.get((channelId || '').toString());
      if (!channel) {
        // Not monitoring this channel, ignore
        return;
      }

      // Process each deleted message ID
      for (const messageId of update.messageIds) {
        const deleted = await this.telegramMessageRepository.markAsDeleted(
          channelId.toString(),
          messageId,
        );

        if (deleted) {
          this.logger.debug(
            {
              channelCode: channel.channelCode,
              channelId: channelId.toString(),
              messageId,
            },
            'Message marked as deleted',
          );
        }
      }
    } catch (error) {
      this.logger.error(
        { err: error, update },
        'Error handling message deletion',
      );
      Sentry.captureException(error);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        // Kill all queues and wait for them to drain
        for (const queue of this.channelQueues.values()) {
          queue.killAndDrain();
        }
        this.channelQueues.clear();

        await this.client.destroy();
        this.client = null;
        this.currentUser = null;
        this.activeChannels.clear();
        this.logger.info('Disconnected from Telegram');
      } catch (error) {
        this.logger.error({ err: error }, 'Error during disconnect');
        Sentry.captureException(error);
        throw error;
      }
    }
  }

  async getMe(): Promise<User | null> {
    if (!this.client) {
      throw new Error('Client not connected. Call connect() first.');
    }

    if (this.currentUser) {
      return this.currentUser;
    }

    try {
      this.currentUser = await this.client.getMe();
      return this.currentUser;
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to get current user');
      Sentry.captureException(error);
      throw error;
    }
  }
}
