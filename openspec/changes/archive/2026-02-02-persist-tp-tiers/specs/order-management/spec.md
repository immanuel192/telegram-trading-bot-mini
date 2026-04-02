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
  - `lotSize`: Position size in lots (number)
  - `price`: Entry price for market orders or limit price for limit orders (number)
  - `history`: Array for tracking order lifecycle events (initially empty array)
  - `meta.takeProfitTiers`: Array of all validated and sorted take profit levels (each with `price` and optional `isUsed`)

#### Scenario: Take Profit Tiers structure
- **WHEN** storing take profit tiers in an order
- **THEN** each tier SHALL include:
  - `price`: The target exit price (number)
  - `isUsed`: Indicates if this specific tier has been reached/triggered (boolean, optional)
- **AND** they SHALL be stored in a list sorted by profitability (highest profit first)

## ADDED Requirements

### Requirement: Multi-Tier Take Profit Storage
The system SHALL store all identified take profit levels from a signal to enable comprehensive monitoring.

#### Scenario: Persisting all TP levels
- **WHEN** an order is opened or updated by the executor-service
- **THEN** all normalized take profit levels SHALL be saved to the `meta.takeProfitTiers` field
- **AND** the legacy `tp` field SHALL continue to store the primary take profit (TP1) for backward compatibility
