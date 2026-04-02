import { LoadOrderParamsToStateStep } from '../../../../../src/services/order-handlers/update-order/load-order-params-to-state.step';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';

describe('LoadOrderParamsToStateStep', () => {
  let ctx: any;
  let next: jest.Mock;

  beforeEach(() => {
    next = jest.fn();
    ctx = {
      state: {},
      payload: { command: CommandEnum.SET_TP_SL },
      logger: { warn: jest.fn(), info: jest.fn() },
    };
  });

  it('should load entryPrice from actualEntryPrice if available', async () => {
    ctx.state.order = {
      entry: { actualEntryPrice: 50000, entryPrice: 49000 },
      side: 'LONG',
    };

    await LoadOrderParamsToStateStep.execute(ctx, next);

    expect(ctx.state.entryPrice).toBe(50000);
    expect(next).toHaveBeenCalled();
  });

  it('should fallback to entryPrice if actualEntryPrice is missing', async () => {
    ctx.state.order = {
      entry: { entryPrice: 49000 },
      side: 'LONG',
    };

    await LoadOrderParamsToStateStep.execute(ctx, next);

    expect(ctx.state.entryPrice).toBe(49000);
    expect(next).toHaveBeenCalled();
  });

  it('should warn and skip if order is missing in state', async () => {
    await LoadOrderParamsToStateStep.execute(ctx, next);

    expect(ctx.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Order not found'),
    );
    expect(ctx.state.entryPrice).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });
});
