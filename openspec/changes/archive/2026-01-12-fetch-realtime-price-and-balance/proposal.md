# Proposal: Fetch Realtime Price and Account Balance

## Overview

Implement real-time price and account balance caching using Redis to enable precise lot size calculation and margin management for market orders. This change introduces two cache services (price and balance), enhances broker adapters, updates order execution flow, and adds background jobs to keep cache data fresh.

## Problem Statement

Currently, the system lacks real-time price and balance information when executing market orders:

1. **Price Information Gap**: When executing market orders without entry price, we cannot calculate precise lot sizes because we don't know the current market price until after execution.

2. **Balance Information Gap**: Account balance is stored in MongoDB (`Account.balance` and `Account.balanceUpdatedAt`) but is not reliably updated. The lot size calculator needs accurate balance to calculate risk-based position sizes, especially for DCA strategies with `maxOpenPositions`.

3. **Deferred Stop Loss Issue**: At line 231 in `order-executor.service.ts`, we defer stop loss calculation for market orders without entry price. After execution, we need the executed price to set the SL, but currently have no fallback if the broker doesn't return the executed price immediately.

## Proposed Solution

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Background Jobs                          │
│  ┌──────────────────────┐    ┌──────────────────────────┐  │
│  │ FetchBalanceJob      │    │ FetchPriceJob            │  │
│  │ (every 1 min)        │    │ (every 15s recommended)  │  │
│  └──────────┬───────────┘    └──────────┬───────────────┘  │
│             │                            │                   │
│             ▼                            ▼                   │
│  ┌──────────────────────┐    ┌──────────────────────────┐  │
│  │ BalanceCacheService  │    │ PriceCacheService        │  │
│  │ Redis: exchange-acct │    │ Redis: exchange-symbol   │  │
│  └──────────┬───────────┘    └──────────┬───────────────┘  │
└─────────────┼────────────────────────────┼──────────────────┘
              │                            │
              ▼                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Order Execution Flow (executor-service)         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ OrderExecutorService.handleOpenOrder                  │  │
│  │  1. Fetch balance cache (validate TTL < 30min)       │  │
│  │  2. Pass to LotSizeCalculator                        │  │
│  │  3. Execute order                                     │  │
│  │  4. If no entry price, fetch live price cache        │  │
│  │     (validate TTL < 32s)                             │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

1. **PriceCacheService** (`libs/shared/utils/src/cache/price-cache.service.ts`)
   - Cache key: `price:${exchangeCode}:${universalSymbol}`
   - Value: `{ bid: number, ask: number, ts: number }`
   - Constructor: `(exchangeCode: string, redis: Redis)`

2. **BalanceCacheService** (`libs/shared/utils/src/cache/balance-cache.service.ts`)
   - Cache key: `balance:${exchangeCode}:${accountId}`
   - Value: `{ balance: number, marginUsed: number, marginAvailable: number, equity: number, ts: number }`
   - Constructor: `(exchangeCode: string, redis: Redis)`

3. **Adapter Enhancements** (`apps/executor-service/src/adapters/`)
   - Add `exchangeCode` and `accountId` getters to `IBrokerAdapter`
   - Update `fetchPrice()` to support multiple symbols: `fetchPrice(symbols: string[]): Promise<PriceTicker[]>`

4. **Background Jobs** (`apps/trade-manager/src/jobs/`)
   - `FetchBalanceJob`: Fetch balance from all adapters every 1 min
   - `FetchPriceJob`: Fetch prices from all adapters every 15s (configurable via cron)

5. **Configuration** (`apps/executor-service/src/config.ts`)
   - `BALANCE_CACHE_TTL_SECONDS`: 1800 (30 minutes)
   - `PRICE_CACHE_TTL_SECONDS`: 32 (2 update cycles at 15s)

## Design Decisions

### 1. Constructor Injection vs Factory Pattern

**Decision**: Use constructor injection for Redis instance.

**Rationale**:
- Reuses Redis connection across service instances
- Simpler dependency management
- Aligns with existing container pattern in `executor-service` and `trade-manager`
- Factory pattern would add unnecessary complexity for this use case

### 2. Universal Symbol Format

**Decision**: Always use universal symbol format (e.g., `XAUUSD`) in cache keys.

**Rationale**:
- Consistent across all brokers
- Easier to share price data between accounts using the same exchange
- Adapter handles transformation to broker-specific format internally

### 3. Balance Data Standardization

**Decision**: Define `BalanceInfo` interface with standard fields across all brokers.

```typescript
interface BalanceInfo {
  balance: number;        // Total account balance
  marginUsed: number;     // Margin currently used
  marginAvailable: number; // Available margin for new positions
  equity: number;         // Account equity (balance + unrealized P&L)
  ts: number;             // Unix timestamp of last update
}
```

