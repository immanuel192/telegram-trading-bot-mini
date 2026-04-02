# Tasks: Fetch Realtime Price and Account Balance

This document outlines the implementation tasks for adding real-time price and balance caching. Tasks are grouped by component and include testing tasks adjacent to implementation.

---

## Phase 1: Cache Services (libs/shared/utils)

### Task 1.1: Create PriceCacheService

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `libs/shared/utils/src/cache/price-cache.service.ts`

**Description**: Implement the `PriceCacheService` class with Redis-based price caching.

**Acceptance Criteria**:
- ✅ Define `PriceData` interface with `bid`, `ask`, `ts` fields
- ✅ Implement constructor accepting `exchangeCode` and `redis` instance
- ✅ Implement `getPrice(symbol: string): Promise<PriceData | null>`
- ✅ Implement `setPrice(symbol: string, bid: number, ask: number): Promise<void>`
- ✅ Use cache key format: `price:${exchangeCode}:${universalSymbol}`
- ✅ Auto-add timestamp on `setPrice()`
- ✅ Return `null` on cache miss (no error)

**Dependencies**: None

**Estimated Effort**: 2 hours

---

### Task 1.2: Create BalanceCacheService

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `libs/shared/utils/src/cache/balance-cache.service.ts`

**Description**: Implement the `BalanceCacheService` class with Redis-based balance caching.

**Acceptance Criteria**:
- ✅ Define `BalanceInfo` interface with `balance`, `marginUsed`, `marginAvailable`, `equity`, `ts` fields
- ✅ Implement constructor accepting `exchangeCode` and `redis` instance
- ✅ Implement `getBalance(accountId: string): Promise<BalanceInfo | null>`
- ✅ Implement `setBalance(accountId: string, info: Omit<BalanceInfo, 'ts'>): Promise<void>`
- ✅ Use cache key format: `balance:${exchangeCode}:${accountId}`
- ✅ Auto-add timestamp on `setBalance()`
- ✅ Return `null` on cache miss (no error)

**Dependencies**: None

**Estimated Effort**: 2 hours

---

### Task 1.3: Export cache services from shared utils

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `libs/shared/utils/src/index.ts`

**Description**: Export the new cache services for use in apps.

**Acceptance Criteria**:
- ✅ Export `PriceCacheService` and `PriceData`
- ✅ Export `BalanceCacheService` and `BalanceInfo`

**Dependencies**: Task 1.1, Task 1.2

**Estimated Effort**: 15 minutes

---

### Task 1.4: Integration tests for PriceCacheService

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `libs/shared/utils/test/integration/price-cache.service.spec.ts`

**Description**: Create integration tests for `PriceCacheService` with real Redis.

**Acceptance Criteria**:
- ✅ Test `setPrice()` stores data in Redis with correct key format
- ✅ Test `getPrice()` retrieves data correctly
- ✅ Test `getPrice()` returns `null` for missing keys
- ✅ Test timestamp is auto-added and in Unix milliseconds
- ✅ Test universal symbol format in keys
- ✅ Use test Redis instance (cleanup after tests)

**Dependencies**: Task 1.1

**Estimated Effort**: 1.5 hours

---

### Task 1.5: Integration tests for BalanceCacheService

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `libs/shared/utils/test/integration/balance-cache.service.spec.ts`

**Description**: Create integration tests for `BalanceCacheService` with real Redis.

**Acceptance Criteria**:
- ✅ Test `setBalance()` stores data in Redis with correct key format
- ✅ Test `getBalance()` retrieves data correctly
- ✅ Test `getBalance()` returns `null` for missing keys
- ✅ Test timestamp is auto-added and in Unix milliseconds
- ✅ Test all `BalanceInfo` fields are stored and retrieved correctly
- ✅ Use test Redis instance (cleanup after tests)

**Dependencies**: Task 1.2

**Estimated Effort**: 1.5 hours

---

## Phase 2: Adapter Enhancements (apps/executor-service/src/adapters)

### Task 2.1: Add getters to IBrokerAdapter interface

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `apps/executor-service/src/adapters/interfaces.ts`

**Description**: Add `exchangeCode` and `accountId` getters to the adapter interface.

**Acceptance Criteria**:
- ✅ Add `get exchangeCode(): string` to `IBrokerAdapter`
- ✅ Add `get accountId(): string` to `IBrokerAdapter`
- ✅ Add JSDoc comments explaining purpose (cache key construction)

**Dependencies**: None

