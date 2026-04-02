# message-contracts Spec Delta

## MODIFIED Requirements

### Requirement: Translation Result Message Contract
The system SHALL provide a TRANSLATE_MESSAGE_RESULT message type for returning AI translation results with simplified extraction data.

#### Scenario: Translation result payload structure
- **WHEN** a TRANSLATE_MESSAGE_RESULT message is created
- **THEN** it SHALL include:
  - `promptId`: Prompt rule ID used for translation (string)
  - `traceToken`: Trace token for tracking (string)
  - `receivedAt`: Original message receipt timestamp (integer)
  - `messageId`: Original message ID (string)
  - `channelId`: Original channel ID (string)
  - `commands`: Array of detected commands (minimum 1)

#### Scenario: Command extraction data
- **WHEN** a command includes extraction data
- **THEN** it SHALL include:
  - `symbol`: Trading symbol (optional string)
  - `side`: Command side - BUY or SELL (optional)
  - `isImmediate`: Immediate execution flag (optional boolean)
  - `meta`: Metadata for adjustments (optional object)
  - `entry`: Entry price (optional number)
  - `entryZone`: Entry price range (optional array of numbers)
  - `stopLoss`: Stop loss configuration (optional object)
  - `takeProfits`: Take profit configurations (optional array)
  - `isLinkedWithPrevious`: Link to previous trade (optional boolean)
  - `validationError`: Validation error message (optional string)
- **AND** it SHALL NOT include `closeIds` field

#### Scenario: Removal of closeIds field
- **WHEN** defining extraction data schema
- **THEN** the `closeIds` field SHALL be removed
- **AND** position closing logic SHALL be handled by executor-service
- **AND** existing code relying on `closeIds` SHALL be updated

### Requirement: Execute Order Request Message Contract
The system SHALL provide an EXECUTE_ORDER_REQUEST message type with flexible order execution parameters.

#### Scenario: Execute order request payload structure
- **WHEN** an EXECUTE_ORDER_REQUEST message is created
- **THEN** it SHALL include:
  - `messageId`: Telegram message ID (integer, minimum 1)
  - `channelId`: Telegram channel ID (string)
  - `accountId`: Account ID for execution (string)
  - `traceToken`: Trace token for tracking (string)
  - `symbol`: Trading symbol (string)
  - `command`: Command type from CommandEnum (required)
  - `lotSize`: Position size in lots (number, minimum 0)
  - `isImmediate`: Immediate execution flag (boolean, optional, default false)
  - `entry`: Entry price (number, optional)
  - `stopLoss`: Stop loss configuration (object, optional)
  - `takeProfits`: Take profit configurations (array, optional)
  - `leverage`: Leverage multiplier (number, optional)
  - `timestamp`: Order creation timestamp (integer)

#### Scenario: Command-based execution
- **WHEN** creating an EXECUTE_ORDER_REQUEST
- **THEN** it SHALL use `command` field from CommandEnum (LONG, SHORT, MOVE_SL, SET_TP_SL, CLOSE, CLOSE_ALL, CANCEL, etc.)
- **AND** it SHALL NOT use separate `type` and `executionType` fields
- **AND** the command SHALL determine the execution behavior

#### Scenario: Flexible stop loss configuration
- **WHEN** specifying stop loss
- **THEN** the `stopLoss` field SHALL be an optional object containing:
  - `price`: Stop loss price (number, optional)
  - `pips`: Stop loss in pips (number, optional)
- **AND** at least one of `price` or `pips` SHOULD be provided when stopLoss is present
- **AND** executor-service SHALL resolve the final SL price

#### Scenario: Multiple take profit levels
- **WHEN** specifying take profits
- **THEN** the `takeProfits` field SHALL be an optional array of objects
- **AND** each object SHALL contain:
  - `price`: Take profit price (number, optional)
  - `pips`: Take profit in pips (number, optional)
- **AND** at least one of `price` or `pips` SHOULD be provided for each TP
- **AND** multiple TP levels SHALL be supported

#### Scenario: Immediate vs limit execution
- **WHEN** specifying execution timing
- **THEN** the `isImmediate` field SHALL indicate:
  - `true`: Execute at market price immediately
  - `false` or undefined: Execute as limit order at specified entry price
- **AND** the `entry` field SHALL be used for limit orders

#### Scenario: Removal of deprecated fields
- **WHEN** defining EXECUTE_ORDER_REQUEST schema
- **THEN** the following fields SHALL be removed:
  - `orderId` (executor-service generates this)
  - `type` (replaced by `command`)
  - `executionType` (replaced by `isImmediate`)
  - `price` (replaced by `entry`)
  - `sl` (replaced by `stopLoss` object)
  - `tp` (replaced by `takeProfits` array)
- **AND** the `OrderExecutionType` enum SHALL be removed

### Requirement: Message Validation
The system SHALL validate message payloads using TypeBox schemas with updated contracts.

#### Scenario: Translation result validation
- **WHEN** validating a TRANSLATE_MESSAGE_RESULT message
- **THEN** the validator SHALL use TranslateMessageResultPayloadSchema
- **AND** it SHALL reject messages with `closeIds` in extraction data
- **AND** it SHALL accept messages with all valid extraction fields

#### Scenario: Execute order request validation
- **WHEN** validating an EXECUTE_ORDER_REQUEST message
- **THEN** the validator SHALL use ExecuteOrderRequestPayloadSchema
- **AND** it SHALL require `command` field with valid CommandEnum value
- **AND** it SHALL accept optional `isImmediate`, `entry`, `stopLoss`, `takeProfits` fields
- **AND** it SHALL reject messages with deprecated fields (`orderId`, `type`, `executionType`, `price`, `sl`, `tp`)

### Requirement: Message Contract Testing
The message contracts SHALL have comprehensive unit tests covering new and modified schemas.

#### Scenario: Translation result schema tests
- **WHEN** testing TranslateMessageResultPayloadSchema
- **THEN** tests SHALL verify:
  - Valid payloads without `closeIds` are accepted
  - Payloads with `closeIds` are rejected
  - All extraction fields validate correctly
  - Backward compatibility with existing valid messages

#### Scenario: Execute order request schema tests
- **WHEN** testing ExecuteOrderRequestPayloadSchema
- **THEN** tests SHALL verify:
  - All CommandEnum values are accepted
  - Optional fields (`isImmediate`, `entry`, `stopLoss`, `takeProfits`) validate correctly
  - StopLoss object validates with `price` or `pips`
  - TakeProfits array validates with multiple entries
  - Deprecated fields are rejected
  - Required fields are enforced
