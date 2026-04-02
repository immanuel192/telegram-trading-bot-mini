# telegram-message-model Specification

## Purpose
TBD - created by archiving change refine-telegram-service-infrastructure. Update Purpose after archive.
## Requirements
### Requirement: TelegramMessage Schema
The `TelegramMessage` model MUST store all relevant message data in structured fields without redundant raw data storage.

#### Scenario: Store message with structured fields only
**Given** a new Telegram message is received  
**When** the message is persisted to MongoDB  
**Then** all relevant fields MUST be extracted and stored in structured format  
**And** the `raw` field MUST NOT be populated  
**And** the document MUST include: `channelCode`, `channelId`, `messageId`, `message`, `hasMedia`, `mediaType`, `hashTags`, `sentAt`, `receivedAt`, `history`

### Requirement: Track Message Edits
The system MUST track when messages are edited, preserving both original and updated content.

#### Scenario: Message is edited by user
**Given** a message exists in the database  
**When** an edit event is received from Telegram  
**Then** the `originalMessage` field MUST be set to the previous `message` value  
**And** the `message` field MUST be updated with the new text  
**And** the `updatedAt` field MUST be set to the current timestamp  
**And** a history entry with type `EDIT_MESSAGE` MUST be added

#### Scenario: Message is edited multiple times
**Given** a message has already been edited once  
**When** another edit event is received  
**Then** the `originalMessage` field MUST remain unchanged (preserves first version)  
**And** the `message` field MUST be updated with the latest text  
**And** the `updatedAt` field MUST be updated to the current timestamp  
**And** a new history entry with type `EDIT_MESSAGE` MUST be added

### Requirement: Message History Event Types
The `TelegramMessageHistory` model MUST distinguish between different types of processing events using an enum and support optional audit notes.

#### Scenario: New message history entry
**Given** a new message is processed  
**When** a history entry is created  
**Then** the `type` field MUST be set to `MessageHistoryTypeEnum.NEW_MESSAGE`  
**And** the entry MUST include `createdAt`, `fromService`, `targetService`
**And** the entry MAY include an optional `notes` field for audit purposes

#### Scenario: Edit message history entry
**Given** a message edit is processed  
**When** a history entry is created  
**Then** the `type` field MUST be set to `MessageHistoryTypeEnum.EDIT_MESSAGE`  
**And** the entry MUST include `createdAt`, `fromService`, `targetService`
**And** the entry MAY include an optional `notes` field for audit purposes

#### Scenario: Translation message history entry with AI response notes
**Given** a message translation is processed by interpret-service
**When** a history entry is created with type `TRANSLATE_RESULT`
**Then** the entry MUST include `createdAt`, `fromService`, `targetService`
**And** the entry MUST include a `notes` field containing the JSON-stringified AI response
**And** the notes MUST be parseable back to the original AI response structure

### Requirement: MessageHistoryTypeEnum Definition
The system MUST define an enum for history event types that is extensible for future event types.

#### Scenario: Enum values are defined
**Given** the `MessageHistoryTypeEnum` is imported  
**Then** it MUST include the value `NEW_MESSAGE = 'new-message'`  
**And** it MUST include the value `EDIT_MESSAGE = 'edit-message'`  
**And** it MUST be exportable from the dal models package

### Requirement: Live Price Capture
The system MUST capture the live market price when processing the first symbols encountered in a translation result, storing it as a baseline for audit purposes.

#### Scenario: Capture live price during translation processing
**Given** a `TRANSLATE_MESSAGE_RESULT` is being processed by `trade-manager`  
**When** the message does NOT already have a `meta.livePrice`  
**And** the result contains at least one command with a symbol  
**Then** the system MUST fetch the current mid-price (bid/ask average) from the price cache  
**And** the `meta.livePrice` field MUST be updated atomically using dot notation  
**And** subsequent commands for the same message MUST NOT overwrite the existing `livePrice`
