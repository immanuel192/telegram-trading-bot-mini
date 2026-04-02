import {
  IPipelineStep,
  NextFunction,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  ExecutionContext,
  BaseCloseExecutionState,
} from '../execution-context';
import { brokerCloseOrder } from './close-order.helper';

/**
 * Step to execute the close order operation on the broker.
 * Stores result in context state for further processing.
 */
export class BrokerCloseStep implements IPipelineStep<
  ExecutionContext<BaseCloseExecutionState>
> {
  public readonly name = 'BrokerClose';

  public async execute(
    ctx: ExecutionContext<BaseCloseExecutionState>,
    next: NextFunction,
  ): Promise<void> {
    const { payload, adapter, logger } = ctx;
    const { orderId, symbol, traceToken } = payload;

    if (!adapter) {
      throw new Error('Adapter must be resolved before BrokerCloseStep');
    }

    logger.info(
      { orderId, symbol, traceToken },
      'Calling broker to close order',
    );

    const { result, error, isNotFound } = await brokerCloseOrder(
      adapter,
      orderId,
      symbol,
      traceToken,
      payload.lotSize,
    );

    if (error && !isNotFound) {
      throw error;
    }

    ctx.state.closeResult = result;
    ctx.state.error = error;
    ctx.state.isOrderNotFound = isNotFound;

    return await next();
  }
}
