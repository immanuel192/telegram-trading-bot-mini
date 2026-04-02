/**
 * Purpose: Handler for TRANSLATE_MESSAGE_REQUEST events from Redis Stream.
 * Consumes translation requests and processes them using AI service with session caching.
 * Core Flow: Validate message → Build context → Translate with AI (using cached sessions) → Publish result → Add history entry.
 */

import {
  StreamMessage,
  StreamTopic,
  IStreamPublisher,
  ServiceName,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  CommandEnum,
  MessageType,
} from '@telegram-trading-bot-mini/shared/utils/interfaces';
import { BaseMessageHandler } from '@telegram-trading-bot-mini/shared/utils/stream/consumers/base-message-handler';
import {
  IAIService,
  MessageContext,
} from '../../services/ai/ai-service.interface';
import {
  TelegramMessageRepository,
  TelegramMessageHistory,
  MessageHistoryTypeEnum,
} from '@dal';
import { TranslateMessageResultPayload } from '@telegram-trading-bot-mini/shared/utils/interfaces/messages/translate-message-result';
import { TranslationResult } from '../../services/ai/types';
import { Sentry } from '../../sentry';
import { Logger } from 'pino';

/**
 * Handler for TRANSLATE_MESSAGE_REQUEST type
 * Processes message translation requests from trade-manager using AI service
 */
export class TranslateRequestHandler extends BaseMessageHandler<MessageType.TRANSLATE_MESSAGE_REQUEST> {
  constructor(
    private readonly aiService: IAIService,
    private readonly streamPublisher: IStreamPublisher,
    private readonly telegramMessageRepository: TelegramMessageRepository,
    logger: Logger,
    errorCapture: any,
  ) {
    super(logger, errorCapture);
  }

  /**
   * Handle incoming TRANSLATE_MESSAGE_REQUEST events from the stream
   * @param message - The stream message
   * @param id - The stream message ID
   */
  async handle(
    message: StreamMessage<MessageType.TRANSLATE_MESSAGE_REQUEST>,
    id: string,
  ): Promise<void> {
    return this.processWithTracing(message, id, async () => {
      const startTime = Date.now();
      const { payload } = message;
      const {
        promptId,
        traceToken,
        receivedAt,
        messageId,
        channelId,
        messageText,
        prevMessage,
        quotedMessage,
        quotedFirstMessage,
      } = payload;

      this.logMessageReceived(id, MessageType.TRANSLATE_MESSAGE_REQUEST, {
        messageId,
        channelId,
        traceToken,
        promptId,
      });

      try {
        // Step 1: Build message context (stateless)
        const context = this.buildMessageContext(
          prevMessage,
          quotedMessage,
          quotedFirstMessage,
        );

        this.logger.debug({ channelId }, 'Built message context');

        // Step 2: Translate message with AI (using cached sessions)
        const translationResults = await this.translateWithAI(
          messageText,
          context,
          channelId,
          promptId,
          id,
          messageId,
          traceToken,
        );

        const processedAt = Date.now();
        const duration = processedAt - startTime;

        // Validate we have at least one result
        if (!translationResults || translationResults.length === 0) {
          throw new Error('AI service returned empty result array');
        }

        const commandCount = translationResults.length;

        // Log summary with all commands
        this.logger.info(
          {
            streamMessageId: id,
            messageId,
            channelId,
            traceToken,
            promptId,
            commandCount,
            commands: translationResults.map((r) => ({
              command: r.command,
              isCommand: r.isCommand,
              confidence: r.confidence,
            })),
            duration,
          },
          `AI translation completed - detected ${commandCount} command(s)`,
        );

        // Emit metrics for all commands
        try {
          // Overall processing duration
          Sentry.metrics.distribution(
            'interpret.ai.processing.duration',
            duration,
            {
              unit: 'millisecond',
              attributes: {
                channelId,
                traceToken,
                promptId,
                commandCount: String(commandCount),
              },
            },
          );
        } catch (metricError) {
          // Gracefully handle metric emission errors
          this.logger.error(
            { error: metricError },
            'Failed to emit AI metrics (non-blocking)',
          );
        }

        // Step 4: Build and publish result
        const resultPayload = this.buildResultPayload(
          translationResults,
          promptId,
          traceToken,
          messageId,
          channelId,
          receivedAt,
        );

        const streamMessageId = await this.publishResult(
          resultPayload,
          id,
          channelId,
          messageId,
          traceToken,
          promptId,
        );

        // Step 5: Record success in history
        await this.recordSuccessHistory(
          channelId,
          messageId,
          traceToken,
          promptId,
          translationResults,
          streamMessageId,
          duration,
        );
      } catch (error) {
        await this.handleTranslationError(
          error,
          id,
          channelId,
          messageId,
          traceToken,
          promptId,
        );
        throw error;
      }
    });
  }

  /**
   * Build message context for AI translation
   * Returns only message context without order state (stateless translation)
   */
  private buildMessageContext(
    prevMessage: string,
    quotedMessage?: string,
    quotedFirstMessage?: string,
  ): MessageContext {
    return {
      prevMessage: prevMessage || '',
      quotedMessage: quotedMessage || '',
      quotedFirstMessage: quotedFirstMessage || '',
    };
  }

