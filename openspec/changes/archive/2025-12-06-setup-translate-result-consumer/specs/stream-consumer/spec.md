# stream-consumer Spec Delta

## ADDED Requirements

### Requirement: Translation Results Consumer
The trade-manager service SHALL consume translation results from the StreamTopic.TRANSLATE_RESULTS stream.

#### Scenario: Results consumer configuration
- **WHEN** configuring the TRANSLATE_RESULTS topic consumer
- **THEN** the config SHALL include:
  - `STREAM_CONSUMER_MODE_TRANSLATE_RESULTS`: Consumer mode for translation results (StreamConsumerMode)
  - Default value: `StreamConsumerMode.NEW`

#### Scenario: Results consumer initialization
- **WHEN** the service starts
- **THEN** it SHALL:
  - Create consumer group for `StreamTopic.TRANSLATE_RESULTS` with group name from `APP_NAME`
  - Create `RedisStreamConsumer` instance for results with message validator
  - Register `TranslateResultHandler` to process `TRANSLATE_MESSAGE_RESULT` events
  - Start consumer in the background
  - Log successful initialization

#### Scenario: Result message logging
- **WHEN** a `TRANSLATE_MESSAGE_RESULT` is received
- **THEN** the handler SHALL log:
  - Stream message ID
  - Message ID and channel ID
  - Trace token for correlation
  - Prompt ID used for translation
  - Whether message is a command (isCommand)
  - Number of commands if present
  - Confidence score from meta
  - Processing duration from meta

#### Scenario: No business logic processing
- **WHEN** a translation result is received (initial implementation)
- **THEN** the handler SHALL:
  - Log all message details
  - Acknowledge the message
  - NOT execute any trade logic
  - NOT update database state

#### Scenario: Results consumer shutdown
- **WHEN** the service shuts down
- **THEN** the results consumer SHALL:
  - Stop consuming new messages
  - Wait for in-flight messages to complete
  - Close Redis connection gracefully
  - Log shutdown status

## MODIFIED Requirements

### Requirement: Redis Stream Consumer Infrastructure
The trade-manager service SHALL provide infrastructure for consuming messages from multiple Redis Stream topics.

#### Scenario: Consumer configuration (MODIFIED)
- **WHEN** configuring stream consumers
- **THEN** the config SHALL include:
  - `STREAM_CONSUMER_MODE_MESSAGES`: Consumption mode for messages stream
  - `STREAM_CONSUMER_MODE_TRANSLATE_RESULTS`: Consumption mode for results stream (NEW)
  - Per-topic consumer group configuration
  - Per-topic consumer name configuration

#### Scenario: Multiple topic support (MODIFIED)
- **WHEN** setting up consumers
- **THEN** the service SHALL support consuming from:
  - `StreamTopic.MESSAGES` for new Telegram messages
  - `StreamTopic.TRANSLATE_RESULTS` for translation results (NEW)
- **AND** each topic SHALL have its own consumer group
- **AND** each consumer group SHALL be independently configurable

## Related Specs
- **message-events**: Defines `TRANSLATE_MESSAGE_RESULT` payload structure
- **stream-publisher**: Defines `StreamTopic.TRANSLATE_RESULTS` topic
