import {
  IPipelineStep,
  NextFunction,
} from '@telegram-trading-bot-mini/shared/utils';
import { commitMongoTransaction, abortMongoTransaction } from '@dal';
import { ExecutionContext, BaseExecutionState } from '../execution-context';

/**
 * Error handler step to handle MongoDB transaction cleanup.
 * This ALWAYS runs and ALWAYS closes the session.
 *
 * Logic:
 * - If no error: session already committed by CommitTransactionStep, just close it
 * - If error AND OpenOrderStep succeeded: commit to preserve broker operation, then close
 * - If error before OpenOrderStep: rollback, then close
 *
 * This prevents the critical issue where a broker order is opened but not recorded
 * in the database due to a transaction rollback.
 */
export const RollbackTransactionStep: IPipelineStep<
  ExecutionContext<BaseExecutionState>
> = {
  name: 'RollbackTransaction',
  execute: async (
    ctx: ExecutionContext<BaseExecutionState>,
    next: NextFunction,
  ) => {
    const { orderId } = ctx.payload;
    const { session, state } = ctx;

    if (session.hasEnded) {
      // Session already closed
      await next();
      return;
    }

    try {
      // If there's an error, handle transaction commit/rollback
      if (state.error) {
        const shouldCommit = !!ctx.result;

        if (shouldCommit) {
          // Broker operation succeeded - MUST commit to preserve it
          ctx.logger.warn(
            { orderId, error: state.error.message },
            'Committing transaction despite error (broker operation succeeded)',
          );
          await commitMongoTransaction(session);
          ctx.logger.info(
            { orderId },
            'Transaction committed to preserve broker operation',
          );
        } else {
          // No broker operation - safe to rollback
          ctx.logger.info(
            { orderId, error: state.error.message },
            'Rolling back transaction due to error before broker operation',
          );
          await abortMongoTransaction(session);
          ctx.logger.debug({ orderId }, 'Transaction rolled back successfully');
        }
      } else {
        // No error - transaction already committed by CommitTransactionStep
        ctx.logger.debug(
          { orderId },
          'No error - transaction already committed',
        );
      }
    } catch (error) {
      // Critical error during commit/abort
      ctx.logger.error(
        { orderId, error },
        'Failed to commit/rollback transaction in error handler',
      );

      // Try to abort as a last resort
      try {
        await abortMongoTransaction(session);
        ctx.logger.warn({ orderId }, 'Transaction aborted after failure');
      } catch (abortError) {
        ctx.logger.error(
          { orderId, error: abortError },
          'Failed to abort transaction during error recovery - session may be in inconsistent state',
        );
      }
    } finally {
      // ALWAYS close the session to prevent leaks
      try {
        if (!session.hasEnded) {
          await session.endSession();
          ctx.logger.debug({ orderId }, 'MongoDB session closed');
        }
      } catch (sessionError) {
        ctx.logger.error(
          { orderId, error: sessionError },
          'Failed to close MongoDB session - potential session leak',
        );
      }
    }

    await next();
  },
};