  /**
   * Translate message with AI service
   * Uses Sentry tracing for observability
   */
  private async translateWithAI(
    messageText: string,
    context: MessageContext,
    channelId: string,
    promptId: string,
    streamMessageId: string,
    messageId: number,
    traceToken: string,
  ): Promise<TranslationResult[]> {
    return await Sentry.startSpan(
      {
        name: 'ai-translate',
        op: 'ai.inference',
        attributes: {
          promptId,
          channelId,
          provider: 'gemini', // TODO: Make this dynamic when we support multiple providers
        },
      },
      async (span) => {
        this.logger.debug(
          {
            streamMessageId,
            messageId,
            channelId,
            traceToken,
            promptId,
            messageTextLength: messageText.length,
          },
          'Starting AI translation with session caching',
        );

        const result = await this.aiService.translateMessage(
          messageText,
          context,
          channelId,
          promptId,
          traceToken,
        );

        // Validate result
        if (!result || result.length === 0) {
          throw new Error('AI service returned empty result');
        }

        // Add result attributes to span
        span.setAttribute('commandCount', result.length);

        // Add details for each command
        result.forEach((cmd, index) => {
          span.setAttribute(`command.${index}.type`, cmd.command);
          span.setAttribute(`command.${index}.isCommand`, cmd.isCommand);
          span.setAttribute(`command.${index}.confidence`, cmd.confidence);
        });

        return result;
      },
    );
  }

  /**
   * Build result payload for publishing
   * Supports multiple commands per message
   */
  private buildResultPayload(
    translationResults: TranslationResult[],
    promptId: string,
    traceToken: string,
    messageId: number,
    channelId: string,
    originalReceivedAt: number,
  ): TranslateMessageResultPayload {
    // Validate we have at least one result
    if (!translationResults || translationResults.length === 0) {
      throw new Error('Cannot build payload from empty translation results');
    }

    return {
      promptId,
      traceToken,
      receivedAt: originalReceivedAt,
      messageId,
      channelId,
      // Array of all commands
      commands: translationResults.map((result) => ({
        isCommand: result.isCommand,
        command: result.command as CommandEnum,
        confidence: result.confidence,
        reason: result.reason,
        extraction: result.extraction,
      })),
    };
  }

  /**
   * Publish translation result to stream
   */
  private async publishResult(
    resultPayload: TranslateMessageResultPayload,
    streamMessageId: string,
    channelId: string,
    messageId: number,
    traceToken: string,
    promptId: string,
  ): Promise<string> {
    return await Sentry.startSpan(
      {
        name: 'publish-result',
        op: 'queue.publish',
        attributes: {
          commandCount: resultPayload.commands.length,
        },
      },
      async (span) => {
        const publishedStreamId = await this.streamPublisher.publish(
          StreamTopic.TRANSLATE_RESULTS,
          {
            version: '1.0',
            type: MessageType.TRANSLATE_MESSAGE_RESULT,
            payload: resultPayload,
          },
        );

        span.setAttribute('streamMessageId', publishedStreamId);

        this.logger.debug(
          {
            streamMessageId,
            publishedStreamId,
            messageId,
            channelId,
            traceToken,
            promptId,
            commandCount: resultPayload.commands.length,
            commands: resultPayload.commands.map((c) => c.command),
          },
          'Published TRANSLATE_MESSAGE_RESULT',
        );

        return publishedStreamId;
      },
    );
  }

  /**
   * Record successful translation in message history
   */
  private async recordSuccessHistory(
    channelId: string,
    messageId: number,
    traceToken: string,
    promptId: string,
    translationResult: any,
    streamMessageId: string,
    duration: number,
  ): Promise<void> {
    await this.addHistoryEntry(channelId, messageId, {
      type: MessageHistoryTypeEnum.TRANSLATE_RESULT,
      createdAt: new Date(),
      fromService: ServiceName.INTERPRET_SERVICE,
      targetService: ServiceName.TRADE_MANAGER,
      traceToken,
      streamEvent: {
        messageEventType: MessageType.TRANSLATE_MESSAGE_RESULT,
        messageId: streamMessageId,
      },
      notes: {
        promptId,
        result: translationResult,
        duration,
      },
    });
  }

  /**
   * Handle translation errors
   */
  private async handleTranslationError(
    error: unknown,
    streamMessageId: string,
    channelId: string,
    messageId: number,
    traceToken: string,
    promptId: string,
  ): Promise<void> {
    this.logger.error(
      {
        streamMessageId,
        messageId,
        channelId,
        traceToken,
        promptId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Error processing translation request',
    );

    await this.addHistoryEntry(channelId, messageId, {
      type: MessageHistoryTypeEnum.TRANSLATE_RESULT,
      createdAt: new Date(),
      fromService: ServiceName.INTERPRET_SERVICE,
      targetService: ServiceName.INTERPRET_SERVICE,
      traceToken,
      errorMessage: error instanceof Error ? error.message : String(error),
      notes: {
        promptId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    });
  }

  /**
   * Add a history entry to the telegram message
   * Handles errors gracefully to not block the main flow
   */
  private async addHistoryEntry(
    channelId: string,
    messageId: number,
    historyEntry: TelegramMessageHistory,
  ): Promise<void> {
    return await Sentry.startSpan(
      {
        name: 'add-history-entry',
        op: 'db.mutation',
        attributes: {
          channelId,
          messageId: messageId.toString(),
          historyType: historyEntry.type,
        },
      },
      async () => {
        try {
          await this.telegramMessageRepository.addHistoryEntry(
            channelId,
            messageId,
            historyEntry,
          );
        } catch (error) {
          this.logger.error(
            {
              channelId,
              messageId,
              historyType: historyEntry.type,
              error: error instanceof Error ? error.message : String(error),
            },
            'Failed to add history entry (non-blocking)',
          );
        }
      },
    );
  }
}
