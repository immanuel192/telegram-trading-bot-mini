import {
  IPipelineStep,
  NextFunction,
  ExecuteOrderResultType,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  CloseBadPositionExecutionState,
  ExecutionContext,
} from '../execution-context';
import { OrderHistoryStatus } from '@dal';

/**
 * Purpose: Check if CLOSE_BAD_POSITION is disabled in account config.
 * Core Flow: If disabled, add SKIPPED history and abort pipeline.
 */
export class CheckDisableCloseBadPositionStep implements IPipelineStep<
  ExecutionContext<CloseBadPositionExecutionState>
> {
  public readonly name = 'CheckDisableCloseBadPosition';

  public async execute(
    ctx: ExecutionContext<CloseBadPositionExecutionState>,
    next: NextFunction,
  ): Promise<void> {
    const { account, payload, logger } = ctx;
    const { orderId, traceToken, messageId, channelId, command } = payload;

    if (account.configs?.disableCloseBadPosition) {
      logger.info(
        { orderId, accountId: account.accountId, traceToken },
        'CLOSE_BAD_POSITION command skipped - disabled in account config',
      );

      // Add SKIPPED history entry
      await ctx.addOrderHistory(OrderHistoryStatus.SKIPPED, {
        message:
          'CLOSE_BAD_POSITION command skipped due to account config (disableCloseBadPosition=true)',
        reason:
          'Copy trading delay makes this command unreliable for DCA strategies',
      });

      // Publish success event (command was successfully skipped)
      ctx.result = {
        orderId,
        messageId,
        channelId,
        accountId: account.accountId,
        traceToken,
        success: true,
        symbol: payload.symbol,
        type: ExecuteOrderResultType.OTHERS,
      };

      // Abort the rest of the pipeline
      return await ctx.abort(
        'CLOSE_BAD_POSITION command skipped due to account config',
      );
    }

    await next();
  }
}
