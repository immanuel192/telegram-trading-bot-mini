# Spec: Balance Cache Service

## ADDED Requirements

### Requirement: Balance caching with Redis

The system SHALL provide a `BalanceCacheService` class in `libs/shared/utils/src/cache/balance-cache.service.ts` that manages account balance data in Redis with exchange and account scoping.

#### Scenario: Store balance data for an account

**Given** a `BalanceCacheService` instance with exchangeCode "oanda" and a Redis connection  
**When** `setBalance("acc-123", { balance: 10000, marginUsed: 2000, marginAvailable: 8000, equity: 10500 })` is called  
**Then** the service SHALL store the balance data in Redis with key `balance:oanda:acc-123`  
**And** the value SHALL be a JSON object containing all provided fields plus a `ts` timestamp  
**And** the timestamp SHALL be automatically added with current Unix milliseconds

#### Scenario: Retrieve balance data for an account

**Given** balance data exists in Redis for key `balance:oanda:acc-123`  
**When** `getBalance("acc-123")` is called  
**Then** the service SHALL return a `BalanceInfo` object with all fields  
**And** all numeric values SHALL be parsed correctly from JSON

#### Scenario: Handle missing balance data

**Given** no balance data exists in Redis for account "acc-999"  
**When** `getBalance("acc-999")` is called  
**Then** the service SHALL return `null`  
**And** no error SHALL be thrown

### Requirement: Standardized balance data structure

The system SHALL define a `BalanceInfo` interface in `libs/shared/utils/src/cache/balance-cache.service.ts` that standardizes balance data across all broker types.

```typescript
export interface BalanceInfo {
  balance: number;        // Total account balance
  marginUsed: number;     // Margin currently in use
  marginAvailable: number; // Available margin for new positions
  equity: number;         // Account equity (balance + unrealized P&L)
  ts: number;             // Unix timestamp in milliseconds
}
```

#### Scenario: Balance data structure validation

**Given** balance data retrieved from cache  
**When** the data is used by lot size calculator  
**Then** it SHALL contain `balance` as the total account balance  
**And** it SHALL contain `marginUsed` as the margin currently in use  
**And** it SHALL contain `marginAvailable` as available margin for new positions  
**And** it SHALL contain `equity` as account equity (balance + unrealized P&L)  
**And** it SHALL contain `ts` as Unix timestamp in milliseconds  
**And** all fields SHALL be required (not optional)

### Requirement: Transform broker-specific data to standard format

The `BalanceCacheService` SHALL accept balance data without timestamp and automatically add it.

#### Scenario: Auto-add timestamp on setBalance

**Given** balance data without `ts` field: `{ balance: 10000, marginUsed: 2000, marginAvailable: 8000, equity: 10500 }`  
**When** `setBalance("acc-123", balanceData)` is called  
**Then** the service SHALL add a `ts` field with current Unix milliseconds  
**And** the complete `BalanceInfo` SHALL be stored in Redis

### Requirement: Constructor injection pattern

The `BalanceCacheService` SHALL accept dependencies via constructor injection to enable Redis connection reuse.

#### Scenario: Initialize service with dependencies

**Given** an exchangeCode "oanda" and a Redis instance  
**When** creating a new `BalanceCacheService(exchangeCode, redis)`  
**Then** the service SHALL store the exchangeCode for key construction  
**And** the service SHALL use the provided Redis instance for all operations  
**And** the service SHALL NOT create its own Redis connection

### Requirement: Cache key format

The `BalanceCacheService` SHALL use a consistent key format for all balance data.

#### Scenario: Generate cache key for account

**Given** a `BalanceCacheService` with exchangeCode "oanda"  
**When** storing or retrieving balance for accountId "acc-123"  
**Then** the cache key SHALL be `balance:oanda:acc-123`  
**And** the key format SHALL be `balance:${exchangeCode}:${accountId}`

### Requirement: Error handling for Redis operations

The `BalanceCacheService` SHALL handle Redis operation failures gracefully.

#### Scenario: Handle Redis connection failure on get

**Given** a Redis connection that is unavailable  
**When** `getBalance("acc-123")` is called  
**Then** the service SHALL throw an error  
**And** the error SHALL propagate to the caller for handling

#### Scenario: Handle Redis connection failure on set

**Given** a Redis connection that is unavailable  
**When** `setBalance("acc-123", balanceData)` is called  
**Then** the service SHALL throw an error  
**And** the error SHALL propagate to the caller for handling

---

## Integration Requirements

### Requirement: Integration with executor-service

The `BalanceCacheService` SHALL be usable in `executor-service` for retrieving cached balance during order execution.

#### Scenario: Fetch balance in order executor

**Given** an `IBrokerAdapter` instance with exchangeCode "oanda" and accountId "acc-123"  
**And** a Redis instance available in the container  
**When** creating a `BalanceCacheService` in `OrderExecutorService`  
**Then** the service SHALL be initialized with `adapter.exchangeCode` and the Redis instance  
**And** calling `getBalance(adapter.accountId)` SHALL return the cached balance  
**And** the balance SHALL be usable in lot size calculation

### Requirement: Integration with trade-manager jobs

The `BalanceCacheService` SHALL be usable in `trade-manager` background jobs for storing fetched balance data.

#### Scenario: Store balance from background job

**Given** a `FetchBalanceJob` running in trade-manager  
**And** `AccountInfo` fetched from broker adapter: `{ balance: 10000, equity: 10500, margin: 2000, freeMargin: 8000 }`  
**When** the job transforms to `BalanceInfo` and calls `setBalance()`  
**Then** the balance data SHALL be persisted to Redis  
**And** the data SHALL be accessible to executor-service instances

#### Scenario: Transform AccountInfo to BalanceInfo

**Given** `AccountInfo` from adapter: `{ balance: 10000, equity: 10500, margin: 2000, freeMargin: 8000 }`  
**When** transforming to `BalanceInfo` in the job  
**Then** the mapping SHALL be:
- `balance` → `balance`
- `margin` → `marginUsed`
- `freeMargin` → `marginAvailable`
- `equity` → `equity`
**And** the transformed data SHALL be valid `BalanceInfo` (minus `ts`)
