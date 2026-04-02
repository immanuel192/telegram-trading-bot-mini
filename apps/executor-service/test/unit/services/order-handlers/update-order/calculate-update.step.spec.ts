import { CalculateUpdateStep } from '../../../../../src/services/order-handlers/update-order/calculate-update.step';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';

describe('CalculateUpdateStep', () => {
  let step: CalculateUpdateStep;
  let ctx: any;
  let next: jest.Mock;

  beforeEach(() => {
    step = new CalculateUpdateStep();
    next = jest.fn();
    ctx = {
      state: {
        order: {
          orderId: 'order-1',
          side: 'LONG',
          entry: { entryOrderId: 'broker-order-1' },
          sl: { slPrice: 49000 },
          tp: { tp1Price: 51000 },
        },
        stopLoss: {},
        takeProfits: [],
      },
      payload: {
        command: CommandEnum.SET_TP_SL,
        symbol: 'BTCUSD',
        meta: {},
      },
      account: { symbols: { BTCUSD: { pipValue: 1 } } },
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    };
  });

  it('should set shouldUpdateSl to true if SL price is different', async () => {
    ctx.state.stopLoss = { price: 49500 };

    await step.execute(ctx, next);

    expect(ctx.state.shouldUpdateSl).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  it('should not set shouldUpdateSl if SL price is identical', async () => {
    ctx.state.stopLoss = { price: 49000 };

    await step.execute(ctx, next);

    expect(ctx.state.shouldUpdateSl).toBeFalsy();
    expect(next).toHaveBeenCalled();
  });

  it('should set shouldUpdateTp to true if TP price is different', async () => {
    ctx.state.takeProfits = [{ price: 52000 }];

    await step.execute(ctx, next);

    expect(ctx.state.shouldUpdateTp).toBe(true);
  });

  it('should apply broker price adjustment to SL if not skipped', async () => {
    ctx.state.stopLoss = { price: 49500 };
    ctx.state.entryPrice = 50000;

    // Set adjustment percentage to 1% (0.01)
    // Distance = 500. Adjusted Distance = 500 * (1 + 0.01) = 505.
    // Adjusted Price = 50000 - 505 = 49495.
    ctx.account.configs = { stopLossAdjustPricePercentage: 0.01 };

    await step.execute(ctx, next);

    expect(ctx.state.shouldUpdateSl).toBe(true);
    expect(ctx.state.stopLoss.price).toBe(49495);
    expect(ctx.state.brokerSlAdjustment).toBeDefined();
    expect(ctx.state.brokerSlAdjustment.adjustPercent).toBe(0.01);
  });

  it('should throw error if order entryOrderId is missing', async () => {
    ctx.state.order.entry.entryOrderId = undefined;

    await expect(step.execute(ctx, next)).rejects.toThrow(
      'does not have an entry order ID',
    );
  });
});
