# message-edit-handling Specification

## Purpose
TBD - created by archiving change refine-telegram-service-infrastructure. Update Purpose after archive.
## Requirements
### Requirement: Listen for Edit Message Events
The telegram-service MUST listen for message edit events from Telegram via mtcute.

#### Scenario: Edit event is received for monitored channel
**Given** the service is connected to Telegram  
**And** a channel is being monitored  
**When** a message in that channel is edited  
**Then** the edit event MUST be captured  
**And** the `handleEditMessage()` method MUST be called

#### Scenario: Edit event is received for unmonitored channel
**Given** the service is connected to Telegram  
**And** a channel is NOT being monitored  
**When** a message in that channel is edited  
**Then** the edit event MUST be ignored  
**And** no processing MUST occur

### Requirement: Update Message on Edit
The system MUST update the stored message when an edit event is received, preserving the original content.

#### Scenario: Edit event for existing message
**Given** a message exists in the database with `channelId` and `messageId`  
**When** an edit event is received for that message  
**Then** the system MUST find the existing message  
**And** the current `message` value MUST be stored in `originalMessage`  
**And** the `message` field MUST be updated with the new text  
**And** the `updatedAt` field MUST be set to the current timestamp  
**And** the updated message MUST be saved to the database

#### Scenario: Edit event for non-existent message
**Given** no message exists in the database for the given `channelId` and `messageId`  
**When** an edit event is received  
**Then** a warning MUST be logged  
**And** no database update MUST occur  
**And** no notification MUST be sent

### Requirement: Track Edit in History
The system MUST add a history entry when a message is edited.

#### Scenario: Successful edit processing
**Given** a message edit is processed successfully  
**When** the message is updated in the database  
**Then** a history entry MUST be added with type `EDIT_MESSAGE`  
**And** the history entry MUST include `createdAt`, `fromService`, `targetService`  
**And** the `fromService` MUST be `ServiceName.TELEGRAM_SERVICE`  
**And** the `targetService` MUST be empty or `ServiceName.TELEGRAM_SERVICE`

#### Scenario: Edit processing fails
**Given** a message edit is being processed  
**When** an error occurs during processing  
**Then** a history entry MUST be added with type `EDIT_MESSAGE`  
**And** the `errorMessage` field MUST contain the error details  
**And** the error MUST be logged  
**And** the error MUST be sent to Sentry

### Requirement: Notify on Message Edit
The system MUST send a push notification when a message is edited, showing both old and new content.

#### Scenario: Edit notification for message with media alert enabled
**Given** `NOTIFICATION_ALERT_WHEN_TELEGRAM_MESSAGE_HAS_MEDIA` is set to `yes`  
**And** a message is edited  
**When** the edit is processed  
**Then** a push notification MUST be sent  
**And** the notification title MUST be "Message Edited"  
**And** the notification message MUST include the channel code  
**And** the notification message MUST include the old message text  
**And** the notification message MUST include the new message text  
**And** the notification MUST include the trace token

#### Scenario: Edit notification failure
**Given** a message is edited  
**When** the push notification service fails  
**Then** the error MUST be logged  
**And** the message update MUST still succeed  
**And** the error MUST NOT prevent history tracking

### Requirement: Generate Trace Token for Edits
The system MUST generate and use a trace token for all edit-related logging and notifications.

#### Scenario: Trace token in edit logs
**Given** a message edit is being processed  
**When** any log statement is written  
**Then** the log MUST include a `traceToken` field  
**And** the trace token MUST be in the format `{messageId}{channelId}`

#### Scenario: Trace token in edit notification
**Given** a message edit notification is sent  
**When** the notification is created  
**Then** the notification MUST include the trace token  
**And** the trace token MUST match the format `{messageId}{channelId}`

