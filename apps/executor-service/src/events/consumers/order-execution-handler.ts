/**
 * Purpose: Stream consumer handler for EXECUTE_ORDER_REQUEST messages
 * Exports: OrderExecutionHandler class
 * Core Flow: Consumes EXECUTE_ORDER_REQUEST → delegates to OrderExecutorService → handles errors
 *
 * This handler is responsible for:
 * 1. Receiving order execution requests from the stream
 * 2. Delegating execution to the OrderExecutorService
 * 3. Logging and error handling
 *
 */

import { BaseMessageHandler } from '@telegram-trading-bot-mini/shared/utils/stream/consumers/base-message-handler';
import {
  MessageType,
  StreamMessage,
  LoggerInstance,
  IErrorCapture,
  CommandEnum,
} from '@telegram-trading-bot-mini/shared/utils';
import { PipelineOrderExecutorService } from '../../services/order-handlers/pipeline-executor.service';

export class OrderExecutionHandler extends BaseMessageHandler<MessageType.EXECUTE_ORDER_REQUEST> {
  constructor(
    private pipelineExecutor: PipelineOrderExecutorService,
    logger: LoggerInstance,
    errorCapture: IErrorCapture,
  ) {
    super(logger, errorCapture);
  }

  /**
   * Handle incoming EXECUTE_ORDER_REQUEST message
   * Delegates to OrderExecutorService for actual execution
   */
  async handle(
    message: StreamMessage<MessageType.EXECUTE_ORDER_REQUEST>,
    id: string,
  ): Promise<void> {
    const { payload } = message;
    this.logMessageReceived(id, MessageType.EXECUTE_ORDER_REQUEST, payload);

    try {
      // All order execution commands now use the Action Pipeline pattern
      await this.pipelineExecutor.executeOrder(payload);

      this.logger.info(
        {
          messageId: id,
          orderId: payload.orderId,
          accountId: payload.accountId,
          command: payload.command,
          traceToken: payload.traceToken,
        },
        'Order execution request handled successfully',
      );
    } catch (error) {
      this.logError(id, MessageType.EXECUTE_ORDER_REQUEST, error as Error, {
        orderId: payload.orderId,
        accountId: payload.accountId,
        command: payload.command,
        traceToken: payload.traceToken,
      });

      // Capture error to Sentry for monitoring
      this.errorCapture.captureException(error as Error, {
        messageId: id,
        messageType: MessageType.EXECUTE_ORDER_REQUEST,
        orderId: payload.orderId,
        accountId: payload.accountId,
        command: payload.command,
        traceToken: payload.traceToken,
      });

      // Re-throw to let the stream consumer handle retry logic
      throw error;
    }
  }
}
