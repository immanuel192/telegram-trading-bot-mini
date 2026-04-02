import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';
import {
  ExecutionContext,
  BaseCloseExecutionState,
} from '../../../../../src/services/order-handlers/execution-context';
import { UpdateTpTierStatusStep } from '../../../../../src/services/order-handlers/close-order/update-tp-tier-status.step';

describe('UpdateTpTierStatusStep', () => {
  let step: UpdateTpTierStatusStep;
  let ctx: ExecutionContext<BaseCloseExecutionState>;
  let next: jest.Mock;

  beforeEach(() => {
    step = new UpdateTpTierStatusStep();
    next = jest.fn();

    ctx = {
      payload: {
        orderId: 'order-123',
        command: CommandEnum.CLOSE_PARTIAL,
      },
      state: {
        closeResult: {
          closedLots: 0.1,
          closedPrice: 2000,
          exchangeOrderId: 'ex-1',
          closedAt: Date.now(),
        },
        order: {
          orderId: 'order-123',
          meta: {
            takeProfitTiers: [{ price: 2000, isUsed: true }, { price: 2100 }],
          },
        },
      },
      logger: {
        info: jest.fn(),
      },
      container: {
        orderRepository: {
          updateOne: jest.fn().mockResolvedValue(true),
          findByOrderId: jest.fn().mockResolvedValue({
            orderId: 'order-123',
            meta: {
              takeProfitTiers: [
                { price: 2000, isUsed: true },
                { price: 2100, isUsed: true }, // The updated state
              ],
            },
          }),
        },
      },
      session: 'mock-session',
    } as any;
  });

  it('should mark the FIRST unused TP tier as used and re-fetch from DB', async () => {
    await step.execute(ctx, next);

    // Verify DB update uses $elemMatch with $or to handle undefined/false values
    expect(ctx.container.orderRepository.updateOne).toHaveBeenCalledWith(
      {
        orderId: 'order-123',
        'meta.takeProfitTiers': {
          $elemMatch: {
            $or: [{ isUsed: { $exists: false } }, { isUsed: false }],
          },
        },
      },
      {
        $set: { 'meta.takeProfitTiers.$.isUsed': true },
      },
      'mock-session',
    );

    // Verify re-fetch
    expect(ctx.container.orderRepository.findByOrderId).toHaveBeenCalledWith(
      'order-123',
    );

    // Verify in-memory state was synchronized from re-fetched order
    expect(ctx.state.order?.meta?.takeProfitTiers?.[1].isUsed).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  it('should skip if command is not CLOSE_PARTIAL', async () => {
    ctx.payload.command = CommandEnum.CLOSE_ALL;
    await step.execute(ctx, next);
    expect(ctx.container.orderRepository.updateOne).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should skip if error exists', async () => {
    ctx.state.error = new Error('Broker error');
    await step.execute(ctx, next);
    expect(ctx.container.orderRepository.updateOne).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