**Estimated Effort**: 30 minutes

---

### Task 2.2: Implement getters in BaseBrokerAdapter

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `apps/executor-service/src/adapters/base.adapter.ts`

**Description**: Implement the new getters in the base adapter class.

**Acceptance Criteria**:
- ✅ Implement `get exchangeCode()` returning `this.brokerConfig.exchangeCode`
- ✅ Implement `get accountId()` returning `this.accountId` (from constructor)
- ✅ Verify all subclass adapters inherit these getters

**Dependencies**: Task 2.1

**Estimated Effort**: 30 minutes

---

### Task 2.3: Update fetchPrice signature in IBrokerAdapter

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `apps/executor-service/src/adapters/interfaces.ts`

**Description**: Modify `fetchPrice()` to accept array of symbols.

**Acceptance Criteria**:
- ✅ Change signature to `fetchPrice(symbols: string[]): Promise<PriceTicker[]>`
- ✅ Update JSDoc to document multi-symbol support
- ✅ Note: Breaking change for all adapter implementations

**Dependencies**: None

**Estimated Effort**: 15 minutes

---

### Task 2.4: Implement multi-symbol fetchPrice in OandaAdapter

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `apps/executor-service/src/adapters/oanda/oanda.adapter.ts`

**Description**: Update Oanda adapter to support fetching multiple symbols in one call.

**Acceptance Criteria**:
- ✅ Accept `symbols: string[]` parameter
- ✅ Transform all symbols to Oanda format (e.g., `XAUUSD` → `XAU_USD`)
- ✅ Call `client.pricing.getAsync()` with all instruments
- ✅ Map response to `PriceTicker[]` with universal symbols
- ✅ Maintain array order matching input
- ✅ Handle single-symbol case (backward compatibility)

**Dependencies**: Task 2.3

**Estimated Effort**: 1.5 hours

---

### Task 2.5: Update MockAdapter fetchPrice

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `apps/executor-service/src/adapters/mock/mock.adapter.ts`

**Description**: Update mock adapter to support multi-symbol fetching.

**Acceptance Criteria**:
- ✅ Accept `symbols: string[]` parameter
- ✅ Return array of mock `PriceTicker` objects
- ✅ One ticker per symbol in input array

**Dependencies**: Task 2.3

**Estimated Effort**: 30 minutes

---

### Task 2.6: Add getAllAdapters to BrokerAdapterFactory

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `apps/executor-service/src/adapters/factory.ts`

**Description**: Add method to retrieve all cached adapters as an array.

**Acceptance Criteria**:
- ✅ Implement `getAllAdapters(): IBrokerAdapter[]`
- ✅ Return `Array.from(this.adapters.values())`
- ✅ Return empty array if no adapters cached
- ✅ Add JSDoc explaining use case (background jobs)

**Dependencies**: None

**Estimated Effort**: 30 minutes

---

### Task 2.7: Unit tests for adapter getters

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `apps/executor-service/test/unit/adapters/base.adapter.spec.ts`

**Description**: Test the new getters in base adapter.

**Acceptance Criteria**:
- ✅ Test `exchangeCode` getter returns correct value
- ✅ Test `accountId` getter returns correct value
- ✅ Verify getters work in OandaAdapter and MockAdapter

**Dependencies**: Task 2.2

**Estimated Effort**: 1 hour

---

### Task 2.8: Integration tests for multi-symbol fetchPrice

**File**: `apps/executor-service/test/integration/adapters/oanda.adapter.spec.ts`

**Description**: Test multi-symbol price fetching in Oanda adapter.

**Acceptance Criteria**:
- ✅ Test fetching multiple symbols returns correct array
- ✅ Test symbols are transformed to Oanda format in request
- ✅ Test response contains universal symbols
- ✅ Test array order matches input order
- ✅ Test single-symbol case still works
- ✅ Use real Oanda sandbox API

**Dependencies**: Task 2.4

**Estimated Effort**: 2 hours

---

## Phase 3: Balance Integration (apps/executor-service)

### Task 3.1: Add Redis to executor-service container

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `apps/executor-service/src/container.ts`

**Description**: Initialize Redis instance in the container.

**Acceptance Criteria**:
- ✅ Import `Redis` from `ioredis`
- ✅ Create Redis instance: `new Redis(config('REDIS_URL'))`
- ✅ Add `redis` to container interface
- ✅ Export redis instance from container

**Dependencies**: None

**Estimated Effort**: 30 minutes

---

