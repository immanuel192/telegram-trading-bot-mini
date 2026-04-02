/**
 * Purpose: Base abstract class for broker adapters with common functionality
 * Exports: BaseBrokerAdapter abstract class
 * Core Flow: Provides retry logic and common lifecycle management
 *
 * All broker adapters extend this base class and implement the abstract methods
 * for exchange-specific order execution logic.
 *
 * Core idea: all prices or input as arguments to the Adapter should be the final one, except the symbol mapping. Adapter should not have any logic to adjust the entry, takeProfit or stopLoss
 */

import { LoggerInstance } from '@telegram-trading-bot-mini/shared/utils';
import { BrokerConfig } from '@dal';
import * as Sentry from '@sentry/node';
import {
  IBrokerAdapter,
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
} from './interfaces';

export abstract class BaseBrokerAdapter implements IBrokerAdapter {
  protected isReady = false;

  /**
   * Symbol mapping cache: universal → broker
   * Populated from config overrides and/or fetchInstruments()
   */
  protected symbolCache: Map<string, string> = new Map();

  /**
   * In-memory leverage cache per symbol
   * Prevents redundant setExchangeLeverage API calls
   * Cache lifetime = adapter instance lifetime (one adapter per account)
   */
  private leverageCache: Map<string, number> = new Map();

  constructor(
    protected _accountId: string,
    protected brokerConfig: BrokerConfig,
    protected logger: LoggerInstance,
  ) {}

  /**
   * Validate broker configuration
   * Each adapter must implement its own validation logic based on exchange requirements
   * Called automatically during init() before establishing connection
   *
   * @throws Error if configuration is invalid
   */
  protected abstract validateConfig(): void;

  /**
   * Format amount to exchange-specific precision
   * Each exchange has different requirements for lot size/units precision
   * Some exchanges may have different precision per symbol
   *
   * @param symbol - Trading symbol
   * @param amount - Raw amount value (string or number)
   * @returns Formatted amount string
   */
  protected abstract formatAmount(
    symbol: string,
    amount: string | number,
  ): string;

  /**
   * Format price to exchange-specific precision
   * Each exchange has different requirements for price precision
   * Some exchanges may have different precision per symbol
   *
   * @param symbol - Trading symbol
   * @param price - Raw price value (string or number)
   * @returns Formatted price string
   */
  protected abstract formatPrice(
    symbol: string,
    price: string | number,
  ): string;

  /**
   * Transform universal symbol to broker-specific format
   * Each adapter implements its own transformation logic
   *
   * Examples:
   * - OandaAdapter: XAUUSD → XAU_USD (adds underscore)
   * - MockAdapter: XAUUSD → XAUUSD (no transformation)
   * - BinanceAdapter: BTCUSDT → BTCUSDT (no transformation)
   *
   * @param universalSymbol - Symbol in universal format (e.g., XAUUSD, BTCUSDT)
   * @returns Broker-specific symbol
   */
  protected abstract transformSymbol(universalSymbol: string): string;

  /**
   * Refresh symbols/instruments from exchange
   * Some exchanges require periodic symbol list updates
   */
  abstract refreshSymbols(): Promise<void>;

  /**
   * Set leverage for a specific symbol on the exchange
   * Public method that handles caching and calls broker-specific implementation
   *
   * @param symbol - Trading symbol
   * @param leverage - Leverage multiplier
   */
  async setLeverage(symbol: string, leverage: number): Promise<void> {
    // Check cache - skip if already set to same value
    const cached = this.leverageCache.get(symbol);
    if (cached === leverage) {
      this.logger.debug(
        { symbol, leverage, cached },
        'Leverage already set, skipping API call',
      );
      return;
    }

    // Call broker-specific implementation
    await this.exchangeSetExchangeLeverage(symbol, leverage);

    // Update cache
    this.leverageCache.set(symbol, leverage);

    this.logger.info(
      { symbol, leverage },
      'Leverage set on exchange and cached',
    );
  }

  /**
   * Broker-specific leverage setting implementation
   * Override this in subclasses to implement exchange-specific logic
   *
   * @param symbol - Trading symbol
   * @param leverage - Leverage multiplier
   */
  protected abstract exchangeSetExchangeLeverage(
    symbol: string,
    leverage: number,
  ): Promise<void>;

  abstract init(): Promise<void>;
  abstract close(): Promise<void>;

  /**
   * Open a new position (market or limit order)
   * Derived classes must implement exchange-specific logic
   */
  abstract openOrder(params: OpenOrderParams): Promise<OpenOrderResult>;

  /**
   * Close an existing OPEN position
   * Derived classes must implement exchange-specific logic
   */
  abstract closeOrder(params: CloseOrderParams): Promise<CloseOrderResult>;

  /**
   * Cancel a PENDING order
   * Derived classes must implement exchange-specific logic
   */
  abstract cancelOrder(params: CancelOrderParams): Promise<void>;

  /**
   * Set stop loss for an existing order
   * Derived classes must implement exchange-specific logic
   * Returns the new SL order ID from the exchange
   */
  abstract setStopLoss(params: SetStopLossParams): Promise<SetStopLossResult>;

