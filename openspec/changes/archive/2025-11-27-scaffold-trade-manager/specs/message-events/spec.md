## ADDED Requirements

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
