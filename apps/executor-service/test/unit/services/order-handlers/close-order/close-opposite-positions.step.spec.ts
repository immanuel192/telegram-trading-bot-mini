import { CloseOppositePositionsStep } from '../../../../../src/services/order-handlers/close-order/close-opposite-positions.step';
import {
  ExecutionContext,
  OpenTradeExecutionState,
} from '../../../../../src/services/order-handlers/execution-context';
import { OrderSide, OrderStatus } from '@dal';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';
import * as closeOrderHelper from '../../../../../src/services/order-handlers/close-order/close-order.helper';

describe('CloseOppositePositionsStep', () => {
  let step: CloseOppositePositionsStep;
  let context: ExecutionContext<OpenTradeExecutionState>;
  let next: jest.Mock;
  let payload: any;
  let container: any;
  let adapter: any;

  beforeEach(() => {
    jest.clearAllMocks();
    step = new CloseOppositePositionsStep();
    next = jest.fn();

    payload = {
      orderId: 'new-order-1',
      symbol: 'EURUSD',
      command: CommandEnum.LONG,
      traceToken: 'trace-1',
      accountId: 'acc-1',
      messageId: 123,
      channelId: 'chan-1',
      timestamp: Date.now(),
    };

    adapter = {
      exchangeCode: 'OANDA',
      closeOrder: jest.fn(),
      emitMetric: jest.fn(),
    };

    container = {
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        child: jest.fn().mockReturnThis(),
      },
      orderRepository: {
        findAll: jest.fn(),
        findOne: jest.fn(),
        updateOne: jest.fn().mockResolvedValue(true),
      },
    };

    context = new ExecutionContext({ payload, container }) as any;
    context.adapter = adapter;
    context.account = {
      accountId: 'acc-1',
      configs: {
        closeOppositePosition: true,
      },
    } as any;
    context.session = 'mock-session' as any;
  });

  it('should call next and do nothing if closeOppositePosition is disabled', async () => {
    context.account.configs!.closeOppositePosition = false;

    await step.execute(context, next);

    expect(next).toHaveBeenCalled();
    expect(container.orderRepository.findAll).not.toHaveBeenCalled();
  });

  it('should call next if no opposite orders found', async () => {
    container.orderRepository.findAll.mockResolvedValue([]);

    await step.execute(context, next);

    expect(next).toHaveBeenCalled();
    expect(container.orderRepository.findAll).toHaveBeenCalledWith({
      accountId: 'acc-1',
      symbol: 'EURUSD',
      side: OrderSide.SHORT, // Opposite of LONG
      status: OrderStatus.OPEN,
    });
  });

  it('should close opposite orders and publish results', async () => {
    const oppositeOrder = {
      orderId: 'old-order-short',
      symbol: 'EURUSD',
      side: OrderSide.SHORT,
      status: OrderStatus.OPEN,
    };
    container.orderRepository.findAll.mockResolvedValue([oppositeOrder]);

    const mockCloseResult = {
      exchangeOrderId: 'ex-123',
      closedPrice: 1.099,
      closedLots: 0.1,
      closedAt: Date.now(),
    };

    jest.spyOn(closeOrderHelper, 'brokerCloseOrder').mockResolvedValue({
      result: mockCloseResult,
      isNotFound: false,
    });
    jest.spyOn(closeOrderHelper, 'calculateOrderPnl').mockReturnValue(5);
    jest.spyOn(closeOrderHelper, 'finalizeOrderClosure').mockResolvedValue();
    jest.spyOn(closeOrderHelper, 'publishCloseResult').mockResolvedValue();

    await step.execute(context, next);

    expect(closeOrderHelper.brokerCloseOrder).toHaveBeenCalledWith(
      adapter,
      'old-order-short',
      'EURUSD',
      'trace-1',
    );

    expect(closeOrderHelper.calculateOrderPnl).toHaveBeenCalledWith(
      oppositeOrder,
      1.099,
      0.1,
    );

    expect(closeOrderHelper.finalizeOrderClosure).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        orderId: 'old-order-short',
        pnlValue: 5,
        result: mockCloseResult,
      }),
    );

    expect(closeOrderHelper.publishCloseResult).toHaveBeenCalledWith(
      context,
      'old-order-short',
      mockCloseResult,
      expect.objectContaining({
        orderId: 'old-order-short',
        command: CommandEnum.CLOSE_ALL,
      }),
    );

    expect(next).toHaveBeenCalled();
  });

  it('should continue closing other orders if one fails', async () => {
    const oppositeOrders = [
      {
        orderId: 'order-fail',
        symbol: 'EURUSD',
        side: OrderSide.SHORT,
        status: OrderStatus.OPEN,
      },
      {
        orderId: 'order-success',
        symbol: 'EURUSD',
        side: OrderSide.SHORT,
        status: OrderStatus.OPEN,
      },
    ];
    container.orderRepository.findAll.mockResolvedValue(oppositeOrders);

    jest
      .spyOn(closeOrderHelper, 'brokerCloseOrder')
      .mockResolvedValueOnce({
        error: new Error('Broker error'),
        isNotFound: false,
      })
      .mockResolvedValueOnce({
        result: { closedPrice: 1 } as any,
        isNotFound: false,
      });
    jest.spyOn(closeOrderHelper, 'finalizeOrderClosure').mockResolvedValue();
    jest.spyOn(closeOrderHelper, 'publishCloseResult').mockResolvedValue();
    jest.spyOn(closeOrderHelper, 'calculateOrderPnl').mockReturnValue(0);

    await step.execute(context, next);

    expect(closeOrderHelper.brokerCloseOrder).toHaveBeenCalledTimes(2);
    expect(container.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ closedOrderId: 'order-fail' }),
      'Failed to close opposite position',
    );
    expect(next).toHaveBeenCalled();
  });
});
