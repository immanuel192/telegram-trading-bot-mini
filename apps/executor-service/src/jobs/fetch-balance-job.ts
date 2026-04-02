/**
 * Purpose: Background job to fetch and cache account balance from all brokers
 * Frequency: Recommended every 30 minutes via cron
 *
 * Flow:
 * 1. Get all pre-loaded adapters from BrokerAdapterFactory
 * 2. For each adapter:
 *    a. Validate operation hours for the account
 *    b. Skip if outside operation hours
 *    c. Fetch account details (balance, equity, margin)
 *    d. Cache in Redis using BalanceCacheService
 * 3. Handles individual adapter failures gracefully
 */

import {
  BaseJob,
  RegisterJob,
  BalanceCacheService,
} from '@telegram-trading-bot-mini/shared/utils';
import { Container } from '../interfaces';
import { OperationTimeCheckerService } from '../services/calculations/operation-time-checker.service';

@RegisterJob('fetch-balance-job')
export class FetchBalanceJob extends BaseJob<Container> {
  // Initialize operation time checker
  private operationTimeChecker: OperationTimeCheckerService;

  public override async init() {
    await super.init();
    this.operationTimeChecker = new OperationTimeCheckerService(
      this.container.logger,
    );
  }

  /**
   * Job execution logic called on schedule
   */
  async onTick(): Promise<void> {
    const { brokerFactory, redis, logger, errorCapture } = this.container;
    const adapters = brokerFactory.getAllAdapters();
    if (adapters.length === 0) {
      logger.debug('No active broker adapters to fetch balance for');
      return;
    }

    logger.info(
      {
        totalAdapters: adapters.length,
      },
      'Starting balance fetch for all adapters',
    );

    /**
     * @todo Good for MVP, when number of account growth we need to revise this logic due to performance issue
     */
    await Promise.all(
      adapters.map(async (adapter) => {
        const accountId = adapter.accountId;
        const exchangeCode = adapter.exchangeCode;

        try {
          // 1. Get account config to check operation hours and balance sharing
          const account =
            await this.container.accountRepository.findByAccountId(accountId);

          // 1a. Validate operation hours
          const operationHours = account?.configs?.operationHours;

          if (operationHours) {
            const isMarketOpen =
              this.operationTimeChecker.isInside(operationHours);

            if (!isMarketOpen) {
              logger.info(
                {
                  accountId,
                  exchangeCode,
                  timezone: operationHours.timezone,
                  schedule: operationHours.schedule,
                },
                'Skipping balance fetch - outside operation hours',
              );

              return; // Skip this adapter
            }
          }

          // 2. Fetch real-time info from broker
          const accountInfo = await adapter.getAccountInfo();

          // 3. Apply balance sharing divisor
          const divisor = account?.brokerConfig?.maxShareVirtualAccounts || 1;

          /**
           * NOTE: If maxShareVirtualAccounts > 1, we share the real account balance with multiple virtual accounts.
           * The balance and equity might be affected by other virtual accounts sharing the same real account,
           * which is expected (similar to CROSS mode in Binance Futures).
           */
          const truncate = (val: number) => Math.trunc(val * 100) / 100;
          const balancedInfo = {
            balance: truncate(accountInfo.balance / divisor),
            equity: truncate(accountInfo.equity / divisor),
            marginUsed: truncate(accountInfo.margin / divisor),
            marginAvailable: truncate(accountInfo.freeMargin / divisor),
          };

          // 4. Transform to cache format
          const balanceCache = new BalanceCacheService(exchangeCode, redis);
          await balanceCache.setBalance(accountId, balancedInfo);

          logger.info(
            {
              accountId,
              exchangeCode,
              balance: balancedInfo.balance,
              realBalance: accountInfo.balance,
              divisor,
            },
            'Successfully cached account balance',
          );
        } catch (error) {
          logger.error(
            { accountId, exchangeCode, error },
            'Failed to fetch/cache balance for account',
          );

          errorCapture.captureException(error as Error, {
            accountId,
            exchangeCode,
            context: 'fetch_balance_job',
          });

          // Continue with next adapter
        }
      }),
    );
  }
}
