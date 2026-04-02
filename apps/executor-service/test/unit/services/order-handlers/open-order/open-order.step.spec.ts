import { OpenOrderStep } from '../../../../../src/services/order-handlers/open-order/open-order.step';
import {
  ExecutionContext,
  OpenTradeExecutionState,
} from '../../../../../src/services/order-handlers/execution-context';
import {
  CommandEnum,
  CommandSide,
  BalanceInfo,
} from '@telegram-trading-bot-mini/shared/utils';
import { OpenOrderResult } from '../../../../../src/adapters/interfaces';
import { OrderStatus, OrderHistoryStatus } from '@dal';

describe('OpenOrderStep', () => {
  let step: OpenOrderStep;
  let context: ExecutionContext<OpenTradeExecutionState>;
  let next: jest.Mock;
  let adapter: any;
  let mockSession: any;

  beforeEach(() => {
    step = new OpenOrderStep();
    next = jest.fn();
    mockSession = { id: 'session-1' };

    adapter = {
      exchangeCode: 'OANDA',
      accountId: 'acc-123',
      openOrder: jest.fn(),
      emitMetric: jest.fn(),
    };

    const payload = {
      orderId: 'order-1',
      symbol: 'EURUSD',
      command: CommandEnum.LONG,
      traceToken: 'trace-1',
      accountId: 'acc-1',
      messageId: 123,
      channelId: 'chan-1',
      timestamp: Date.now(),
      isImmediate: true,
      lotSize: 0.1,
    };

    const container = {
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        child: jest.fn().mockReturnThis(),
      },
      orderRepository: {
        updateOne: jest.fn().mockResolvedValue(true),
      },
    } as any;

    context = new ExecutionContext({ payload, container });
    context.adapter = adapter;
    context.account = { accountId: 'acc-1' } as any;
    context.session = mockSession;
    context.state.entryPrice = 1.1;
    context.state.stopLoss = { price: 1.09 };
    context.state.takeProfits = [{ price: 1.12 }];
    context.state.lotSize = 0.1;
    context.state.leverage = 30;
    context.state.balanceInfo = {
      balance: 1000,
      ts: Date.now(),
    } as BalanceInfo;
  });

  it('should open order and update database', async () => {
    const mockResult: OpenOrderResult = {
      exchangeOrderId: 'broker-123',
      executedPrice: 1.1005,
      executedLots: 0.1,
      executedAt: Date.now(),
      stopLossOrderId: 'sl-123',
      takeProfitOrderId: 'tp-123',
    };

    adapter.openOrder.mockResolvedValue(mockResult);

    await step.execute(context, next);

    expect(adapter.openOrder).toHaveBeenCalledWith({
      orderId: 'order-1',
      symbol: 'EURUSD',
      side: CommandSide.BUY,
      lotSize: 0.1,
      isImmediate: true,
      entry: 1.1,
      stopLoss: { price: 1.09 },
      takeProfits: [{ price: 1.12 }],
      meta: undefined,
      traceToken: 'trace-1',
    });

    expect(context.result).toEqual({
      orderId: 'order-1',
      accountId: 'acc-1',
      traceToken: 'trace-1',
      messageId: 123,
      channelId: 'chan-1',
      success: true,
      type: 1, // OrderOpen
      symbol: 'EURUSD',
      side: 'LONG',
      lotSize: 0.1,
      lotSizeRemaining: 0.1,
      takeProfits: [],
    });
    expect(adapter.emitMetric).toHaveBeenCalledWith(
      'openOrder',
      expect.any(Number),
      'EURUSD',
      'success',
      { orderType: 'market', side: 'long' },
    );

    // Should call updateOne twice: once for history, once for set
    expect(context.container.orderRepository.updateOne).toHaveBeenCalledTimes(
      2,
    );

    // Check history call
    expect(context.container.orderRepository.updateOne).toHaveBeenCalledWith(
      { orderId: 'order-1' },
      expect.objectContaining({
        $push: expect.objectContaining({
          history: expect.objectContaining({
            status: OrderHistoryStatus.OPEN,
            command: CommandEnum.LONG,
            info: expect.objectContaining({
              exchangeOrderId: 'broker-123',
              executedPrice: 1.1005,
            }),
          }),
        }),
      }),
      mockSession,
    );

    // Check set fields call
    expect(context.container.orderRepository.updateOne).toHaveBeenCalledWith(
      { orderId: 'order-1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          'entry.entryOrderId': 'broker-123',
          'entry.actualEntryPrice': 1.1005,
          status: OrderStatus.OPEN,
          lotSizeRemaining: 0.1,
          lotSize: 0.1,
          'sl.slPrice': 1.09,
          'sl.slOrderId': 'sl-123',
          'tp.tp1Price': 1.12,
          'tp.tp1OrderId': 'tp-123',
        }),
      }),
      mockSession,
    );

    expect(next).toHaveBeenCalled();
  });

  it('should handle SHORT orders', async () => {
    (context.payload as any).command = CommandEnum.SHORT;
    const mockResult: OpenOrderResult = {
      exchangeOrderId: 'broker-456',
      executedPrice: 1.0995,
      executedLots: 0.1,
      executedAt: Date.now(),
    };

    adapter.openOrder.mockResolvedValue(mockResult);

    await step.execute(context, next);

    expect(adapter.openOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        side: CommandSide.SELL,
      }),
    );

    expect(adapter.emitMetric).toHaveBeenCalledWith(
      'openOrder',
      expect.any(Number),
      'EURUSD',
      'success',
      { orderType: 'market', side: 'short' },
    );
  });

  it('should handle limit orders', async () => {
    (context.payload as any).isImmediate = false;
    const mockResult: OpenOrderResult = {
      exchangeOrderId: 'broker-limit',
      executedPrice: 1.1,
      executedLots: 0.1,
      executedAt: Date.now(),
    };

    adapter.openOrder.mockResolvedValue(mockResult);

    await step.execute(context, next);

    expect(adapter.emitMetric).toHaveBeenCalledWith(
      'openOrder',
      expect.any(Number),
      'EURUSD',
      'success',
      { orderType: 'limit', side: 'long' },
    );
  });

  it('should throw error if adapter is not resolved', async () => {
    context.adapter = undefined;

    await expect(step.execute(context, next)).rejects.toThrow(
      'Adapter must be resolved before OpenOrderStep',
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should throw error if lot size is not calculated', async () => {
    context.state.lotSize = undefined;

    await expect(step.execute(context, next)).rejects.toThrow(
      'Lot size must be calculated before OpenOrderStep',
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should emit error metric on failure', async () => {
    const error = new Error('Broker API error');
    adapter.openOrder.mockRejectedValue(error);

    await expect(step.execute(context, next)).rejects.toThrow(
      'Broker API error',
    );

    expect(adapter.emitMetric).toHaveBeenCalledWith(
      'openOrder',
      expect.any(Number),
      'EURUSD',
      'error',
      { orderType: 'market', side: 'long' },
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should handle orders without TP/SL', async () => {
    context.state.stopLoss = undefined;
    context.state.takeProfits = undefined;

    const mockResult: OpenOrderResult = {
      exchangeOrderId: 'broker-no-tpsl',
      executedPrice: 1.1005,
      executedLots: 0.1,
      executedAt: Date.now(),
    };

    adapter.openOrder.mockResolvedValue(mockResult);

    await step.execute(context, next);

    expect(context.container.orderRepository.updateOne).toHaveBeenCalledWith(
      { orderId: 'order-1' },
      expect.objectContaining({
        $set: expect.not.objectContaining({
          'sl.slPrice': expect.anything(),
          'tp.tp1Price': expect.anything(),
        }),
      }),
      mockSession,
    );
  });
});
