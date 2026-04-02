# Spec: Telegram Client Integration

## ADDED Requirements

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
The system MUST persist all processed messages to the `telegram-messages` collection with enriched context.

#### Scenario: Save New Message
Given a new message from an active channel
When the message is processed
Then it should be saved to `telegram-messages`
And `sentAt` should be the timestamp from the Telegram message
And `receivedAt` should be the current system time
And `quotedMessage` should be populated if it's a reply
And `prevMessage` should be populated with the previous message in the channel

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
The system MUST load active channels from the `telegram-channels` collection into memory on startup.

#### Scenario: Resolve New Channel
Given a document in `telegram-channels` with `isActive: true` and missing `channelId`
When the service starts
Then it should use the `url` to resolve the `channelId` and `accessHash` via mtcute
And it should update the document in the database with the resolved values

#### Scenario: Listen to Active Channels
Given multiple active channels in `telegram-channels`
When the service is running
Then it should only process messages from those resolved channels

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
