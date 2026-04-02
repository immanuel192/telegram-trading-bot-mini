# telegram-client Specification

## Purpose
Defines the behavior and requirements for the Telegram Client service, which handles connection, message ingestion, persistence, and stream publishing.
## Requirements
### Requirement: Capture Telegram Session
The system MUST provide a standalone script to interactively capture a Telegram session string.

#### Scenario: Interactive Session Capture
Given the user runs the `capture-session` script
When the user provides `API_ID`, `API_HASH`, and `PHONE`
Then the script should request an OTP from Telegram
And when the user enters the valid OTP
Then the script should output the session string to the console

### Requirement: Load Configuration from Database
The system MUST load the Telegram session string from the `configs` database collection on startup.

#### Scenario: Load Session from DB
Given a document exists in `configs` with key "telegram-session"
When the service starts
Then it should use the value of that document as the session string
And successfully connect to Telegram

### Requirement: Health Check Endpoint
The system MUST expose a HTTP health check endpoint.

#### Scenario: Health Check
Given the service is running
When a GET request is made to `/healthcheck`
Then it should return status 200 and body "👍"

### Requirement: Persist Telegram Messages
The system MUST persist all processed messages to the `telegram-messages` collection with complete message data including media info, hashtags, reply chain tracking, and raw message structure.

#### Scenario: Save New Message with Complete Data
Given a new message from an active channel
When the message is processed
Then it should be saved to `telegram-messages`
And `channelId` should be extracted from the message
And `channelCode` should be the internal channel identifier
And `sentAt` should be the timestamp from the Telegram message
And `receivedAt` should be the current system time
And `hasMedia` should indicate if the message contains media
And `mediaType` should be set if media is present (photo, video, document, audio, voice, sticker, animation, other)
And `hashTags` should contain all hashtags extracted from the message text (lowercase, e.g., ["#btc", "#eth"])
And `raw` should contain the serialized mtcute message object
And `quotedMessage` should be populated if it's a reply
And `prevMessage` should be populated with the previous message in the channel
And `history` should be initialized as an empty array

#### Scenario: Extract Hashtags from Message
Given a message with text "Buy #BTC and #ETH now! #crypto"
When the message is processed
Then `hashTags` should be ["#btc", "#eth", "#crypto"]

#### Scenario: Detect Media in Message
Given a message with a photo attachment
When the message is processed
Then `hasMedia` should be true
And `mediaType` should be "photo"

#### Scenario: Track Reply Chain
Given a message that is a reply to another message
And the reply is part of a threaded conversation with a top message
When the message is processed
Then `quotedMessage.id` should be the ID of the direct reply target
And `quotedMessage.message` should be the text of the direct reply target
And `quotedMessage.hasMedia` should indicate if the reply target has media
And `quotedMessage.replyToTopId` should be the ID of the first message in the reply chain
And `quotedMessage.replyToTopMessage` should contain the ID and text of the top message (if available in DB)

#### Scenario: Serialize Raw Message Data
Given any message from Telegram
When the message is processed
Then the `raw` field should contain a plain object representation of the mtcute Message
And the raw data should be serializable to MongoDB (no special mtcute object properties)
And the raw data should include basic message properties (id, date, text)
And the raw data should include chat info (id, title, username)
And the raw data should include media metadata (if present)
And the raw data should NOT include large binary data

#### Scenario: Publish message to stream with channelId
Given a message has been persisted to the database
When the telegram-service publishes the message event to the Redis stream
Then the event payload MUST include `channelId`
And the event payload MUST include `messageId`
And the event payload MUST include `exp` (expiry timestamp)
And it MUST atomically update the message document to append a history entry
And the history entry MUST record the event emission details
And the database update MUST succeed even if stream publishing fails

### Requirement: Handle Message Deletion
The system MUST handle message deletion events by marking the message as deleted in the database.

#### Scenario: Mark Message as Deleted
Given a message exists in `telegram-messages`
When a deletion event is received for that message
Then the `deletedAt` field should be updated with the current timestamp

### Requirement: Error Handling and Monitoring
The system MUST capture unhandled exceptions and report them to Sentry.

#### Scenario: Capture Exception
Given an error occurs during message processing
Then the error should be logged
And the error stack should be sent to Sentry

### Requirement: Manage Telegram Channels
The system MUST load active channels from the `telegram-channels` collection into memory on startup. Channels MUST have `channelId` and `accessHash` pre-populated.

#### Scenario: Load Channels with Required Fields
Given a document in `telegram-channels` with `isActive: true`
When the service starts
Then it should verify the document has `channelId` and `accessHash` fields
And it should load the channel into memory for monitoring
And it should NOT attempt to resolve these fields from a URL

#### Scenario: Skip Channels with Missing Required Fields
Given a document in `telegram-channels` with `isActive: true` but missing `channelId` or `accessHash`
When the service starts
Then it should log a warning for that channel
And it should NOT load that channel into memory
And it should continue loading other valid channels

