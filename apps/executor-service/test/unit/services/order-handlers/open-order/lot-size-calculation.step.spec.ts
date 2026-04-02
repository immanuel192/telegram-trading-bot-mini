import { LotSizeCalculationStep } from '../../../../../src/services/order-handlers/open-order/lot-size-calculation.step';
import {
  ExecutionContext,
  OpenTradeExecutionState,
} from '../../../../../src/services/order-handlers/execution-context';
import {
  CommandEnum,
  BalanceInfo,
} from '@telegram-trading-bot-mini/shared/utils';
import { LotSizeCalculatorService } from '../../../../../src/services/calculations/lot-size-calculator.service';

describe('LotSizeCalculationStep', () => {
  let step: LotSizeCalculationStep;
  let context: ExecutionContext<OpenTradeExecutionState>;
  let next: jest.Mock;

  beforeEach(() => {
    step = new LotSizeCalculationStep();
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
      lotSize: 0,
      meta: { reduceLotSize: false },
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
    context.account = { accountId: 'acc-1' } as any;
    context.state.entryPrice = 1.1;
    context.state.stopLoss = { price: 1.09 };
    context.state.leverage = 30;
    context.state.balanceInfo = {
      balance: 1000,
      ts: Date.now(),
    } as BalanceInfo;
  });

  it('should calculate lot size and store it in state', async () => {
    const calculateLotSizeSpy = jest
      .spyOn(LotSizeCalculatorService.prototype, 'calculateLotSize')
      .mockReturnValue(0.1);

    await step.execute(context, next);

    expect(calculateLotSizeSpy).toHaveBeenCalledWith({
      lotSize: 0,
      symbol: 'EURUSD',
      account: context.account,
      accountBalanceInfo: context.state.balanceInfo,
      entry: 1.1,
      stopLoss: { price: 1.09 },
      leverage: 30,
      meta: { reduceLotSize: false },
    });
    expect(context.state.lotSize).toBe(0.1);
    expect(next).toHaveBeenCalled();

    calculateLotSizeSpy.mockRestore();
  });

  it('should use provided lotSize from payload if > 0', async () => {
    (context.payload as any).lotSize = 0.5;
    const calculateLotSizeSpy = jest
      .spyOn(LotSizeCalculatorService.prototype, 'calculateLotSize')
      .mockReturnValue(0.5);

    await step.execute(context, next);

    expect(calculateLotSizeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ lotSize: 0.5 }),
    );
    expect(context.state.lotSize).toBe(0.5);
    expect(next).toHaveBeenCalled();

    calculateLotSizeSpy.mockRestore();
  });

  it('should use default leverage of 1 if not in state', async () => {
    context.state.leverage = undefined;
    const calculateLotSizeSpy = jest
      .spyOn(LotSizeCalculatorService.prototype, 'calculateLotSize')
      .mockReturnValue(0.01);

    await step.execute(context, next);

    expect(calculateLotSizeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ leverage: 1 }),
    );
    expect(next).toHaveBeenCalled();

    calculateLotSizeSpy.mockRestore();
  });

  it('should pass meta to calculator', async () => {
    (context.payload as any).meta = { reduceLotSize: true };
    const calculateLotSizeSpy = jest
      .spyOn(LotSizeCalculatorService.prototype, 'calculateLotSize')
      .mockReturnValue(0.05);

    await step.execute(context, next);

    expect(calculateLotSizeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ meta: { reduceLotSize: true } }),
    );
    expect(next).toHaveBeenCalled();

    calculateLotSizeSpy.mockRestore();
  });
});
