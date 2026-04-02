# Spec: Price Cache Service

## ADDED Requirements

### Requirement: Price caching with Redis

The system SHALL provide a `PriceCacheService` class in `libs/shared/utils/src/cache/price-cache.service.ts` that manages real-time price data in Redis with exchange-scoped keys.

#### Scenario: Store price data for a symbol

**Given** a `PriceCacheService` instance with exchangeCode "oanda" and a Redis connection  
**When** `setPrice("XAUUSD", 2650.5, 2651.0)` is called  
**Then** the service SHALL store the price data in Redis with key `price:oanda:XAUUSD`  
**And** the value SHALL be a JSON object containing `{ bid: 2650.5, ask: 2651.0, ts: <current_timestamp> }`  
**And** the timestamp SHALL be in Unix milliseconds format

#### Scenario: Retrieve price data for a symbol

**Given** price data exists in Redis for key `price:oanda:XAUUSD`  
**When** `getPrice("XAUUSD")` is called  
**Then** the service SHALL return a `PriceData` object with `{ bid, ask, ts }` fields  
**And** all numeric values SHALL be parsed correctly from JSON

#### Scenario: Handle missing price data

**Given** no price data exists in Redis for symbol "BTCUSDT"  
**When** `getPrice("BTCUSDT")` is called  
**Then** the service SHALL return `null`  
**And** no error SHALL be thrown

#### Scenario: Use universal symbol format in cache keys

**Given** a `PriceCacheService` instance  
**When** storing or retrieving prices  
**Then** the cache key SHALL always use universal symbol format (e.g., "XAUUSD", not "XAU_USD")  
**And** the key format SHALL be `price:${exchangeCode}:${universalSymbol}`

### Requirement: Price data interface

The system SHALL define a `PriceData` interface in `libs/shared/utils/src/cache/price-cache.service.ts` with the following structure:

```typescript
export interface PriceData {
  bid: number;
  ask: number;
  ts: number; // Unix timestamp in milliseconds
}
```

#### Scenario: Price data structure validation

**Given** price data retrieved from cache  
**When** the data is used by consumers  
**Then** it SHALL contain `bid` as a number representing the bid price  
**And** it SHALL contain `ask` as a number representing the ask price  
**And** it SHALL contain `ts` as a Unix timestamp in milliseconds  
**And** all fields SHALL be required (not optional)

### Requirement: Constructor injection pattern

The `PriceCacheService` SHALL accept dependencies via constructor injection to enable Redis connection reuse.

#### Scenario: Initialize service with dependencies

**Given** an exchangeCode "oanda" and a Redis instance  
**When** creating a new `PriceCacheService(exchangeCode, redis)`  
**Then** the service SHALL store the exchangeCode for key construction  
**And** the service SHALL use the provided Redis instance for all operations  
**And** the service SHALL NOT create its own Redis connection

### Requirement: Error handling for Redis operations

The `PriceCacheService` SHALL handle Redis operation failures gracefully.

#### Scenario: Handle Redis connection failure on get

**Given** a Redis connection that is unavailable  
**When** `getPrice("XAUUSD")` is called  
**Then** the service SHALL throw an error  
**And** the error SHALL propagate to the caller for handling

#### Scenario: Handle Redis connection failure on set

**Given** a Redis connection that is unavailable  
**When** `setPrice("XAUUSD", 2650.5, 2651.0)` is called  
**Then** the service SHALL throw an error  
**And** the error SHALL propagate to the caller for handling

---

## Integration Requirements

### Requirement: Integration with executor-service

The `PriceCacheService` SHALL be usable in `executor-service` for retrieving cached prices during order execution.

#### Scenario: Create service instance in order executor

**Given** an `IBrokerAdapter` instance with exchangeCode "oanda"  
**And** a Redis instance available in the container  
**When** creating a `PriceCacheService` in `OrderExecutorService`  
**Then** the service SHALL be initialized with `adapter.exchangeCode` and the Redis instance  
**And** the service SHALL be ready to fetch prices for any symbol

### Requirement: Integration with trade-manager jobs

The `PriceCacheService` SHALL be usable in `trade-manager` background jobs for storing fetched prices.

#### Scenario: Store prices from background job

**Given** a `FetchPriceJob` running in trade-manager  
**And** price data fetched from broker adapter  
**When** the job creates a `PriceCacheService` and calls `setPrice()`  
**Then** the price data SHALL be persisted to Redis  
**And** the data SHALL be accessible to executor-service instances