#### Scenario: Listen to Active Channels
Given multiple active channels in `telegram-channels`
When the service is running
Then it should only process messages from those channels
And it should filter messages by `channelId`

### Requirement: Connect to Telegram Network
The system MUST be able to establish a persistent connection to the Telegram MTProto network using provided credentials.

#### Scenario: Successful Connection
Given valid `API_ID`, `API_HASH`, and `SESSION` string
When the service starts
Then it should successfully connect to Telegram
And it should log the current user's info

#### Scenario: Invalid Credentials
Given invalid `API_ID` or `API_HASH`
When the service starts
Then it should throw an authentication error
And the service should exit or retry with backoff

### Requirement: Listen to Channel Messages
The system MUST listen for new text messages from a specific list of Telegram channels.

#### Scenario: Receive Message from Monitored Channel
Given the service is connected
And the `telegram-channels` collection contains an active document for "@signal_channel"
When a new text message is posted in "@signal_channel"
Then the system should capture the message content, date, and sender
And the message should be passed to the processing pipeline

#### Scenario: Ignore Message from Unmonitored Channel
Given the service is connected
And the `telegram-channels` collection does NOT contain an active document for "@random_channel"
When a new message is posted in "@random_channel"
Then the system should ignore the message

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

### Requirement: Extract Message Metadata
The system MUST extract and store comprehensive metadata from each message including hashtags, media information, and raw message structure.

#### Scenario: Extract hashtags from message text
Given a message with text containing hashtags (e.g., "#BTC", "#eth", "#CRYPTO")
When the message is processed
Then all hashtags should be extracted using regex pattern `/#[a-zA-Z0-9_]+/g`
And all hashtags should be converted to lowercase
And the `hashTags` field should be an array of extracted hashtags
And if no hashtags are found, `hashTags` should be an empty array

#### Scenario: Detect and classify media types
Given a message with media attachment
When the message is processed
Then `hasMedia` should be set to true
And `mediaType` should be determined based on `message.media.type`
And `mediaType` should be one of: photo, video, document, audio, voice, sticker, animation, other
And for animations, the system should check `documentAttributeAnimated` in raw data
And if no media is present, `hasMedia` should be false and `mediaType` should be undefined

#### Scenario: Serialize mtcute message for storage
Given any message from the mtcute library
When the message is processed
Then the raw message should be serialized to a plain JavaScript object
And the serialization should handle mtcute's special object properties
And the serialized object should be storable in MongoDB
And if serialization fails, a minimal object with `id` and `error` should be stored
And the serialization should include the TL object if available (`message.raw`)

### Requirement: Index Messages by Telegram Channel ID
The system MUST index messages by `channelId` (Telegram's identifier) rather than `channelCode` (internal identifier) for optimal query performance.

#### Scenario: Create unique index on channelId and messageId
Given the `telegram-messages` collection
Then there MUST be a unique compound index on `{channelId, messageId}`
And this index MUST prevent duplicate messages from the same channel
And queries filtering by `channelId` and `messageId` MUST use this index

#### Scenario: Query messages by channelId
Given messages from multiple channels in the database
When querying for messages from a specific channel
Then the query MUST filter by `channelId` (not `channelCode`)
And the query MUST use the `{channelId, messageId}` index for performance

### Requirement: Push Notification for Media Detection
The system MUST support optional push notifications when media is detected in messages, configurable via `NOTIFICATION_ALERT_WHEN_TELEGRAM_MESSAGE_HAS_MEDIA` setting.

#### Scenario: Send notification when media detected and enabled
Given `NOTIFICATION_ALERT_WHEN_TELEGRAM_MESSAGE_HAS_MEDIA` is set to `true`
And PushSafer API key is configured
When a message with media (photo, video, etc.) is processed
Then a push notification MUST be sent to all devices
And the notification message MUST be `{channelCode} - {mediaType} detected in message`
And the notification title MUST be `Telegram Media Alert`
And the notification MUST vibrate the device
And the trace token MUST be `telegram-{channelCode}-{messageId}`

#### Scenario: No notification when config disabled
Given `NOTIFICATION_ALERT_WHEN_TELEGRAM_MESSAGE_HAS_MEDIA` is set to `false` or not set
When a message with media is processed
Then no push notification should be sent
And message processing should continue normally

#### Scenario: No notification when no media
Given `NOTIFICATION_ALERT_WHEN_TELEGRAM_MESSAGE_HAS_MEDIA` is set to `true`
When a message without media is processed
Then no push notification should be sent

#### Scenario: Graceful handling of notification failures
Given `NOTIFICATION_ALERT_WHEN_TELEGRAM_MESSAGE_HAS_MEDIA` is set to `true`
When a message with media is processed
And the push notification service fails
Then the error MUST be logged
And the error MUST be reported to Sentry
And message processing MUST continue successfully
And the message MUST still be persisted to the database

