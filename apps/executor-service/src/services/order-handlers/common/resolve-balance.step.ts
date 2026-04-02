import {
  BalanceCacheService,
  IPipelineStep,
} from '@telegram-trading-bot-mini/shared/utils';
import { ExecutionContext, BaseExecutionState } from '../execution-context';
import { config } from '../../../config';

/**
 * Step to resolve the effective balance from cache.
 * Updates ctx.state.balanceInfo
 */
export class ResolveBalanceStep implements IPipelineStep<
  ExecutionContext<BaseExecutionState>
> {
  public readonly name = 'ResolveBalance';

  public async execute(
    ctx: ExecutionContext<BaseExecutionState>,
    next: () => Promise<void>,
  ): Promise<void> {
    const { account, adapter, payload, container, logger } = ctx;
    const { traceToken } = payload;

    if (!adapter) {
      throw new Error('Adapter must be resolved before ResolveBalanceStep');
    }

    try {
      const balanceCache = new BalanceCacheService(
        adapter.exchangeCode,
        container.redis,
      );
      const cachedBalance = await balanceCache.getBalance(adapter.accountId);

      if (cachedBalance) {
        const cacheAgeSeconds = (Date.now() - cachedBalance.ts) / 1000;
        const ttl = config('BALANCE_CACHE_TTL_SECONDS');

        if (cacheAgeSeconds <= ttl) {
          ctx.state.balanceInfo = cachedBalance;
        } else {
          logger.warn(
            {
              accountId: account.accountId,
              cacheAgeSeconds: Math.round(cacheAgeSeconds),
              ttl,
              traceToken,
            },
            'Balance cache expired',
          );
        }
      } else {
        logger.warn(
          { accountId: account.accountId, traceToken },
          'Balance cache miss',
        );
      }
    } catch (error) {
      logger.warn(
        { accountId: account.accountId, error, traceToken },
        'Failed to fetch balance cache',
      );
    }

    return await next();
  }
}
