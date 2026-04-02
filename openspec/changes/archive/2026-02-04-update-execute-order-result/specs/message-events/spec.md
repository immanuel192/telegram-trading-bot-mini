## ADDED Requirements

### Requirement: Execute Order Result Payload
The `EXECUTE_ORDER_RESULT` payload SHALL include comprehensive state information for in-memory tracking.

#### Scenario: Enhanced payload structure
- **WHEN** publishing an `EXECUTE_ORDER_RESULT` event
- **THEN** the payload SHALL include:
  - `symbol`: string (optional, universal instrument symbol, e.g., BTC/USDT)
  - `side`: string (optional, LONG or SHORT)
  - `type`: integer enum (required):
    - 0: OTHERS
    - 1: OrderOpen
    - 2: OrderClosed (Strictly means 100% position closure)
    - 3: OrderUpdatedTpSl
  - `lotSize`: number (optional, original size of the order)
  - `lotSizeRemaining`: number (optional, current remaining size in the position)
  - `takeProfits`: array of `{ price: number }` (optional, current take profit tiers)
  - `orderId`: string (required)
  - `accountId`: string (required)
  - `success`: boolean (required)
  - `executedLots`: number (optional)
  - `executedAt`: number (optional, timestamp)
