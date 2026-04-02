/**
 * Purpose: Extract publishAndLogPayloads logic for publishing to Redis stream and tracking history.
 */

import {
  NextFunction,
  IPipelineStep,
  IStreamPublisher,
  StreamTopic,
  MessageType,
  ServiceName,
  LoggerInstance,
} from '@telegram-trading-bot-mini/shared/utils';
import { CommandProcessingContext } from '../execution-context';
import {
  TelegramMessageRepository,
  MessageHistoryTypeEnum,
  TelegramMessageHistory,
} from '@dal';

export class PublishExecutionRequestStep implements IPipelineStep<CommandProcessingContext> {
  name = 'PublishExecutionRequestStep';

  constructor(
    private readonly streamPublisher: IStreamPublisher,
    private readonly telegramMessageRepository: TelegramMessageRepository,
    private readonly logger: LoggerInstance,
  ) {}

  async execute(
    ctx: CommandProcessingContext,
    next: NextFunction,
  ): Promise<void> {
    const { state, messageContext } = ctx;
    const { executePayloads } = state;
    const { messageId, channelId, traceToken, sentryTrace, sentryBaggage } =
      messageContext;

    for (const executePayload of executePayloads) {
      let streamMessageId: string | undefined;
      let errorMessage: string | undefined;

      try {
        // Publish to ORDER_EXECUTION_REQUESTS stream
        streamMessageId = await this.streamPublisher.publish(
          StreamTopic.ORDER_EXECUTION_REQUESTS,
          {
            version: '1.0',
            type: MessageType.EXECUTE_ORDER_REQUEST,
            payload: executePayload,
            _sentryTrace: sentryTrace,
            _sentryBaggage: sentryBaggage,
          },
        );
        this.logger.info(
          {
            messageId,
            channelId,
            accountId: state.account.accountId,
            orderId: executePayload.orderId,
            command: state.command,
            symbol: executePayload.symbol,
            traceToken,
            streamMessageId,
          },
          'Published EXECUTE_ORDER_REQUEST to executor-service',
        );
      } catch (error) {
        errorMessage = (error as Error).message;
        // The pipeline runner will catch and handle the throw
        this.logger.error(
          {
            messageId,
            channelId,
            accountId: state.account.accountId,
            orderId: executePayload.orderId,
            command: state.command,
            traceToken,
            error,
          },
          'Failed to publish EXECUTE_ORDER_REQUEST',
        );
        throw error;
      } finally {
        // Track history even if publishing failed
        const historyEntry: TelegramMessageHistory = {
          type: MessageHistoryTypeEnum.EXECUTE_REQUEST,
          createdAt: new Date(),
          fromService: ServiceName.TRADE_MANAGER,
          targetService: ServiceName.EXECUTOR_SERVICE,
          traceToken,
          ...(streamMessageId && {
            streamEvent: {
              messageEventType: MessageType.EXECUTE_ORDER_REQUEST,
              messageId: streamMessageId,
            },
          }),
          ...(errorMessage && { errorMessage }),
          notes: {
            orderId: executePayload.orderId,
            executePayload,
          } as any,
        };

        await this.telegramMessageRepository.addHistoryEntry(
          channelId,
          messageId,
          historyEntry,
          undefined as any, // Session removed
        );
      }
    }

    await next();
  }
}
