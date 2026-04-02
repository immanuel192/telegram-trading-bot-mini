# broker-adapter-system Specification

## Purpose
Define the broker adapter abstraction layer that allows executor-service to interact with multiple broker exchanges (crypto via ccxt, Oanda, and future XM/Exness) through a unified interface. This specification covers the adapter pattern, concrete implementations for ccxt and Oanda (ported from trading-view-alert), and the factory for managing adapter instances.

## ADDED Requirements

### Requirement: Exchange Service Base Contract
The system SHALL define a base contract that all broker adapters implement, following trading-view-alert's ExchangeServiceBase pattern.

#### Scenario: IExchangeService public interface
- **WHEN** defining the exchange service contract
- **THEN** an `IExchangeService` interface SHALL be created with methods:
  - Lifecycle management:
    - `init(): Promise<void>` - Initialize exchange connection
    - `ready(): boolean` - Check if exchange is ready
    - `name(): string` - Get exchange name
  - Order operations (high-level):
    - `placeOrder(params: PlaceOrderOptions): Promise<Order>` - Place market/limit order
    - `placeTpSl(params: PlaceOrderSlTpOptions): Promise<PlaceOrderSlTpResult>` - Set SL/TP
    - `closeOrder(params: CloseOrderOptions): Promise<CloseOrderResult>` - Close position
  - Market data:
    - `fetchTicker(symbol: string, accountId?: string): Promise<Ticker>` - Get current price
    - `leverageInfo(symbol: string): MarketLeverageSummary | null` - Get leverage tiers
    - `calLeverage(symbol: string, tradeAmount: number): number` - Calculate leverage
    - `setLeverage(symbol: string, leverage: number): Promise<void>` - Set leverage
    - `getCurrentLeverage(symbol: string): number | undefined` - Get current leverage
  - Symbol management:
    - `lookupSymbol(symbol: string): string | undefined` - Map symbol to exchange symbol
    - `refreshSymbols(): Promise<void>` - Refresh symbol mappings

#### Scenario: ExchangeServiceBase abstract class
- **WHEN** implementing the base exchange service
- **THEN** an `ExchangeServiceBase` abstract class SHALL be created
- **AND** it SHALL implement the high-level public API methods:
  - `placeOrder()` - performs symbol lookup, leverage prep, delegates to `exchangeCreateOrder()`
  - `placeTpSl()` - validates prices, places SL/TP orders, handles cancellation
  - `closeOrder()` - checks positions, closes pending orders, delegates to exchange methods
  - `setLeverage()` - tracks leverage per symbol, delegates to `setExchangeLeverage()`
- **AND** it SHALL define protected abstract methods for derived classes:
  - `initialValidation(): Promise<void>` - Exchange-specific initialization
  - `exchangeAmountToPrecision(symbol: string, amount: number | string): string`
  - `exchangePriceToPrecision(symbol: string, price: number | string): string`
  - `exchangeCreateOrder(params: ExchangeCreateOrderOptions): Promise<Order>`
  - `exchangeCancelOrder(exchangeOrderId: string, symbol: string): Promise<void>`
  - `exchangeFetchPositions(symbol: string): Promise<ExchangePosition[]>`
  - `exchangeFetchOpenOrders(symbol: string): Promise<Order[]>`
  - `setExchangeLeverage(symbol: string, leverage: number): Promise<void>`
  - `prepareOrderLeverageAndMargin(symbol: string, leverage: number): Promise<void>`

### Requirement: Adapter Implementation Strategies
The system SHALL provide two implementation strategies for ExchangeServiceBase: CryptoExchangeAdapter (ccxt-based) and APIExchangeAdapter (HTTP-based).

#### Scenario: CryptoExchangeAdapter for ccxt exchanges
- **WHEN** implementing adapters for ccxt-supported exchanges
- **THEN** a `CryptoExchangeAdapter` abstract class SHALL be created extending `ExchangeServiceBase`
- **AND** it SHALL:
  - Initialize and maintain a ccxt exchange instance
  - Implement `exchangeCreateOrder()` using ccxt's `createOrder()` method
  - Implement `exchangeFetchPositions()` using ccxt's `fetchPositions()`
  - Implement `exchangeFetchOpenOrders()` using ccxt's `fetch OpenOrders()`
  - Implement precision helpers using ccxt's `amountToPrecision()` and `priceToPrecision()`
  - Handle leverage setting via ccxt's `setLeverage()`
  - Manage margin mode (ISOLATED/CROSSED) via ccxt
  - Support position mode (one-way/hedge mode)
