import {
  IPipelineStep,
  NextFunction,
} from '@telegram-trading-bot-mini/shared/utils';
import { commitMongoTransaction } from '@dal';
import { ExecutionContext, BaseExecutionState } from '../execution-context';

/**
 * Deferred step to commit MongoDB transaction on successful execution.
 * This ONLY runs when the main pipeline succeeds (no errors).
 */
export const CommitTransactionStep: IPipelineStep<
  ExecutionContext<BaseExecutionState>
> = {
  name: 'CommitTransaction',
  execute: async (
    ctx: ExecutionContext<BaseExecutionState>,
    next: NextFunction,
  ) => {
    const { orderId } = ctx.payload;
    const { session } = ctx;

    ctx.logger.info(`Transaction Session id: ${session.id}`);

    if (!session) {
      ctx.logger.warn(
        { orderId },
        'No active session found, skipping transaction commit',
      );
      await next();
      return;
    }

    ctx.logger.debug({ orderId }, 'Committing MongoDB transaction');
    await commitMongoTransaction(session);
    ctx.logger.info({ orderId }, 'MongoDB transaction committed successfully');

    // assume that committed, we endSession now
    await session.endSession();
    await next();
  },
};
