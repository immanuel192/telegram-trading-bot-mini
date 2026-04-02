## Context

The system currently extracts multi-tier Take Profit levels but lacks the automated "monitoring" component to act on them. This design introduces a reactive monitoring layer in `trade-manager` that leverages an enhanced in-memory cache to trigger partial closures with minimal latency and reduced database load.

## Goals / Non-Goals

### Goals:
- Trigger `CLOSE_PARTIAL` commands automatically when price crosses a TP tier.
- Minimize database reads through efficient account and order caching in `trade-manager`.
- Maintain state consistency across the execution pipeline (Broker -> DB -> Cache).
- Support O(1) order lookup by symbol during price updates.

### Non-Goals:
- Automated Stop Loss moving (to be implemented in a future phase).
- Dynamic lot size calculation for partial closes (starting with fixed 10%).
- Supporting broker-side OCO orders for partial TPs (monitoring will be system-side).

## Decisions

### 1. Account Caching in Trade-Manager
- **Decision**: Implement a read-through cache for accounts in `trade-manager` similar to `executor-service`.
- **Rationale**: `LIVE_PRICE_UPDATE` can arrive frequently. Querying the DB for every price update across potentially hundreds of orders is unsustainable.
- **TTL**: 30 seconds (configurable).

### 2. Enhanced Order Cache Schema
- **Decision**: Extend `CachedOrder` to include `isTpMonitoringAvailable: boolean` and the full `takeProfitTiers` array.
- **Decision**: Add a `symbolOrders` index (`Map<string, Set<string>>`) to `OrderCacheService`.
- **Rationale**: `tp-monitoring-engine` needs all tiers to know what to trigger and must find orders by symbol instantly when a price update arrives.

### 3. TP Crossing Logic
- **Decision**: Use `previousPrice` and `currentPrice` from the `LIVE_PRICE_UPDATE` event to detect "crossing".
- **Logic**:
  - **LONG**: `previousPrice < tierPrice` AND `currentPrice >= tierPrice`.
  - **SHORT**: `previousPrice > tierPrice` AND `currentPrice <= tierPrice`.
- **Deduplication**: Only trigger if `tier.isUsed` is not explicitly `true` in the cache.

### 4. Executor-Service Pipeline Enhancements
- **Decision**: Create a new step `UpdateTpTierStatusStep` in the `CLOSE_PARTIAL` pipeline to mark tiers as `isUsed: true` atomically.
- **Decision**: Ensure `PublishResultStep` includes the updated `takeProfitTiers` and `lotSizeRemaining` in the outgoing event.
- **Rationale**: This allows the `trade-manager` result handler to keep the cache synchronized without re-fetching from the DB.

## Risks / Trade-offs

- **Memory Usage**: Storing full TP tiers for all OPEN orders increases the memory footprint of `trade-manager`. Given the optimized subset of fields, this is acceptable for thousands of orders.
- **Race Condition**: If two price updates arrive in milliseconds, we might trigger twice.
  - *Mitigation*: The `isUsed` check in the cache, followed by an atomic update in the DB, will ensure only the first one succeeds if they both reach the broker simultaneously.
- **Broker Delays**: There might be a delay between price crossing and broker execution.
  - *Mitigation*: The system relies on its internal price feed as the source of truth for triggering, which is consistent with the "monitoring" requirement.
