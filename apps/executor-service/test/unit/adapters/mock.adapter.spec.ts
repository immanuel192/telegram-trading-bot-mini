/**
 * Unit tests for MockAdapter
 */

import { MockAdapter } from '../../../src/adapters/mock/mock.adapter';
import { BrokerConfig } from '@dal';
import { CommandSide } from '@telegram-trading-bot-mini/shared/utils';
import pino from 'pino';

describe('MockAdapter', () => {
  let adapter: MockAdapter;
  const logger = pino({ level: 'silent' });
  const mockConfig: BrokerConfig = {
    exchangeCode: 'mock',
    apiKey: 'test-key',
    unitsPerLot: 100000,
  };

  beforeEach(async () => {
    adapter = new MockAdapter('test-account', mockConfig, logger);
    await adapter.init();
  });

  afterEach(async () => {
    await adapter.close();
  });

  describe('lifecycle', () => {
    it('should initialize successfully', async () => {
      const newAdapter = new MockAdapter('test-account-2', mockConfig, logger);
      await newAdapter.init();

      expect(newAdapter.ready()).toBe(true);
      expect(newAdapter.getName()).toBe('Mock Exchange');
      expect(newAdapter.getExchangeCode()).toBe('mock');

      await newAdapter.close();
    });

    it('should close successfully', async () => {
      expect(adapter.ready()).toBe(true);
      await adapter.close();
      expect(adapter.ready()).toBe(false);
    });

    it('should throw error when exchangeCode is missing', async () => {
      const invalidConfig = { ...mockConfig, exchangeCode: '' };
      const invalidAdapter = new MockAdapter(
        'test-account',
        invalidConfig as BrokerConfig,
        logger,
      );

      await expect(invalidAdapter.init()).rejects.toThrow(
        'exchangeCode is required',
      );
    });
  });

  describe('openOrder', () => {
    it('should open market order successfully', async () => {
      const result = await adapter.openOrder({
        orderId: 'test-order-1',
        symbol: 'BTCUSDT',
        side: CommandSide.BUY,
        lotSize: 0.1,
        isImmediate: true,
        traceToken: 'test-trace',
      });

      expect(result).toMatchObject({
        exchangeOrderId: expect.stringContaining('MOCK-'),
        executedPrice: expect.any(Number),
        executedLots: 0.1,
        executedAt: expect.any(Number),
      });
      expect(result.executedPrice).toBeGreaterThan(0);
    });

    it('should open limit order successfully', async () => {
      const result = await adapter.openOrder({
        orderId: 'test-order-2',
        symbol: 'ETHUSDT',
        side: CommandSide.SELL,
        lotSize: 0.5,
        isImmediate: false,
        entry: 3100,
        traceToken: 'test-trace',
      });

      expect(result).toMatchObject({
        exchangeOrderId: expect.stringContaining('MOCK-'),
        executedPrice: 3100,
        executedLots: 0.5,
        executedAt: expect.any(Number),
      });
    });

    it('should use entry price when provided', async () => {
      const entryPrice = 2500;
      const result = await adapter.openOrder({
        orderId: 'test-order-3',
        symbol: 'XAUUSD',
        side: CommandSide.BUY,
        lotSize: 1.0,
        isImmediate: false,
        entry: entryPrice,
        traceToken: 'test-trace',
      });

      expect(result.executedPrice).toBe(entryPrice);
    });

    it('should generate unique order IDs', async () => {
      const result1 = await adapter.openOrder({
        orderId: 'test-order-4',
        symbol: 'BTCUSDT',
        side: CommandSide.BUY,
        lotSize: 0.1,
        isImmediate: true,
        traceToken: 'test-trace-1',
      });

      const result2 = await adapter.openOrder({
        orderId: 'test-order-5',
        symbol: 'BTCUSDT',
        side: CommandSide.BUY,
        lotSize: 0.1,
        isImmediate: true,
        traceToken: 'test-trace-2',
      });

      expect(result1.exchangeOrderId).not.toBe(result2.exchangeOrderId);
    });

    it('should handle unknown symbols with default price', async () => {
      const result = await adapter.openOrder({
        orderId: 'test-order-6',
        symbol: 'UNKNOWN',
        side: CommandSide.BUY,
        lotSize: 0.1,
        isImmediate: true,
        traceToken: 'test-trace',
      });

      expect(result.executedPrice).toBeGreaterThan(0);
    });
  });

  describe('closeOrder', () => {
    it('should close order successfully', async () => {
      const result = await adapter.closeOrder({
        orderId: 'test-order-1',
        symbol: 'BTCUSDT',
        traceToken: 'test-trace',
      });

      expect(result).toMatchObject({
        exchangeOrderId: expect.stringContaining('MOCK-CLOSE-'),
        closedPrice: expect.any(Number),
        closedLots: 0.1,
        closedAt: expect.any(Number),
      });
      expect(result.closedPrice).toBeGreaterThan(0);
    });

    it('should generate unique close order IDs', async () => {
      const result1 = await adapter.closeOrder({
        orderId: 'test-order-1',
        symbol: 'BTCUSDT',
        traceToken: 'test-trace-1',
      });

      const result2 = await adapter.closeOrder({
        orderId: 'test-order-2',
        symbol: 'BTCUSDT',
        traceToken: 'test-trace-2',
      });

      expect(result1.exchangeOrderId).not.toBe(result2.exchangeOrderId);
    });
  });

  describe('cancelOrder', () => {
    it('should cancel order successfully', async () => {
      await expect(
        adapter.cancelOrder({
          orderId: 'test-order-1',
          symbol: 'BTCUSDT',
          traceToken: 'test-trace',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('setStopLoss', () => {
    it('should set stop loss successfully', async () => {
      const result = await adapter.setStopLoss({
        orderId: 'test-order-1',
        symbol: 'BTCUSDT',
        price: 49000,
        traceToken: 'test-trace',
      });

      expect(result).toMatchObject({
        slOrderId: expect.stringContaining('MOCK-SL-'),
      });
    });

    it('should generate unique SL order IDs', async () => {
      const result1 = await adapter.setStopLoss({
        orderId: 'test-order-1',
        symbol: 'BTCUSDT',
        price: 49000,
        traceToken: 'test-trace-1',
      });

      const result2 = await adapter.setStopLoss({
        orderId: 'test-order-2',
        symbol: 'BTCUSDT',
        price: 48000,
        traceToken: 'test-trace-2',
      });

      expect(result1.slOrderId).not.toBe(result2.slOrderId);
    });
  });

  describe('setTakeProfit', () => {
    it('should set take profit successfully', async () => {
      const result = await adapter.setTakeProfit({
        orderId: 'test-order-1',
        symbol: 'BTCUSDT',
        price: 51000,
        traceToken: 'test-trace',
      });

      expect(result).toMatchObject({
        tpOrderId: expect.stringContaining('MOCK-TP-'),
      });
    });

    it('should generate unique TP order IDs', async () => {
      const result1 = await adapter.setTakeProfit({
        orderId: 'test-order-1',
        symbol: 'BTCUSDT',
        price: 51000,
        traceToken: 'test-trace-1',
      });

      const result2 = await adapter.setTakeProfit({
        orderId: 'test-order-2',
        symbol: 'BTCUSDT',
        price: 52000,
        traceToken: 'test-trace-2',
      });

      expect(result1.tpOrderId).not.toBe(result2.tpOrderId);
    });
  });

  describe('fetchPrice', () => {
    it('should fetch price for known symbol', async () => {
      const result = await adapter.fetchPrice(['BTCUSDT']);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        symbol: 'BTCUSDT',
        bid: expect.any(Number),
        ask: expect.any(Number),
        timestamp: expect.any(Number),
      });
      expect(result[0].ask).toBeGreaterThan(result[0].bid);
    });

    it('should return different prices on multiple calls (simulates fluctuation)', async () => {
      const result1 = await adapter.fetchPrice(['BTCUSDT']);
      const result2 = await adapter.fetchPrice(['BTCUSDT']);

      // Prices should be different due to random fluctuation
      expect(result1[0].bid).not.toBe(result2[0].bid);
    });

    it('should fetch price for unknown symbol with default', async () => {
      const result = await adapter.fetchPrice(['UNKNOWN']);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        symbol: 'UNKNOWN',
        bid: expect.any(Number),
        ask: expect.any(Number),
        timestamp: expect.any(Number),
      });
      expect(result[0].bid).toBeGreaterThan(0);
    });

    it('should fetch prices for multiple symbols', async () => {
      const result = await adapter.fetchPrice(['BTCUSDT', 'ETHUSDT', 'XAUUSD']);

      expect(result).toHaveLength(3);
      expect(result[0].symbol).toBe('BTCUSDT');
      expect(result[1].symbol).toBe('ETHUSDT');
      expect(result[2].symbol).toBe('XAUUSD');
      result.forEach((ticker) => {
        expect(ticker.bid).toBeGreaterThan(0);
        expect(ticker.ask).toBeGreaterThan(ticker.bid);
      });
    });
  });

  describe('getAccountInfo', () => {
    it('should return mock account info', async () => {
      const result = await adapter.getAccountInfo();

      expect(result).toEqual({
        balance: 10000,
        equity: 10500,
        margin: 500,
        freeMargin: 9500,
      });
    });
  });

  describe('fetchPositions', () => {
    it('should return empty array', async () => {
      const result = await adapter.fetchPositions('BTCUSDT');
      expect(result).toEqual([]);
    });
  });

  describe('fetchOpenOrders', () => {
    it('should return empty array', async () => {
      const result = await adapter.fetchOpenOrders('BTCUSDT');
      expect(result).toEqual([]);
    });
  });

  describe('getTransactions', () => {
    it('should return empty array for now', async () => {
      const result = await adapter.getTransactions({
        from: new Date(),
        to: new Date(),
      });
      expect(result).toEqual([]);
    });
  });

  describe('metadata', () => {
    it('should return correct name', () => {
      expect(adapter.getName()).toBe('Mock Exchange');
    });

    it('should return correct exchange code', () => {
      expect(adapter.getExchangeCode()).toBe('mock');
    });

    it('should return correct token key', () => {
      expect(adapter.getTokenKey()).toBe('mock:test-account');
    });
  });

  describe('formatting', () => {
    it('should format amount to 2 decimal places', () => {
      // Access protected method via type assertion
      const formatted = (adapter as any).formatAmount('BTCUSDT', 0.123456);
      expect(formatted).toBe('0.12');
    });

    it('should format price to 5 decimal places', () => {
      // Access protected method via type assertion
      const formatted = (adapter as any).formatPrice('BTCUSDT', 50000.123456);
      expect(formatted).toBe('50000.12346');
    });
  });

  describe('leverage and margin', () => {
    it('should handle refreshSymbols without error', async () => {
      await expect(adapter.refreshSymbols()).resolves.toBeUndefined();
    });

    it('should handle setLeverage without error (Mock simulates leverage)', async () => {
      // Mock adapter simulates leverage support
      await expect(adapter.setLeverage('BTCUSDT', 10)).resolves.toBeUndefined();
    });
  });
});
