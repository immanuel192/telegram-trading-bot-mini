## MODIFIED Requirements

### Requirement: Order Execution Service
The executor-service SHALL provide an OrderExecutorService that orchestrates order execution via broker adapters.

#### Scenario: OrderExecutorService execution pipeline
- **WHEN** OrderExecutorService processes an order
- **THEN** it SHALL run a pipeline that includes:
  - Account and adapter resolution
  - Entry price and stop loss calculation
  - Take profit normalization
  - Take profit selection
  - Broker execution
  - **Database persistence of results, including all normalized TP tiers AND initialization of lotSizeRemaining with the executed lots**
  - Result publication

### Requirement: Execution Result Handling in Trade-Manager
The trade-manager SHALL consume execution results from executor-service and update Order entities.

#### Scenario: Order update on successful execution
- **WHEN** an execution result indicates success
- **THEN** trade-manager SHALL:
  - Find Order by `orderId`
  - Update Order with:
    - `actualSymbol` = `payload.actualSymbol`
    - **`lotSizeRemaining` = `payload.executedLots` (initial value)**
    - Append to `history` array:
      ```json
      {
        "event": "EXECUTED",
        "timestamp": payload.executedAt,
        "data": payload
      }
      ```
