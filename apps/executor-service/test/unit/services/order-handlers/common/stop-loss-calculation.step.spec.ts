import { StopLossCalculationStep } from '../../../../../src/services/order-handlers/common/stop-loss-calculation.step';
import {
  ExecutionContext,
  OpenTradeExecutionState,
} from '../../../../../src/services/order-handlers/execution-context';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';
import { StopLossCalculatorService } from '../../../../../src/services/calculations/stop-loss-calculator.service';

describe('StopLossCalculationStep', () => {
  let step: StopLossCalculationStep;
  let context: ExecutionContext<OpenTradeExecutionState>;
  let next: jest.Mock;

  beforeEach(() => {
    step = new StopLossCalculationStep();
    next = jest.fn();

    const payload = {
      orderId: 'order-1',
      symbol: 'EURUSD',
      command: CommandEnum.LONG,
      traceToken: 'trace-1',
      accountId: 'acc-1',
      messageId: 123,
      channelId: 'chan-1',
      timestamp: Date.now(),
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
    context.account = {
      accountId: 'acc-1',
      configs: {},
    } as any;
    context.state.entryPrice = 1.1;
  });

  it('should skip calculation if no entry price', async () => {
    context.state.entryPrice = undefined;
    context.state.stopLoss = { price: 1.095 };

    await step.execute(context, next);

    expect(context.state.stopLoss).toEqual({ price: 1.095 });
    expect(context.state.shouldSyncTpSl).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  it('should return original SL when no adjustments needed', async () => {
    context.state.stopLoss = { price: 1.095 };

    await step.execute(context, next);

    expect(context.state.stopLoss).toEqual({ price: 1.095 });
    expect(context.state.shouldSyncTpSl).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  it('should force SL when none provided and forceStopLossByPercentage is configured', async () => {
    context.account.configs!.forceStopLossByPercentage = 0.02; // 2%
    context.state.stopLoss = undefined;

    await step.execute(context, next);

    // For LONG with entry 1.1000 and 2% force SL:
    // SL = 1.1000 - (1.1000 * 0.02) = 1.1000 - 0.022 = 1.078
    expect(context.state.stopLoss?.price).toBeCloseTo(1.078, 3);
    expect(context.state.shouldSyncTpSl).toBe(false); // Forced SL, don't sync
    expect(next).toHaveBeenCalled();
  });

  it('should adjust SL when meta.adjustEntry is true', async () => {
    context.account.configs!.addOnStopLossPercentForAdjustEntry = 0.1; // 10%
    context.payload.meta = { adjustEntry: true };
    context.state.stopLoss = { price: 1.095 };

    await step.execute(context, next);

    // Original distance: 1.1000 - 1.0950 = 0.0050
    // Adjusted distance: 0.0050 * 1.1 = 0.0055
    // New SL: 1.1000 - 0.0055 = 1.0945
    expect(context.state.stopLoss?.price).toBeCloseTo(1.0945, 4);
    expect(context.state.shouldSyncTpSl).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  it('should apply broker price adjustment', async () => {
    context.account.configs!.stopLossAdjustPricePercentage = 0.05; // 5%
    context.state.stopLoss = { price: 1.095 };

    await step.execute(context, next);

    // Original distance: 1.1000 - 1.0950 = 0.0050
    // Adjusted distance: 0.0050 * 1.05 = 0.00525
    // New SL: 1.1000 - 0.00525 = 1.09475
    expect(context.state.stopLoss?.price).toBeCloseTo(1.09475, 5);
    expect(context.state.shouldSyncTpSl).toBe(true);

    // Verify adjustment info is stored in state
    expect(context.state.brokerSlAdjustment).toBeDefined();
    expect(context.state.brokerSlAdjustment?.adjustPercent).toBe(0.05);
    expect(context.state.brokerSlAdjustment?.original.price).toBe(1.095);
    expect(next).toHaveBeenCalled();
  });

  it('should handle SHORT orders correctly', async () => {
    context.payload.command = CommandEnum.SHORT;
    context.account.configs!.forceStopLossByPercentage = 0.02; // 2%
    context.state.stopLoss = undefined;

    await step.execute(context, next);

    // For SHORT with entry 1.1000 and 2% force SL:
    // SL = 1.1000 + (1.1000 * 0.02) = 1.1000 + 0.022 = 1.122
    expect(context.state.stopLoss?.price).toBeCloseTo(1.122, 3);
    expect(context.state.shouldSyncTpSl).toBe(false);
    expect(next).toHaveBeenCalled();
  });

  it('should set shouldSyncTpSl to false when SL price is invalid', async () => {
    // Mock the calculator to return invalid price
    const calculateStopLossSpy = jest
      .spyOn(StopLossCalculatorService.prototype, 'calculateStopLoss')
      .mockReturnValue({
        result: { price: 0 },
        useForceStopLoss: false,
      });

    context.state.stopLoss = { price: 1.095 };

    await step.execute(context, next);

    expect(context.state.shouldSyncTpSl).toBe(false);
    expect(next).toHaveBeenCalled();
    calculateStopLossSpy.mockRestore();
  });

  it('should handle pips-based SL', async () => {
    context.state.stopLoss = { pips: 50 };

    await step.execute(context, next);

    // Should pass through pips-based SL
    expect(context.state.stopLoss).toEqual({ pips: 50 });
    expect(context.state.shouldSyncTpSl).toBe(false); // No price, so can't sync
    expect(next).toHaveBeenCalled();
  });

  it('should use symbol-level config over account-level', async () => {
    context.account.configs!.forceStopLossByPercentage = 0.02;
    context.account.symbols = {
      EURUSD: {
        forceStopLossByPercentage: 0.03, // 3% at symbol level
      },
    };
    context.state.stopLoss = undefined;

    await step.execute(context, next);

    // Should use symbol-level 3%: 1.1000 - (1.1000 * 0.03) = 1.067
    expect(context.state.stopLoss?.price).toBeCloseTo(1.067, 3);
    expect(next).toHaveBeenCalled();
  });

  it('should not store broker adjustment for forced stop loss', async () => {
    context.account.configs!.forceStopLossByPercentage = 0.02;
    context.account.configs!.stopLossAdjustPricePercentage = 0.05; // Should be ignored for forced SL
    context.state.stopLoss = undefined;

    await step.execute(context, next);

    expect(context.state.stopLoss?.price).toBeDefined();
    expect(context.state.brokerSlAdjustment).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });
});
