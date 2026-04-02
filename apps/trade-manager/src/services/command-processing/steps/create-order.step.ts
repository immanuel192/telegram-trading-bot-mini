/**
 * Purpose: Extract the handleTradeOrderCreation logic for order persistence.
 */

import {
  NextFunction,
  IPipelineStep,
  CommandEnum,
  LoggerInstance,
} from '@telegram-trading-bot-mini/shared/utils';
import { CommandProcessingContext } from '../execution-context';
import { OrderService } from '../../order.service';
import { OrderSide, OrderExecutionType, TradeType } from '@dal';

export class OrderCreationStep implements IPipelineStep<CommandProcessingContext> {
  name = 'OrderCreationStep';

  constructor(
    private readonly orderService: OrderService,
    private readonly logger: LoggerInstance,
  ) {}

  async execute(
    ctx: CommandProcessingContext,
    next: NextFunction,
  ): Promise<void> {
    const { state, messageContext } = ctx;
    const { command, orderCreationPayload: createPayload } = state;
    const { messageId, channelId, traceToken } = messageContext;

    if (!createPayload) {
      return await next();
    }

    const isLinkedWithPrevious =
      command.extraction?.isLinkedWithPrevious ?? false;

    // Create order record
    // orderService.createOrder will handle finding and linking orphan orders
    // if isLinkedWithPrevious is true
    const orderResult = await this.orderService.createOrder(
      {
        orderId: createPayload.orderId,
        accountId: state.account.accountId,
        messageId,
        channelId,
        symbol: createPayload.symbol,
        side:
          command.command === CommandEnum.LONG
            ? OrderSide.LONG
            : OrderSide.SHORT,
        executionType: createPayload.isImmediate
          ? OrderExecutionType.market
          : OrderExecutionType.limit,
        tradeType: TradeType.FUTURE,
        lotSize: createPayload.lotSize ?? 0,
        isLinkedWithPrevious,
        entry: createPayload.entry,
        traceToken,
        command: command.command,
      },
      undefined as any, // Session removed
    );

    this.logger.info(
      {
        messageId,
        channelId,
        orderId: createPayload.orderId,
        linkedOrderIds: orderResult.linkedOrderIds,
        isLinkedWithPrevious,
        traceToken,
      },
      'Order created for LONG/SHORT command',
    );

    state.orderCreated = true;

    await next();
  }
}
