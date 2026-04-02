## ADDED Requirements

### Requirement: In-Memory Order Cache
The trade-manager SHALL maintain an in-memory cache of open orders to support high-frequency processing.

#### Scenario: OrderCacheService data structures
- **WHEN** the `OrderCacheService` is initialized
- **THEN** it SHALL maintain internal mappings:
  - `Map<OrderId, { orderId: string, symbol: string, side: string, lotSize: number, lotSizeRemaining: number, takeProfits: { price: number }[] }>`
  - `Map<AccountId, Set<OrderId>>` for account-level indexing

#### Scenario: Cache Refreshing
- **WHEN** `refreshCache()` is called
- **THEN** it SHALL:
  - Query all open orders from the database (selecting only `orderId`, `accountId`, and `meta.takeProfitTiers`).
  - Update the internal mappings to match the database result.
  - Remove any orders from the cache that are no longer present in the database result (indicating they were closed).

#### Scenario: Reactive Cache Updates
- **WHEN** an `EXECUTE_ORDER_RESULT` is received
- **THEN** the cache SHALL be updated reactively:
  - If `type` is `OrderOpen` or `OrderUpdatedTpSl`: Add/Update the order in the cache using `addOrder` or `updateOrder`.
  - If `type` is `OrderClosed`: Remove the order from the cache using `removeOrder`.
- **AND** the handler SHALL NOT trigger a full cache refresh.

### Requirement: Cache Refresh Job
The trade-manager SHALL run a periodic background job to synchronize the in-memory cache with the database.

#### Scenario: Periodic Refresh Job
- **WHEN** the `RefreshOrderCacheJob` is initialized OR runs on a tick
- **THEN** it SHALL call `OrderCacheService.refreshCache()`.
- **AND** it SHALL trigger an initial refresh immediately upon startup.
- **AND** the job SHALL be configured to run periodically (e.g., every 1 minute) thereafter.
- **AND** it SHALL ensure that only one instance of the job runs at a time.

#### Scenario: OrderCacheService API
- **WHEN** managing individual orders
- **THEN** it SHALL provide the following methods:
  - `addOrder(orderId: string, accountId: string)`: Adds a new order to the cache.
  - `updateOrder(orderId: string, takeProfits: { price: number }[])`: Updates an existing order's take profit tiers.
  - `removeOrder(orderId: string)`: Removes an order from the cache and cleans up account mapping.
  - `getOrder(orderId: string)`: Retrieves the cached order.

#### Scenario: Thread Safety
- **WHEN** multiple concurrent processes access the `OrderCacheService`
- **THEN** it SHALL ensure atomic updates to the internal maps to prevent race conditions or inconsistent states.
- **AND** it SHALL be registered as a singleton in the application container.
