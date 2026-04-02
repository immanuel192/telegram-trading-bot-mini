/**
 * Unit tests for BaseBrokerAdapter retry logic
 */

import { BaseBrokerAdapter } from '../../../src/adapters/base.adapter';
import {
  OpenOrderParams,
  OpenOrderResult,
  CloseOrderParams,
  CloseOrderResult,
  CancelOrderParams,
  SetStopLossParams,
  SetStopLossResult,
  SetTakeProfitParams,
  SetTakeProfitResult,
  PriceTicker,
  AccountInfo,
} from '../../../src/adapters/interfaces';
import { BrokerConfig } from '@dal';
import pino from 'pino';
import * as Sentry from '@sentry/node';

// Test implementation of BaseBrokerAdapter
class TestAdapter extends BaseBrokerAdapter {
  async init(): Promise<void> {
    this.isReady = true;
  }

  async close(): Promise<void> {
    this.isReady = false;
  }

  async openOrder(params: OpenOrderParams): Promise<OpenOrderResult> {
    return {
      exchangeOrderId: 'test-order-1',
      executedPrice: 50000,
      executedLots: params.lotSize,
      executedAt: Date.now(),
    };
  }

  async closeOrder(params: CloseOrderParams): Promise<CloseOrderResult> {
    return {
      exchangeOrderId: 'test-close-1',
      closedPrice: 50000,
      closedLots: 0.1,
      closedAt: Date.now(),
    };
  }

  async cancelOrder(params: CancelOrderParams): Promise<void> {
    // No-op for test
  }

  async setStopLoss(params: SetStopLossParams): Promise<SetStopLossResult> {
    return { slOrderId: 'test-sl-order-1' };
  }

  async setTakeProfit(
    params: SetTakeProfitParams
  ): Promise<SetTakeProfitResult> {
    return { tpOrderId: 'test-tp-order-1' };
  }

  async fetchPrice(symbols: string[]): Promise<PriceTicker[]> {
    return symbols.map((symbol) => ({
      symbol,
      bid: 50000,
      ask: 50001,
      timestamp: Date.now(),
    }));
  }

  async getAccountInfo(): Promise<AccountInfo> {
    return {
      balance: 10000,
      equity: 10500,
      margin: 500,
      freeMargin: 9500,
    };
  }

  getName(): string {
    return 'Test Adapter';
  }

  getExchangeCode(): string {
    return 'test';
  }

  getTokenKey(): string {
    return 'test-token-key';
  }

  async fetchPositions(symbol: string): Promise<any[]> {
    return [];
  }

  async fetchOpenOrders(symbol: string): Promise<any[]> {
    return [];
  }

  async getTransactions(params: any): Promise<any[]> {
    return [];
  }

  async refreshSymbols(): Promise<void> {
    // No-op for test
  }

  protected formatAmount(symbol: string, amount: string | number): string {
    return String(amount);
  }

  protected formatPrice(symbol: string, price: string | number): string {
    return String(price);
  }

  protected async setExchangeLeverage(
    symbol: string,
    leverage: number
  ): Promise<void> {
    // No-op for test
  }

  protected async exchangeSetExchangeLeverage(
    symbol: string,
    leverage: number
  ): Promise<void> {
    // No-op for test - broker-specific implementation
  }

  protected validateConfig(): void {
    // No validation needed for test adapter
  }

  protected transformSymbol(universalSymbol: string): string {
    // Test adapter uses symbols as-is (no transformation)
    return universalSymbol;
  }

  // Expose protected method for testing
  public testRetryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries?: number,
    initialDelayMs?: number
  ): Promise<T> {
    return this.retryWithBackoff(fn, maxRetries, initialDelayMs);
  }

  // Expose public method for testing
  public testEmitMetric(
    operation: string,
    duration: number,
    symbol: string,
    status: 'success' | 'error',
    additionalAttributes?: Record<string, string>
  ): void {
    return this.emitMetric(
      operation,
      duration,
      symbol,
      status,
      additionalAttributes
    );
  }
}

