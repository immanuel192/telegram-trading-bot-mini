## MODIFIED Requirements

### Requirement: Order Data Model
The system SHALL provide an Order entity to represent virtual trading orders with their execution parameters and message associations.

#### Scenario: Order structure
- **WHEN** an Order is created
- **THEN** it SHALL include the following fields:
  - `_id`: MongoDB ObjectId (optional)
  - `messageId`: Telegram message ID that triggered this order (number)
  - `channelId`: Telegram channel ID where the message originated (string)
  - `accountId`: Account identifier for executor-service (string)
  - `orderId`: Unique order identifier generated using short-unique-id package (string)
  - `type`: Order direction - LONG or SHORT (OrderType enum)
  - `executionType`: Execution method - market or limit (OrderExecutionType enum)
  - `symbol`: Symbol resolved by interpret-service (string)
  - `actualSymbol`: Actual symbol name resolved after executor runs (string, optional)
  - `lotSize`: Initial position size in lots (number)
  - **`lotSizeRemaining`: Current remaining units in the position (number, optional)**
  - `price`: Entry price for market orders or limit price for limit orders (number)
  - `history`: Array for tracking order lifecycle events (initially empty array)
  - `meta.takeProfitTiers`: Array of all validated and sorted take profit levels (each with `price` and optional `isUsed`)
