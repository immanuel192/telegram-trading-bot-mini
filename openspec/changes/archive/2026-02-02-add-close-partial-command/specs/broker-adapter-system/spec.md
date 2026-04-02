## MODIFIED Requirements

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
    - **`closeOrder(params: CloseOrderOptions): Promise<CloseOrderResult>` - Close position or part of it**
  - Market data:
    - `fetchTicker(symbol: string, accountId?: string): Promise<Ticker>` - Get current price
    - `leverageInfo(symbol: string): MarketLeverageSummary | null` - Get leverage tiers
    - `calLeverage(symbol: string, tradeAmount: number): number` - Calculate leverage
    - `setLeverage(symbol: string, leverage: number): Promise<void>` - Set leverage
    - `getCurrentLeverage(symbol: string): number | undefined` - Get current leverage
  - Symbol management:
    - `lookupSymbol(symbol: string): string | undefined` - Map symbol to exchange symbol
    - `refreshSymbols(): Promise<void>` - Refresh symbol mappings

### Requirement: Oanda Adapter
The system SHALL support Oanda forex trading, ported from trading-view-alert.

#### Scenario: OandaAdapter implementation
- **WHEN** implementing the Oanda adapter
- **THEN** an `OandaAdapter` SHALL be created extending `BaseBrokerAdapter`
- **AND** it SHALL use `OandaClient` for API calls
- **AND** it SHALL implement:
  - Market order placement
  - SL/TP modification via order update
  - **`closeOrder`: Closes an open trade. If `amount` is provided, it SHALL close only that specific unit amount (partial close)**
  - Order cancellation
  - Price fetching
  - Symbol mapping (e.g., XAUUSD → XAU_USD)
- **AND** it SHALL configure Oanda-specific settings (accountId from brokerConfig)
