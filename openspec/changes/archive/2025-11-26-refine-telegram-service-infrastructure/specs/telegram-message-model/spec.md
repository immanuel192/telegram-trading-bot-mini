# Spec: Telegram Message Data Model

**Capability**: `telegram-message-model`  
**Related Change**: `refine-telegram-service-infrastructure`

## Overview

This spec defines the data model for Telegram messages, including message content, metadata, context (quoted/previous messages), and processing history.

## ADDED Requirements

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
The `TelegramMessageHistory` model MUST distinguish between different types of processing events using an enum.

#### Scenario: New message history entry
**Given** a new message is processed  
**When** a history entry is created  
**Then** the `type` field MUST be set to `MessageHistoryTypeEnum.NEW_MESSAGE`  
**And** the entry MUST include `createdAt`, `fromService`, `targetService`

#### Scenario: Edit message history entry
**Given** a message edit is processed  
**When** a history entry is created  
**Then** the `type` field MUST be set to `MessageHistoryTypeEnum.EDIT_MESSAGE`  
**And** the entry MUST include `createdAt`, `fromService`, `targetService`

### Requirement: MessageHistoryTypeEnum Definition
The system MUST define an enum for history event types that is extensible for future event types.

#### Scenario: Enum values are defined
**Given** the `MessageHistoryTypeEnum` is imported  
**Then** it MUST include the value `NEW_MESSAGE = 'new-message'`  
**And** it MUST include the value `EDIT_MESSAGE = 'edit-message'`  
**And** it MUST be exportable from the dal models package

## Data Model

### TelegramMessage Interface
```typescript
interface TelegramMessage extends Document {
  _id?: ObjectId;
  channelCode: string;
  channelId: string;
  messageId: number;
  message: string;
  originalMessage?: string;      // Added: Original text before first edit
  hasMedia: boolean;
  mediaType?: 'photo' | 'video' | 'document' | 'audio' | 'voice' | 'sticker' | 'animation' | 'other';
  hashTags: string[];
  quotedMessage?: {
    id: number;
    message: string;
    hasMedia: boolean;
    replyToTopId?: number;
    replyToTopMessage?: string;
  };
  prevMessage?: {
    id: number;
    message: string;
  };
  sentAt: Date;
  receivedAt: Date;
  updatedAt?: Date;              // Added: When message was last edited
  deletedAt?: Date;
  // raw: Record<string, any>;   // Removed
  meta?: {
    parsed?: any;
    tradeOrder?: any;
  };
  history: TelegramMessageHistory[];
}
```

### MessageHistoryTypeEnum
```typescript
enum MessageHistoryTypeEnum {
  NEW_MESSAGE = 'new-message',
  EDIT_MESSAGE = 'edit-message',
}
```

### TelegramMessageHistory Interface
```typescript
interface TelegramMessageHistory {
  type: MessageHistoryTypeEnum;  // Added: Distinguishes event types
  createdAt: Date;
  fromService: string;
  targetService: string;
  errorMessage?: string;
  streamEvent?: {
    messageEventType: string;
    messageId: string;
  };
}
```

## Validation Rules

1. `channelCode` and `channelId` MUST NOT be empty
2. `messageId` MUST be a positive integer
3. `message` MUST be a string (can be empty for media-only messages)
4. `originalMessage` MUST only be set when `updatedAt` is also set
5. `history` MUST be an array (can be empty)
6. Each history entry MUST have a `type` field

## Migration Considerations

- Existing documents with `raw` field: Field will be ignored; no migration required
- Existing documents without `type` in history: Will fail validation; migration script needed if strict validation is enforced
- Recommendation: Add `type` field to new history entries only; optionally migrate old entries later
