## 1. Shared Library Updates

- [x] 1.1 Update `CachedOrder` interface
  - **Scope**: Modify `CachedOrder` in `/apps/trade-manager/src/services/order-cache.service.ts` to include `isTpMonitoringAvailable?: boolean` and change `takeProfits` to `{ price: number; isUsed?: boolean }[]`.
  - **Outcome**: `CachedOrder` supports tracking monitoring eligibility and detailed TP tier usage.
- [x] 1.2 Update `ExecuteOrderResultPayload` schema
  - **Scope**: Update `ExecuteOrderResultPayloadSchema` in `/libs/shared/utils/src/interfaces/messages/execute-order-result-payload.ts` to enrich `takeProfits` objects with an optional `isUsed: boolean` property.
  - **Outcome**: Execution result events can carry full TP tier status back to consumers.

## 2. Trade-Manager Service Enhancements

- [x] 2.1 Implement Account Caching
  - **Scope**: Update `/apps/trade-manager/src/services/account.service.ts` to include an in-memory `Map` cache and a `getAccountByIdWithCache(accountId: string)` method with a configurable TTL (default 30s).
  - **Outcome**: Reduced database load for frequent account configuration lookups.
- [x] 2.2 Add Symbol Indexing to Order Cache
  - **Scope**: Add `symbolOrders` map (`Map<string, Set<string>>`) to `/apps/trade-manager/src/services/order-cache.service.ts` and update `internalAdd`/`internalRemove` to maintain this index.
  - **Outcome**: O(1) lookup of orders by symbol during price updates.
- [x] 2.3 Populate Monitoring Flags in Order Cache
  - **Scope**: In `OrderCacheService.internalAdd`, fetch the account using the new cached service, check `configs.enableTpMonitoring`, and set the `isTpMonitoringAvailable` flag on the cached order.
  - **Outcome**: Orders in cache are correctly marked for monitoring based on account settings.
- [x] 2.4 Implement Symbol Query Method
  - **Scope**: Add `getOrdersBySymbol(symbol: string)` to `OrderCacheService` in `/apps/trade-manager/src/services/order-cache.service.ts`.
  - **Outcome**: Efficient retrieval of all active orders for a given symbol.
- [x] 2.5 Update Cache Refresh from DB
  - **Scope**: Update `refreshCache()` in `OrderCacheService` to fetch `meta.takeProfitTiers` from MongoDB and populate the detailed `takeProfits` in cache.
  - **Outcome**: Initial cache state correctly reflects DB tier status.

## 3. Executor-Service Pipeline Updates

- [x] 3.1 Create `UpdateTpTierStatusStep`
  - **Scope**: Implement a new pipeline step in `/apps/executor-service/src/services/order-handlers/close-order/update-tp-tier-status.step.ts` that uses `$set` to mark specific TP tiers as `isUsed: true` in MongoDB.
  - **Outcome**: Atomic persistence of TP tier usage upon partial closure.
- [x] 3.2 Wire `UpdateTpTierStatusStep` into Pipeline
  - **Scope**: Add the new step to the `CLOSE_PARTIAL` pipeline in `/apps/executor-service/src/services/order-handlers/pipeline-executor.service.ts`.
  - **Outcome**: Partial closure flow automatically updates TP tier status.
- [x] 3.3 Enrich Execution Result Publishing
  - **Scope**: Update `/apps/executor-service/src/services/order-handlers/close-order/update-order-history-after-close-step.step.ts` to ensure `takeProfits` (from the latest DB state or context) are included in the `ctx.result` payload.
  - **Outcome**: Downstream services receive updated TP tier information in the result event.
- [x] 3.4 Context Propagation for Partial Closes
  - **Scope**: Verify and ensure `lotSizeRemaining` and detailed `takeProfitTiers` are correctly populated in `ExecutionContext` during the `CLOSE_PARTIAL` flow.
  - **Outcome**: Data consistency throughout the execution pipeline.

## 4. TP Monitoring Implementation

- [x] 4.1 Implement Cross Detection Logic
  - **Scope**: Implement the crossing detection algorithm (Cross Up for LONG, Cross Down for SHORT) in `/apps/trade-manager/src/events/consumers/live-price-update-handler.ts` using `previousPrice` and `currentPrice`.
  - **Outcome**: Reliable detection of price hitting Take Profit levels.
- [x] 4.2 Integrate Dependencies in Price Handler
  - **Scope**: Inject `OrderCacheService` and `AccountService` into `LivePriceUpdateHandler` constructor.
  - **Outcome**: Price handler has access to required services for monitoring.
- [x] 4.3 Implement Partial Close Trigger
  - **Scope**: Publish `CLOSE_PARTIAL` command with `lotSize` = 10% of total and a unique `messageId` (using `originalMessageId * 100 + tierIndex`).
  - **Outcome**: Automated execution triggered on TP hit.
- [x] 4.4 Optimistic Cache Update (Revised)
  - **Scope**: Implemented "assume remaining not cross" optimization and skipped local marking as per user feedback (executor-service is source of truth).
  - **Outcome**: Efficient monitoring logic without redundant local state mutation.

## 5. Result Synchronization

- [x] 5.1 Update Result Handler
  - **Scope**: In `/apps/trade-manager/src/events/consumers/execute-order-result-handler.ts`, update the `OrderUpdatedTpSl` case to sync the full `takeProfits` array and `lotSizeRemaining` from the result payload into the `OrderCacheService`.
  - **Outcome**: In-memory cache is kept in sync with the broker and DB state.

## 6. Testing & Verification

- [x] 6.1 Unit Test: Account Caching
  - **Scope**: Create unit tests in `/apps/trade-manager/test/unit/services/account-cache.spec.ts` verifying TTL and read-through logic.
  - **Outcome**: Verified reliability of account caching.
- [x] 6.2 Unit Test: Order Cache Indexing
  - **Scope**: Update/add unit tests for `OrderCacheService` verifying symbol-based indexing and monitoring flag assignment.
  - **Outcome**: Verified efficiency and correctness of enhanced order cache.
- [x] 6.3 Integration Test: Monitoring Flow
  - **Scope**: Create a new integration test in `/apps/trade-manager/test/integration/tp-monitoring-flow.spec.ts` that simulates a `LIVE_PRICE_UPDATE` crossing a TP and verifies the resulting `CLOSE_PARTIAL` request and subsequent cache update.
  - **Outcome**: End-to-end verification of the TP monitoring system.

## 7. Documentation

- [x] 7.1 Update Technical Documentation
  - **Scope**: Update `/README.md` or create a new `docs/tp-monitoring.md` to document the automated TP monitoring architecture, caching strategy, and trigger logic.
  - **Outcome**: Clear documentation for future maintenance and developers.