- **AND** it SHALL be reusable for ANY ccxt-supported exchange (Binance, Bybit, KuCoin, etc.)

#### Scenario: APIExchangeAdapter for HTTP-based exchanges
- **WHEN** implementing adapters for non-ccxt exchanges (Oanda, XM, Exness)
- **THEN** an `APIExchangeAdapter` abstract class SHALL be created extending `ExchangeServiceBase`
- **AND** it SHALL:
  - Provide HTTP client infrastructure (using fetch or axios)
  - Handle authentication using access token / refresh token pattern
  - Implement token refresh logic before expiry
  - Provide abstract methods for derived classes to implement exchange-specific endpoints:
    - `placeOrderRequest(params): Promise<Order>` - HTTP request to place order
    - `cancelOrderRequest(orderId, symbol): Promise<void>` - HTTP request to cancel
    - `fetchPositionsRequest(symbol): Promise<Position[]>` - HTTP request to fetch positions
    - `fetchTickerRequest(symbol): Promise<Ticker>` - HTTP request to fetch price
  - Handle HTTP error codes and retries
  - Implement rate limiting awareness
- **AND** each exchange (Oanda, XM, Exness) SHALL extend this class and implement the request methods

### Requirement: CCXT Crypto Exchange Adapter
The system SHALL support crypto exchanges via the ccxt library, ported from trading-view-alert.

#### Scenario: BaseCcxtAdapter implementation
- **WHEN** implementing ccxt-based adapters
- **THEN** a `BaseCcxtAdapter` SHALL be created extending `BaseBrokerAdapter`
- **AND** it SHALL port logic from `trading-view-alert/src/services/exchanges/crypto/base.ccxt.ts`:
  - ccxt exchange initialization
  - Leverage setting
  - Margin type management
  - Precision helpers (amountToPrecision, priceToPrecision)
  - Position fetching
- **AND** ccxt SHALL be installed as a dependency

#### Scenario: BinanceFutureAdapter implementation
- **WHEN** implementing Binance Future support
- **THEN** a `BinanceFutureAdapter` SHALL be created extending `BaseCcxtAdapter`
- **AND** it SHALL port logic from `trading-view-alert/src/services/exchanges/crypto/binance.future.ts`:
  - Market order placement
  - SL/TP as separate STOP_MARKET/TAKE_PROFIT_MARKET orders
  - Position side handling (hedge mode vs one-way mode)
  - Order cancellation (SL/TP orders)
  - Symbol mapping if needed
- **AND** it SHALL use ccxt's Binance USDM interface

#### Scenario: ccxt adapter testing
- **WHEN** testing ccxt adapters
- **THEN** unit tests SHALL mock ccxt exchange methods
- **AND** integration tests SHALL use Binance testnet
- **AND** integration tests SHALL verify:
  - Order placement → SL/TP placement → Order cancellation flow
  - Live price fetching
  - Leverage adjustment

### Requirement: Oanda Adapter
The system SHALL support Oanda forex trading, ported from trading-view-alert.

#### Scenario: OandaClient HTTP client
- **WHEN** implementing Oanda support
- **THEN** an `OandaClient` class SHALL be created
- **AND** it SHALL port HTTP client logic from `trading-view-alert/src/services/exchanges/oanda/index.ts`
- **AND** it SHALL support Oanda API v20 endpoints:
  - `POST /v3/accounts/{accountID}/orders` - Place order
  - `PUT /v3/accounts/{accountID}/orders/{orderID}` - Modify SL/TP
  - `PUT /v3/accounts/{accountID}/orders/{orderID}/cancel` - Cancel order
  - `GET /v3/accounts/{accountID}/pricing` - Fetch prices
- **AND** it SHALL handle authentication via API key in headers

#### Scenario: OandaAdapter implementation
- **WHEN** implementing the Oanda adapter
- **THEN** an `OandaAdapter` SHALL be created extending `BaseBrokerAdapter`
- **AND** it SHALL use `OandaClient` for API calls
- **AND** it SHALL implement:
  - Market order placement
  - SL/TP modification via order update
  - Order cancellation
  - Price fetching
  - Symbol mapping (e.g., XAUUSD → XAU_USD)
- **AND** it SHALL configure Oanda-specific settings (accountId from brokerConfig)

#### Scenario: Oanda adapter testing
- **WHEN** testing Oanda adapter
- **THEN** unit tests SHALL mock HTTP responses
- **AND** integration tests SHALL use Oanda practice account
- **AND** integration tests SHALL verify full order lifecycle:
  - Place order → Set SL/TP → Cancel order

