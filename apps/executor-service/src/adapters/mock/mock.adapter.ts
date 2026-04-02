/**
 * Purpose: Mock broker adapter for testing without real exchange APIs
 * Exports: MockAdapter class
 * Core Flow: Simulates order execution with fake data and delays
 *
 * This adapter allows complete service testing and wiring before implementing
 * real exchange integrations. It simulates realistic behavior including
 * execution delays and price fluctuations.
 */

import { BaseBrokerAdapter } from '../base.adapter';
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
  ExchangePosition,
  ExchangeOrder,
  GetTransactionParams,
  TransactionItem,
} from '../interfaces';
import { BrokerConfig } from '@dal';
import { LoggerInstance } from '@telegram-trading-bot-mini/shared/utils';

export class MockAdapter extends BaseBrokerAdapter {
  private mockOrders = new Map<string, OpenOrderResult>();
  private mockPrices = new Map<string, number>();

  constructor(
    accountId: string,
    brokerConfig: BrokerConfig,
    logger: LoggerInstance,
  ) {
    super(accountId, brokerConfig, logger);
  }

  /**
   * Validate mock adapter configuration
   * Mock adapter has minimal validation requirements
   */
  protected validateConfig(): void {
    // Mock adapter doesn't require strict validation
    // Just ensure basic fields exist
    if (!this.brokerConfig.exchangeCode) {
      throw new Error('exchangeCode is required');
    }
  }

  async init(): Promise<void> {
    this.validateConfig();
    this.logger.info(
      { accountId: this._accountId },
      'Mock adapter initialized',
    );
    this.isReady = true;

    // Initialize mock prices for common symbols
    this.mockPrices.set('BTCUSDT', 50000);
    this.mockPrices.set('ETHUSDT', 3000);
    this.mockPrices.set('XAUUSD', 2000);
  }

  async close(): Promise<void> {
    this.logger.info({ accountId: this._accountId }, 'Mock adapter closed');
    this.isReady = false;
  }

  async openOrder(params: OpenOrderParams): Promise<OpenOrderResult> {
    this.logger.info(
      {
        symbol: params.symbol,
        side: params.side,
        lotSize: params.lotSize,
        isImmediate: params.isImmediate,
        traceToken: params.traceToken,
      },
      'Mock: Opening order',
    );

    // Simulate execution delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    const basePrice = this.mockPrices.get(params.symbol) || 1000;
    const executedPrice =
      params.entry || basePrice + (Math.random() - 0.5) * 10;

    const result: OpenOrderResult = {
      exchangeOrderId: `MOCK-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`,
      executedPrice,
      executedLots: params.lotSize,
      executedAt: Date.now(),
    };

    // Add SL order ID if stop loss is provided
    if (params.stopLoss) {
      result.stopLossOrderId = `MOCK-SL-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;
    }

    // Add TP order ID if take profits are provided
    if (params.takeProfits && params.takeProfits.length > 0) {
      result.takeProfitOrderId = `MOCK-TP-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;
    }

    this.logger.info(
      {
        exchangeOrderId: result.exchangeOrderId,
        executedPrice: result.executedPrice,
        stopLossOrderId: result.stopLossOrderId,
        takeProfitOrderId: result.takeProfitOrderId,
        traceToken: params.traceToken,
      },
      'Mock: Order opened successfully',
    );

    return result;
  }

  async closeOrder(params: CloseOrderParams): Promise<CloseOrderResult> {
    this.logger.info(
      {
        orderId: params.orderId,
        symbol: params.symbol,
        traceToken: params.traceToken,
      },
      'Mock: Closing order',
    );

    // Simulate execution delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    const basePrice = this.mockPrices.get(params.symbol) || 1000;
    const closedPrice = basePrice + (Math.random() - 0.5) * 10;

    const result: CloseOrderResult = {
      exchangeOrderId: `MOCK-CLOSE-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`,
      closedPrice,
      closedLots: params.amount || 0.1, // Mock value or requested amount
      closedAt: Date.now(),
    };

    this.logger.info(
      {
        orderId: params.orderId,
        exchangeOrderId: result.exchangeOrderId,
        closedPrice: result.closedPrice,
        traceToken: params.traceToken,
      },
      'Mock: Order closed successfully',
    );

    return result;
  }

