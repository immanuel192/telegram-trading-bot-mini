# Spec: Price Integration in Order Execution

## ADDED Requirements

### Requirement: Price cache integration for market orders without entry

The `OrderExecutorService.handleOpenOrder()` method SHALL fetch cached live price BEFORE the `shouldDeferStopLoss` check and set `entry` if available, which naturally prevents deferred SL.

**Related**: This modifies `apps/executor-service/src/services/order-executor.service.ts` at line ~231 (before `shouldDeferStopLoss` check).

#### Scenario: Fetch cached price when no entry provided

**Given** a market order execution request without entry price  
**When** `handleOpenOrder()` is called  
**Then** the service SHALL check if `entry` is undefined  
**And** if undefined, it SHALL create a `PriceCacheService` instance with `adapter.exchangeCode` and Redis  
**And** it SHALL call `getPrice(symbol)` to fetch cached price

#### Scenario: Use cached price as entry when fresh

**Given** no entry price provided  
**And** cached price exists: `{ bid: 2650.5, ask: 2651.0, ts: <10_seconds_ago> }`  
**And** config `PRICE_CACHE_TTL_SECONDS = 32`  
**When** validating the cache  
**Then** the service SHALL calculate age: `Date.now() - cachedPrice.ts`  
**And** age SHALL be < 32000 milliseconds  
**And** the service SHALL calculate mid price: `(bid + ask) / 2 = 2650.75`  
**And** the service SHALL set `entryToUse = 2650.75`  
**And** the service SHALL set `usedCachedPrice = true`  
**And** an info log SHALL be emitted: "Using cached live price as entry for market order"

#### Scenario: Natural prevention of deferred SL

**Given** `entryToUse` is set from cached price  
**When** the code reaches `shouldDeferStopLoss = !entryToUse`  
**Then** `shouldDeferStopLoss` SHALL be `false`  
**And** the existing SL calculation SHALL proceed normally with `entryToUse`  
**And** SL SHALL be sent to the exchange during order opening

#### Scenario: Reject stale cached price

**Given** no entry price provided  
**And** cached price exists: `{ bid: 2650.5, ask: 2651.0, ts: <45_seconds_ago> }`  
**And** config `PRICE_CACHE_TTL_SECONDS = 32`  
**When** validating the cache  
**Then** the service SHALL calculate age: `Date.now() - cachedPrice.ts`  
**And** age SHALL be >= 32000 milliseconds  
**And** the service SHALL NOT set `entryToUse`  
**And** a warning log SHALL be emitted: "Cached price too old, proceeding without entry"  
**And** `shouldDeferStopLoss` SHALL remain `true`

#### Scenario: Handle missing cached price

**Given** no entry price provided  
**And** no cached price exists for symbol "XAUUSD"  
**When** `getPrice("XAUUSD")` returns `null`  
**Then** the service SHALL NOT set `entryToUse`  
**And** a debug log SHALL be emitted: "No cached price available, proceeding without entry"  
**And** `shouldDeferStopLoss` SHALL remain `true`  
**And** order execution SHALL continue normally

### Requirement: Add order history when cached price is used

The service SHALL add an informational history entry when cached live price is used as entry.

#### Scenario: Record cached price usage in order history

**Given** cached price was used to set entry  
**And** `usedCachedPrice = true`  
**When** order execution completes  
**Then** the service SHALL add a history entry with:
- `status: OrderHistoryStatus.INFO`
- `service: ServiceName.EXECUTOR_SERVICE`
- `ts: <current_date>`
- `traceToken: <from_payload>`
- `messageId: <from_payload>`
- `channelId: <from_payload>`
- `command: <from_payload>`
- `info.message: "Used cached live price as entry for market order"`
- `info.cachedPrice: <entryToUse_value>`
- `info.symbol: <symbol>`

#### Scenario: No history entry when cached price not used

**Given** entry price was provided in the original request  
**Or** cached price was not available  
**Or** cached price was stale  
**When** order execution completes  
**Then** the service SHALL NOT add an INFO history entry for cached price usage

### Requirement: Configuration for price cache TTL

The `executor-service` configuration SHALL include a setting for price cache TTL.

**Related**: This adds new config to `apps/executor-service/src/config.ts`.

#### Scenario: Define price cache TTL configuration

