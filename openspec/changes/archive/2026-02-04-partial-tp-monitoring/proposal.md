## Why

Currently, the system can extract multi-tier Take Profit (TP) levels from trading signals, but it lacks the automated logic to monitor real-time price movements and trigger partial position closures when those levels are hit. This gap requires manual monitoring or simplistic broker-side TPs, limiting the effectiveness of advanced trading strategies that rely on sequential profit taking and risk adjustment (e.g., moving SL to entry after TP1).

## What Changes

- **Trade Manager Account Caching**: Implement in-memory caching with TTL (default 30s) for accounts in `trade-manager` to reduce database load during high-frequency price updates.
- **Enhanced Order Cache**: Update `OrderCacheService` to store full `takeProfitTiers` (including `isUsed` status) instead of just prices, and add a symbol-to-orders mapping for O(1) lookup during price updates.
- **TP Monitoring Logic**: Implement Crossing logic (Cross Up for LONG, Cross Down for SHORT) in `LivePriceUpdateHandler` to detect when price hits a profit tier.
- **Automated Partial Closure**: Trigger `CLOSE_PARTIAL` events automatically when a TP tier is hit, with an initial fixed lot size (10% of total).
- **Executor Service Persistence**: Update the `CLOSE_PARTIAL` pipeline to mark TP tiers as `isUsed` in the database and include updated tier info in the execution result events.
- **Result Handler Sync**: Update `ExecuteOrderResultHandler` to synchronize the full TP status and remaining lot size back into the in-memory `OrderCacheService`.

## Capabilities

### New Capabilities
- `tp-monitoring-engine`: Core logic for detecting price crossings against TP tiers and orchestrating partial closures.

### Modified Capabilities
- `order-caching`: Extend cache to support detailed TP tiers, account-level monitoring flags, and symbol-based indexing.
- `account-service`: Introduce read-through memory caching for account configurations in the trade-manager service.
- `partial-order-closure`: Enhance the execution pipeline to persist TP tier usage and publish enriched result events.

## Impact

- **trade-manager**: New dependency on `account.service` and `order-cache.service` inside `live-price-update-handler.ts`.
- **executor-service**: Modification of `UpdateLotSizeRemainingStep` and `UpdateOrderHistoryAfterCloseStep` (or similar) to handle TP tier persistence.
- **Shared Libs**: Update to `ExecuteOrderResultPayload` schema and `CachedOrder` interface.
- **Performance**: Significant reduction in DB reads for accounts; increased memory usage for order caching.