  async cancelOrder(params: CancelOrderParams): Promise<void> {
    this.logger.info(
      {
        orderId: params.orderId,
        symbol: params.symbol,
        traceToken: params.traceToken,
      },
      'Mock: Order cancelled',
    );
  }

  async setStopLoss(params: SetStopLossParams): Promise<SetStopLossResult> {
    this.logger.info(
      {
        orderId: params.orderId,
        price: params.price,
        traceToken: params.traceToken,
      },
      'Mock: Stop loss set',
    );
    return {
      slOrderId: `MOCK-SL-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`,
    };
  }

  async setTakeProfit(
    params: SetTakeProfitParams,
  ): Promise<SetTakeProfitResult> {
    this.logger.info(
      {
        orderId: params.orderId,
        price: params.price,
        traceToken: params.traceToken,
      },
      'Mock: Take profit set',
    );
    return {
      tpOrderId: `MOCK-TP-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`,
    };
  }

  /**
   * Fetch price data for one or more symbols
   * Returns mock price data for testing
   *
   * @param symbols - Array of universal symbol format
   * @returns Array of mock price tickers, one per symbol
   */
  async fetchPrice(symbols: string[]): Promise<PriceTicker[]> {
    return symbols.map((symbol) => {
      const basePrice = this.mockPrices.get(symbol) || 1000;
      // Simulate price fluctuation
      const price = basePrice + (Math.random() - 0.5) * 20;

      return {
        symbol,
        bid: price - 0.5,
        ask: price + 0.5,
        timestamp: Date.now(),
      };
    });
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
    return 'Mock Exchange';
  }

  getExchangeCode(): string {
    return this.brokerConfig.exchangeCode;
  }

  /**
   * Get token key for mock adapter
   * Mock adapter doesn't use real tokens, so we return a static key per account
   */
  getTokenKey(): string {
    return `mock:${this._accountId}`;
  }

  /**
   * Format amount to mock precision (2 decimal places)
   */
  protected formatAmount(symbol: string, amount: string | number): string {
    const rawAmount: number = parseFloat(amount.toString());
    return rawAmount.toFixed(2);
  }

  /**
   * Format price to mock precision (5 decimal places)
   */
  protected formatPrice(symbol: string, price: string | number): string {
    const rawPrice: number = parseFloat(price.toString());
    return rawPrice.toFixed(5);
  }

  /**
   * Refresh symbols from exchange
   * Mock adapter doesn't need to refresh symbols
   */
  async refreshSymbols(): Promise<void> {
    // Nothing to do for mock
    return;
  }

  /**
   * Set leverage for a symbol
   * Mock adapter simulates leverage support
   */
  protected async exchangeSetExchangeLeverage(
    _symbol: string,
    _leverage: number,
  ): Promise<void> {
    // Mock adapter doesn't actually set leverage
    return;
  }

  /**
   * Transform universal symbol to mock broker format
   * Mock adapter uses symbols as-is (no transformation)
   */
  protected transformSymbol(universalSymbol: string): string {
    return universalSymbol;
  }

  /**
   * Fetch open positions for a symbol
   * Mock adapter returns empty array
   */
  async fetchPositions(_symbol: string): Promise<ExchangePosition[]> {
    // Mock adapter doesn't track positions
    return [];
  }

  /**
   * Fetch pending orders for a symbol
   * Mock adapter returns empty array
   */
  async fetchOpenOrders(_symbol: string): Promise<ExchangeOrder[]> {
    // Mock adapter doesn't track pending orders
    return [];
  }

  /**
   * Fetch transaction history from mock broker
   */
  async getTransactions(
    params: GetTransactionParams,
  ): Promise<TransactionItem[]> {
    this.logger.debug({ params }, 'Mock: Fetching transactions (stub)');
    return [];
  }
}
