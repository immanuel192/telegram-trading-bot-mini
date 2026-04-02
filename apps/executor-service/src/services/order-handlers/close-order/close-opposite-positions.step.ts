import { Order, OrderSide, OrderStatus } from '@dal';
import {
  CommandEnum,
  ExecuteOrderRequestPayload,
  IPipelineStep,
  NextFunction,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  ExecutionContext,
  OpenTradeExecutionState,
} from '../execution-context';
import {
  brokerCloseOrder,
  calculateOrderPnl,
  finalizeOrderClosure,
  publishCloseResult,
} from './close-order.helper';

/**
 * Step to close opposite positions before opening a new one.
 * If closeOppositePosition is enabled for the account, it finds all open orders
 * on the opposite side and closes them.
 */
export class CloseOppositePositionsStep implements IPipelineStep<
  ExecutionContext<OpenTradeExecutionState>
> {
  public readonly name = 'CloseOppositePositions';

  public async execute(
    ctx: ExecutionContext<OpenTradeExecutionState>,
    next: NextFunction,
  ): Promise<void> {
    const { account, payload, adapter, container, logger } = ctx;
    const { symbol, command } = payload;

    if (!adapter) {
      throw new Error(
        'Adapter must be resolved before CloseOppositePositionsStep',
      );
    }

    // Check if closeOppositePosition is enabled (default to true)
    const shouldCloseOpposite = account.configs?.closeOppositePosition ?? true;

    if (!shouldCloseOpposite) {
      return await next();
    }

    // Determine opposite side
    const oppositeSide =
      command === CommandEnum.LONG ? OrderSide.SHORT : OrderSide.LONG;

    // Find all open orders on the opposite side for this symbol and account
    const oppositeOrders = await container.orderRepository.findAll({
      accountId: account.accountId,
      symbol,
      side: oppositeSide,
      status: OrderStatus.OPEN,
    });

    if (oppositeOrders.length === 0) {
      return await next();
    }

    logger.info(
      { ordersToClose: oppositeOrders.length, symbol, oppositeSide },
      'Closing opposite positions before opening new order',
    );

    // Close each opposite order
    for (const oppositeOrder of oppositeOrders) {
      await this.executeOrderClose(ctx, oppositeOrder);
    }

    return await next();
  }

  /**
   * Helper to execute closure for a single opposite order
   */
  private async executeOrderClose(
    ctx: ExecutionContext<OpenTradeExecutionState>,
    order: Order,
  ): Promise<void> {
    const { adapter, payload, logger } = ctx;
    const { orderId, symbol } = order;

    try {
      const closePayload: ExecuteOrderRequestPayload = {
        ...payload,
        orderId,
        command: CommandEnum.CLOSE_ALL,
        timestamp: Date.now(),
      };

      // 1. Broker call
      const { result, error, isNotFound } = await brokerCloseOrder(
        adapter!,
        orderId,
        symbol,
        payload.traceToken,
      );

      // 2. Calculate PNL (Directly using our fetched entity)
      const pnlValue =
        result && !isNotFound
          ? calculateOrderPnl(order, result.closedPrice, result.closedLots)
          : undefined;

      // 3. Persist results
      await finalizeOrderClosure(ctx, {
        orderId,
        closePayload,
        result,
        error,
        isNotFound,
        pnlValue,
      });

      // 4. Publish result for secondary order
      if (result) {
        await publishCloseResult(ctx, orderId, result, closePayload);
      }

      logger.info({ closedOrderId: orderId }, 'Closed opposite position');

      if (error && !isNotFound) {
        throw error;
      }
    } catch (e) {
      logger.error(
        { closedOrderId: orderId, error: (e as Error).message },
        'Failed to close opposite position',
      );
      // We don't throw here to ensure we try to close other orders if any
    }
  }
}
