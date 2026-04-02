## Why

Currently, the `EXECUTE_ORDER_RESULT` event is defined but not utilized. To implement sophisticated trading strategies like partial take-profit, the system needs a reliable way to track order status changes and sync them in memory for high-frequency processing. Querying the database every 200ms is not scalable and introduces excessive latency.

## What Changes

- **Update `EXECUTE_ORDER_RESULT` Payload**: Enhance the payload to include `symbol`, `type` (OrderOpen, OrderClosed, OrderUpdatedTpSl, OTHERS), and `takeProfits` (prices).
- **Update Executor Service**: Ensure that the `executor-service` emits the `EXECUTE_ORDER_RESULT` event with the correct payload and type for all relevant operations (Open Order, Set TP/SL, Close Position).
- **New `OrderCacheService` in Trade Manager**: Implement a high-performance in-memory cache for open orders that consumes `EXECUTE_ORDER_RESULT` events to maintain a near real-time snapshot of the trading state.

## Capabilities

### New Capabilities
- `order-caching`: Provides a high-frequency, in-memory cache for tracking open orders and their current state (take profits, etc.) without hitting the database.

### Modified Capabilities
- `order-execution-flow`: Update the flow to emit execution results after major order lifecycle events.
- `message-events`: Enhance the `EXECUTE_ORDER_RESULT` event schema.

## Impact

- **Shared Libs**: `libs/shared/utils/src/interfaces/messages/execute-order-result-payload.ts`
- **Executor Service**: all order handlers in `apps/executor-service/src/services/order-handlers`
- **Trade Manager**: New service `OrderCacheService` and corresponding event handler for `EXECUTE_ORDER_RESULT`.
- **Latency**: Significant reduction in database queries for order status checks during high-frequency trading loops.
