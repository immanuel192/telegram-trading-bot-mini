/**
 * Purpose: Handler for EXECUTE_ORDER_RESULT events from Redis Stream.
 * Allows trade-manager to be aware of the result of order execution from executor-service.
 */

import {
  MessageType,
  StreamMessage,
  IErrorCapture,
  LoggerInstance,
} from '@telegram-trading-bot-mini/shared/utils';
import { BaseMessageHandler } from '@telegram-trading-bot-mini/shared/utils/stream/consumers/base-message-handler';
import { ExecuteOrderResultType } from '@telegram-trading-bot-mini/shared/utils';
import { OrderCacheService } from '../../services/order-cache.service';

/**
 * Handler for EXECUTE_ORDER_RESULT type
 * Explicitly does not log on success to reduce noise, as per user request.
 */
export class ExecuteOrderResultHandler extends BaseMessageHandler<MessageType.EXECUTE_ORDER_RESULT> {
  constructor(
    logger: LoggerInstance,
    errorCapture: IErrorCapture,
    private readonly orderCacheService: OrderCacheService,
  ) {
    super(logger, errorCapture);
  }

  /**
   * Handle incoming EXECUTE_ORDER_RESULT events
   */
  async handle(
    message: StreamMessage<MessageType.EXECUTE_ORDER_RESULT>,
    id: string,
  ): Promise<void> {
    const { payload } = message;

    // Process with tracing
    return this.processWithTracing(message, id, async () => {
      // If execution failed, we don't need to update the cache (it's for OPEN orders)
      if (!payload.success) {
        return;
      }

      const {
        orderId,
        accountId,
        type,
        messageId,
        channelId,
        symbol,
        side,
        lotSize,
        lotSizeRemaining,
        takeProfits,
      } = payload;

      switch (type) {
        case ExecuteOrderResultType.OrderOpen:
          if (symbol && side && lotSize !== undefined) {
            this.logger.info(
              { orderId, accountId, symbol, side, lotSize, takeProfits },
              'Cache: Adding new open order',
            );
            await this.orderCacheService.addOrder(
              orderId,
              accountId,
              symbol,
              side,
              messageId,
              channelId,
              lotSize,
              takeProfits || [],
            );
          }
          break;

        case ExecuteOrderResultType.OrderUpdatedTpSl:
          this.logger.info(
            {
              orderId,
              lotSizeRemaining,
              tpCount: takeProfits?.length,
              takeProfits,
            },
            'Cache: Updating order TP/SL or lot size',
          );
          this.orderCacheService.updateOrder(orderId, {
            lotSizeRemaining,
            takeProfits,
          });
          break;

        case ExecuteOrderResultType.OrderClosed:
          this.logger.info({ orderId }, 'Cache: Removing closed order');
          this.orderCacheService.removeOrder(orderId);
          break;

        default:
          // OTHERS or unknown type - no cache action needed
          break;
      }
    });
  }
}
