# telegram-client Spec Delta

## MODIFIED Requirements

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

## REMOVED Requirements

### ~~Requirement: Resolve Channel from URL~~
**REMOVED**: The system no longer resolves `channelId` and `accessHash` from URLs at runtime. Users must provide these values directly when creating channel documents.

#### ~~Scenario: Resolve New Channel~~
**REMOVED**: This scenario is no longer applicable as URL resolution is removed.

## ADDED Requirements

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
