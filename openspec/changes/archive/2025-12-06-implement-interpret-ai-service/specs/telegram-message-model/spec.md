## MODIFIED Requirements

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
