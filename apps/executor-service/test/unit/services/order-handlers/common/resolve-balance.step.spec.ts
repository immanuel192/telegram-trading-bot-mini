import { ResolveBalanceStep } from '../../../../../src/services/order-handlers/common/resolve-balance.step';
import {
  ExecutionContext,
  BaseExecutionState,
} from '../../../../../src/services/order-handlers/execution-context';
import {
  CommandEnum,
  BalanceCacheService,
} from '@telegram-trading-bot-mini/shared/utils';
import * as configModule from '../../../../../src/config';

describe('ResolveBalanceStep', () => {
  let step: ResolveBalanceStep;
  let context: ExecutionContext<BaseExecutionState>;
  let next: jest.Mock;
  let adapter: any;
  let redis: any;

  beforeEach(() => {
    step = new ResolveBalanceStep();
    next = jest.fn();

    adapter = {
      exchangeCode: 'OANDA',
      accountId: 'acc-123',
    };

    redis = {};

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
      redis,
      orderRepository: {
        updateOne: jest.fn().mockResolvedValue(true),
      },
    } as any;

    context = new ExecutionContext({ payload, container });
    context.adapter = adapter;
    context.account = { accountId: 'acc-1' } as any;

    jest.spyOn(configModule, 'config').mockImplementation((key: string) => {
      if (key === 'BALANCE_CACHE_TTL_SECONDS') return 300;
      return null;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should successfully resolve balance and equity from cache', async () => {
    const cachedBalance = {
      balance: 1000,
      equity: 1050,
      marginUsed: 100,
      marginAvailable: 950,
      ts: Date.now(),
    };

    jest
      .spyOn(BalanceCacheService.prototype, 'getBalance')
      .mockResolvedValue(cachedBalance);

    await step.execute(context, next);

    expect(context.state.balanceInfo).toEqual(cachedBalance);
    expect(next).toHaveBeenCalled();
  });

  it('should not set balance if cache is expired', async () => {
    const cachedBalance = {
      balance: 1000,
      equity: 1050,
      ts: Date.now() - 600 * 1000, // 10 minutes ago, TTL is 5 minutes
    } as any;

    jest
      .spyOn(BalanceCacheService.prototype, 'getBalance')
      .mockResolvedValue(cachedBalance);

    await step.execute(context, next);

    expect(context.state.balanceInfo).toBeUndefined();
    expect(context.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ cacheAgeSeconds: expect.any(Number) }),
      'Balance cache expired',
    );
    expect(next).toHaveBeenCalled();
  });

  it('should handle cache miss gracefully', async () => {
    jest
      .spyOn(BalanceCacheService.prototype, 'getBalance')
      .mockResolvedValue(null);

    await step.execute(context, next);

    expect(context.state.balanceInfo).toBeUndefined();
    expect(context.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ traceToken: 'trace-1' }),
      'Balance cache miss',
    );
    expect(next).toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    jest
      .spyOn(BalanceCacheService.prototype, 'getBalance')
      .mockRejectedValue(new Error('Redis error'));

    await step.execute(context, next);

    expect(context.state.balanceInfo).toBeUndefined();
    expect(context.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      'Failed to fetch balance cache',
    );
    expect(next).toHaveBeenCalled();
  });

  it('should throw error if adapter is not resolved', async () => {
    context.adapter = undefined;

    await expect(step.execute(context, next)).rejects.toThrow(
      'Adapter must be resolved before ResolveBalanceStep',
    );
    expect(next).not.toHaveBeenCalled();
  });
});
