import { BrokerUpdateStep } from '../../../../../src/services/order-handlers/update-order/broker-update.step';

describe('BrokerUpdateStep', () => {
  let step: BrokerUpdateStep;
  let ctx: any;
  let next: jest.Mock;
  let adapter: any;

  beforeEach(() => {
    step = new BrokerUpdateStep();
    next = jest.fn();
    adapter = {
      cancelOrder: jest.fn().mockResolvedValue({}),
      setStopLoss: jest.fn().mockResolvedValue({ slOrderId: 'new-sl-id' }),
      setTakeProfit: jest.fn().mockResolvedValue({ tpOrderId: 'new-tp-id' }),
      emitMetric: jest.fn(),
    };
    ctx = {
      adapter,
      state: {
        order: {
          orderId: 'order-1',
          entry: { entryOrderId: 'broker-order-1' },
          sl: { slOrderId: 'old-sl-id' },
          tp: { tp1OrderId: 'old-tp-id' },
        },
        updates: [],
      },
      payload: {
        traceToken: 'trace-1',
        symbol: 'BTCUSD',
      },
      logger: { warn: jest.fn(), info: jest.fn() },
    };
  });

  it('should cancel old SL and place new SL if shouldUpdateSl is true', async () => {
    ctx.state.shouldUpdateSl = true;
    ctx.state.stopLoss = { price: 49500 };

    await step.execute(ctx, next);

    expect(adapter.cancelOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'old-sl-id' })
    );
    expect(adapter.setStopLoss).toHaveBeenCalledWith(
      expect.objectContaining({ price: 49500 })
    );
    expect(ctx.state.newSlOrderId).toBe('new-sl-id');
    expect(ctx.state.updates).toContainEqual(
      expect.objectContaining({ field: 'sl', newOrderId: 'new-sl-id' })
    );
  });

  it('should cancel old TP and place new TP if shouldUpdateTp is true', async () => {
    ctx.state.shouldUpdateTp = true;
    ctx.state.takeProfits = [{ price: 52000 }];

    await step.execute(ctx, next);

    expect(adapter.cancelOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'old-tp-id' })
    );
    expect(adapter.setTakeProfit).toHaveBeenCalledWith(
      expect.objectContaining({ price: 52000 })
    );
    expect(ctx.state.newTp1OrderId).toBe('new-tp-id');
    expect(ctx.state.updates).toContainEqual(
      expect.objectContaining({ field: 'tp1', newOrderId: 'new-tp-id' })
    );
  });

  it('should not throw if cancelOrder fails', async () => {
    ctx.state.shouldUpdateSl = true;
    ctx.state.stopLoss = { price: 49500 };
    adapter.cancelOrder.mockRejectedValue(new Error('Cancel failed'));

    await step.execute(ctx, next);

    expect(adapter.setStopLoss).toHaveBeenCalled();
    expect(ctx.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('Failed to cancel old SL order')
    );
  });
});
