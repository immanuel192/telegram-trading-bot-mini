import { UpdateOrderDatabaseStep } from '../../../../../src/services/order-handlers/update-order/update-order-database.step';

describe('UpdateOrderDatabaseStep', () => {
  let step: UpdateOrderDatabaseStep;
  let ctx: any;
  let next: jest.Mock;

  beforeEach(() => {
    step = new UpdateOrderDatabaseStep();
    next = jest.fn();
    ctx = {
      state: {
        order: { orderId: 'order-1' },
        updates: [
          { field: 'sl', price: 49500, newOrderId: 'new-sl-id' },
          { field: 'tp1', price: 52000, newOrderId: 'new-tp-id' },
        ],
        brokerSlAdjustment: { info: 'adj' },
      },
      payload: {
        traceToken: 'trace-1',
        messageId: 100,
        channelId: 'ch-1',
        command: 'SET_TP_SL',
      },
      container: {
        orderRepository: {
          updateOne: jest.fn().mockResolvedValue({}),
        },
      },
      session: 'mongo-session',
    };
  });

  it('should update database with $set and $push history', async () => {
    await step.execute(ctx, next);

    expect(ctx.container.orderRepository.updateOne).toHaveBeenCalledWith(
      { orderId: 'order-1' },
      expect.objectContaining({
        $set: {
          'sl.slPrice': 49500,
          'sl.slOrderId': 'new-sl-id',
          'tp.tp1Price': 52000,
          'tp.tp1OrderId': 'new-tp-id',
        },
        $push: {
          history: expect.objectContaining({
            status: 'update',
            info: expect.objectContaining({
              updates: ctx.state.updates,
              brokerSlAdjustment: ctx.state.brokerSlAdjustment,
            }),
          }),
        },
      }),
      'mongo-session'
    );
    expect(next).toHaveBeenCalled();
  });

  it('should skip update if no updates in state', async () => {
    ctx.state.updates = [];

    await step.execute(ctx, next);

    expect(ctx.container.orderRepository.updateOne).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