**Given** the executor-service config interface  
**When** defining configuration properties  
**Then** it SHALL include `PRICE_CACHE_TTL_SECONDS: number`  
**And** the default value SHALL be `32` (2 update cycles at 15s)  
**And** the value SHALL be configurable via environment variable

### Requirement: Preserve existing entry price logic

The price cache integration SHALL NOT interfere when entry price is already provided.

#### Scenario: Skip price cache when entry provided

**Given** a market order with `entry = 2650.0` provided  
**When** `handleOpenOrder()` is called  
**Then** the service SHALL use the provided entry price  
**And** the service SHALL NOT fetch price from cache  
**And** `entryToUse` SHALL equal the provided entry  
**And** no cached price logic SHALL execute

#### Scenario: Existing deferred SL still works

**Given** no entry price provided  
**And** no cached price available (or stale)  
**And** order is executed successfully  
**And** `result.executedPrice` is returned from exchange  
**When** processing deferred SL  
**Then** the existing deferred SL logic SHALL execute  
**And** SL SHALL be calculated using `result.executedPrice`  
**And** auto-sync job SHALL be triggered to set SL

---

## ADDED Requirements

### Requirement: OrderHistoryStatus.INFO enum value

The `OrderHistoryStatus` enum SHALL include an `INFO` value for informational events.

**Related**: This adds to `libs/dal/src/models/order.model.ts`.

#### Scenario: Define INFO status

**Given** the `OrderHistoryStatus` enum  
**When** defining status values  
**Then** it SHALL include `INFO = 'info'`  
**And** the JSDoc SHALL describe it as: "Informational event - Used for non-critical informational events in order processing"  
**And** examples SHALL include: "using cached live price, automatic adjustments, system decisions"

---

## Logging Requirements

### Requirement: Detailed logging for price cache usage

The price cache integration SHALL provide detailed logs for debugging and monitoring.

#### Scenario: Log cached price usage

**Given** cached price is used as entry  
**When** setting `entryToUse`  
**Then** the service SHALL log:
- `orderId`
- `symbol`
- `cachedPrice` (mid price value)
- `ageMs` (age of cache in milliseconds)
- Message: "Using cached live price as entry for market order"
**And** the log level SHALL be `info`

#### Scenario: Log stale price cache warning

**Given** cached price is too old  
**When** rejecting the cached price  
**Then** the service SHALL log:
- `orderId`
- `symbol`
- `ageMs` (age of cache)
- `maxAgeMs` (configured TTL)
- Message: "Cached price too old, proceeding without entry"
**And** the log level SHALL be `warn`

#### Scenario: Log missing price cache

**Given** no cached price exists  
**When** cache returns `null`  
**Then** the service SHALL log:
- `orderId`
- `symbol`
- Message: "No cached price available, proceeding without entry"
**And** the log level SHALL be `debug`

---

## Error Handling Requirements

### Requirement: Graceful handling of price cache failures

The price cache integration SHALL handle failures without blocking order execution.

#### Scenario: Continue execution on Redis read failure

**Given** a Redis connection error when calling `getPrice()`  
**When** the error is caught  
**Then** the service SHALL log the error  
**And** the service SHALL proceed without setting `entryToUse`  
**And** order execution SHALL continue normally  
**And** `shouldDeferStopLoss` SHALL remain `true`  
**And** the error SHALL be captured in Sentry

#### Scenario: Handle invalid cached price data

**Given** cached price data is corrupted or invalid  
**When** parsing the price data fails  
**Then** the service SHALL log the error  
**And** the service SHALL proceed without setting `entryToUse`  
**And** order execution SHALL continue normally

---

## Integration Requirements

### Requirement: Simplified logic flow

The price cache integration SHALL simplify the overall logic by eliminating the need for complex deferred SL fallback.

#### Scenario: Single SL calculation path

**Given** cached price is used to set entry  
**When** SL calculation occurs  
**Then** it SHALL use the same code path as orders with provided entry  
**And** there SHALL be NO duplication of SL calculation logic  
**And** the deferred SL section SHALL only handle the case where both cached price AND executed price are unavailable

#### Scenario: Entry available for downstream logic

**Given** cached price is used to set entry  
**When** passing parameters to `executeOpenOrder()`  
**Then** `entry` parameter SHALL be set to `entryToUse`  
**And** all downstream logic SHALL have access to the entry price  
**And** broker adapter SHALL receive the entry price
