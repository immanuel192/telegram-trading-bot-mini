## Purpose
The partial-order-closure capability defines the mechanisms for reducing the size of an open position incrementally. This is essential for multi-tier take-profit strategies where profits are secured at multiple price levels.

## ADDED Requirements

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
