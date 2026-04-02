# message-events Specification

## Purpose
TBD - created by archiving change scaffold-trade-manager. Update Purpose after archive.
## Requirements
### Requirement: New Message Event Payload
The NewMessagePayload interface SHALL include channel information to eliminate redundant database lookups.

#### Scenario: Payload structure
- **WHEN** publishing a NEW_MESSAGE event
- **THEN** the payload SHALL include:
  - `channelId`: Telegram channel ID (string)
  - `channelCode`: Telegram channel code (string) - **NEW**
  - `messageId`: Message ID within the channel (number)
  - `traceToken`: Optional trace token for tracking (string)
  - `exp`: Expiry timestamp in milliseconds (number)

#### Scenario: Channel code population
- **WHEN** telegram-service publishes a message event
- **THEN** it SHALL populate the channelCode field from the TelegramChannel entity
- **AND** downstream services SHALL use channelCode without additional database queries

#### Scenario: Backward compatibility
- **WHEN** updating the NewMessagePayload interface
- **THEN** all existing consumers SHALL be updated:
  - telegram-service tests
  - shared-utils tests
  - Any integration tests referencing NewMessagePayload

### Requirement: Telegram Service Message Publishing
The telegram-service SHALL include channel code when publishing message events.

#### Scenario: Event publishing with channel code
- **WHEN** TelegramClientService publishes a StreamTopic.MESSAGES event
- **THEN** it SHALL:
  - Fetch the TelegramChannel entity
  - Extract the channelCode field
  - Include channelCode in the NewMessagePayload
  - Publish the event to Redis Stream

#### Scenario: Error handling for missing channel
- **WHEN** publishing a message event
- **AND** the channel is not found in the database
- **THEN** the service SHALL:
  - Log an error with trace token
  - Capture the error in Sentry
  - Skip publishing the event

### Requirement: Translation Request Payload with Prompt ID
The TRANSLATE_MESSAGE_REQUEST payload SHALL include promptId to support account-specific prompt customization.

#### Scenario: Payload includes promptId
- **WHEN** trade-manager publishes a TRANSLATE_MESSAGE_REQUEST event
- **THEN** the payload SHALL include:
  - `promptId`: Unique identifier for the prompt rule (string, required)
  - `exp`: Expiry timestamp in milliseconds (number, required)
  - `messageId`: Telegram message ID (string, required)
  - `channelId`: Telegram channel ID (string, required)
  - `messageText`: Raw message text to translate (string, required)
  - `prevMessage`: Previous message text for context (string, required)
  - `quotedMessage`: Quoted message text (string, optional)
  - `quotedFirstMessage`: First message in quote chain (string, optional)
  - `orders`: Current orders for context (array, required)

#### Scenario: Validation rejects missing promptId
- **WHEN** a TRANSLATE_MESSAGE_REQUEST is published without promptId
- **THEN** the message validator SHALL reject the payload with validation error

### Requirement: Translation Result Payload with Prompt ID
The TRANSLATE_MESSAGE_RESULT payload SHALL include promptId to track which prompt was used.

#### Scenario: Payload includes promptId
- **WHEN** interpret-service publishes a TRANSLATE_MESSAGE_RESULT event
- **THEN** the payload SHALL include:
  - `promptId`: Unique identifier for the prompt rule used (string, required)
  - `messageId`: Original message ID (string, required)
  - `channelId`: Original channel ID (string, required)
  - `isCommand`: Whether message is a trading command (boolean, required)
  - `meta`: Translation metadata with confidence, timestamps, duration (object, required)
  - `commands`: Parsed trading commands (array, optional)
  - `note`: Short reason for translation result (string, optional)

#### Scenario: Validation rejects missing promptId
- **WHEN** a TRANSLATE_MESSAGE_RESULT is published without promptId
- **THEN** the message validator SHALL reject the payload with validation error

### Requirement: Multiple Translation Requests per Message
The trade-manager SHALL publish one TRANSLATE_MESSAGE_REQUEST per unique promptId for each NEW_MESSAGE.

#### Scenario: Single promptId - one request
- **WHEN** a NEW_MESSAGE is received for a channel with 3 accounts sharing the same promptId
- **THEN** trade-manager SHALL publish exactly 1 TRANSLATE_MESSAGE_REQUEST with that promptId

#### Scenario: Multiple promptIds - multiple requests
- **WHEN** a NEW_MESSAGE is received for a channel with accounts having 3 distinct promptIds
- **THEN** trade-manager SHALL publish exactly 3 TRANSLATE_MESSAGE_REQUEST events, one per promptId

#### Scenario: No active accounts - no requests
- **WHEN** a NEW_MESSAGE is received for a channel with no active accounts
- **THEN** trade-manager SHALL NOT publish any TRANSLATE_MESSAGE_REQUEST events
- **AND** SHALL log a warning about no active accounts

#### Scenario: History entry per request
- **WHEN** trade-manager publishes multiple TRANSLATE_MESSAGE_REQUEST events
- **THEN** it SHALL create a separate history entry for each request
- **AND** each history entry SHALL include the promptId in the notes field

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

