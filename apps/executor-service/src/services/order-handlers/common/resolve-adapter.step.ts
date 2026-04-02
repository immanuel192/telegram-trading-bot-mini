import { IPipelineStep } from '@telegram-trading-bot-mini/shared/utils';
import { ExecutionContext, BaseExecutionState } from '../execution-context';

/**
 * Step to resolve the broker adapter for the account.
 */
export const ResolveAdapterStep: IPipelineStep<
  ExecutionContext<BaseExecutionState>
> = {
  name: 'ResolveAdapter',
  execute: async (ctx, next) => {
    const { accountId } = ctx.payload;

    // Resolve adapter via factory
    const adapter = await ctx.container.brokerFactory.getAdapter(accountId);

    if (!adapter) {
      throw new Error(`Could not resolve adapter for account: ${accountId}`);
    }

    ctx.adapter = adapter;
    await next();
  },
};
