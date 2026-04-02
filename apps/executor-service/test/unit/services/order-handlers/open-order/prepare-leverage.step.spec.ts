import { PrepareLeverageStep } from '../../../../../src/services/order-handlers/open-order/prepare-leverage.step';
import {
  ExecutionContext,
  OpenTradeExecutionState,
} from '../../../../../src/services/order-handlers/execution-context';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';
import { LeverageResolverService } from '../../../../../src/services/calculations/leverage-resolver.service';

describe('PrepareLeverageStep', () => {
  let step: PrepareLeverageStep;
  let context: ExecutionContext<OpenTradeExecutionState>;
  let next: jest.Mock;
  let adapter: any;

  beforeEach(() => {
    step = new PrepareLeverageStep();
    next = jest.fn();

    adapter = {
      exchangeCode: 'OANDA',
      setLeverage: jest.fn().mockResolvedValue(true),
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
    context.account = {
      accountId: 'acc-1',
      configs: {},
      symbols: {
        EURUSD: {
          leverage: 30,
        },
      },
    } as any;
  });

  it('should resolve and set leverage', async () => {
    const resolveLeverageSpy = jest
      .spyOn(LeverageResolverService.prototype, 'resolveLeverage')
      .mockReturnValue(30);
    const setLeverageIfNeededSpy = jest
      .spyOn(LeverageResolverService.prototype, 'setLeverageIfNeeded')
      .mockResolvedValue();

    await step.execute(context, next);

    expect(resolveLeverageSpy).toHaveBeenCalledWith('EURUSD', context.account);
    expect(context.state.leverage).toBe(30);
    expect(setLeverageIfNeededSpy).toHaveBeenCalledWith(
      adapter,
      'EURUSD',
      30,
      context.account,
    );
    expect(next).toHaveBeenCalled();

    resolveLeverageSpy.mockRestore();
    setLeverageIfNeededSpy.mockRestore();
  });

  it('should throw error if adapter is not resolved', async () => {
    context.adapter = undefined;

    await expect(step.execute(context, next)).rejects.toThrow(
      'Adapter must be resolved before PrepareLeverageStep',
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should use default leverage if not configured', async () => {
    context.account.symbols = {};
    const resolveLeverageSpy = jest
      .spyOn(LeverageResolverService.prototype, 'resolveLeverage')
      .mockReturnValue(1);
    const setLeverageIfNeededSpy = jest
      .spyOn(LeverageResolverService.prototype, 'setLeverageIfNeeded')
      .mockResolvedValue();

    await step.execute(context, next);

    expect(context.state.leverage).toBe(1);
    expect(next).toHaveBeenCalled();

    resolveLeverageSpy.mockRestore();
    setLeverageIfNeededSpy.mockRestore();
  });
});