  /**
   * Set take profit for an existing order
   * Derived classes must implement exchange-specific logic
   * Returns the new TP order ID from the exchange
   */
  abstract setTakeProfit(
    params: SetTakeProfitParams,
  ): Promise<SetTakeProfitResult>;

  abstract fetchPrice(symbols: string[]): Promise<PriceTicker[]>;
  abstract getAccountInfo(): Promise<AccountInfo>;

  /**
   * Fetch open positions for a specific symbol
   * Returns all open positions/trades for the given symbol
   */
  abstract fetchPositions(symbol: string): Promise<ExchangePosition[]>;

  /**
   * Fetch pending orders for a specific symbol
   * Returns all pending (not yet filled) orders for the given symbol
   */
  abstract fetchOpenOrders(symbol: string): Promise<ExchangeOrder[]>;

  /**
   * Fetch transaction history from the broker
   * Derived classes must implement exchange-specific logic
   */
  abstract getTransactions(
    params: GetTransactionParams,
  ): Promise<TransactionItem[]>;

  abstract getName(): string;
  abstract getExchangeCode(): string;
  abstract getTokenKey(): string;

  /**
   * Get exchange code for this adapter
   * Used for constructing cache keys (e.g., price:oanda:XAUUSD)
   */
  get exchangeCode(): string {
    return this.brokerConfig.exchangeCode;
  }

  /**
   * Get account ID for this adapter
   * Used for constructing cache keys (e.g., balance:oanda:acc-123)
   */
  get accountId(): string {
    return this._accountId;
  }

  ready(): boolean {
    return this.isReady;
  }

  /**
   * Resolve universal symbol to broker-specific symbol
   *
   * Resolution priority:
   * 1. Check cache (populated from config or fetchInstruments)
   * 2. Check config override (symbolMapping)
   * 3. Apply adapter-specific transformation logic (transformSymbol)
   *
   * The result is cached for performance.
   *
   * @param universalSymbol - Symbol in universal format (e.g., XAUUSD, BTCUSDT)
   * @returns Broker-specific symbol (e.g., XAU_USD for Oanda)
   *
   * @example
   * ```typescript
   * const brokerSymbol = this.resolveSymbol('XAUUSD');
   * // For Oanda: returns 'XAU_USD'
   * // For Binance: returns 'XAUUSD'
   * ```
   */
  public resolveSymbol(universalSymbol: string): string {
    // Check cache first
    const cached = this.symbolCache.get(universalSymbol);
    if (cached) {
      return cached;
    }

    let brokerSymbol: string;

    // Check config override
    const mapping = this.brokerConfig.symbolMapping?.[universalSymbol];
    if (mapping) {
      const isSandbox = this.brokerConfig.isSandbox ?? false;
      brokerSymbol = isSandbox ? mapping[0] : mapping[1];

      this.logger.debug(
        { universalSymbol, brokerSymbol, source: 'config', isSandbox },
        'Resolved symbol from config override',
      );
    } else {
      // Apply adapter-specific transformation
      brokerSymbol = this.transformSymbol(universalSymbol);

      this.logger.debug(
        { universalSymbol, brokerSymbol, source: 'transform' },
        'Resolved symbol using transformation logic',
      );
    }

    // Cache the result
    this.symbolCache.set(universalSymbol, brokerSymbol);

    return brokerSymbol;
  }

  /**
   * Emit broker API performance metric to Sentry
   * Tracks latency and success/error status for all broker operations
   *
   * @param operation - Operation name (e.g., 'openOrder', 'closeOrder')
   * @param duration - Duration in milliseconds
   * @param symbol - Trading symbol
   * @param status - Operation status ('success' or 'error')
   * @param additionalAttributes - Optional additional attributes for the metric
   */
  public emitMetric(
    operation: string,
    duration: number,
    symbol: string,
    status: 'success' | 'error',
    additionalAttributes?: Record<string, string>,
  ): void {
    try {
      Sentry.metrics.distribution('executor.broker.api.duration', duration, {
        unit: 'millisecond',
        attributes: {
          broker: this.getExchangeCode(),
          operation,
          symbol,
          status,
          ...additionalAttributes,
        },
      });
    } catch (error) {
      // Gracefully handle metric emission errors (non-blocking)
      this.logger.debug(
        { error, operation, symbol },
        'Failed to emit broker API metric (non-blocking)',
      );
    }
  }

  /**
   * Retry helper with exponential backoff
   * Useful for handling transient broker API errors
   *
   * @param fn - Function to retry
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   * @param initialDelayMs - Initial delay in milliseconds (default: 1000)
   * @returns Result of the function
   * @throws Error if all retries are exhausted
   */
  protected async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    initialDelayMs = 1000,
  ): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxRetries - 1) throw error;
        const delay = initialDelayMs * Math.pow(2, attempt);
        this.logger.warn({ attempt, delay, error }, 'Retrying after error');
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new Error('Unreachable');
  }
}
