import { PublishResultStep } from '../../../../../src/services/order-handlers/common/publish-result.step';
import {
  StreamTopic,
  MessageType,
  ExecuteOrderResultType,
} from '@telegram-trading-bot-mini/shared/utils';

describe('PublishResultStep', () => {
  let context: any;
  let next: jest.Mock;

  beforeEach(() => {
    next = jest.fn();
    context = {
      payload: {
        orderId: 'order-1',
        accountId: 'acc-1',
        traceToken: 'trace-1',
        messageId: 123,
        channelId: 'chan-1',
        symbol: 'BTC/USDT',
      },
      container: {
        streamPublisher: {
          publish: jest.fn().mockResolvedValue(true),
        },
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
      },
      state: {},
      result: undefined,
    } as any;
  });

  it('should publish ctx.result if available', async () => {
    context.result = {
      orderId: 'order-1',
      accountId: 'acc-1',
      traceToken: 'trace-1',
      messageId: 123,
      channelId: 'chan-1',
      success: true,
      symbol: 'BTC/USDT',
      type: ExecuteOrderResultType.OrderOpen,
    };

    await PublishResultStep.execute(context, next);

    expect(context.container.streamPublisher.publish).toHaveBeenCalledWith(
      StreamTopic.ORDER_EXECUTION_RESULTS,
      expect.objectContaining({
        type: MessageType.EXECUTE_ORDER_RESULT,
        payload: context.result,
      }),
    );
  });

  it('should derive result from ctx.state.error if result is missing', async () => {
    context.state.error = new Error('Calculated fail');
    (context.state.error as any).code = 'CALC_ERROR';

    await PublishResultStep.execute(context, next);

    expect(context.container.streamPublisher.publish).toHaveBeenCalledWith(
      StreamTopic.ORDER_EXECUTION_RESULTS,
      expect.objectContaining({
        payload: expect.objectContaining({
          success: false,
          symbol: 'BTC/USDT',
          type: ExecuteOrderResultType.OTHERS,
          error: 'Calculated fail',
          errorCode: 'CALC_ERROR',
        }),
      }),
    );
  });

  it('should warn and not publish if no result and no error', async () => {
    await PublishResultStep.execute(context, next);

    expect(context.container.streamPublisher.publish).not.toHaveBeenCalled();
    expect(context.logger.warn).toHaveBeenCalledWith(
      'No result available to publish',
    );
  });
});