### Task 3.2: Add balance cache TTL config

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `apps/executor-service/src/config.ts`

**Description**: Add configuration for balance cache TTL.

**Acceptance Criteria**:
- ✅ Add `BALANCE_CACHE_TTL_SECONDS: number` to config interface
- ✅ Set default value to `1800` (30 minutes)
- ✅ Add JSDoc explaining purpose

**Dependencies**: None

**Estimated Effort**: 15 minutes

---

### Task 3.3: Integrate balance cache in OrderExecutorService

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `apps/executor-service/src/services/order-executor.service.ts`

**Description**: Fetch and validate balance cache in `handleOpenOrder()`.

**Acceptance Criteria**:
- ✅ Inject Redis instance via constructor
- ✅ After fetching adapter (line ~131), create `BalanceCacheService`
- ✅ Call `getBalance(adapter.accountId)`
- ✅ Validate cache age against `BALANCE_CACHE_TTL_SECONDS`
- ✅ Use cached balance if fresh, otherwise fall back to `account.balance`
- ✅ Log debug message when using cached balance
- ✅ Log warning when cache expired or missing
- ✅ Pass balance to `lotSizeCalculator` via account override

**Dependencies**: Task 1.2, Task 3.1, Task 3.2

**Estimated Effort**: 2 hours

---

### Task 3.4: Integration tests for balance integration

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `apps/executor-service/test/integration/services/order-executor-balance.spec.ts`

**Description**: Test balance cache integration in order execution flow.

**Acceptance Criteria**:
- ✅ Test fresh balance cache is used in lot size calculation
- ✅ Test expired balance cache falls back to DB
- ✅ Test missing balance cache falls back to DB
- ✅ Test balance override doesn't mutate original account object
- ✅ Test Redis connection failure is handled gracefully
- ✅ Verify correct logs are emitted
- ✅ Use real Redis and MongoDB

**Dependencies**: Task 3.3

**Estimated Effort**: 3 hours

---

## Phase 4: Price Integration (apps/executor-service)

### Task 4.0: Add INFO status to OrderHistoryStatus enum

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `libs/dal/src/models/order.model.ts`

**Description**: Add `INFO` status to track informational events in order history.

**Acceptance Criteria**:
- ✅ Add `INFO = 'info'` to `OrderHistoryStatus` enum
- ✅ Add JSDoc: "Informational event - Used for non-critical informational events in order processing"
- ✅ Include examples: "using cached live price, automatic adjustments, system decisions"

**Dependencies**: None

**Estimated Effort**: 15 minutes

---

### Task 4.1: Add price cache TTL config

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `apps/executor-service/src/config.ts`

**Description**: Add configuration for price cache TTL.

**Acceptance Criteria**:
- ✅ Add `PRICE_CACHE_TTL_SECONDS: number` to config interface
- ✅ Set default value to `32` (2 update cycles at 15s)
- ✅ Add JSDoc explaining purpose (2x update frequency)

**Dependencies**: None

**Estimated Effort**: 15 minutes

---

### Task 4.2: Integrate price cache for market orders without entry

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `apps/executor-service/src/services/order-executor.service.ts`

**Description**: Fetch cached price BEFORE `shouldDeferStopLoss` check and set `entry` if available, which naturally prevents deferred SL.

**Acceptance Criteria**:
- ✅ At line ~231 (before `shouldDeferStopLoss` check), check if `!entry`
- ✅ If no entry, create `PriceCacheService` with `adapter.exchangeCode` and Redis
- ✅ Call `getPrice(symbol)` to fetch cached price
- ✅ Validate cache age against `PRICE_CACHE_TTL_SECONDS`
- ✅ If fresh, calculate mid price: `(bid + ask) / 2`
- ✅ Set `entryToUse = midPrice` and `usedCachedPrice = true`
- ✅ Log info message: "Using cached live price as entry for market order"
- ✅ Log warning if cache too old: "Cached price too old, proceeding without entry"
- ✅ Log debug if cache missing: "No cached price available, proceeding without entry"
- ✅ Use `entryToUse` in SL calculation (naturally prevents deferred SL)
- ✅ Pass `entryToUse` to `executeOpenOrder()`
- ✅ After order execution, if `usedCachedPrice`, add `OrderHistoryStatus.INFO` entry with:
  - `message: "Used cached live price as entry for market order"`
  - `cachedPrice: <entryToUse_value>`
  - `symbol: <symbol>`

**Dependencies**: Task 1.1, Task 3.1, Task 4.0, Task 4.1

