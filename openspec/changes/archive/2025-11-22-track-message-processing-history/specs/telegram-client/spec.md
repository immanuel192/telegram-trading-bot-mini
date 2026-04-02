## ADDED Requirements

### Requirement: Track Message Processing History
The system MUST maintain an audit trail of how each message is processed through the service pipeline by recording history entries when emitting events to downstream services.

#### Scenario: Record history when publishing message event
Given a new message has been persisted to the database
When the telegram-service publishes the message to the Redis stream
Then it MUST atomically append a history entry to the message document
And the history entry MUST include `fromService` set to "telegram-service"
And the history entry MUST include `targetService` set to the downstream service name
And the history entry MUST include `createdAt` with the current timestamp
And the history entry MUST include `streamEvent` with the event type and stream message ID

#### Scenario: Record history when event publishing fails
Given a new message has been persisted to the database
When the telegram-service attempts to publish to the Redis stream
And the stream publishing operation fails
Then it MUST still persist a history entry to the message document
And the history entry MUST include `errorMessage` with the error details
And the error MUST be logged and reported to Sentry

#### Scenario: Initialize empty history for new messages
Given a new message is received from Telegram
When the message is persisted to the database
Then the `history` field MUST be initialized as an empty array
And subsequent processing steps will append to this array

### Requirement: Standardize Service Names
The system MUST use a centralized enum for service identifiers to ensure consistency across the codebase.

#### Scenario: Use ServiceName enum for history tracking
Given the system needs to record which service is processing a message
When populating the `fromService` or `targetService` fields in history entries
Then it MUST use values from the `ServiceName` enum
And the enum MUST be defined in `libs/shared/utils`
And the enum MUST include all services in the system (telegram-service, interpret-service, trade-manager)

## MODIFIED Requirements

### Requirement: Persist Telegram Messages
The system MUST persist all processed messages to the `telegram-messages` collection with enriched context and processing history.

#### Scenario: Save New Message
Given a new message from an active channel
When the message is processed
Then it should be saved to `telegram-messages`
And `sentAt` should be the timestamp from the Telegram message
And `receivedAt` should be the current system time
And `quotedMessage` should be populated if it's a reply
And `prevMessage` should be populated with the previous message in the channel
And `history` should be initialized as an empty array

#### Scenario: Publish message to stream with history tracking
Given a message has been persisted to the database
When the telegram-service publishes the message event to the Redis stream
Then it MUST atomically update the message document to append a history entry
And the history entry MUST record the event emission details
And the database update MUST succeed even if stream publishing fails
