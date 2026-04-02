## 1. Shared Utilities Updates
Outcome: Reliable communication of order status changes between services with a strict schema.

- [x] 1.1 Update `ExecuteOrderResultPayloadSchema` in `libs/shared/utils/src/interfaces/messages/execute-order-result-payload.ts`. Scope: Add `symbol`, `side`, `lotSize`, `lotSizeRemaining`, `type` (required), and `takeProfits` (optional fields for synchronization).
- [x] 1.2 Define `ExecuteOrderResultType` enum. Scope: 0=OTHERS, 1=OrderOpen, 2=OrderClosed (Total), 3=OrderUpdatedTpSl.
- [x] 1.3 Update related unit tests for the payload schema in `libs/shared/utils/test`. Scope: Verify validation for all new fields and JSDoc for OrderClosed.

## 2. Executor Service Enhancements
Outcome: Executor service broadcasts all significant order lifecycle events with necessary metadata for caching.

- [x] 2.1 Update `OpenOrderStep`. Scope: Emit `EXECUTE_ORDER_RESULT` with `type: OrderOpen` upon successful broker execution.
- [x] 2.2 Update `SetTpSlStep`. Scope: Emit `EXECUTE_ORDER_RESULT` with `type: OrderUpdatedTpSl` and latest TP tiers.
- [x] 2.3 Update `CloseBadPositionStep` and `CloseAllStep`. Scope: Emit `EXECUTE_ORDER_RESULT` with `type: OrderClosed` when positions are fully or partially closed.
- [x] 2.4 Update `OrderExecutionHandler`. Scope: Ensure uniform result emission logic across all execution pipelines.
- [x] 2.5 Update executor integration tests. Scope: Assert that results published to the stream contain the new fields and correct types.

## 3. Trade Manager - OrderCacheService
Outcome: High-performance, thread-safe in-memory storage for active orders in Trade Manager.

- [x] 3.1 Create `OrderCacheService` class. Scope: Implement internal `Map<OrderId, Order>` and `Map<AccountId, Set<OrderId>>` mappings.
- [x] 3.2 Implement `refreshCache()`. Scope: Query DB for `OPEN` orders, reconcile with memory, and prune closed orders.
- [x] 3.4 Implement CRUD methods. Scope: `addOrder` (init with IDs, symbol, side, and lot sizes), `updateOrder` (set TPs and update remaining size), `removeOrder` (cleanup Maps), and `getOrder`.
- [x] 3.5 Ensure Thread-Safety. Scope: Wrap map mutations in atomic blocks to prevent race conditions during high-frequency updates.
- [x] 3.6 Container Registration. Scope: Register as a singleton in `apps/trade-manager/src/container.ts`.
- [x] 3.7 Unit tests for Cache Logic. Scope: Test reconciliation logic, removal behavior, and account-level indexing.

## 4. Trade Manager - Event Integration
Outcome: Trade Manager cache remains synchronized with real-time execution events.

- [x] 4.1 Update `ExecuteOrderResultHandler` to inject `OrderCacheService`.
- [x] 4.2 Update `ExecuteOrderResultHandler.onMessage()` to handle:
  - `OrderOpen`: Call `orderCacheService.addOrder()`.
  - `OrderUpdatedTpSl`: Call `orderCacheService.updateOrder()`.
  - `OrderClosed`: Call `orderCacheService.removeOrder()`.
- [x] 4.3 Implement Unit and Integration tests for `ExecuteOrderResultHandler`.

## 5. Trade Manager - Background Jobs
Outcome: Guaranteed eventual consistency for the in-memory cache against database drift.

- [x] 5.1 Create `RefreshOrderCacheJob`. Scope: Implements `BaseJob` and calls `cacheService.refreshCache()`.
- [x] 5.2 Startup Logic. Scope: Ensure `refreshCache` is called immediately upon job initialization before the first cron tick.
- [x] 5.3 Trigger Configuration. Scope: Set 1-minute interval cron schedule.
- [x] 5.4 Worker Registration. Scope: Register in `apps/trade-manager/src/jobs/index.ts` so it's auto-registered.
- [x] 5.5 Verification. Scope: Integration tests verify cache is populated on job init and refreshed on trigger.
