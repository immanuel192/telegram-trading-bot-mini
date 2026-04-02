# message-events Specification Delta

## ADDED Requirements

### Requirement: Translation Request Message Type
The system SHALL support requesting message translation from trade-manager to interpret-service via Redis Streams.

#### Scenario: TRANSLATE_MESSAGE_REQUEST message structure
- **WHEN** trade-manager publishes a translation request
- **THEN** the message SHALL include:
  - `exp`: Expiry timestamp in milliseconds (Date.now() + 10000)
  - `messageId`: Telegram message ID (string)
  - `channelId`: Telegram channel ID (string)
  - `messageText`: The raw message text to translate (string)
  - `prevMessage`: The previous message text for context (string)
  - `quotedMessage`: Optional quoted message text (string)
  - `quotedFirstMessage`: Optional first message in quote chain (string)
  - `orders`: Array of current orders for context (Order[])

#### Scenario: Order context structure
- **WHEN** including orders in translation request
- **THEN** each order SHALL include:
  - `orderId`: Unique order identifier (string)
  - `symbol`: Trading symbol (string)
  - `entryPrice`: Order entry price (number)
  - `tp`: Optional take profit price (number)
  - `sl`: Optional stop loss price (number)
  - `entryTime`: Optional ISO date time string (string)
  - `executed`: Whether order is executed or pending (boolean)

#### Scenario: Message expiry validation
- **WHEN** interpret-service consumes a TRANSLATE_MESSAGE_REQUEST
- **AND** current time > exp timestamp
- **THEN** the service SHALL:
  - Log a warning with trace token
  - Skip processing the message
  - Acknowledge the message (don't retry)
  - Capture metric for monitoring

#### Scenario: Empty orders array
- **WHEN** no current orders exist for the account
- **THEN** the orders field SHALL be an empty array
- **AND** the message SHALL still be valid

### Requirement: Translation Result Message Type
The system SHALL support returning translation results from interpret-service to trade-manager via Redis Streams.

#### Scenario: TRANSLATE_MESSAGE_RESULT message structure
- **WHEN** interpret-service publishes a translation result
- **THEN** the message SHALL include:
  - `messageId`: Original message ID (string)
  - `channelId`: Original channel ID (string)
  - `isCommand`: Whether message is a trading command (boolean)
  - `meta`: Metadata object with timing and confidence
  - `commands`: Optional array of parsed commands (ICommand[])
  - `note`: Optional AI reasoning explanation (string)

#### Scenario: Result metadata structure
- **WHEN** publishing translation result
- **THEN** meta SHALL include:
  - `confidence`: AI confidence score 0-1 (number)
  - `receivedAt`: Request received timestamp in ms (number)
  - `processedAt`: Processing completed timestamp in ms (number)
  - `duration`: Processing duration in ms (number)

#### Scenario: Command structure
- **WHEN** isCommand is true
- **THEN** commands array SHALL contain ICommand objects with:
  - `action`: CommandAction enum value (required)
  - `type`: CommandType enum value (required)
  - `symbol`: Trading symbol (required string)
  - `orderId`: Optional order ID for updates/closes (string)
  - `lotSize`: Optional lot size for new orders (number)
  - `price`: Optional price for limit orders (number)

#### Scenario: CommandAction enum values
- **WHEN** defining command actions
- **THEN** the following values SHALL be supported:
  - `LONG`: Open long position
  - `SHORT`: Open short position
  - `UPDATE`: Update existing order (SL/TP)
  - `CLOSE_PARTIAL`: Partially close running order
  - `CLOSE_TP`: Close order due to take profit
  - `CLOSE_SL`: Close order due to stop loss
  - `CANCEL`: Cancel pending order
  - `CLOSE_ALL`: Close all positions and orders

#### Scenario: CommandType enum values
- **WHEN** defining command types
- **THEN** the following values SHALL be supported:
  - `MARKET`: Execute immediately at market price
  - `LIMIT`: Pending order at specified price

#### Scenario: Non-command message result
- **WHEN** interpret-service determines message is not a command
- **THEN** the result SHALL have:
  - `isCommand: false`
  - `commands`: undefined or empty array
  - `note`: Optional explanation of why not a command

#### Scenario: Confidence score validation
- **WHEN** validating translation result
- **THEN** confidence SHALL be:
  - A number between 0 and 1 (inclusive)
  - 0 = no confidence, 1 = 100% confidence
  - Reject message if outside this range

### Requirement: Symbol Price Request Message Type
The system SHALL support requesting latest symbol prices via Redis Streams.

#### Scenario: SYMBOL_FETCH_LATEST_PRICE message structure
- **WHEN** a service requests latest symbol price
- **THEN** the message SHALL include:
  - `symbol`: Trading symbol to fetch price for (string)
  - `messageId`: Originating message ID for correlation (string)
  - `channelId`: Originating channel ID for correlation (string)

#### Scenario: Symbol validation
- **WHEN** validating price request
- **THEN** symbol SHALL:
  - Be a non-empty string
  - Follow standard symbol format (e.g., "EURUSD", "XAUUSD")
  - Be validated by the receiving service

## MODIFIED Requirements

### Requirement: Message Type Enum
The MessageType enum SHALL be extended to support translation and price request messages.

#### Scenario: New message type values
- **WHEN** defining message types
- **THEN** the enum SHALL include:
  - `NEW_MESSAGE` (existing)
  - `TRANSLATE_MESSAGE_REQUEST` (new)
  - `TRANSLATE_MESSAGE_RESULT` (new)
  - `SYMBOL_FETCH_LATEST_PRICE` (new)

### Requirement: Message Type Payload Mapping
The MessageTypePayloadMap SHALL include mappings for all new message types.

#### Scenario: Payload type safety
- **WHEN** using StreamMessage<T> with new types
- **THEN** TypeScript SHALL enforce correct payload types:
  - `StreamMessage<MessageType.TRANSLATE_MESSAGE_REQUEST>` → `TranslateMessageRequestPayload`
  - `StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT>` → `TranslateMessageResultPayload`
  - `StreamMessage<MessageType.SYMBOL_FETCH_LATEST_PRICE>` → `SymbolFetchLatestPricePayload`

## Testing Requirements

### Requirement: Message Schema Validation Tests
All new message types SHALL have comprehensive unit tests for schema validation.

#### Scenario: Valid payload acceptance
- **WHEN** testing message schemas
- **THEN** valid payloads SHALL pass TypeBox validation
- **AND** all required fields SHALL be present
- **AND** all field types SHALL match schema

#### Scenario: Invalid payload rejection
- **WHEN** testing message schemas
- **THEN** invalid payloads SHALL fail TypeBox validation
- **AND** missing required fields SHALL be rejected
- **AND** incorrect field types SHALL be rejected
- **AND** out-of-range values SHALL be rejected (e.g., confidence > 1)

#### Scenario: Optional field handling
- **WHEN** testing message schemas
- **THEN** optional fields SHALL be:
  - Accepted when present and valid
  - Accepted when absent
  - Rejected when present but invalid

#### Scenario: Enum value validation
- **WHEN** testing command schemas
- **THEN** all CommandAction values SHALL be valid
- **AND** all CommandType values SHALL be valid
- **AND** invalid enum values SHALL be rejected

## Cross-References

- **Related to**: `service-foundation` (interpret-service will consume/publish these messages)
- **Related to**: `stream-consumer` (existing spec for Redis Stream patterns)
- **Depends on**: Existing `NEW_MESSAGE` message type and patterns
