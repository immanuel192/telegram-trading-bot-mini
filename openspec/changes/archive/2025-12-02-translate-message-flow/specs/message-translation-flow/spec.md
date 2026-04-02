# message-translation-flow Spec Delta

## ADDED Requirements

### Requirement: New Message Processing in Trade Manager
The trade-manager service SHALL process NEW_MESSAGE events by creating a transaction, adding history, and publishing translation requests.

#### Scenario: Successful message processing
- **WHEN** trade-manager receives a NEW_MESSAGE event from Redis Stream
- **THEN** it SHALL:
  1. Fetch the TelegramMessage from database using channelId and messageId
  2. Start a MongoDB transaction
  3. Create a history entry with type `TRANSLATE_MESSAGE`
  4. Add the history entry to the message's history array
  5. Publish a TRANSLATE_MESSAGE_REQUEST event to Redis Stream
  6. Commit the transaction
- **AND** the history entry SHALL include streamEvent details
- **AND** the TRANSLATE_MESSAGE_REQUEST payload SHALL include message text and context

#### Scenario: Message not found
- **WHEN** trade-manager receives a NEW_MESSAGE event
- **AND** the message does not exist in the database
- **THEN** it SHALL:
  - Log an error with trace token
  - Capture the error in Sentry
  - Skip processing (do not publish translation request)
  - Acknowledge the stream message

#### Scenario: Transaction failure
- **WHEN** any operation within the transaction fails
- **THEN** the transaction SHALL be automatically rolled back
- **AND** no history entry SHALL be persisted
- **AND** no TRANSLATE_MESSAGE_REQUEST event SHALL be published
- **AND** the error SHALL be captured in Sentry
- **AND** the stream message SHALL remain unacknowledged for retry

#### Scenario: Translation request payload
- **WHEN** publishing a TRANSLATE_MESSAGE_REQUEST event
- **THEN** the payload SHALL include:
  - `exp`: Current timestamp + 10 seconds (in milliseconds)
  - `messageId`: Telegram message ID (as string)
  - `channelId`: Telegram channel ID
  - `messageText`: Current message text
  - `prevMessage`: Previous message text (or empty string if none)
  - `quotedMessage`: Quoted message text (optional)
  - `quotedFirstMessage`: First message in quote chain (optional)
  - `orders`: Empty array (for MVP)

#### Scenario: History entry structure
- **WHEN** creating a history entry for translation request
- **THEN** it SHALL include:
  - `type`: `MessageHistoryTypeEnum.TRANSLATE_MESSAGE`
  - `createdAt`: Current timestamp
  - `fromService`: `'trade-manager'`
  - `targetService`: `'interpret-service'`
  - `streamEvent.messageEventType`: `MessageType.TRANSLATE_MESSAGE_REQUEST`
  - `streamEvent.messageId`: Redis Stream message ID returned from publish

#### Scenario: Dependency injection
- **WHEN** NewMessageHandler is instantiated
- **THEN** it SHALL receive via constructor:
  - `telegramMessageRepository`: For database access
  - `streamPublisher`: For publishing events
  - `logger`: For logging (inherited from base)
- **AND** these dependencies SHALL be wired in the container

### Requirement: Configuration for Message History TTL
The trade-manager configuration SHALL include a TTL setting for message history records.

#### Scenario: TTL configuration
- **WHEN** accessing the trade-manager configuration
- **THEN** it SHALL include `MESSAGE_HISTORY_TTL_SECONDS`
- **AND** the default value SHALL be `10` (10 seconds, matching telegram-service pattern)
- **AND** the value SHALL be overridable via environment variable
- **AND** it SHALL be defined in `TradeManagerConfig` interface (not BaseConfig)

#### Scenario: TTL usage
- **WHEN** creating history entries
- **THEN** the TTL configuration SHALL be available for future use
- **AND** the existing MongoDB TTL index on `sentAt` SHALL continue to govern document expiration
- **NOTE**: This configuration prepares for future per-entry TTL if needed
