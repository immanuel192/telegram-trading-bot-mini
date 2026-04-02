import {
  IPipelineStep,
  NextFunction,
} from '@telegram-trading-bot-mini/shared/utils';
import { ExecutionContext, BaseExecutionState } from '../execution-context';

/**
 * Step to start Sentry tracing/instrumentation for the order execution pipeline.
 * Records the start time for duration metrics.
 */
export const SentryStartStep: IPipelineStep<
  ExecutionContext<BaseExecutionState>
> = {
  name: 'SentryStart',
  execute: async (
    ctx: ExecutionContext<BaseExecutionState>,
    next: NextFunction,
  ) => {
    // Record start time for duration tracking
    ctx.state.sentryStartTime = Date.now();

    await next();
  },
};
