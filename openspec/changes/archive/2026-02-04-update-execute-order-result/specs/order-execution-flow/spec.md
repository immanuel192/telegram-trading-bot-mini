## MODIFIED Requirements

### Requirement: Execution Result Handling in Trade-Manager
The trade-manager SHALL consume execution results from executor-service, update Order entities, and synchronize the in-memory cache.

#### Scenario: Order update on successful execution
- **WHEN** an execution result indicates success
- **THEN** trade-manager SHALL:
  - Find Order by `orderId`
  - Update Order with:
    - `actualSymbol` = `payload.actualSymbol`
    - `lotSizeRemaining` = `payload.executedLots` (initial value)
    - Append to `history` array:
      ```json
      {
        "event": "EXECUTED",
        "timestamp": payload.executedAt,
        "data": payload
      }
      ```
  - **Notify `OrderCacheService` to update the in-memory state based on the payload type and data.**

## ADDED Requirements

### Requirement: Consistent Execution Result Emission
The executor-service SHALL emit an `EXECUTE_ORDER_RESULT` event for every successful order modification or state change.

#### Scenario: Emission types
- **WHEN** an order is opened
- **THEN** emit `EXECUTE_ORDER_RESULT` with `type: OrderOpen`.
- **WHEN** an order TP/SL is updated
- **THEN** emit `EXECUTE_ORDER_RESULT` with `type: OrderUpdatedTpSl` and latest `takeProfits`.
- **WHEN** an order is closed (partially or fully)
- **THEN** emit `EXECUTE_ORDER_RESULT` with `type: OrderClosed`.
