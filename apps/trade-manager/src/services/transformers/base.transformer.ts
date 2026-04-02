/**
 * Base transformer class with shared utility methods
 */

import {
  CommandEnum,
  CommandSide,
  ExecuteOrderRequestPayload,
  LoggerInstance,
} from '@telegram-trading-bot-mini/shared/utils';
import { Order, OrderSide } from '@dal';
import { OrderService } from '../order.service';
import { TransformContext, TranslateMessageResultCommand } from './types';

/**
 * Base class for command transformers
 * Provides shared utility methods for validation and transformation
 */
export abstract class BaseTransformer {
  constructor(
    protected readonly orderService: OrderService,
    protected readonly logger?: LoggerInstance,
  ) {}

  /**
   * Map CommandSide to OrderSide
   * CommandSide.BUY → OrderSide.LONG
   * CommandSide.SELL → OrderSide.SHORT
   */
  protected mapCommandSideToOrderSide(commandSide: CommandSide): OrderSide {
    return commandSide === CommandSide.BUY ? OrderSide.LONG : OrderSide.SHORT;
  }

  /**
   * Filter orders by side if extraction.side is provided
   * Returns all orders if no side specified
   * Logs warning if filtering reduces order count
   */
  protected filterOrdersBySide(
    orders: Order[],
    extractionSide: CommandSide | undefined,
    command: CommandEnum,
    context: TransformContext,
  ): Order[] {
    if (!extractionSide) {
      return orders;
    }

    const targetOrderSide = this.mapCommandSideToOrderSide(extractionSide);
    const filteredOrders = orders.filter(
      (order) => order.side === targetOrderSide,
    );

    if (filteredOrders.length < orders.length) {
      this.logger?.info(
        {
          command,
          requestedSide: extractionSide,
          targetOrderSide,
          totalOrders: orders.length,
          filteredOrders: filteredOrders.length,
          messageId: context.messageId,
          traceToken: context.traceToken,
        },
        'Filtered orders by side',
      );
    }

    return filteredOrders;
  }

  /**
   * Log validation failure with details
   */
  protected logValidationFailure(
    reason: string,
    commandType: CommandEnum,
    context: TransformContext,
  ): void {
    this.logger?.warn(
      {
        reason,
        commandType,
        messageId: context.messageId,
        traceToken: context.traceToken,
      },
      'Command transformation validation failed',
    );
  }
}
