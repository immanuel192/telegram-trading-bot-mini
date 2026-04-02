import {
  IPipelineStep,
  NextFunction,
} from '@telegram-trading-bot-mini/shared/utils';
import { ExecutionContext, BaseExecutionState } from '../execution-context';
import { Sentry } from '../../../sentry';

/**
 * Step to finish and commit Sentry tracing/instrumentation.
 * Calculates and emits processing duration metrics for the order execution.
 * Usually registered as a deferred step to run regardless of pipeline success or failure.
 */
export const SentryCommitStep: IPipelineStep<
  ExecutionContext<BaseExecutionState>
> = {
  name: 'SentryCommit',
  execute: async (
    ctx: ExecutionContext<BaseExecutionState>,
    next: NextFunction,
  ) => {
    const { payload, state, logger } = ctx;
    const { orderId, command, traceToken, channelId, accountId } = payload;

    try {
      // Calculate processing duration if start time was recorded
      if (state.sentryStartTime) {
        const now = Date.now();
        const duration = now - state.sentryStartTime;

        // Emit metric for order execution duration
        Sentry.metrics.distribution('order.execution.duration', duration, {
          unit: 'millisecond',
          attributes: {
            command,
            channelId,
            accountId,
            success: state.error ? 'false' : 'true',
          },
        });

        logger.debug(
          {
            orderId,
            command,
            traceToken,
            duration,
            success: !state.error,
          },
          'Order execution duration metric emitted',
        );
      }
    } catch (error) {
      // Gracefully handle metric emission errors (non-blocking)
      logger.debug(
        { error, orderId, traceToken },
        'Failed to emit execution duration metric (non-blocking)',
      );
    }

    await next();
  },
};
