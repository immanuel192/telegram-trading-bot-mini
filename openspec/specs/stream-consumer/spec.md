# stream-consumer Specification

## Purpose
TBD - created by archiving change scaffold-trade-manager. Update Purpose after archive.
## Requirements
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

### Requirement: Message Topic Consumer
The trade-manager service SHALL consume messages from the StreamTopic.MESSAGES stream.

#### Scenario: Messages consumer configuration
- **WHEN** configuring the MESSAGES topic consumer
- **THEN** the config SHALL include:
  - `STREAM_MESSAGES_GROUP_NAME`: Consumer group name for messages (default: 'trade-manager-messages')
  - `STREAM_MESSAGES_CONSUMER_NAME`: Consumer instance name (default: 'trade-manager-instance-1')

#### Scenario: Message consumption mode - new only
- **WHEN** STREAM_CONSUMER_MODE is 'new'
- **THEN** the consumer SHALL only process messages published after the consumer starts
- **AND** it SHALL not process historical messages

#### Scenario: Message consumption mode - all messages
- **WHEN** STREAM_CONSUMER_MODE is 'all'
- **THEN** the consumer SHALL process all messages in the stream
- **AND** it SHALL start from the beginning of the stream or last acknowledged position

#### Scenario: Message acknowledgment
- **WHEN** a message is received
- **THEN** the consumer SHALL:
  - Log the message receipt with trace token
  - Acknowledge the message (XACK)
  - Return successfully

#### Scenario: Initial implementation - no processing
- **WHEN** a message is received (initial implementation)
- **THEN** the consumer SHALL:
  - Log the message details
  - Acknowledge the message
  - NOT perform any business logic processing

### Requirement: Stream Consumer Lifecycle Management
The trade-manager SHALL manage the lifecycle of all stream consumers.

#### Scenario: Consumer startup
- **WHEN** the service starts
- **THEN** all configured consumers SHALL:
  - Initialize their Redis connections
  - Create or join their consumer groups
  - Start consuming messages in the background
  - Log their startup status

#### Scenario: Consumer shutdown
- **WHEN** the service shuts down
- **THEN** all consumers SHALL:
  - Stop consuming new messages
  - Wait for in-flight messages to complete
  - Close their Redis connections gracefully
  - Log their shutdown status

#### Scenario: Consumer registration in container
- **WHEN** wiring up the service
- **THEN** all consumer instances SHALL be registered in the container
- **AND** they SHALL be accessible for lifecycle management

### Requirement: Stream Consumer Error Handling
Stream consumers SHALL handle errors gracefully without crashing the service.

#### Scenario: Message processing error
- **WHEN** an error occurs during message processing
- **THEN** the consumer SHALL:
  - Log the error with trace token and message details
  - Capture the error in Sentry
  - NOT acknowledge the message (allow retry)

#### Scenario: Redis connection error
- **WHEN** the Redis connection fails
- **THEN** the consumer SHALL:
  - Log the connection error
  - Capture the error in Sentry
  - Attempt to reconnect with exponential backoff

#### Scenario: Consumer group creation error
- **WHEN** a consumer group cannot be created
- **THEN** the system SHALL:
  - Log the error with topic and group name
  - Capture the error in Sentry
  - Fail the service startup (critical error)

### Requirement: Stream Consumer Testing
Stream consumers SHALL have integration tests verifying message consumption.

#### Scenario: Consumer receives messages
- **WHEN** running integration tests
- **THEN** the test SHALL:
  - Publish a test message to StreamTopic.MESSAGES
  - Verify the consumer receives the message
  - Verify the message is acknowledged
  - Verify the message appears in consumer logs

#### Scenario: Consumer group behavior
- **WHEN** testing consumer groups
- **THEN** the test SHALL verify:
  - Messages are distributed across consumers in the same group
  - Each message is processed by only one consumer in the group
  - Acknowledged messages are not redelivered

#### Scenario: Multiple topic consumption
- **WHEN** testing multiple consumers
- **THEN** the test SHALL verify:
  - Each consumer processes messages from its designated topic only
  - Consumers operate independently
  - Stopping one consumer does not affect others

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

