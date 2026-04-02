## ADDED Requirements

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
