import { IPipelineStep } from '@telegram-trading-bot-mini/shared/utils';
import { OrderHistoryStatus } from '@dal';
import {
  ExecutionContext,
  OpenTradeExecutionState,
} from '../execution-context';

/**
 * Step to validate that the account hasn't reached its maximum open positions limit.
 * If the limit is reached, it updates the order history and halts the pipeline.
 */
export const MaxPositionsStep: IPipelineStep<
  ExecutionContext<OpenTradeExecutionState>
> = {
  name: 'MaxPositions',
  execute: async (ctx, next) => {
    const { payload, account, container, logger } = ctx;
    const { orderId } = payload;

    if (!account) {
      throw new Error('Account must be resolved before MaxPositionsStep');
    }

    const maxOpenPositions = account.configs?.maxOpenPositions;

    // Continue if no limit is set or limit is non-positive
    if (!maxOpenPositions || maxOpenPositions === 0) {
      return await next();
    }

    const currentOpenPositions =
      await container.orderRepository.countOpenOrdersByAccountId(
        account.accountId,
        ctx.session,
      );

    if (currentOpenPositions < maxOpenPositions) {
      return await next();
    }

    logger.warn(
      {
        orderId,
        accountId: account.accountId,
        currentOpenPositions,
        maxOpenPositions,
      },
      'Skipping order: Maximum open positions limit reached',
    );

    // Update Order.history with SKIPPED status using helper
    await ctx.addOrderHistory(OrderHistoryStatus.SKIPPED, {
      reason: 'EXCEED_MAX_OPEN_POSITIONS',
      currentOpenPositions,
      maxOpenPositions,
    });

    // Set failure result for deferred publishing step using helper
    ctx.setFailureResult(
      'EXCEED_MAX_OPEN_POSITIONS',
      `Maximum open positions limit reached (${maxOpenPositions})`,
    );

    // Halt the pipeline
  },
};
