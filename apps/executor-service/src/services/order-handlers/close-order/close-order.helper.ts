import {
  CommandEnum,
  ExecuteOrderRequestPayload,
  ExecuteOrderResultPayload,
  ExecuteOrderResultType,
  MessageType,
  StreamTopic,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  BaseCloseExecutionState,
  OpenTradeExecutionState,
  ExecutionContext,
} from '../execution-context';
import { IBrokerAdapter, CloseOrderResult } from '../../../adapters/interfaces';
import { OrderNotFoundError } from '../../../adapters/errors';
import { OrderHistoryStatus, OrderSide, OrderStatus, Order } from '@dal';
import { ObjectId } from 'mongodb';

/**
 * Atomic: Calls the broker adapter to close an order.
 * Maps OrderNotFoundError to a safe "N/A" result.
 */
export async function brokerCloseOrder(
  adapter: IBrokerAdapter,
  orderId: string,
  symbol: string,
  traceToken: string,
  amount?: number,
): Promise<{ result?: CloseOrderResult; error?: any; isNotFound: boolean }> {
  const startTime = Date.now();
  try {
    const result = await adapter.closeOrder({
      orderId,
      symbol,
      traceToken,
      amount,
    });
    adapter.emitMetric('closeOrder', Date.now() - startTime, symbol, 'success');
    return { result, isNotFound: false };
  } catch (e) {
    if (e instanceof OrderNotFoundError) {
      adapter.emitMetric(
        'closeOrder',
        Date.now() - startTime,
        symbol,
        'success',
      );
      return {
        isNotFound: true,
        error: e,
        result: {
          exchangeOrderId: 'N/A',
          closedPrice: 0,
          closedLots: 0,
          closedAt: Date.now(),
        },
      };
    }
    adapter.emitMetric('closeOrder', Date.now() - startTime, symbol, 'error');
    return { error: e, isNotFound: false };
  }
}

/**
 * Atomic: Calculates PNL for an order based on exit details.
 */
export function calculateOrderPnl(
  order: Order,
  exitPrice: number,
  closedLots: number,
): number {
  const entryPrice =
    order.entry?.actualEntryPrice || order.entry?.entryPrice || 0;
  const direction = order.side === OrderSide.LONG ? 1 : -1;
  return (exitPrice - entryPrice) * closedLots * direction;
}

/**
 * Atomic: Finalizes the order closure in the database.
 * Handles both main order (ctx.payload) and secondary orders.
 */
