# partial-order-closure Specification

## Purpose
The partial-order-closure capability defines the mechanisms for reducing the size of an open position incrementally. This is essential for multi-tier take-profit strategies where profits are secured at multiple price levels.
## Requirements
### Requirement: Partial Order Closure Command
The system SHALL support a `CLOSE_PARTIAL` command to reduce the size of an open position without closing it entirely.

#### Scenario: CLOSE_PARTIAL execution
- **WHEN** the `CLOSE_PARTIAL` command is executed
- **THEN** it SHALL reduce the position size by the amount specified in the `lotSize` field of the request
- **AND** it SHALL update the `lotSizeRemaining` field of the Order in the database

#### Scenario: Partial close amount validation
- **WHEN** a `CLOSE_PARTIAL` command is received
- **THEN** the system SHALL verify that the requested reduction amount (lotSize) is not greater than the current `lotSizeRemaining`
- **AND** if the amount is greater, it SHALL only close the remaining balance and log a **WARNING** in the order history
- **AND** if the amount equals the remaining balance, the position SHALL be closed entirely

#### Scenario: Partial close message correlation
- **WHEN** generating a `CLOSE_PARTIAL` request for a multi-tier take profit
- **THEN** the `messageId` of the request SHALL be a number constructed as `original_messageId * 100 + tierIndex` (e.g., messageId 123 for TP1 becomes 12301)
- **AND** this SHALL be used to trace the execution back to the specific take profit trigger

#### Scenario: Order status after partial close
- **WHEN** a position is partially closed but still has a remaining balance
- **THEN** its status SHALL remain `OPEN`
- **AND** the history SHALL be updated with a `CLOSED_PARTIAL` event containing details of the closure

### Requirement: Persistence of Tier Usage
The `CLOSE_PARTIAL` pipeline SHALL mark the triggered take profit tier as used in the database.

#### Scenario: Update Tier in DB
- **WHEN** Successfully closing a partial position triggered by a TP tier
- **THEN** it SHALL atomically update `meta.takeProfitTiers` to set `isUsed: true` for the corresponding price level.

### Requirement: Enriched Execution Result
Execution result events for partial closures SHALL include the current state of remaining lots and TP tiers.

#### Scenario: Publish Full Status in Result
- **WHEN** Publishing `EXECUTE_ORDER_RESULT` for a partial close
- **THEN** it SHALL include `lotSizeRemaining` and the full list of `takeProfitTiers` (including their updated `isUsed` status) in the payload.