**Estimated Effort**: 2.5 hours

---

### Task 4.3: Integration tests for price integration

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `apps/executor-service/test/integration/services/order-executor-price.spec.ts`

**Description**: Test price cache integration in market order flow.

**Acceptance Criteria**:
- ✅ Test fresh price cache is used as entry for market order
- ✅ Test mid price calculation is correct
- ✅ Test entry is set and SL is calculated (no deferral)
- ✅ Test stale price cache is rejected, order proceeds without entry
- ✅ Test missing price cache, order proceeds without entry
- ✅ Test `OrderHistoryStatus.INFO` entry is added when cached price used
- ✅ Test no INFO entry when entry already provided
- ✅ Test executed price fallback still works when no cached price
- ✅ Verify correct logs are emitted
- ✅ Use real Redis and MongoDB

**Dependencies**: Task 4.2

**Estimated Effort**: 3 hours

---

## Phase 5: Background Jobs (apps/executor-service)

### Task 5.1: Add Redis to executor-service container

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `apps/executor-service/src/container.ts`

**Description**: Initialize Redis instance in the container (Already present).

**Acceptance Criteria**:
- ✅ Import `Redis` from `ioredis`
- ✅ Create Redis instance: `new Redis(config('REDIS_URL'))`
- ✅ Add `redis` to container interface
- ✅ Export redis instance from container

**Dependencies**: None

**Estimated Effort**: 30 minutes

---

### Task 5.2: Add brokerFactory to executor-service container

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `apps/executor-service/src/container.ts`

**Description**: Make broker adapter factory available in executor-service container (Already present).

**Acceptance Criteria**:
- ✅ Import `BrokerAdapterFactory` from executor-service
- ✅ Initialize factory in container
- ✅ Add `brokerFactory` to container interface
- ✅ Ensure factory is initialized before jobs start

**Dependencies**: None

**Estimated Effort**: 1 hour

**Note**: This may require restructuring to share the factory between services. Consider moving factory to libs/shared if needed.

---

### Task 5.3: Create FetchBalanceJob

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `apps/executor-service/src/jobs/fetch-balance-job.ts`

**Description**: Implement background job to fetch and cache account balance.

**Acceptance Criteria**:
- ✅ Extend `BaseJob<Container>`
- ✅ Use decorator `@RegisterJob('fetch-balance-job')`
- ✅ Implement `onTick()` method
- ✅ Get all adapters from `container.brokerFactory.getAllAdapters()`
- ✅ For each adapter:
  - Call `adapter.getAccountInfo()`
  - Transform `AccountInfo` to `BalanceInfo`
  - Create `BalanceCacheService` with `adapter.exchangeCode` and Redis
  - Call `setBalance(adapter.accountId, balanceInfo)`
- ✅ Handle adapter failures gracefully (log, Sentry, continue)
- ✅ Log success message per adapter
- ✅ Add comprehensive JSDoc with cron recommendation

**Dependencies**: Task 1.2, Task 2.6, Task 5.1, Task 5.2

**Estimated Effort**: 2.5 hours

---

### Task 5.4: Create FetchPriceJob

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `apps/executor-service/src/jobs/fetch-price-job.ts`

**Description**: Implement background job to fetch and cache prices.

**Acceptance Criteria**:
- ✅ Extend `BaseJob<Container>`
- ✅ Use decorator `@RegisterJob('fetch-price-job')`
- ✅ Define `FetchPriceJobMeta` interface with `symbols: string[]`
- ✅ Implement `onTick()` method
- ✅ Extract symbols from `this.jobConfig.meta.symbols`
- ✅ Get all adapters and group by `exchangeCode` (one per exchange)
- ✅ For each exchange:
  - Call `adapter.fetchPrice(symbols)`
  - Create `PriceCacheService` with exchangeCode and Redis
  - For each price, call `setPrice(symbol, bid, ask)`
- ✅ Handle adapter failures gracefully (log, Sentry, continue)
- ✅ Log success message per exchange with symbol count
- ✅ Add comprehensive JSDoc with cron recommendation (every 15s)

**Dependencies**: Task 1.1, Task 2.4, Task 2.6, Task 5.1, Task 5.2

**Estimated Effort**: 3 hours

---

### Task 5.5: Integration tests for FetchBalanceJob

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `apps/executor-service/test/integration/jobs/fetch-balance-job.spec.ts`

**Description**: Test the balance fetch job end-to-end.

