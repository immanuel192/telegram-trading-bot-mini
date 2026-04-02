/**
 * Purpose: Handler for TRANSLATE_MESSAGE_RESULT events from Redis Stream.
 * Consumes translation results from StreamTopic.TRANSLATE_RESULTS, transforms commands,
 * creates orders, captures live market price for auditing, and publishes execution requests to executor-service.
 */

import {
  CommandEnum,
  IErrorCapture,
  LoggerInstance,
  MessageType,
  StreamMessage,
} from '@telegram-trading-bot-mini/shared/utils';
import { BaseMessageHandler } from '@telegram-trading-bot-mini/shared/utils/stream/consumers/base-message-handler';
import { Account, AccountRepository } from '@dal';
import { TelegramChannelCacheService } from '../../services/telegram-channel-cache.service';
import * as Sentry from '@sentry/node';
import { CommandProcessingPipelineService } from '../../services/command-processing-pipeline.service';

type TranslateMessageResultCommand =
  StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT>['payload']['commands'][number];

/**
 * Context object to encapsulate common message metadata
 * Reduces parameter count and improves readability
 */
interface MessageContext {
  messageId: number;
  channelId: string;
  traceToken: string;
  /** Sentry trace header for distributed tracing */
  sentryTrace?: string;
  /** Sentry baggage header for distributed tracing */
  sentryBaggage?: string;
}

/**
 * Handler for TRANSLATE_MESSAGE_RESULT type
 * Processes translation results from interpret-service and publishes execution requests
 */
export class TranslateResultHandler extends BaseMessageHandler<MessageType.TRANSLATE_MESSAGE_RESULT> {
  constructor(
    logger: LoggerInstance,
    errorCapture: IErrorCapture,
    private readonly telegramChannelCacheService: TelegramChannelCacheService,
    private readonly accountRepository: AccountRepository,
    private readonly pipelineService: CommandProcessingPipelineService,
  ) {
    super(logger, errorCapture);
  }

  /**
   * Handle incoming TRANSLATE_MESSAGE_RESULT events from the stream
   * @param message - The stream message
   * @param id - The stream message ID
   */
  async handle(
    message: StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT>,
    id: string,
  ): Promise<void> {
    return this.processWithTracing(message, id, async () => {
      const { payload } = message;
      const {
        receivedAt,
        messageId,
        channelId,
        promptId,
        traceToken,
        commands,
      } = payload;

      this.logMessageReceived(
        id,
        MessageType.TRANSLATE_MESSAGE_RESULT,
        payload,
      );

      try {
        // Create message context for helper methods
        const context: MessageContext = {
          messageId,
          channelId,
          traceToken,
          sentryTrace: message._sentryTrace,
          sentryBaggage: message._sentryBaggage,
        };

        // Step 1: Filter valid commands
        const validCommands = this.filterValidCommands(commands, context);
        if (validCommands.length === 0) {
          return;
        }

        // Step 2: Lookup channel code
        const channelCode = await this.lookupChannelCode(context);
        if (!channelCode) {
          return;
        }

        // Step 3: Find active accounts
        const activeAccounts = await this.findActiveAccounts(
          channelCode,
          context,
        );
        if (activeAccounts.length === 0) {
          return;
        }

        // Step 4: Process commands for all accounts in parallel
        // NOTE: Using Promise.all for parallel processing. This works well for small-medium
        // number of accounts (< 100). For larger scale (100+ accounts), consider:
        // - Batch processing with p-limit or similar
        const results = await Promise.all(
          activeAccounts.map((account) =>
            this.processAccountCommands(account, validCommands, context),
          ),
        );

        // Aggregate results
        const { processedCount, skippedCount } = results.reduce(
          (acc, result) => ({
            processedCount: acc.processedCount + result.processedCount,
            skippedCount: acc.skippedCount + result.skippedCount,
          }),
          { processedCount: 0, skippedCount: 0 },
        );

        this.logger.info(
          {
            messageId,
            channelId,
            traceToken,
            processedCount,
            skippedCount,
            totalAccounts: activeAccounts.length,
            totalCommands: validCommands.length,
          },
          `Translation result processing complete - ${processedCount} requests published, ${skippedCount} skipped`,
        );

        // Calculate and emit overall processing duration metric
        this.emitProcessingDurationMetric(
          receivedAt,
          channelId,
          traceToken,
          promptId,
        );
      } catch (error) {
        this.logError(
          id,
          MessageType.TRANSLATE_MESSAGE_RESULT,
          error as Error,
          {
            messageId,
            channelId,
            promptId,
            traceToken,
          },
        );
        throw error;
      }
    });
  }