describe('BaseBrokerAdapter', () => {
  let adapter: TestAdapter;
  const logger = pino({ level: 'silent' }); // Silent logger for tests
  const mockConfig: BrokerConfig = {
    exchangeCode: 'test',
    apiKey: 'test-key',
    unitsPerLot: 100000,
  };

  beforeEach(() => {
    adapter = new TestAdapter('test-account', mockConfig, logger);
  });

  describe('lifecycle', () => {
    it('should initialize and set ready state', async () => {
      expect(adapter.ready()).toBe(false);
      await adapter.init();
      expect(adapter.ready()).toBe(true);
    });

    it('should close and unset ready state', async () => {
      await adapter.init();
      expect(adapter.ready()).toBe(true);
      await adapter.close();
      expect(adapter.ready()).toBe(false);
    });
  });

  describe('retryWithBackoff', () => {
    it('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await adapter.testRetryWithBackoff(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Attempt 1 failed'))
        .mockRejectedValueOnce(new Error('Attempt 2 failed'))
        .mockResolvedValue('success');

      const result = await adapter.testRetryWithBackoff(fn, 3, 10);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Always fails'));

      await expect(adapter.testRetryWithBackoff(fn, 3, 10)).rejects.toThrow(
        'Always fails'
      );
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff delays', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Attempt 1'))
        .mockRejectedValueOnce(new Error('Attempt 2'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      await adapter.testRetryWithBackoff(fn, 3, 100);
      const duration = Date.now() - startTime;

      // Should have delays of 100ms and 200ms (total ~300ms)
      // Allow some tolerance for test execution time
      expect(duration).toBeGreaterThanOrEqual(250);
      expect(duration).toBeLessThan(500);
    });
  });

  describe('metadata', () => {
    it('should return adapter name', () => {
      expect(adapter.getName()).toBe('Test Adapter');
    });

    it('should return exchange code', () => {
      expect(adapter.getExchangeCode()).toBe('test');
    });

    it('should return token key', () => {
      expect(adapter.getTokenKey()).toBe('test-token-key');
    });
  });

  describe('emitMetric', () => {
    let sentryDistributionSpy: jest.SpyInstance;

    beforeEach(() => {
      // Mock Sentry.metrics.distribution
      sentryDistributionSpy = jest.spyOn(Sentry.metrics, 'distribution');
    });

    afterEach(() => {
      sentryDistributionSpy.mockRestore();
    });

    it('should emit metric to Sentry with correct parameters', () => {
      adapter.testEmitMetric('openOrder', 150, 'XAUUSD', 'success');

      expect(sentryDistributionSpy).toHaveBeenCalledTimes(1);
      expect(sentryDistributionSpy).toHaveBeenCalledWith(
        'executor.broker.api.duration',
        150,
        {
          unit: 'millisecond',
          attributes: {
            broker: 'test',
            operation: 'openOrder',
            symbol: 'XAUUSD',
            status: 'success',
          },
        }
      );
    });

    it('should include broker code in attributes', () => {
      adapter.testEmitMetric('closeOrder', 200, 'BTCUSD', 'success');

      expect(sentryDistributionSpy).toHaveBeenCalledWith(
        'executor.broker.api.duration',
        200,
        expect.objectContaining({
          attributes: expect.objectContaining({
            broker: 'test',
          }),
        })
      );
    });

    it('should include operation name in attributes', () => {
      adapter.testEmitMetric('setStopLoss', 100, 'XAUUSD', 'success');

      expect(sentryDistributionSpy).toHaveBeenCalledWith(
        'executor.broker.api.duration',
        100,
        expect.objectContaining({
          attributes: expect.objectContaining({
            operation: 'setStopLoss',
          }),
        })
      );
    });

    it('should include symbol in attributes', () => {
      adapter.testEmitMetric('fetchPrice', 50, 'ETHUSD', 'success');

      expect(sentryDistributionSpy).toHaveBeenCalledWith(
        'executor.broker.api.duration',
        50,
        expect.objectContaining({
          attributes: expect.objectContaining({
            symbol: 'ETHUSD',
          }),
        })
      );
    });

    it('should include status in attributes', () => {
      adapter.testEmitMetric('cancelOrder', 120, 'XAUUSD', 'error');

      expect(sentryDistributionSpy).toHaveBeenCalledWith(
        'executor.broker.api.duration',
        120,
        expect.objectContaining({
          attributes: expect.objectContaining({
            status: 'error',
          }),
        })
      );
    });

    it('should include additional attributes when provided', () => {
      adapter.testEmitMetric('openOrder', 150, 'XAUUSD', 'success', {
        orderType: 'market',
        side: 'LONG',
      });

      expect(sentryDistributionSpy).toHaveBeenCalledWith(
        'executor.broker.api.duration',
        150,
        expect.objectContaining({
          attributes: expect.objectContaining({
            broker: 'test',
            operation: 'openOrder',
            symbol: 'XAUUSD',
            status: 'success',
            orderType: 'market',
            side: 'LONG',
          }),
        })
      );
    });

    it('should not include additional attributes when not provided', () => {
      adapter.testEmitMetric('openOrder', 150, 'XAUUSD', 'success');

      expect(sentryDistributionSpy).toHaveBeenCalledWith(
        'executor.broker.api.duration',
        150,
        {
          unit: 'millisecond',
          attributes: {
            broker: 'test',
            operation: 'openOrder',
            symbol: 'XAUUSD',
            status: 'success',
          },
        }
      );
    });

    it('should gracefully handle Sentry emission errors (non-blocking)', () => {
      // Mock Sentry to throw an error
      sentryDistributionSpy.mockImplementation(() => {
        throw new Error('Sentry is down');
      });

      // Should not throw
      expect(() => {
        adapter.testEmitMetric('openOrder', 150, 'XAUUSD', 'success');
      }).not.toThrow();

      expect(sentryDistributionSpy).toHaveBeenCalledTimes(1);
    });

    it('should log debug message when metric emission fails', () => {
      const loggerDebugSpy = jest.spyOn(logger, 'debug');

      // Mock Sentry to throw an error
      sentryDistributionSpy.mockImplementation(() => {
        throw new Error('Sentry is down');
      });

      adapter.testEmitMetric('openOrder', 150, 'XAUUSD', 'success');

      expect(loggerDebugSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
          operation: 'openOrder',
          symbol: 'XAUUSD',
        }),
        'Failed to emit broker API metric (non-blocking)'
      );

      loggerDebugSpy.mockRestore();
    });
  });

  describe('resolveSymbol', () => {
    it('should resolve symbol using transformation logic by default', () => {
      const result = adapter.resolveSymbol('XAUUSD');
      expect(result).toBe('XAUUSD'); // TestAdapter doesn't transform
    });

    it('should cache resolved symbols', () => {
      const transformSpy = jest.spyOn(adapter as any, 'transformSymbol');

      // First call should use transformation
      const result1 = adapter.resolveSymbol('XAUUSD');
      expect(result1).toBe('XAUUSD');
      expect(transformSpy).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = adapter.resolveSymbol('XAUUSD');
      expect(result2).toBe('XAUUSD');
      expect(transformSpy).toHaveBeenCalledTimes(1); // Still 1, not called again

      transformSpy.mockRestore();
    });

    it('should use config override for production environment', () => {
      const configWithMapping: BrokerConfig = {
        exchangeCode: 'test',
        apiKey: 'test-key',
        unitsPerLot: 100000,
        isSandbox: false,
        symbolMapping: {
          XAUUSD: ['XAU_USD_SANDBOX', 'XAU_USD_PROD'],
        },
      };

      const adapterWithMapping = new TestAdapter(
        'test-account',
        configWithMapping,
        logger
      );

      const result = adapterWithMapping.resolveSymbol('XAUUSD');
      expect(result).toBe('XAU_USD_PROD');
    });

    it('should use config override for sandbox environment', () => {
      const configWithMapping: BrokerConfig = {
        exchangeCode: 'test',
        apiKey: 'test-key',
        unitsPerLot: 100000,
        isSandbox: true,
        symbolMapping: {
          XAUUSD: ['XAU_USD_SANDBOX', 'XAU_USD_PROD'],
        },
      };

      const adapterWithMapping = new TestAdapter(
        'test-account',
        configWithMapping,
        logger
      );

      const result = adapterWithMapping.resolveSymbol('XAUUSD');
      expect(result).toBe('XAU_USD_SANDBOX');
    });

    it('should fall back to transformation when symbol not in config', () => {
      const configWithMapping: BrokerConfig = {
        exchangeCode: 'test',
        apiKey: 'test-key',
        unitsPerLot: 100000,
        symbolMapping: {
          XAUUSD: ['XAU_USD_SANDBOX', 'XAU_USD_PROD'],
        },
      };

      const adapterWithMapping = new TestAdapter(
        'test-account',
        configWithMapping,
        logger
      );

      // BTCUSDT not in config, should use transformation
      const result = adapterWithMapping.resolveSymbol('BTCUSDT');
      expect(result).toBe('BTCUSDT'); // TestAdapter doesn't transform
    });

    it('should cache config-resolved symbols', () => {
      const configWithMapping: BrokerConfig = {
        exchangeCode: 'test',
        apiKey: 'test-key',
        unitsPerLot: 100000,
        symbolMapping: {
          XAUUSD: ['XAU_USD_SANDBOX', 'XAU_USD_PROD'],
        },
      };

      const adapterWithMapping = new TestAdapter(
        'test-account',
        configWithMapping,
        logger
      );

      const transformSpy = jest.spyOn(
        adapterWithMapping as any,
        'transformSymbol'
      );

      // First call should use config
      const result1 = adapterWithMapping.resolveSymbol('XAUUSD');
      expect(result1).toBe('XAU_USD_PROD');
      expect(transformSpy).not.toHaveBeenCalled(); // Config used, not transform

      // Second call should use cache
      const result2 = adapterWithMapping.resolveSymbol('XAUUSD');
      expect(result2).toBe('XAU_USD_PROD');
      expect(transformSpy).not.toHaveBeenCalled(); // Still not called

      transformSpy.mockRestore();
    });

    it('should log debug message when resolving from config', () => {
      const loggerDebugSpy = jest.spyOn(logger, 'debug');

      const configWithMapping: BrokerConfig = {
        exchangeCode: 'test',
        apiKey: 'test-key',
        unitsPerLot: 100000,
        isSandbox: false,
        symbolMapping: {
          XAUUSD: ['XAU_USD_SANDBOX', 'XAU_USD_PROD'],
        },
      };

      const adapterWithMapping = new TestAdapter(
        'test-account',
        configWithMapping,
        logger
      );

      adapterWithMapping.resolveSymbol('XAUUSD');

      expect(loggerDebugSpy).toHaveBeenCalledWith(
        {
          universalSymbol: 'XAUUSD',
          brokerSymbol: 'XAU_USD_PROD',
          source: 'config',
          isSandbox: false,
        },
        'Resolved symbol from config override'
      );

      loggerDebugSpy.mockRestore();
    });

    it('should log debug message when resolving from transformation', () => {
      const loggerDebugSpy = jest.spyOn(logger, 'debug');

      adapter.resolveSymbol('BTCUSDT');

      expect(loggerDebugSpy).toHaveBeenCalledWith(
        {
          universalSymbol: 'BTCUSDT',
          brokerSymbol: 'BTCUSDT',
          source: 'transform',
        },
        'Resolved symbol using transformation logic'
      );

      loggerDebugSpy.mockRestore();
    });
  });
});
