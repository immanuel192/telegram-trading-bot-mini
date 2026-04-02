## Why

To support multi-tier take profit strategies, the system needs the ability to partially close open positions as different price targets are hit. This reduces risk and secures profits incrementally rather than closing the entire position at once.

## What Changes

- **Add CLOSE_PARTIAL command**: Introduce a new internal command `CLOSE_PARTIAL` for communication between `trade-manager` and `executor-service`.
- **Update ExecuteOrderRequestPayload**: Modify the execution payload to indicate that for `CLOSE_PARTIAL`, the `lotSize` field specifies the amount of units to reduce.
- **Track Remaining Units**: Update the `Order` model in the Data Access Layer to include `lotSizeRemaining` to track partial closures.
- **Executor Pipeline**: Implement a new `CLOSE_PARTIAL` pipeline in the `executor-service` that handles partial closures via broker adapters.
- **Broker Adapter Enhancement**: Update `IBrokerAdapter` and `OandaAdapter` to support closing a specific amount of units from a position.

## Capabilities

### New Capabilities
- `partial-order-closure`: Defines how positions are partially closed, including validation against remaining lot size and updating order history.

### Modified Capabilities
- `order-execution-flow`: Requirements updated to ensure `lotSizeRemaining` is initialized when an order is opened.
- `order-management`: Requirements updated to track and persist `lotSizeRemaining` in the order state.

## Impact

- **libs/shared/utils**: Updated `CommandEnum` and `ExecuteOrderRequestPayload`.
- **libs/dal**: Updated `Order` model and schema.
- **apps/trade-manager**: New transformer for generating `CLOSE_PARTIAL` requests.
- **apps/executor-service**: New pipeline for `CLOSE_PARTIAL`, updated `OpenOrderStep`, and enhanced broker adapters.
