import { EntryPriceResolverStep } from '../../../../../src/services/order-handlers/common/price-resolver.step';
import { OrderHistoryStatus } from '@dal';
import {
  CommandEnum,
  PriceCacheService,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  ExecutionContext,
  BaseExecutionState,
} from '../../../../../src/services/order-handlers/execution-context';
import * as configModule from '../../../../../src/config';

describe('PriceResolverStep', () => {
  let context: ExecutionContext<BaseExecutionState>;
  let next: jest.Mock;
  let mockPriceCache: any;
  let configSpy: jest.SpyInstance;

  beforeEach(() => {
    next = jest.fn();

    mockPriceCache = {
      getPrice: jest.fn(),
    };

    // Spy on config to control TTL
    configSpy = jest
      .spyOn(configModule, 'config')
      .mockImplementation((key: string) => {
        if (key === 'PRICE_CACHE_TTL_SECONDS') return 10;
        return (configModule.config as any).wrappedMethod(key);
      });

    // Spy on PriceCacheService constructor
    jest
      .spyOn(PriceCacheService.prototype, 'getPrice')
      .mockImplementation(mockPriceCache.getPrice);

    const payload = {
      symbol: 'BTCUSD',
      orderId: 'order-1',
      traceToken: 'trace-1',
      command: CommandEnum.LONG,
      messageId: 123,
      channelId: 'chan-1',
      accountId: 'acc-1',
      timestamp: Date.now(),
      entry: undefined, // No entry for market order
    };

    const container = {
      redis: {} as any,
      orderRepository: {
        updateOne: jest.fn().mockResolvedValue(true),
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        child: jest.fn().mockReturnThis(),
      },
    } as any;

    context = new ExecutionContext({ payload, container });
    context.adapter = {
      exchangeCode: 'OANDA',
    } as any;
    context.session = 'mock-session' as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should use payload entry if provided', async () => {
    context.payload.entry = 1.2345;

    await EntryPriceResolverStep.execute(context, next);

    expect(context.state.entryPrice).toBe(1.2345);
    expect(next).toHaveBeenCalled();
    expect(mockPriceCache.getPrice).not.toHaveBeenCalled();
  });

  it('should use cached price if no entry and cache is fresh', async () => {
    const cachedPrice = {
      bid: 1.234,
      ask: 1.235,
      ts: Date.now() - 5000, // 5 seconds ago
    };
    mockPriceCache.getPrice.mockResolvedValue(cachedPrice);

    await EntryPriceResolverStep.execute(context, next);

    const expectedMidPrice = (1.234 + 1.235) / 2;
    expect(context.state.entryPrice).toBe(expectedMidPrice);
    expect(next).toHaveBeenCalled();
    expect(context.container.orderRepository.updateOne).toHaveBeenCalledWith(
      { orderId: 'order-1' },
      expect.objectContaining({
        $push: {
          history: expect.objectContaining({
            status: OrderHistoryStatus.INFO,
            info: expect.objectContaining({
              message: 'Used cached live price as entry for market order',
              bid: 1.234,
              ask: 1.235,
              cachedPrice: expectedMidPrice,
            }),
          }),
        },
      }),
      'mock-session',
    );
  });

  it('should not use cached price if too old', async () => {
    const cachedPrice = {
      bid: 1.234,
      ask: 1.235,
      ts: Date.now() - 15000, // 15 seconds ago (older than TTL of 10s)
    };
    mockPriceCache.getPrice.mockResolvedValue(cachedPrice);

    await EntryPriceResolverStep.execute(context, next);

    expect(context.state.entryPrice).toBeUndefined();
    expect(next).toHaveBeenCalled();
    expect(context.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: 'BTCUSD',
        cacheAgeSeconds: 15,
      }),
      'Cached price too old, proceeding without entry',
    );
  });

  it('should handle no cached price available', async () => {
    mockPriceCache.getPrice.mockResolvedValue(null);

    await EntryPriceResolverStep.execute(context, next);

    expect(context.state.entryPrice).toBeUndefined();
    expect(next).toHaveBeenCalled();
    expect(context.logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'BTCUSD' }),
      'No cached price available, proceeding without entry',
    );
  });

  it('should handle price cache fetch error gracefully', async () => {
    mockPriceCache.getPrice.mockRejectedValue(new Error('Redis error'));

    await EntryPriceResolverStep.execute(context, next);

    expect(context.state.entryPrice).toBeUndefined();
    expect(next).toHaveBeenCalled();
    expect(context.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: 'BTCUSD',
        error: expect.any(Error),
      }),
      'Failed to fetch price cache',
    );
  });
});
