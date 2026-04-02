import {
  IPipelineStep,
  StreamTopic,
  MessageType,
  ExecuteOrderResultType,
} from '@telegram-trading-bot-mini/shared/utils';
import { ExecutionContext, BaseExecutionState } from '../execution-context';

/**
 * Deferred step to publish the execution result to the Redis stream.
 * It uses ctx.result if available, otherwise it can be extended to
 * derive a failure result from ctx.state.error.
 */
export const PublishResultStep: IPipelineStep<
  ExecutionContext<BaseExecutionState>
> = {
  name: 'PublishResult',
  execute: async (ctx, next) => {
    const { result, container, payload } = ctx;

    // If no result was explicitly set, and an error exists, we should derive a failure result
    let finalResult = result;
    if (!finalResult && ctx.state.error) {
      finalResult = {
        orderId: payload.orderId,
        accountId: payload.accountId,
        traceToken: payload.traceToken,
        messageId: payload.messageId,
        channelId: payload.channelId,
        success: false,
        symbol: payload.symbol,
        type: ExecuteOrderResultType.OTHERS,
        error: ctx.state.error.message,
        errorCode: (ctx.state.error as any).code || 'INTERNAL_ERROR',
      };
    }

    if (finalResult) {
      ctx.logger.info(
        { success: finalResult.success },
        'Publishing execution result',
      );
      await container.streamPublisher.publish(
        StreamTopic.ORDER_EXECUTION_RESULTS,
        {
          version: '1.0.0',
          type: MessageType.EXECUTE_ORDER_RESULT,
          payload: finalResult,
        },
      );
    } else {
      ctx.logger.warn('No result available to publish');
    }
  },
};
