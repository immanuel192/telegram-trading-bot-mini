import {
  IPipelineStep,
  NextFunction,
  ExecuteOrderResultType,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  ExecutionContext,
  BaseCloseExecutionState,
} from '../execution-context';
import { finalizeOrderClosure } from './close-order.helper';

/**
 * Step to finalize the order closure in the database (Status, history, PNL).
 * This is meant to be used as a DEFERRED step in the CLOSE_ALL pipeline.
 */
export class UpdateOrderHistoryAfterCloseStep implements IPipelineStep<
  ExecutionContext<BaseCloseExecutionState>
> {
  public readonly name = 'UpdateOrderHistoryAfterClose';

  public async execute(
    ctx: ExecutionContext<BaseCloseExecutionState>,
    next: NextFunction,
  ): Promise<void> {
    const { payload, state } = ctx;
    const { closeResult, error } = state;
    const isNotFound = state.isOrderNotFound;
    const pnlValue = state.pnlValue;

    // We only finalize if we have a result from the previous steps
    // Or if there was an error that we need to log in history
    if (!closeResult && !error) {
      return await next();
    }

    await finalizeOrderClosure(ctx, {
      orderId: payload.orderId,
      closePayload: payload,
      result: closeResult,
      error,
      isNotFound,
      pnlValue,
    });

    // If successful, prepare the result for PublishResultStep
    if (closeResult) {
      ctx.result = {
        orderId: payload.orderId,
        accountId: payload.accountId,
        traceToken: payload.traceToken,
        messageId: payload.messageId,
        channelId: payload.channelId,
        success: true,
        symbol: payload.symbol,
        type: state.isFullClose
          ? ExecuteOrderResultType.OrderClosed
          : ExecuteOrderResultType.OrderUpdatedTpSl,
        side: state.order?.side,
        lotSize: state.order?.lotSize,
        lotSizeRemaining: state.isFullClose ? 0 : state.order?.lotSizeRemaining,
        takeProfits: (state.order?.meta as any)?.takeProfitTiers?.map(
          (tp: any) => ({
            price: tp.price,
            isUsed: tp.isUsed,
          }),
        ),
      };
    }

    return await next();
  }
}
