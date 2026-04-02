import {
  IPipelineStep,
  NextFunction,
  CommandEnum,
  ServiceName,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  ExecutionContext,
  OpenTradeExecutionState,
  UpdateOrderExecutionState,
} from '../execution-context';
import { OrderHistoryStatus, Order, Account } from '@dal';

type ExecutionType = OpenTradeExecutionState | UpdateOrderExecutionState;

/**
 * Step to sync Take Profit (TP) and Stop Loss (SL) across linked orders.
 * Use with LONG/SHORT, MOVE_SL and SET_TP_SL commands
 */
export class SyncLinkedOrderTpSlStep implements IPipelineStep<
  ExecutionContext<ExecutionType>
> {
  public readonly name = 'SyncLinkedOrderTpSl';

  public async execute(
    ctx: ExecutionContext<ExecutionType>,
    next: NextFunction,
  ): Promise<void> {
    const { payload, container, state, account, session } = ctx;
    const { orderId, traceToken, command } = payload;
    const { shouldSyncTpSl, takeProfits, stopLoss } = state;

    // We only proceed if shouldSyncTpSl is true or skipLinkedOrderSync is false (default is true if not set)
    if (
      shouldSyncTpSl === false ||
      payload.meta?.executionInstructions?.skipLinkedOrderSync
    ) {
      return await next();
    }

    // @todo when we do TP monitoring, we should revise this logic
    const order = await container.orderRepository.findOne({ orderId }, session);

    if (order && order.linkedOrders && order.linkedOrders.length > 0) {
      // Prefer state values as they are resolved/adjusted by previous steps
      let slToSync = stopLoss?.price ? { price: stopLoss.price } : undefined;
      let tpToSync = this.selectTpForLinkedOrder(ctx, takeProfits, account);

      // Fallback to order values if state doesn't have prices (only for non-update commands)
      const isUpdateCommand =
        command === CommandEnum.MOVE_SL || command === CommandEnum.SET_TP_SL;

      if (!isUpdateCommand) {
        if (!slToSync && order.sl?.slPrice) {
          slToSync = { price: order.sl.slPrice };
        }
        if (!tpToSync && order.tp?.tp1Price) {
          tpToSync = { price: order.tp.tp1Price };
        }
      }

      // Logic for syncing TP/SL across linked orders
      if (slToSync || tpToSync) {
        await this.syncLinkedOrdersTpSl(ctx, order, {
          traceToken,
          sl: slToSync,
          tp: tpToSync,
          normalisedTPs: state.normalisedTakeProfits,
        });
      }

      // Log TP optimization in history (if applied and for new orders)
      await this.logTpOptimizationHistory(ctx, order, takeProfits);
    }

    return await next();
  }

  /**
   * Unified logic for syncing TP/SL across linked orders
   * @param ctx Execution context
   * @param sourceOrder The order that triggered the sync
   * @param options SL/TP and trace token
   */
  private async syncLinkedOrdersTpSl(
    ctx: ExecutionContext<OpenTradeExecutionState>,
    sourceOrder: Order,
    options: {
      sl?: { price: number };
      tp?: { price: number };
      normalisedTPs?: { price?: number; pips?: number }[];
      traceToken?: string;
    } = {},
  ): Promise<void> {
    const { orderId, linkedOrders, accountId } = sourceOrder;
    const { container, logger } = ctx;

    if (!linkedOrders?.length) return;

    try {
      logger.info(
        { orderId, linkedCount: linkedOrders.length - 1 },
        'Broadcasting TP/SL to linked siblings',
      );

      // Trigger jobs with a delay to avoid race condition:
      // The current order is being updated within a MongoDB transaction.
      // If we trigger the job immediately, it may execute before the transaction commits,
      // causing it to see stale order status (e.g., PENDING instead of OPEN).
      // The 200ms delay gives the transaction time to commit.
      for (const targetOrderId of linkedOrders) {
        if (targetOrderId === orderId) continue;

        await container.jobService?.triggerJob({
          jobName: ServiceName.AUTO_SYNC_TP_SL_LINKED_ORDER_JOB,
          params: {
            accountId,
            orderId: targetOrderId,
            sl: options.sl,
            tp: {
              ...(options.tp || {}),
              tiers: options.normalisedTPs?.map((tp) => ({
                price: tp.price!,
              })),
            },
            sourceOrderId: orderId,
          },
          traceToken: options.traceToken,
          delay: 200, // 200ms delay to allow MongoDB transaction to commit
        });
      }
    } catch (error) {
      logger.error({ orderId, error }, 'Linked order sync failed');
    }
  }

  /**
   * Select appropriate TP for linked order based on optimization config
   * @param ctx Execution context
   * @param selectedTakeProfit Array of selected TPs
   * @param account Account with configs
   */
  private selectTpForLinkedOrder(
    ctx: ExecutionContext<OpenTradeExecutionState>,
    selectedTakeProfit: { price?: number; pips?: number }[] | undefined,
    account: Account,
  ): { price: number } | undefined {
    if (!selectedTakeProfit || selectedTakeProfit.length === 0) {
      return undefined;
    }

    // If optimization enabled and second TP available, use it
    if (
      account.configs?.linkedOrderOptimiseTp &&
      selectedTakeProfit[1]?.price
    ) {
      ctx.logger.debug(
        {
          accountId: account.accountId,
          currentOrderTP: selectedTakeProfit[0].price,
          linkedOrderTP: selectedTakeProfit[1].price,
        },
        'Using optimized TP for linked order',
      );
      return { price: selectedTakeProfit[1].price };
    }

    // Default: use same TP as current order
    return selectedTakeProfit[0]?.price
      ? { price: selectedTakeProfit[0].price }
      : undefined;
  }

  /**
   * Log TP optimization in order history when applied
   * @param ctx Execution context
   * @param order Order document
   * @param selectedTakeProfit Array of selected TPs
   */
  private async logTpOptimizationHistory(
    ctx: ExecutionContext<OpenTradeExecutionState>,
    order: Order,
    selectedTakeProfit: { price?: number; pips?: number }[] | undefined,
  ): Promise<void> {
    const { account, logger } = ctx;

    // Only log if optimization is enabled and actually applied
    if (
      !account.configs?.linkedOrderOptimiseTp ||
      !selectedTakeProfit?.[1]?.price ||
      !order.linkedOrders ||
      order.linkedOrders.length === 0
    ) {
      return;
    }

    try {
      await ctx.addOrderHistory(OrderHistoryStatus.INFO, {
        message: 'TP optimization applied for linked orders',
        currentOrderTP: selectedTakeProfit[0].price,
        linkedOrderTP: selectedTakeProfit[1].price,
      });
    } catch (error) {
      logger.error(
        { orderId: order.orderId, error },
        'Failed to log TP optimization history',
      );
    }
  }
}
