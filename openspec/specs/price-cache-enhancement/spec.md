# price-cache-enhancement Specification

## Purpose
TBD - created by archiving change improve-trading-accuracy. Update Purpose after archive.
## Requirements
### Requirement: Cross-exchange price lookup

The `PriceCacheService` SHALL provide a method to fetch price data from any available exchange when exchange-specific lookup is not required, with optional TTL validation.

#### Scenario: Fetch price from any available exchange

**Given** price data exists in Redis for keys `price:oanda:XAUUSD` and `price:binance:XAUUSD`  
**When** `getPriceFromAnyExchange("XAUUSD")` is called  
**Then** the service SHALL return a `PriceData` object from one of the available exchanges  
**And** the returned price SHALL be valid (non-null)  
**And** the service SHALL return the first valid price found during SCAN

#### Scenario: Handle no prices available for symbol

**Given** no price data exists in Redis for symbol "BTCUSDT"  
**When** `getPriceFromAnyExchange("BTCUSDT")` is called  
**Then** the service SHALL return `null`  
**And** no error SHALL be thrown

#### Scenario: Handle Redis SCAN errors gracefully

**Given** a Redis connection that fails during SCAN operation  
**When** `getPriceFromAnyExchange("XAUUSD")` is called  
**Then** the service SHALL throw an error  
**And** the error SHALL propagate to the caller for handling

#### Scenario: Skip expired prices and return next valid one

**Given** price data exists for `price:oanda:XAUUSD` (timestamp: 10 seconds ago) and `price:binance:XAUUSD` (timestamp: 2 seconds ago)  
**And** maxAgeMs is set to 5000 (5 seconds)  
**When** `getPriceFromAnyExchange("XAUUSD", 5000)` is called  
**Then** the service SHALL skip the expired OANDA price (10 seconds old)  
**And** the service SHALL return the valid Binance price (2 seconds old)  
**And** the TTL validation SHALL use `Date.now() - price.ts <= maxAgeMs`

#### Scenario: Return null when all prices are expired

**Given** price data exists for `price:oanda:XAUUSD` (timestamp: 10 seconds ago) and `price:binance:XAUUSD` (timestamp: 8 seconds ago)  
**And** maxAgeMs is set to 5000 (5 seconds)  
**When** `getPriceFromAnyExchange("XAUUSD", 5000)` is called  
**Then** the service SHALL skip both expired prices  
**And** the service SHALL return `null`  
**And** no error SHALL be thrown

#### Scenario: No TTL validation when maxAgeMs not provided

**Given** price data exists for `price:oanda:XAUUSD` (timestamp: 10 seconds ago)  
**When** `getPriceFromAnyExchange("XAUUSD")` is called without maxAgeMs  
**Then** the service SHALL return the price regardless of age  
**And** no TTL validation SHALL be performed  
**And** the method SHALL be backward compatible

### Requirement: TTL validation helper method

The `PriceCacheService` SHALL provide a public helper method to validate price freshness for callers who need TTL validation.

#### Scenario: Validate price freshness with maxAgeMs

**Given** a `PriceData` object with timestamp 3 seconds ago  
**And** maxAgeMs is set to 5000 (5 seconds)  
**When** `isValidPrice(priceData, 5000)` is called  
**Then** the method SHALL return `true`  
**And** the validation SHALL use `Date.now() - price.ts <= maxAgeMs`

#### Scenario: Reject expired price

**Given** a `PriceData` object with timestamp 10 seconds ago  
**And** maxAgeMs is set to 5000 (5 seconds)  
**When** `isValidPrice(priceData, 5000)` is called  
**Then** the method SHALL return `false`

#### Scenario: Reject null price

**Given** a null price  
**When** `isValidPrice(null, 5000)` is called  
**Then** the method SHALL return `false`

#### Scenario: No TTL validation when maxAgeMs not provided

**Given** a `PriceData` object with any timestamp  
**When** `isValidPrice(priceData)` is called without maxAgeMs  
**Then** the method SHALL return `true` if price is non-null  
**And** the method SHALL return `false` if price is null  
**And** no TTL validation SHALL be performed

### Requirement: Documentation for getPrice freshness warning

The `PriceCacheService.getPrice()` method SHALL include JSDoc documentation warning callers about potential stale data.

#### Scenario: JSDoc warning for getPrice

**Given** the `getPrice()` method documentation  
**When** a developer views the JSDoc  
**Then** the documentation SHALL include a warning: "Note: This method does NOT validate price freshness. Callers should check the `ts` field and validate against their TTL requirements, or use `isValidPrice()` helper method."  
**And** the documentation SHALL include an example of TTL validation  
**And** the documentation SHALL reference the `isValidPrice()` helper method

### Requirement: Backward compatibility

The `PriceCacheService` SHALL maintain backward compatibility with existing exchange-specific price lookups.

#### Scenario: Existing getPrice method unchanged

**Given** a `PriceCacheService` instance with exchangeCode "oanda"  
**When** `getPrice("XAUUSD")` is called  
**Then** the service SHALL return price data only from the "oanda" exchange  
**And** the behavior SHALL be identical to pre-enhancement implementation  
**And** no breaking changes SHALL occur

---