export async function finalizeOrderClosure(
  ctx: ExecutionContext<BaseCloseExecutionState | OpenTradeExecutionState>,
  params: {
    orderId: string;
    closePayload: ExecuteOrderRequestPayload;
    result?: CloseOrderResult;
    error?: any;
    isNotFound: boolean;
    pnlValue?: number;
  },
): Promise<void> {
  const { orderId, closePayload, result, error, isNotFound, pnlValue } = params;
  const { container, session, logger, state } = ctx;

  const isFinal =
    closePayload.command !== CommandEnum.CLOSE_PARTIAL ||
    (state as BaseCloseExecutionState).isFullClose;

  const updateSet: any = isFinal
    ? { status: OrderStatus.CLOSED, closedAt: new Date() }
    : {};
  const historyInfo: any = {};
  const rawResponse =
    error?.rawResponse || error?.response?.body || error?.response?.data;

  if (result) {
    if (isNotFound) {
      logger.info(
        { orderId, traceToken: closePayload.traceToken, rawResponse },
        'Order already closed on exchange',
      );
      historyInfo.reason = 'Order already closed (not found on exchange)';
      if (rawResponse) historyInfo.rawResponse = rawResponse;
    } else {
      updateSet['exit.actualExitPrice'] = result.closedPrice;
      if (pnlValue !== undefined) {
        updateSet['pnl.pnl'] = pnlValue;
      }
      historyInfo.exchangeOrderId = result.exchangeOrderId;
      historyInfo.closedPrice = result.closedPrice;
      historyInfo.closedLots = result.closedLots;
      if (pnlValue !== undefined) historyInfo.pnl = pnlValue;

      // For partial or cumulative closures, we increment the total realized PNL.
      // If result is from CLOSE_ALL, it still works as it adds the final portion.
      if (pnlValue !== undefined) {
        delete updateSet['pnl.pnl']; // Ensure we don't $set it
      }
    }
  } else if (error) {
    updateSet.status = undefined; // Don't mark as closed if it failed
    historyInfo.error = error.message;
    if (rawResponse) historyInfo.rawResponse = rawResponse;
  }

  /**
   * Use cases
   * - For close orders of the Oppose positions: the orderId != ctx.payload.orderId
   * - For all other cases: it will be the same
   */
  if (orderId === ctx.payload.orderId) {
    await ctx.addOrderHistory(
      result
        ? isFinal
          ? OrderHistoryStatus.CLOSED
          : OrderHistoryStatus.INFO
        : OrderHistoryStatus.ERROR,
      historyInfo,
    );

    if (
      result &&
      (Object.keys(updateSet).length > 0 || pnlValue !== undefined)
    ) {
      await container.orderRepository.updateOne(
        { orderId } as any,
        {
          $set: updateSet,
          ...(pnlValue !== undefined && { $inc: { 'pnl.pnl': pnlValue } }),
        },
        session,
      );
    }
  } else {
    // Secondary order (e.g. opposite positions)
    const update: any = {
      $push: {
        history: {
          _id: new ObjectId(),
          status: result
            ? isFinal
              ? OrderHistoryStatus.CLOSED
              : OrderHistoryStatus.INFO
            : OrderHistoryStatus.ERROR,
          service: 'executor-service',
          ts: result && !isNotFound ? new Date(result.closedAt) : new Date(),
          traceToken: closePayload.traceToken,
          messageId: closePayload.messageId,
          channelId: closePayload.channelId,
          command: closePayload.command,
          info: historyInfo,
        } as any,
      },
    };

    if (result && Object.keys(updateSet).length > 0) {
      update.$set = updateSet;
    }
    if (result && pnlValue !== undefined) {
      update.$inc = { 'pnl.pnl': pnlValue };
    }

    await container.orderRepository.updateOne({ orderId }, update, session);
  }
}

/**
 * Atomic: Publishes result to stream.
 */
export async function publishCloseResult(
  ctx: ExecutionContext<BaseCloseExecutionState | OpenTradeExecutionState>,
  orderId: string,
  result: CloseOrderResult,
  closePayload: ExecuteOrderRequestPayload,
): Promise<void> {
  const state = ctx.state as BaseCloseExecutionState;
  const isFinal =
    closePayload.command !== CommandEnum.CLOSE_PARTIAL || state.isFullClose;

  const resultPayload: ExecuteOrderResultPayload = {
    orderId,
    messageId: closePayload.messageId,
    channelId: closePayload.channelId,
    accountId: closePayload.accountId,
    traceToken: closePayload.traceToken,
    success: true,
    symbol: closePayload.symbol,
    type: isFinal
      ? ExecuteOrderResultType.OrderClosed
      : ExecuteOrderResultType.OrderUpdatedTpSl,
    side: state.order?.side,
    lotSize: state.order?.lotSize,
    lotSizeRemaining: isFinal ? 0 : state.order?.lotSizeRemaining,
    takeProfits: (state.order?.meta as any)?.takeProfitTiers?.map(
      (tp: any) => ({
        price: tp.price,
        isUsed: tp.isUsed,
      }),
    ),
  };

  await ctx.container.streamPublisher.publish(
    StreamTopic.ORDER_EXECUTION_RESULTS,
    {
      version: '1.0.0',
      type: MessageType.EXECUTE_ORDER_RESULT,
      payload: resultPayload,
    },
  );
}
