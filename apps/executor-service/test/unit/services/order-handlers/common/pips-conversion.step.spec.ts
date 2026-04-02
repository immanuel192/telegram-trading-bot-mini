import { PipsConversionStep } from '../../../../../src/services/order-handlers/common/pips-conversion.step';
import {
  ExecutionContext,
  BaseExecutionState,
} from '../../../../../src/services/order-handlers/execution-context';
import { OrderHistoryStatus, OrderSide } from '@dal';
import {
  CommandEnum,
  ServiceName,
} from '@telegram-trading-bot-mini/shared/utils';

describe('PipsConversionStep', () => {
  let context: ExecutionContext<BaseExecutionState>;
  let next: jest.Mock;

  beforeEach(() => {
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
        child: jest.fn().mockReturnThis(),
      },
      orderRepository: {
        updateOne: jest.fn().mockResolvedValue(true),
      },
    } as any;

    context = new ExecutionContext({ payload, container });
    context.account = {
      accountId: 'acc-1',
      symbols: {
        EURUSD: {
          pipValue: 0.0001,
        },
      },
    } as any;
    context.session = 'mock-session' as any;
  });

  it('should skip conversion if no entry price', async () => {
    context.state.entryPrice = undefined;
    context.state.stopLoss = { pips: 50 };

    await PipsConversionStep.execute(context, next);

    expect(context.state.stopLoss).toEqual({ pips: 50 });
    expect(next).toHaveBeenCalled();
    expect(context.container.orderRepository.updateOne).not.toHaveBeenCalled();
  });

  it('should convert SL pips to price for LONG order', async () => {
    context.state.entryPrice = 1.1;
    context.state.stopLoss = { pips: 50 };

    await PipsConversionStep.execute(context, next);

    // For LONG: SL is below entry
    // SL = 1.1000 - (50 * 0.0001) = 1.1000 - 0.0050 = 1.0950
    expect(context.state.stopLoss?.price).toBeCloseTo(1.095, 4);
    expect(next).toHaveBeenCalled();
  });

  it('should convert TP pips to price for LONG order', async () => {
    context.state.entryPrice = 1.1;
    context.state.takeProfits = [{ pips: 100 }, { pips: 200 }];

    await PipsConversionStep.execute(context, next);

    // For LONG: TP is above entry
    // TP1 = 1.1000 + (100 * 0.0001) = 1.1100
    // TP2 = 1.1000 + (200 * 0.0001) = 1.1200
    expect(context.state.takeProfits).toHaveLength(2);
    expect(context.state.takeProfits![0].price).toBeCloseTo(1.11, 4);
    expect(context.state.takeProfits![1].price).toBeCloseTo(1.12, 4);
    expect(next).toHaveBeenCalled();
  });

  it('should convert SL pips to price for SHORT order', async () => {
    context.payload.command = CommandEnum.SHORT;
    context.state.entryPrice = 1.1;
    context.state.stopLoss = { pips: 50 };

    await PipsConversionStep.execute(context, next);

    // For SHORT: SL is above entry
    // SL = 1.1000 + (50 * 0.0001) = 1.1050
    expect(context.state.stopLoss?.price).toBeCloseTo(1.105, 4);
    expect(next).toHaveBeenCalled();
  });

  it('should convert TP pips to price for SHORT order', async () => {
    context.payload.command = CommandEnum.SHORT;
    context.state.entryPrice = 1.1;
    context.state.takeProfits = [{ pips: 100 }];

    await PipsConversionStep.execute(context, next);

    // For SHORT: TP is below entry
    // TP = 1.1000 - (100 * 0.0001) = 1.0900
    expect(context.state.takeProfits).toHaveLength(1);
    expect(context.state.takeProfits![0].price).toBeCloseTo(1.09, 4);
    expect(next).toHaveBeenCalled();
  });

  it('should add history entry when conversions are made', async () => {
    context.state.entryPrice = 1.1;
    context.state.stopLoss = { pips: 50 };
    context.state.takeProfits = [{ pips: 100 }];

    await PipsConversionStep.execute(context, next);

    const updateCall = (
      context.container.orderRepository.updateOne as jest.Mock
    ).mock.calls[0];
    const historyEntry = updateCall[1].$push.history;

    expect(updateCall[0]).toEqual({ orderId: 'order-1' });
    expect(updateCall[2]).toBe('mock-session');
    expect(historyEntry.status).toBe(OrderHistoryStatus.INFO);
    expect(historyEntry.service).toBe(ServiceName.EXECUTOR_SERVICE);
    expect(historyEntry.info.action).toBe('pips_to_price_conversion');
    expect(historyEntry.info.conversions).toHaveLength(2);
    expect(historyEntry.info.conversions[0].type).toBe('SL');
    expect(historyEntry.info.conversions[0].pips).toBe(50);
    expect(historyEntry.info.conversions[0].price).toBeCloseTo(1.095, 4);
    expect(historyEntry.info.conversions[1].type).toBe('TP1');
    expect(historyEntry.info.conversions[1].pips).toBe(100);
    expect(historyEntry.info.conversions[1].price).toBeCloseTo(1.11, 4);
    expect(next).toHaveBeenCalled();
  });

  it('should not convert if price is already set', async () => {
    context.state.entryPrice = 1.1;
    context.state.stopLoss = { price: 1.095, pips: 50 };
    context.state.takeProfits = [{ price: 1.11, pips: 100 }];

    await PipsConversionStep.execute(context, next);

    // Should not change already-set prices
    expect(context.state.stopLoss).toEqual({ price: 1.095, pips: 50 });
    expect(context.state.takeProfits).toEqual([{ price: 1.11, pips: 100 }]);
    expect(context.container.orderRepository.updateOne).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should use default pip value if invalid', async () => {
    context.account.symbols!.EURUSD.pipValue = -0.1;
    context.state.entryPrice = 1.1;
    context.state.stopLoss = { pips: 50 };

    await PipsConversionStep.execute(context, next);

    // Should use default 0.1
    // SL = 1.1000 - (50 * 0.1) = 1.1000 - 5.0 = -3.9000
    expect(context.state.stopLoss).toEqual({ price: -3.9 });
    expect(context.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: 'EURUSD',
        pipValue: -0.1,
      }),
      'Invalid pip value - using default 0.1',
    );
    expect(next).toHaveBeenCalled();
  });

  it('should use default pip value if not configured', async () => {
    context.account.symbols = {};
    context.state.entryPrice = 1.1;
    context.state.stopLoss = { pips: 50 };

    await PipsConversionStep.execute(context, next);

    // Should use default 0.1
    expect(context.state.stopLoss).toEqual({ price: -3.9 });
    expect(next).toHaveBeenCalled();
  });
});
