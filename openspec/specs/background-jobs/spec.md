# background-jobs Specification

## Purpose
TBD - created by archiving change fetch-realtime-price-and-balance. Update Purpose after archive.
## Requirements
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