  /**
   * Filter out non-command messages and NONE commands
   */
  private filterValidCommands(
    commands: TranslateMessageResultCommand[],
    context: MessageContext,
  ): TranslateMessageResultCommand[] {
    const { messageId, channelId, traceToken } = context;
    const validCommands = commands.filter(
      (cmd) => cmd.isCommand && cmd.command !== CommandEnum.NONE,
    );

    if (validCommands.length === 0) {
      this.logger.info(
        {
          messageId,
          channelId,
          traceToken,
          totalCommands: commands.length,
        },
        'No valid commands to process - skipping',
      );
      return [];
    }

    this.logger.info(
      {
        messageId,
        channelId,
        traceToken,
        totalCommands: commands.length,
        validCommands: validCommands.length,
      },
      `Processing ${validCommands.length} valid command(s)`,
    );

    return validCommands;
  }

  /**
   * Lookup channel code using cache service
   */
  private async lookupChannelCode(
    context: MessageContext,
  ): Promise<string | null> {
    const { messageId, channelId, traceToken } = context;
    const channelCode =
      await this.telegramChannelCacheService.getChannelCodeById(channelId);

    if (!channelCode) {
      this.logger.warn(
        {
          messageId,
          channelId,
          traceToken,
        },
        'Channel code not found - skipping message',
      );
      return null;
    }

    this.logger.debug(
      {
        messageId,
        channelId,
        channelCode,
        traceToken,
      },
      'Channel code retrieved from cache',
    );

    return channelCode;
  }

  /**
   * Find all active accounts for the channel
   */
  private async findActiveAccounts(
    channelCode: string,
    context: MessageContext,
  ): Promise<Account[]> {
    const { messageId, channelId, traceToken } = context;
    const activeAccounts =
      await this.accountRepository.findActiveByChannelCode(channelCode);

    if (activeAccounts.length === 0) {
      this.logger.info(
        {
          messageId,
          channelId,
          channelCode,
          traceToken,
        },
        'No active accounts found for channel - skipping',
      );
      return [];
    }

    this.logger.info(
      {
        messageId,
        channelId,
        channelCode,
        accountCount: activeAccounts.length,
        traceToken,
      },
      `Found ${activeAccounts.length} active account(s) for channel`,
    );

    return activeAccounts;
  }

  /**
   * Process all commands for a single account
   * Each command is processed in its own pipeline with atomic steps.
   * Returns count of processed and skipped commands
   */
  private async processAccountCommands(
    account: Account,
    validCommands: TranslateMessageResultCommand[],
    context: MessageContext,
  ): Promise<{ processedCount: number; skippedCount: number }> {
    let processedCount = 0;
    let skippedCount = 0;

    for (const command of validCommands) {
      try {
        const pipelineCtx = this.pipelineService.createContext({
          account,
          command,
          messageId: context.messageId,
          channelId: context.channelId,
          traceToken: context.traceToken,
          sentryTrace: context.sentryTrace,
          sentryBaggage: context.sentryBaggage,
        });

        await this.pipelineService.process(pipelineCtx);
        processedCount++;
      } catch (error) {
        this.logger.error(
          {
            accountId: account.accountId,
            command: command.command,
            messageId: context.messageId,
            error,
          },
          'Failed to process command via pipeline',
        );
        skippedCount++;
      }
    }

    return { processedCount, skippedCount };
  }

  /**
   * Emit overall processing duration metric
   */
  private emitProcessingDurationMetric(
    receivedAt: number,
    channelId: string,
    traceToken: string,
    promptId: string,
  ): void {
    try {
      // Calculate overall processing duration
      const now = Date.now();
      const overallDuration = now - receivedAt;

      // Emit metric for overall message processing duration
      Sentry.metrics.distribution(
        'message.processing.duration',
        overallDuration,
        {
          unit: 'millisecond',
          attributes: {
            channelId,
            traceToken,
            promptId,
          },
        },
      );

      this.logger.debug(
        {
          channelId,
          traceToken,
          overallDuration,
        },
        'Overall processing duration metric emitted',
      );
    } catch (error) {
      // Gracefully handle metric emission errors
      this.logger.debug(
        { error, channelId, traceToken },
        'Failed to emit processing duration metric (non-blocking)',
      );
    }
  }
}
