# Spec: Adapter Enhancements

## ADDED Requirements

### Requirement: Broker adapter metadata getters

The `IBrokerAdapter` interface SHALL provide getters for `exchangeCode` and `accountId` to support cache key construction.

**Related**: This modifies the existing adapter interface in `apps/executor-service/src/adapters/interfaces.ts`.

#### Scenario: Access exchangeCode from adapter

**Given** an `IBrokerAdapter` instance for Oanda broker  
**When** accessing `adapter.exchangeCode`  
**Then** it SHALL return the exchangeCode from `brokerConfig` (e.g., "oanda")  
**And** the value SHALL match `brokerConfig.exchangeCode`

#### Scenario: Access accountId from adapter

**Given** an `IBrokerAdapter` instance for account "acc-123"  
**When** accessing `adapter.accountId`  
**Then** it SHALL return the internal accountId (e.g., "acc-123")  
**And** the value SHALL match the accountId passed to the adapter constructor

### Requirement: Multi-symbol price fetching

The `IBrokerAdapter.fetchPrice()` method SHALL be modified to accept an array of symbols and return an array of price tickers.

**Related**: This modifies the existing `fetchPrice` method signature in `IBrokerAdapter`.

#### Scenario: Fetch prices for multiple symbols

**Given** an `OandaAdapter` instance  
**When** calling `fetchPrice(["XAUUSD", "EURUSD", "GBPUSD"])`  
**Then** the adapter SHALL fetch prices for all three symbols in a single API call  
**And** it SHALL return an array of `PriceTicker` objects  
**And** each ticker SHALL contain the universal symbol (not broker-specific format)  
**And** the array order SHALL match the input order

#### Scenario: Transform broker symbols to universal format in response

**Given** an `OandaAdapter` that uses underscore format (e.g., "XAU_USD")  
**When** fetching prices for `["XAUUSD"]`  
**Then** the adapter SHALL call Oanda API with "XAU_USD"  
**And** the returned `PriceTicker` SHALL have `symbol: "XAUUSD"` (universal format)

#### Scenario: Handle single symbol for backward compatibility

**Given** any `IBrokerAdapter` implementation  
**When** calling `fetchPrice(["XAUUSD"])` with a single-element array  
**Then** the adapter SHALL fetch the price for that symbol  
**And** it SHALL return a single-element array with the price ticker

### Requirement: Adapter factory enhancement

The `BrokerAdapterFactory` SHALL provide a method to retrieve all cached adapter instances.

**Related**: This adds a new method to `apps/executor-service/src/adapters/factory.ts`.

#### Scenario: Get all cached adapters

**Given** a `BrokerAdapterFactory` with 3 cached adapters  
**When** calling `getAllAdapters()`  
**Then** it SHALL return an array of all 3 `IBrokerAdapter` instances  
**And** the array SHALL contain only cached adapters (not create new ones)  
**And** the array SHALL be flattened from the internal Map values

#### Scenario: Return empty array when no adapters cached

**Given** a `BrokerAdapterFactory` with no cached adapters  
**When** calling `getAllAdapters()`  
**Then** it SHALL return an empty array  
**And** no error SHALL be thrown

---

## Implementation Details

### Requirement: Base adapter implementation

The `BaseBrokerAdapter` SHALL implement the new getters to provide default behavior for all adapters.

#### Scenario: Implement exchangeCode getter in base adapter

**Given** a `BaseBrokerAdapter` instance with `brokerConfig.exchangeCode = "oanda"`  
**When** accessing `adapter.exchangeCode`  
**Then** it SHALL return "oanda"  
**And** the implementation SHALL be `return this.brokerConfig.exchangeCode`

#### Scenario: Implement accountId getter in base adapter

**Given** a `BaseBrokerAdapter` instance constructed with accountId "acc-123"  
**When** accessing `adapter.accountId`  
**Then** it SHALL return "acc-123"  
**And** the implementation SHALL be `return this.accountId` (from constructor parameter)

### Requirement: Oanda adapter multi-symbol implementation

The `OandaAdapter` SHALL implement multi-symbol price fetching using the Oanda pricing API.

#### Scenario: Batch fetch prices from Oanda

**Given** an `OandaAdapter` instance  
**When** calling `fetchPrice(["XAUUSD", "EURUSD"])`  
**Then** the adapter SHALL transform symbols to Oanda format: `["XAU_USD", "EUR_USD"]`  
**And** it SHALL call `client.pricing.getAsync()` with `instruments: ["XAU_USD", "EUR_USD"]`  
**And** it SHALL parse the response and return universal symbol format

#### Scenario: Map Oanda response to PriceTicker array

**Given** Oanda API returns prices for `["XAU_USD", "EUR_USD"]`  
**When** processing the response  
**Then** each price SHALL be mapped to a `PriceTicker` with:
- `symbol`: universal format (e.g., "XAUUSD")
- `bid`: parsed from `price.closeoutBid`
- `ask`: parsed from `price.closeoutAsk`
- `timestamp`: current time in milliseconds
**And** the array order SHALL match the input symbol order