**Rationale**:
- Different brokers return different balance structures
- Standardization enables consistent lot size calculation
- Maps to existing `AccountInfo` interface from adapters

### 4. Failure Handling Strategy

**Decision**: Log, capture in Sentry, and continue on failures.

**Rationale**:
- Background jobs should not crash the service
- Individual adapter failures shouldn't block others
- Monitoring via Sentry ensures visibility
- Graceful degradation: stale cache is better than no cache

### 5. Cache Expiry Validation

**Decision**: Validate TTL at read time, not write time.

**Rationale**:
- Allows different consumers to have different TTL requirements
- Executor service can reject stale balance (>30min) while jobs continue updating
- More flexible for future use cases

### 6. Adapter Factory Enhancement

**Decision**: Return cached adapters only (flatten Map values to array).

**Rationale**:
- Background jobs run after adapters are preloaded
- Avoids creating new adapter instances in background jobs
- Simpler implementation
- If an account is not cached, it won't be updated (acceptable trade-off)

## Implementation Phases

### Phase 1: Cache Services (libs/shared/utils)
- Create `PriceCacheService` with `getPrice()` and `setPrice()`
- Create `BalanceCacheService` with `getBalance()` and `setBalance()`
- Create `BalanceInfo` interface
- Add integration tests for both services

### Phase 2: Adapter Enhancements (apps/executor-service/src/adapters)
- Add `exchangeCode` and `accountId` getters to `IBrokerAdapter`
- Update `fetchPrice()` signature to accept `string[]`
- Implement multi-symbol fetch in `OandaAdapter`
- Update `BaseBrokerAdapter` if needed
- Update adapter factory to expose `getAllAdapters(): IBrokerAdapter[]`

### Phase 3: Balance Integration (apps/executor-service)
- Add Redis instance to container
- Update `OrderExecutorService.handleOpenOrder()` to:
  - Create `BalanceCacheService` instance
  - Fetch and validate balance cache
  - Pass to `LotSizeCalculator`
- Update `LotSizeCalculator` to accept optional balance parameter
- Add config for `BALANCE_CACHE_TTL_SECONDS`

### Phase 4: Price Integration (apps/executor-service)
- Update `OrderExecutorService.handleOpenOrder()` to:
  - Create `PriceCacheService` instance after order execution
  - Fetch live price if market order without entry
  - Validate price cache TTL (<32s)
  - Use cached price for deferred SL calculation
- Add config for `PRICE_CACHE_TTL_SECONDS`

### Phase 5: Background Jobs (apps/trade-manager)
- Create `FetchBalanceJob` (cron: every 1 min)
  - Get all adapters from factory
  - Call `getAccountInfo()` per adapter
  - Transform and persist to Redis via `BalanceCacheService`
- Create `FetchPriceJob` (cron: every 15s)
  - Get all adapters, group by exchangeCode
  - Extract symbols from job meta
  - Call `fetchPrice(symbols)` per exchange
  - Persist to Redis via `PriceCacheService`
- Add Redis instance to trade-manager container

### Phase 6: Cleanup
- Remove `balance` and `balanceUpdatedAt` from `Account` model
- Update any references to these fields

## Testing Strategy

### Unit Tests
- `PriceCacheService`: get/set operations, key format
- `BalanceCacheService`: get/set operations, key format, data transformation
- Adapter getters: `exchangeCode`, `accountId`

### Integration Tests
- Cache services with real Redis
- Multi-symbol price fetching in adapters
- Balance cache integration in order execution flow
- Price cache integration in order execution flow
- Background jobs end-to-end

### Manual Testing
- Verify balance updates in Redis every 1 min
- Verify price updates in Redis every 15s
- Verify lot size calculation uses cached balance
- Verify deferred SL uses cached price
- Verify graceful handling of cache misses/expiry

## Risks and Mitigations

| Risk                               | Impact                             | Mitigation                                                         |
| ---------------------------------- | ---------------------------------- | ------------------------------------------------------------------ |
| Redis connection failure           | High - No cache updates            | Graceful error handling, Sentry alerts, fallback to DB balance     |
| Stale cache data                   | Medium - Incorrect calculations    | TTL validation, frequent updates (15s for price, 1min for balance) |
| Adapter failure in background jobs | Low - Missing cache for one broker | Per-adapter try-catch, continue processing others                  |
| Memory usage from cache            | Low - Redis memory growth          | Set Redis TTL on keys, monitor memory usage                        |

## Success Criteria

1. ✅ Price cache updated every 15s for configured symbols
2. ✅ Balance cache updated every 1 min for all active accounts
3. ✅ Lot size calculator uses cached balance when available
4. ✅ Deferred SL calculation uses cached price when available and fresh (<32s)
5. ✅ All integration tests pass
6. ✅ No errors in Sentry from cache operations
7. ✅ `Account.balance` and `Account.balanceUpdatedAt` removed from model

## Open Questions

None - all clarifications received from user.
