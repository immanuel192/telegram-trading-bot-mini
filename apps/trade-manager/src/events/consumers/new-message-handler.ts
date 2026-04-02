/**
 * Purpose: Handler for NEW_MESSAGE events from Redis Stream.
 * Consumes messages from StreamTopic.MESSAGES and processes them.
 * For now, this is a placeholder that logs and acknowledges messages.
 */

import { ClientSession } from 'mongodb';
import {
  TelegramMessageRepository,
  AccountRepository,
  MessageHistoryTypeEnum,
  TelegramMessageHistory,
  TelegramMessage,
} from '@dal';
import {
  StreamTopic,
  MessageType,
  IStreamPublisher,
  StreamMessage,
  LoggerInstance,
  ServiceName,
  TranslateMessageRequestPayload,
  IErrorCapture,
} from '@telegram-trading-bot-mini/shared/utils';
import { BaseMessageHandler } from '@telegram-trading-bot-mini/shared/utils/stream/consumers/base-message-handler';
import { config } from '../../config';

/**
 * Handler for NEW_MESSAGE type
 * Processes new Telegram messages that need to be analyzed
 */
export class NewMessageHandler extends BaseMessageHandler<MessageType.NEW_MESSAGE> {
  constructor(
    private readonly telegramMessageRepository: TelegramMessageRepository,
    private readonly accountRepository: AccountRepository,
    private readonly streamPublisher: IStreamPublisher,
    logger: LoggerInstance,
    errorCapture: IErrorCapture,
  ) {
    super(logger, errorCapture);
  }

  /**
   * Handle incoming NEW_MESSAGE events from the stream
   * @param message - The stream message
   * @param id - The stream message ID
   */
  async handle(
    message: StreamMessage<MessageType.NEW_MESSAGE>,
    id: string,
  ): Promise<void> {
    return this.processWithTracing(message, id, async () => {
      const { payload } = message;
      const { channelId, messageId, channelCode, traceToken } = payload;

      this.logMessageReceived(id, MessageType.NEW_MESSAGE, payload);

      try {
        const telegramMessage = await this.fetchMessage(
          channelId,
          messageId,
          traceToken,
        );

        if (!telegramMessage) {
          return;
        }

        // Get distinct promptIds for active accounts in this channel
        // More efficient than fetching all accounts and grouping in memory
        const promptIds =
          await this.accountRepository.findDistinctPromptIdsByChannelCode(
            channelCode,
          );

        this.logger.debug(
          { channelCode, promptIdsCount: promptIds.length, traceToken },
          'Fetched distinct promptIds for channel',
        );

        if (promptIds.length === 0) {
          this.logger.info(
            { channelId, channelCode, messageId, traceToken },
            'No active accounts found for channel, skipping translation',
          );
          return;
        }

        await this.processMessageTransaction(
          telegramMessage,
          channelId,
          messageId,
          traceToken,
          promptIds,
        );

        this.logger.info(
          {
            channelId,
            messageId,
            traceToken,
            promptIdsCount: promptIds.length,
          },
          'Message processed and translation requests published',
        );
      } catch (error) {
        this.logError(id, MessageType.NEW_MESSAGE, error as Error, {
          channelId,
          messageId,
          traceToken,
        });
        throw error;
      }
    });
  }

  private async fetchMessage(
    channelId: string,
    messageId: number,
    traceToken: string,
  ): Promise<TelegramMessage | null> {
    const telegramMessage =
      await this.telegramMessageRepository.findByChannelAndMessageId(
        channelId,
        messageId,
      );

    if (!telegramMessage) {
      this.logger.error(
        { channelId, messageId, traceToken },
        'Message not found in database, skipping processing',
      );

      this.errorCapture.captureException(
        new Error('Message not found in database'),
        {
          channelId,
          messageId,
          traceToken,
          source: 'NewMessageHandler.fetchMessage',
        },
      );
      return null;
    }

    return telegramMessage;
  }

  private async processMessageTransaction(
    telegramMessage: TelegramMessage,
    channelId: string,
    messageId: number,
    traceToken: string,
    promptIds: string[],
  ): Promise<void> {
    // Publish one TRANSLATE_MESSAGE_REQUEST per unique promptId
    /**
     * @todo This could be performance issue if we have many promptIds. Should not be an issue with MVP
     * NOTE: We use parallel processing with atomic $push history updates (addTranslationHistory)
     * instead of a MongoDB transaction wrapper to avoid session concurrency issues
     * and stop intermittent transaction retries that caused duplicate stream messages.
     */
    await Promise.all(
      promptIds.map(async (promptId) => {
        const streamMessageId = await this.publishTranslateRequest(
          telegramMessage,
          channelId,
          messageId,
          traceToken,
          promptId,
        );

        await this.addTranslationHistory(
          channelId,
          messageId,
          traceToken,
          streamMessageId,
          promptId,
        );

        this.logger.debug(
          {
            channelId,
            messageId,
            promptId,
            traceToken,
          },
          'Published TRANSLATE_MESSAGE_REQUEST for promptId',
        );
      }),
    );
  }

  private async publishTranslateRequest(
    telegramMessage: TelegramMessage,
    channelId: string,
    messageId: number,
    traceToken: string,
    promptId: string,
  ): Promise<string> {
    const payload = this.buildTranslateRequestPayload(
      telegramMessage,
      channelId,
      messageId,
      traceToken,
      promptId,
    );

    const streamMessageId = await this.streamPublisher.publish(
      StreamTopic.TRANSLATE_REQUESTS,
      {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload,
      },
    );

    this.logger.debug(
      { promptId, streamMessageId, traceToken },
      'Published TRANSLATE_MESSAGE_REQUEST',
    );

    return streamMessageId;
  }

  private buildTranslateRequestPayload(
    telegramMessage: TelegramMessage,
    channelId: string,
    messageId: number,
    traceToken: string,
    promptId: string,
  ): TranslateMessageRequestPayload {
    const ttlSeconds = config('MESSAGE_HISTORY_TTL_SECONDS');

    return {
      exp: Date.now() + ttlSeconds * 1000,
      messageId: messageId,
      channelId: channelId,
      traceToken,
      promptId,
      receivedAt: telegramMessage.receivedAt.getTime(),
      messageText: telegramMessage.message,
      prevMessage: telegramMessage.prevMessage?.message || '',
      quotedMessage: telegramMessage.quotedMessage?.message,
      quotedFirstMessage: telegramMessage.quotedMessage?.replyToTopMessage,
    };
  }

  private async addTranslationHistory(
    channelId: string,
    messageId: number,
    traceToken: string,
    streamMessageId: string,
    promptId: string,
  ): Promise<void> {
    const historyEntry: TelegramMessageHistory = {
      type: MessageHistoryTypeEnum.TRANSLATE_MESSAGE,
      createdAt: new Date(),
      fromService: ServiceName.TRADE_MANAGER,
      targetService: ServiceName.INTERPRET_SERVICE,
      traceToken,
      streamEvent: {
        messageEventType: MessageType.TRANSLATE_MESSAGE_REQUEST,
        messageId: streamMessageId,
      },
      notes: JSON.stringify({ promptId }),
    };

    await this.telegramMessageRepository.addHistoryEntry(
      channelId,
      messageId,
      historyEntry,
    );
  }
}
