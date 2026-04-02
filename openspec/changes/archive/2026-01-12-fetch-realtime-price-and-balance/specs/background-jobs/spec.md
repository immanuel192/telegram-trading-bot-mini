# Spec: Background Jobs for Cache Updates

## ADDED Requirements

### Requirement: Fetch Balance Job

The system SHALL provide a `FetchBalanceJob` in `apps/trade-manager/src/jobs/fetch-balance-job.ts` that periodically fetches and caches account balance from all broker adapters.

#### Scenario: Job executes on schedule

**Given** a `FetchBalanceJob` configured with cron `0 */1 * * * *` (every 1 minute)  
**When** the job tick is triggered  
**Then** the job SHALL execute the balance fetch logic  
**And** the job SHALL complete within the tick interval

#### Scenario: Fetch balance from all adapters

**Given** the adapter factory has 3 cached adapters  
**When** the job executes  
**Then** the job SHALL call `container.brokerFactory.getAllAdapters()`  
**And** it SHALL iterate through all returned adapters  
**And** it SHALL call `adapter.getAccountInfo()` for each adapter

#### Scenario: Transform and cache balance data

**Given** an adapter returns `AccountInfo`: `{ balance: 10000, equity: 10500, margin: 2000, freeMargin: 8000 }`  
**When** processing the adapter response  
**Then** the job SHALL transform to `BalanceInfo`:
- `balance: 10000`
- `marginUsed: 2000`
- `marginAvailable: 8000`
- `equity: 10500`
**And** it SHALL create a `BalanceCacheService` with `adapter.exchangeCode` and Redis  
**And** it SHALL call `setBalance(adapter.accountId, balanceInfo)`

#### Scenario: Handle adapter failure gracefully

**Given** one adapter throws an error during `getAccountInfo()`  
**When** the error occurs  
**Then** the job SHALL log the error with adapter name  
**And** the job SHALL capture the error in Sentry  
**And** the job SHALL continue processing remaining adapters  
**And** the job SHALL NOT throw or crash

#### Scenario: Log successful balance cache

**Given** balance is successfully cached for an adapter  
**When** the cache operation completes  
**Then** the job SHALL log an info message with:
- `exchangeCode`
- `accountId`
- Message: "Balance cached successfully"

### Requirement: Fetch Price Job

The system SHALL provide a `FetchPriceJob` in `apps/trade-manager/src/jobs/fetch-price-job.ts` that periodically fetches and caches prices from broker adapters.

#### Scenario: Job executes on recommended schedule

**Given** a `FetchPriceJob` configured with cron `*/15 * * * * *` (every 15 seconds)  
**When** the job tick is triggered  
**Then** the job SHALL execute the price fetch logic  
**And** the job SHALL complete within the tick interval

**Note**: The cron schedule is configurable but 15 seconds is recommended for fresh price data.

#### Scenario: Extract symbols from job meta

**Given** job meta: `{ symbols: ['XAUUSD', 'EURUSD', 'GBPUSD'] }`  
**When** the job executes  
**Then** the job SHALL extract the symbols array  
**And** it SHALL use these symbols for price fetching

#### Scenario: Handle missing symbols in meta

**Given** job meta does not contain `symbols` field  
**When** the job executes  
**Then** the job SHALL use an empty array as default  
**And** no price fetching SHALL occur  
**And** a warning log SHALL be emitted

#### Scenario: Group adapters by exchange code

**Given** adapters: `[OandaAdapter(acc-1), OandaAdapter(acc-2), MockAdapter(acc-3)]`  
**When** grouping by exchange code  
**Then** the job SHALL create a map:
```
{
  "oanda": OandaAdapter(acc-1),  // First oanda adapter only
  "mock": MockAdapter(acc-3)
}
```
**And** only one adapter per exchange SHALL be selected  
**And** the first adapter for each exchange SHALL be used

#### Scenario: Fetch prices per exchange

**Given** grouped adapters and symbols `['XAUUSD', 'EURUSD']`  
**When** fetching prices for "oanda" exchange  
**Then** the job SHALL call `adapter.fetchPrice(['XAUUSD', 'EURUSD'])`  
**And** it SHALL receive an array of `PriceTicker` objects  
**And** each ticker SHALL have universal symbol format

#### Scenario: Cache fetched prices

**Given** price data fetched for "oanda" exchange:
```
[
  { symbol: 'XAUUSD', bid: 2650.5, ask: 2651.0, timestamp: ... },
  { symbol: 'EURUSD', bid: 1.0950, ask: 1.0951, timestamp: ... }
]
```
**When** caching the prices  
**Then** the job SHALL create a `PriceCacheService` with exchangeCode "oanda" and Redis  
**And** it SHALL call `setPrice('XAUUSD', 2650.5, 2651.0)`  
**And** it SHALL call `setPrice('EURUSD', 1.0950, 1.0951)`

#### Scenario: Handle adapter failure gracefully

**Given** one exchange adapter throws an error during `fetchPrice()`  
**When** the error occurs  
**Then** the job SHALL log the error with exchangeCode  
**And** the job SHALL capture the error in Sentry  
**And** the job SHALL continue processing remaining exchanges  
**And** the job SHALL NOT throw or crash

