import { IPipelineStep } from '@telegram-trading-bot-mini/shared/utils';
import { ExecutionContext, BaseExecutionState } from '../execution-context';

/**
 * Step to resolve the account from the database based on the accountId in the payload.
 */
export const ResolveAccountStep: IPipelineStep<
  ExecutionContext<BaseExecutionState>
> = {
  name: 'ResolveAccount',
  execute: async (ctx, next) => {
    const { accountId } = ctx.payload;

    // Use accountService which has caching
    const account =
      await ctx.container.accountService.getAccountById(accountId);

    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    ctx.account = account;
    await next();
  },
};