**Acceptance Criteria**:
- ✅ Test job fetches balance from all adapters
- ✅ Test balance is correctly cached in Redis
- ✅ Test `AccountInfo` to `BalanceInfo` transformation
- ✅ Test adapter failure doesn't stop other adapters
- ✅ Test error logging and Sentry capture
- ✅ Use real Redis and mock adapters
- ✅ Verify cache keys and values

**Dependencies**: Task 5.3

**Estimated Effort**: 2.5 hours

---

### Task 5.6: Integration tests for FetchPriceJob

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `apps/executor-service/test/integration/jobs/fetch-price-job.spec.ts`

**Description**: Test the price fetch job end-to-end.

**Acceptance Criteria**:
- ✅ Test job fetches prices from all exchanges
- ✅ Test prices are correctly cached in Redis
- ✅ Test adapter grouping by exchangeCode
- ✅ Test symbols are extracted from job meta
- ✅ Test adapter failure doesn't stop other exchanges
- ✅ Test error logging and Sentry capture
- ✅ Use real Redis and mock adapters
- ✅ Verify cache keys and values

**Dependencies**: Task 5.4

**Estimated Effort**: 2.5 hours

---

## Phase 6: Cleanup and Documentation

### Task 6.1: Remove balance fields from Account model

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `libs/dal/src/models/account.model.ts`

**Description**: Remove deprecated balance fields now that balance is cached in Redis.

**Acceptance Criteria**:
- ✅ Remove `balance?: number` field (line 1037)
- ✅ Remove `balanceUpdatedAt?: Date` field (line 1042)
- ✅ Remove associated JSDoc comments
- ✅ Verify no code references these fields

**Dependencies**: Task 3.3, Task 5.3 (balance caching fully implemented)

**Estimated Effort**: 30 minutes

---

### Task 6.2: Update Account model references

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: Multiple files in codebase

**Description**: Update any code that references `account.balance` to use cached balance.

**Acceptance Criteria**:
- ✅ Search codebase for `account.balance` references
- ✅ Update to use `BalanceCacheService` where appropriate
- ✅ Update tests that mock `account.balance`
- ✅ Verify all tests pass after changes

**Dependencies**: Task 6.1

**Estimated Effort**: 2 hours

---

### Task 6.3: Add README for cache services

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `libs/shared/utils/src/cache/README.md`

**Description**: Document the cache services for future developers.

**Acceptance Criteria**:
- ✅ Explain purpose of price and balance caching
- ✅ Document cache key formats
- ✅ Document data structures (`PriceData`, `BalanceInfo`)
- ✅ Provide usage examples
- ✅ Explain TTL validation pattern
- ✅ Document error handling approach

**Dependencies**: Task 1.1, Task 1.2

**Estimated Effort**: 1.5 hours

---

### Task 6.4: Update architecture documentation

**Status**: ✅ **COMPLETED** (2026-01-12)

**File**: `docs/caching-architecture.md`

**Description**: Document the caching architecture in project docs.

**Acceptance Criteria**:
- ✅ Add section on Redis caching layer
- ✅ Explain background job architecture
- ✅ Document data flow diagrams
- ✅ Explain TTL validation strategy
- ✅ Document monitoring and observability

**Dependencies**: All implementation tasks complete

**Estimated Effort**: 2 hours

---

## Summary

**Total Tasks**: 35  
**Estimated Total Effort**: ~48.25 hours (6 days for 1 developer)

**Critical Path**:
1. Cache services (Tasks 1.1-1.5) → 7.5 hours
2. Adapter enhancements (Tasks 2.1-2.8) → 7.5 hours
3. Balance integration (Tasks 3.1-3.4) → 6 hours
4. Price integration (Tasks 4.0-4.3) → 5.75 hours
5. Background jobs (Tasks 5.1-5.6) → 12 hours
6. Cleanup (Tasks 6.1-6.4) → 6 hours

**Parallelization Opportunities**:
- Phase 1 and Phase 2 can be done in parallel
- Phase 3 and Phase 4 can be done in parallel after Phase 1
- Phase 5 requires Phase 1, 2 complete
- Phase 6 requires all phases complete

**Testing Coverage**:
- Unit tests: 1 task
- Integration tests: 7 tasks
- Total test tasks: 8 out of 35 (23% of tasks)

**Risk Areas**:
- Task 5.2: May require architectural changes to share adapter factory
- Task 6.2: Unknown number of references to update
- Integration tests may reveal edge cases requiring additional work