#### Scenario: Log successful price cache

**Given** prices are successfully cached for an exchange  
**When** the cache operation completes  
**Then** the job SHALL log an info message with:
- `exchangeCode`
- `symbolCount` (number of symbols cached)
- Message: "Prices cached successfully"

---

## Job Configuration Requirements

### Requirement: Job metadata structure

The background jobs SHALL use typed metadata for configuration.

#### Scenario: FetchPriceJob metadata structure

**Given** the `FetchPriceJob` class  
**When** defining job metadata interface  
**Then** it SHALL define:
```typescript
interface FetchPriceJobMeta {
  symbols: string[]; // Array of universal symbols to fetch
}
```
**And** the job SHALL access meta via `this.jobConfig.meta`

### Requirement: Job registration

The background jobs SHALL be registered with the job system using decorators.

#### Scenario: Register FetchBalanceJob

**Given** the `FetchBalanceJob` class  
**When** the class is defined  
**Then** it SHALL use decorator `@RegisterJob('fetch-balance-job')`  
**And** it SHALL extend `BaseJob<Container>`  
**And** it SHALL implement `onTick()` method

#### Scenario: Register FetchPriceJob

**Given** the `FetchPriceJob` class  
**When** the class is defined  
**Then** it SHALL use decorator `@RegisterJob('fetch-price-job')`  
**And** it SHALL extend `BaseJob<Container>`  
**And** it SHALL implement `onTick()` method

---

## Container Integration Requirements

### Requirement: Redis instance in trade-manager container

The `trade-manager` container SHALL provide a Redis instance for background jobs.

**Related**: This modifies `apps/trade-manager/src/container.ts`.

#### Scenario: Initialize Redis in container

**Given** the trade-manager container initialization  
**When** creating the container  
**Then** it SHALL create a Redis instance using `config('REDIS_URL')`  
**And** the Redis instance SHALL be available in the container  
**And** the same instance SHALL be reused for all cache services in jobs

#### Scenario: Access Redis from job

**Given** a `FetchBalanceJob` instance  
**When** the job needs to cache data  
**Then** it SHALL access Redis via `this.container.redis`  
**And** the Redis instance SHALL be the same one from container initialization

### Requirement: Adapter factory access in jobs

Background jobs SHALL access the adapter factory from the container.

#### Scenario: Access adapter factory in FetchBalanceJob

**Given** a `FetchBalanceJob` instance  
**When** the job needs to get adapters  
**Then** it SHALL access the factory via `this.container.brokerFactory`  
**And** it SHALL call `getAllAdapters()` to get all cached adapters

---

## Error Handling and Monitoring Requirements

### Requirement: Comprehensive error logging

Background jobs SHALL provide detailed error logging for debugging.

#### Scenario: Log adapter fetch error

**Given** an adapter throws an error with message "Connection timeout"  
**When** the error is caught  
**Then** the job SHALL log an error with:
- `adapter` or `exchangeCode`
- `error` object
- Message: "Failed to fetch balance" or "Failed to fetch prices"
**And** the log level SHALL be `error`

#### Scenario: Capture errors in Sentry

**Given** any error occurs during job execution  
**When** the error is caught  
**Then** the job SHALL call `Sentry.captureException(error)`  
**And** the error SHALL be sent to Sentry for monitoring

### Requirement: Job execution summary

Background jobs SHALL log execution summaries for monitoring.

#### Scenario: Log FetchBalanceJob summary

**Given** a `FetchBalanceJob` completes execution  
**When** all adapters have been processed  
**Then** the job SHALL log an info message with:
- Total adapters processed
- Successful count
- Failed count (if any)
- Message: "Balance fetch job completed"

#### Scenario: Log FetchPriceJob summary

**Given** a `FetchPriceJob` completes execution  
**When** all exchanges have been processed  
**Then** the job SHALL log an info message with:
- Total exchanges processed
- Total symbols fetched
- Message: "Price fetch job completed"

---

## Documentation Requirements

### Requirement: Job documentation with JSDoc

Background jobs SHALL include comprehensive JSDoc comments.

#### Scenario: Document FetchPriceJob cron recommendation

**Given** the `FetchPriceJob` class  
**When** documenting the class  
**Then** the JSDoc SHALL include:
```
/**
 * Fetch Price Job
 * 
 * Fetches latest prices from all broker adapters and caches them in Redis.
 * 
 * Recommended cron: */15 * * * * * (every 15 seconds)
 * This ensures price cache is updated frequently for real-time trading decisions.
 * 
 * Job meta configuration:
 * {
 *   symbols: ['XAUUSD', 'EURUSD', ...] // Symbols to fetch
 * }
 */
```

#### Scenario: Document FetchBalanceJob purpose

**Given** the `FetchBalanceJob` class  
**When** documenting the class  
**Then** the JSDoc SHALL include:
```
/**
 * Fetch Balance Job
 * 
 * Fetches account balance from all broker adapters and caches them in Redis.
 * 
 * Cron: 0 */1 * * * * (every 1 minute)
 * This ensures balance cache is reasonably fresh for lot size calculations.
 */
```
