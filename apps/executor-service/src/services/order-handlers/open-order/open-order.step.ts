import {
  IPipelineStep,
  NextFunction,
  CommandEnum,
  CommandSide,
  compactObject,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  ExecutionContext,
  OpenTradeExecutionState,
} from '../execution-context';
import { OpenOrderResult } from '../../../adapters/interfaces';
import { ExecuteOrderResultType } from '@telegram-trading-bot-mini/shared/utils';
import { OrderHistoryStatus, OrderStatus } from '@dal';
import { MatchKeysAndValues } from 'mongodb';
import { Order } from '@dal';

/**
 * Step to execute the open order operation with the broker and update the database.
 * This step:
 * 1. Calls the broker adapter to open the order
 * 2. Updates the order in the database with execution results
 */
export class OpenOrderStep implements IPipelineStep<
  ExecutionContext<OpenTradeExecutionState>
> {
  public readonly name = 'OpenOrder';

  public async execute(
    ctx: ExecutionContext<OpenTradeExecutionState>,
    next: NextFunction,
  ): Promise<void> {
    const { payload, adapter, state, logger, session } = ctx;
    const { orderId, symbol, command, traceToken, isImmediate, meta } = payload;
    const { entryPrice, stopLoss, takeProfits, lotSize } = state;

    if (!adapter) {
      throw new Error('Adapter must be resolved before OpenOrderStep');
    }

    if (lotSize === undefined) {
      throw new Error('Lot size must be calculated before OpenOrderStep');
    }

    const logPayload = { orderId, symbol, command, traceToken };

    // Execute the order via broker adapter
    const startTime = Date.now();
    let result: OpenOrderResult;

    try {
      result = await adapter.openOrder({
        orderId,
        symbol,
        side: command === CommandEnum.LONG ? CommandSide.BUY : CommandSide.SELL,
        lotSize,
        isImmediate: isImmediate ?? true,
        entry: entryPrice,
        stopLoss,
        takeProfits,
        meta,
        traceToken,
      });

      // Emit success metric
      adapter.emitMetric(
        'openOrder',
        Date.now() - startTime,
        symbol,
        'success',
        {
          orderType: (isImmediate ?? true) ? 'market' : 'limit',
          side: command === CommandEnum.LONG ? 'long' : 'short',
        },
      );

      logger.info(
        {
          ...logPayload,
          exchangeOrderId: result.exchangeOrderId,
          executedPrice: result.executedPrice,
          executedLots: result.executedLots,
        },
        'Order opened successfully',
      );
    } catch (error) {
      // Emit error metric
      adapter.emitMetric('openOrder', Date.now() - startTime, symbol, 'error', {
        orderType: (isImmediate ?? true) ? 'market' : 'limit',
        side: command === CommandEnum.LONG ? 'long' : 'short',
      });
      logger.error({ ...logPayload, error }, 'Failed to open order');
      throw error;
    }

    // Store result in context
    ctx.result = {
      orderId,
      accountId: payload.accountId,
      traceToken,
      messageId: payload.messageId,
      channelId: payload.channelId,
      success: true,
      symbol,
      type: ExecuteOrderResultType.OrderOpen,
      side: command === CommandEnum.LONG ? 'LONG' : 'SHORT',
      lotSize: state.lotSize,
      lotSizeRemaining: result.executedLots,
      takeProfits: (state.normalisedTakeProfits || []).map((tp) => ({
        price: tp.price!,
      })),
    };

    // Update database with order results
    await this.updateOrderAfterOpen(ctx, result);

    return await next();
  }

  /**
   * Update order in database after successful open
   */
  private async updateOrderAfterOpen(
    ctx: ExecutionContext<OpenTradeExecutionState>,
    result: OpenOrderResult,
  ): Promise<void> {
    const { payload, state, container, session } = ctx;
    const { orderId } = payload;
    const { lotSize, stopLoss, takeProfits } = state;

    // Build the $set update object
    const setUpdate: MatchKeysAndValues<Order> = {
      'entry.entryOrderId': result.exchangeOrderId,
      'entry.actualEntryPrice': result.executedPrice,
      status: OrderStatus.OPEN,
      lotSizeRemaining: result.executedLots,
    };

    // Always update lot size to ensure the final calculated value is persisted
    (setUpdate as any)['lotSize'] = lotSize;

    // Add SL price and order ID if present
    if (stopLoss?.price) {
      setUpdate['sl.slPrice'] = stopLoss.price;
    }
    if (result.stopLossOrderId) {
      setUpdate['sl.slOrderId'] = result.stopLossOrderId;
    }

    // Add TP prices and order IDs if present
    if (takeProfits && takeProfits.length > 0) {
      const tp1 = takeProfits[0];
      if (tp1?.price) {
        setUpdate['tp.tp1Price'] = tp1.price;
      }
    }
    if (result.takeProfitOrderId) {
      setUpdate['tp.tp1OrderId'] = result.takeProfitOrderId;
    }

    const tiersToPersist = state.normalisedTakeProfits;

    if (tiersToPersist && tiersToPersist.length > 0) {
      setUpdate['meta.takeProfitTiers'] = tiersToPersist
        .filter((tp) => tp.price)
        .map((tp) => ({
          price: tp.price!,
          isUsed: (tp as any).isUsed || false,
        }));
    }

    // Build history info object
    const historyInfo = compactObject({
      exchangeOrderId: result.exchangeOrderId,
      executedPrice: result.executedPrice,
      executedLots: result.executedLots,
      calculatedLotSize: lotSize,
      originalLotSize: payload.lotSize,
      brokerSlAdjustment: state.brokerSlAdjustment,
    });

    // Use built-in history function
    await ctx.addOrderHistory(OrderHistoryStatus.OPEN, historyInfo);

    // Update remaining fields
    await container.orderRepository.updateOne(
      { orderId } as any,
      { $set: setUpdate },
      session,
    );
  }
}
