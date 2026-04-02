## Context

Currently, the system queries the database frequently to track order status, which is inefficient for high-frequency trading. The `EXECUTE_ORDER_RESULT` event exists but is underutilized. We need to enhance this event and implement an in-memory `OrderCacheService` in the `trade-manager` to provide a real-time view of open orders.

## Goals / Non-Goals

**Goals:**
- Enhance `EXECUTE_ORDER_RESULT` with detailed status and take-profit information.
- Ensure `executor-service` consistently emits result events for all order lifecycle changes.
- Implement `OrderCacheService` for fast, in-memory access to open orders.
- Reduce database load by using the cache for common status checks.

**Non-Goals:**
- Replacing the database as the source of truth (cache is eventually consistent).
- Implementing the actual partial take-profit logic (this change only provides the infrastructure/data).

## Decisions

### 1. Enhanced `EXECUTE_ORDER_RESULT` Payload
We will add:
- `symbol`: The universal instrument symbol (optional).
- `side`: Order direction (LONG/SHORT) (optional).
- `lotSize`: The original requested volume (optional).
- `lotSizeRemaining`: The current open volume in the position (optional).
- `type`: An enum `ExecuteOrderResultType` (required):
  - 0: OTHERS
  - 1: OrderOpen
  - 2: OrderClosed (Total closure: signals removal from in-memory tracking).
  - 3: OrderUpdatedTpSl
- `takeProfits`: A simplified list of TP prices `{ price: number }[]` (optional).

**Rationale**: These fields are necessary for the `OrderCacheService` to maintain an accurate state without re-querying the database.

### 2. `OrderCacheService` Architecture
- **In-Memory Storage**: Uses two maps:
  - `Map<OrderId, MiniOrder>`: Quick lookup by Order ID.
  - `Map<AccountId, Set<OrderId>>`: Quick lookup of all orders for an account.
- **Synchronization**:
  - **Periodic Refresh**: A dedicated background job (`RefreshOrderCacheJob`) runs every 1 minute to reconciliation the cache. It SHALL trigger an initial full refresh on application startup to ensure the cache is populated before real-time event processing begins.
  - **Reactive Updates**: `ExecuteOrderResultHandler` performs fine-grained cache modifications (add/update/remove) based on real-time events. It does *not* trigger a full refresh.
- **Thread Safety**: Although Node.js is single-threaded, atomic updates will be ensured by avoiding `await` in the middle of cache modification blocks, or using a simple locking mechanism if complex multi-step updates are needed.

### 3. Executor Service Integration
The following handlers will be updated to emit the result:
- `OpenOrderStep`: Emit with `type: OrderOpen`.
- `SetTpSlStep`: Emit with `type: OrderUpdatedTpSl`.
- `CloseBadPositionStep`, `CloseAllStep`: Emit with `type: OrderClosed`.

## Risks / Trade-offs

- **[Risk] Cache Inconsistency** → [Mitigation] Implement a periodic "refresh" from the database and a "clear cache" capability. Assume "eventual consistency" as per requirements.
- **[Risk] Memory Usage** → [Mitigation] Store only "MiniOrder" (minimal fields) and only for "OPEN" orders.
- **[Risk] Race Conditions** → [Mitigation] Ensure cache updates from events are atomic relative to other cache reads.
