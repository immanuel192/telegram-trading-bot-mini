import { IPipelineStep } from '@telegram-trading-bot-mini/shared/utils';
import { startMongoTransaction } from '@dal';
import { ExecutionContext, BaseExecutionState } from '../execution-context';

/**
 * Step to start a MongoDB transaction.
 * The transaction will remain open through all pipeline steps (including deferred)
 * until CommitTransactionStep commits or aborts it.
 *
 * IMPORTANT: This step MUST be paired with CommitTransactionStep in deferred steps
 * to ensure the transaction is properly committed or aborted.
 */
export const StartTransactionStep: IPipelineStep<
  ExecutionContext<BaseExecutionState>
> = {
  name: 'StartTransaction',
  execute: async (ctx, next) => {
    const { orderId } = ctx.payload;

    // Start a new transaction and store session in context
    ctx.session = await startMongoTransaction();
    ctx.logger.debug({ orderId }, 'MongoDB transaction started');

    await next();
  },
};
