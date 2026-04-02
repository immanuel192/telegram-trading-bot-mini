# Spec: Balance Integration in Order Execution

## ADDED Requirements

### Requirement: Balance cache integration in order executor

The `OrderExecutorService.handleOpenOrder()` method SHALL fetch and validate cached balance before calculating lot size.

**Related**: This modifies `apps/executor-service/src/services/order-executor.service.ts` at line 126-131.

#### Scenario: Fetch balance cache during order execution

**Given** an order execution request for account "acc-123" on exchange "oanda"  
**And** cached balance exists in Redis with age < 30 minutes  
**When** `handleOpenOrder()` is called  
**Then** the service SHALL create a `BalanceCacheService` instance with `adapter.exchangeCode` and Redis  
**And** it SHALL call `getBalance(adapter.accountId)`  
**And** it SHALL validate the cache timestamp

#### Scenario: Use cached balance when fresh

**Given** cached balance: `{ balance: 10000, ..., ts: <5_minutes_ago> }`  
**And** config `BALANCE_CACHE_TTL_SECONDS = 1800` (30 minutes)  
**When** validating the cache  
**Then** the service SHALL calculate age: `Date.now() - cachedBalance.ts`  
**And** age SHALL be < 1800000 milliseconds  
**And** the cached balance SHALL be used in lot size calculation  
**And** a debug log SHALL be emitted: "Using cached balance"

#### Scenario: Reject expired balance cache

**Given** cached balance: `{ balance: 10000, ..., ts: <45_minutes_ago> }`  
**And** config `BALANCE_CACHE_TTL_SECONDS = 1800` (30 minutes)  
**When** validating the cache  
**Then** the service SHALL calculate age: `Date.now() - cachedBalance.ts`  
**And** age SHALL be >= 1800000 milliseconds  
**And** the service SHALL fall back to `account.balance` from database  
**And** a warning log SHALL be emitted: "Balance cache expired, using DB value"

#### Scenario: Handle missing balance cache

**Given** no cached balance exists for account "acc-123"  
**When** `getBalance()` returns `null`  
**Then** the service SHALL fall back to `account.balance` from database  
**And** a warning log SHALL be emitted: "Balance cache miss, using DB value"  
**And** order execution SHALL continue normally

### Requirement: Pass balance to lot size calculator

The `OrderExecutorService` SHALL override the account balance with cached value when passing to `LotSizeCalculator`.

#### Scenario: Override account balance with cached value

**Given** `account.balance = 9500` (from DB)  
**And** `cachedBalance.balance = 10000` (from Redis, fresh)  
**When** calling `lotSizeCalculator.calculateLotSize()`  
**Then** the service SHALL pass `{ ...account, balance: 10000 }`  
**And** the lot size calculation SHALL use the cached balance value  
**And** the original account object SHALL NOT be mutated

### Requirement: Configuration for balance cache TTL

The `executor-service` configuration SHALL include a setting for balance cache TTL.

**Related**: This adds new config to `apps/executor-service/src/config.ts`.

#### Scenario: Define balance cache TTL configuration

**Given** the executor-service config interface  
**When** defining configuration properties  
**Then** it SHALL include `BALANCE_CACHE_TTL_SECONDS: number`  
**And** the default value SHALL be `1800` (30 minutes)  
**And** the value SHALL be configurable via environment variable

### Requirement: Redis instance in executor-service container

The `executor-service` container SHALL provide a Redis instance for cache services.

**Related**: This modifies `apps/executor-service/src/container.ts`.

#### Scenario: Initialize Redis in container

**Given** the executor-service container initialization  
**When** creating the container  
**Then** it SHALL create a Redis instance using `config('REDIS_URL')`  
**And** the Redis instance SHALL be available in the container  
**And** the same instance SHALL be reused for all cache services

---

## Error Handling Requirements

### Requirement: Graceful handling of Redis failures

The balance cache integration SHALL handle Redis failures without blocking order execution.

#### Scenario: Continue execution on Redis read failure

**Given** a Redis connection error when calling `getBalance()`  
**When** the error is caught  
**Then** the service SHALL log the error  
**And** the service SHALL fall back to `account.balance` from database  
**And** order execution SHALL continue  
**And** the error SHALL be captured in Sentry

#### Scenario: Log balance cache usage metrics

**Given** balance cache is fetched successfully  
**When** using the cached balance  
**Then** the service SHALL log:
- `accountId`
- `balance` value used
- `ageMs` (age of cache in milliseconds)
- Message: "Using cached balance"
**And** the log level SHALL be `debug`

#### Scenario: Log balance cache expiry warnings

**Given** balance cache is expired  
**When** falling back to DB balance  
**Then** the service SHALL log:
- `accountId`
- `ageMs` (age of cache)
- `maxAgeMs` (configured TTL)
- Message: "Balance cache expired, using DB value"
**And** the log level SHALL be `warn`
