import {
  IPipelineStep,
  LoggerInstance,
  NextFunction,
} from '@telegram-trading-bot-mini/shared/utils';
import { OrderHistoryStatus } from '@dal';
import { ExecutionContext, BaseExecutionState } from '../execution-context';
import { OperationTimeCheckerService } from '../../calculations/operation-time-checker.service';

/**
 * Step to validate if the market is open for the given symbol/account.
 * If the market is closed, it updates the order history and halts the pipeline.
 * Reuses OperationTimeCheckerService logic directly.
 */
export class MarketHoursStep implements IPipelineStep<
  ExecutionContext<BaseExecutionState>
> {
  public readonly name = 'MarketHours';
  private readonly timeChecker: OperationTimeCheckerService;

  constructor(logger: LoggerInstance) {
    this.timeChecker = new OperationTimeCheckerService(logger);
  }

  public async execute(
    ctx: ExecutionContext<BaseExecutionState>,
    next: NextFunction,
  ): Promise<void> {
    const { payload, account, container, logger } = ctx;
    const { symbol, orderId, traceToken, command } = payload;

    if (!account) {
      throw new Error('Account must be resolved before MarketHoursStep');
    }

    const opHoursConfig =
      account.symbols?.[symbol]?.operationHours ||
      account.configs?.operationHours;

    // If no config or market is open, continue to next step
    if (!opHoursConfig || this.timeChecker.isInside(opHoursConfig)) {
      return await next();
    }

    logger.warn(
      {
        orderId,
        symbol,
        accountId: account.accountId,
        schedule: opHoursConfig.schedule,
      },
      'Skipping order: Market is currently closed',
    );

    // Update Order.history with SKIPPED status
    await ctx.addOrderHistory(OrderHistoryStatus.SKIPPED, {
      reason: 'MARKET_CLOSED',
      schedule: opHoursConfig.schedule,
      timezone: opHoursConfig.timezone,
    });

    // Set failure result for deferred publishing step
    ctx.setFailureResult(
      'MARKET_CLOSED',
      `Market is closed for ${symbol}. Schedule: ${opHoursConfig.schedule}`,
    );

    // Halt the pipeline by NOT calling next()
  }
}