### Requirement: Broker Adapter Factory
The system SHALL provide a factory to create and cache broker adapter instances per account.

#### Scenario: BrokerAdapterFactory class
- **WHEN** executor-service needs a broker adapter
- **THEN** it SHALL use `BrokerAdapterFactory.getAdapter(account: Account)`
- **AND** the factory SHALL:
  - Cache adapters by `accountId`
  - Return existing adapter if already cached
  - Create new adapter if not cached
  - Call `adapter.init()` after creation
  - Store adapter in cache
- **AND** the factory SHALL support creating adapters based on `account.brokerConfig.exchangeCode`:
  - `'binanceusdm'` → `BinanceFutureAdapter`
  - `'oanda'` → `OandaAdapter`
  - Unsupported codes SHALL throw error

#### Scenario: Factory adapter lifecycle
- **WHEN** executor-service shuts down
- **THEN** `factory.closeAll()` SHALL:
  - Call `adapter.close()` for all cached adapters
  - Clear the adapter cache

#### Scenario: Factory error handling
- **WHEN** an account lacks broker configuration
- **THEN** factory SHALL throw error with message: `"No broker config for account {accountId}"`
- **WHEN** an unsupported exchange code is provided
- **THEN** factory SHALL throw error with message: `"Unsupported exchange: {exchangeCode}"`

### Requirement: Broker Adapter Error Handling
Broker adapters SHALL handle errors gracefully and classify them for downstream handling.

#### Scenario: Execution error handling
- **WHEN** a broker adapter fails to execute an order
- **THEN** it SHALL throw an error
- **AND** the calling service (OrderExecutorService) SHALL catch the error
- **AND** the service SHALL publish an `EXECUTE_ORDER_RESULT` with `success: false`
- **AND** the error SHALL be classified into error codes:
  - `INSUFFICIENT_BALANCE` - Insufficient margin/balance
  - `INVALID_SYMBOL` - Symbol not supported
  - `NETWORK_ERROR` - Network/connection issue
  - `UNKNOWN_ERROR` - Other errors

#### Scenario: Connection retry
- **WHEN** a broker API call fails due to network issue
- **THEN** the adapter SHALL retry using `retryWithBackoff`
- **AND** logs SHALL indicate retry attempts
- **AND** after max retries, error SHALL be thrown

### Requirement: Broker Adapter Integration Tests
All broker adapters SHALL have comprehensive integration tests.

#### Scenario: CCXT integration test suite
- **WHEN** testing ccxt adapters
- **THEN** integration tests SHALL:
  - Use Binance testnet or sandbox
  - Test order placement with SL/TP
  - Test order cancellation
  - Test price fetching
  - Verify precision handling
  - Verify leverage setting

#### Scenario: Oanda integration test suite
- **WHEN** testing Oanda adapter
- **THEN** integration tests SHALL:
  - Use Oanda practice account
  - Test order placement
  - Test SL/TP modification
  - Test order cancellation
  - Test price fetching
  - Verify symbol mapping

#### Scenario: Test account credentials
- **WHEN** running integration tests
- **THEN** test credentials SHALL be loaded from environment variables
- **AND** tests SHALL be skipped if credentials not provided (with clear message)
- **AND** test accounts SHALL use sandbox/practice mode only

### Requirement: Future Broker Adapter: Web Terminal (XM/Exness)
The system SHALL support adding web terminal-based brokers in the future.

#### Scenario: WebTerminalAdapter interface
- **WHEN** XM/Exness reverse engineering is complete
- **THEN** a `WebTerminalAdapter` SHALL be created extending `BaseBrokerAdapter`
- **AND** it SHALL implement the standard `IBrokerAdapter` interface
- **AND** it SHALL use reverse-engineered API calls
- **AND** it SHALL handle session management and authentication
- **AND** it SHALL be added to `BrokerAdapterFactory` with:
  - `'xm'` → `WebTerminalAdapter` (XM broker)
  - `'exness'` → `WebTerminalAdapter` (Exness broker, potentially same adapter)

#### Scenario: Web terminal adapter placeholder
- **WHEN** building executor-service in Phase 1-2
- **THEN** web terminal adapters SHALL NOT be implemented
- **AND** factory SHALL throw error for `'xm'` and `'exness'` exchange codes
- **AND** these adapters SHALL be added in future work after reverse engineering completes

