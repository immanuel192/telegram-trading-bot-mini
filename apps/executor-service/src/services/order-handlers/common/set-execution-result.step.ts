import {
  IPipelineStep,
  NextFunction,
  ExecuteOrderResultType,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  ExecutionContext,
  OpenTradeExecutionState,
  UpdateOrderExecutionState,
} from '../execution-context';

type ExecutionType = OpenTradeExecutionState | UpdateOrderExecutionState;

/**
 * Purpose: Ensure execution result is set in context before pipeline completion.
 * This effectively marks the operation as successful if it reaches this point.
 * Warning: you should set the result rather than using this step. For now only MOVE_SL and SET_TP_SL using this step
 */
export class SetExecutionResultStep implements IPipelineStep<
  ExecutionContext<ExecutionType>
> {
  public readonly name = 'SetExecutionResult';

  public async execute(
    ctx: ExecutionContext<ExecutionType>,
    next: NextFunction,
  ): Promise<void> {
    const { payload } = ctx;

    // Only set result if not already set
    if (!ctx.result) {
      const state = ctx.state as UpdateOrderExecutionState;
      const order = state.order;

      ctx.result = {
        orderId: payload.orderId,
        accountId: payload.accountId,
        traceToken: payload.traceToken,
        messageId: payload.messageId,
        channelId: payload.channelId,
        success: true,
        symbol: payload.symbol,
        type: ExecuteOrderResultType.OrderUpdatedTpSl,
        side: state.side || order?.side,
        lotSize: order?.lotSize,
        lotSizeRemaining: order?.lotSizeRemaining,
        takeProfits: (state.normalisedTakeProfits || []).map((tp) => ({
          price: tp.price!,
        })),
      };
    }

    return await next();
  }
}
