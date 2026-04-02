# Telegram Fetcher Testing App Specification

## Overview
The Telegram Fetcher is a standalone CLI testing application for collecting historical Telegram messages to support AI training data analysis for the `interpret-service`.

## ADDED Requirements

### Requirement: CLI Configuration Interface
The application MUST provide an interactive command-line interface for configuration.

#### Scenario: User provides all required configuration
**Given** the user runs the telegram-fetcher application  
**When** prompted for configuration  
**Then** the application MUST prompt for:
- Telegram API ID (required, numeric)
- Telegram Access Hash (required, string)
- Telegram session string (required, string)
- MongoDB connection URI (optional, default: `mongodb://mongo:27017/`)
- MongoDB database name (optional, default: `tele-fetcher`)
- Telegram channel link (required, string)
- Duration in days (optional, numeric, default: 30)

#### Scenario: User accepts default values
**Given** the user runs the telegram-fetcher application  
**When** prompted for optional configuration with defaults  
**Then** the application MUST use the default value when user presses Enter without input

#### Scenario: User provides invalid input
**Given** the user runs the telegram-fetcher application  
**When** prompted for required configuration  
**And** the user provides empty or invalid input  
**Then** the application MUST display a validation error and exit

---

### Requirement: Telegram Connection and Channel Resolution
The application MUST connect to Telegram and resolve the target channel.

#### Scenario: Successful Telegram connection
**Given** valid Telegram credentials are provided  
**When** the application attempts to connect  
**Then** the application MUST successfully authenticate using mtcute  
**And** log "Connected to Telegram" or similar success message

#### Scenario: Failed Telegram connection
**Given** invalid Telegram credentials are provided  
**When** the application attempts to connect  
**Then** the application MUST throw an error  
**And** display a user-friendly error message  
**And** exit with non-zero status code

#### Scenario: Channel resolution for topic URL
**Given** a valid topic URL format (e.g., `https://t.me/c/2899092445/1`)  
**When** the application resolves the channel  
**Then** the application MUST extract the channelId and topicId  
**And** resolve to get the accessHash  
**And** return both channelId and accessHash

#### Scenario: Channel resolution for invite link
**Given** a valid invite link format (e.g., `https://t.me/+IBAuBrj8sj05Mzk1`)  
**When** the application resolves the channel  
**Then** the application MUST extract the invite hash  
**And** resolve using the invite hash to get channelId and accessHash

#### Scenario: Invalid channel URL
**Given** an invalid or unsupported channel URL  
**When** the application attempts to resolve the channel  
**Then** the application MUST throw an error  
**And** display a user-friendly error message  
**And** exit with non-zero status code

---

### Requirement: MongoDB Connection and Schema Setup
The application MUST connect to MongoDB and create the necessary collection and indexes.

#### Scenario: Successful MongoDB connection
**Given** a valid MongoDB connection URI  
**When** the application attempts to connect  
**Then** the application MUST successfully connect to MongoDB  
**And** select or create the specified database  
**And** log "Connected to MongoDB" or similar success message

#### Scenario: Failed MongoDB connection
**Given** an invalid MongoDB connection URI or unreachable server  
**When** the application attempts to connect  
**Then** the application MUST throw an error  
**And** display a user-friendly error message  
**And** exit with non-zero status code

#### Scenario: Collection and index creation
**Given** a successful MongoDB connection  
**When** the application initializes the schema  
**Then** the application MUST create or use the `telegram-messages` collection  
**And** create a unique compound index on `{ channelCode: 1, messageId: 1 }`  
**And** create an index on `{ sentAt: 1 }` for ordering

---

### Requirement: Historical Message Fetching
The application MUST fetch historical messages from Telegram within the specified time range.

#### Scenario: Fetch messages within duration
**Given** a resolved channel and duration of 30 days  
**When** the application fetches historical messages  
**Then** the application MUST calculate the start date as (current date - 30 days)  
**And** fetch all messages from the channel sent on or after the start date  
**And** fetch messages in batches if the API requires pagination

#### Scenario: Display progress during fetching
**Given** the application is fetching messages  
**When** processing batches of messages  
**Then** the application MUST display progress indicators such as:
- "Fetching messages..."
- "Processing batch X..."
- "Fetched Y messages so far"

#### Scenario: Extract message fields
**Given** a message received from Telegram  
**When** the application processes the message  
**Then** the application MUST extract:
- `messageId` (Telegram's message ID)
- `message` (text content)
- `sentAt` (timestamp as Date object)
- `replyToMessage` (if the message is a reply)

---

### Requirement: Message Context Population
The application MUST populate quotedMessage and prevMessage fields for context.

#### Scenario: Populate quotedMessage for replies
**Given** a message that is a reply to another message  
**When** the application processes the message  
**Then** the application MUST query the database for the quoted message by messageId  
**And** IF found, populate `quotedMessage` with `{ id, message }`  
**And** IF not found, leave `quotedMessage` undefined

#### Scenario: Populate prevMessage in single pass
**Given** messages are fetched in chronological order  
**When** the application processes each message  
**Then** the application MUST track the previous message in the batch  
**And** populate `prevMessage` with `{ id, message }` from the previous message  
**And** IF this is the first message, query the database for the latest message before this one

#### Scenario: Populate prevMessage in two passes
**Given** messages are NOT fetched in chronological order  
**When** the application completes the initial fetch  
**Then** the application MUST run a second pass  
**And** for each message, query the database for the latest message sent before it  
**And** update the `prevMessage` field accordingly

---

### Requirement: Message Persistence
The application MUST persist fetched messages to MongoDB.

#### Scenario: Batch insert messages
**Given** a batch of processed messages  
**When** the application persists to MongoDB  
**Then** the application MUST insert messages using batch operations  
**And** handle duplicate messages gracefully (upsert or skip)  
**And** log the number of messages persisted

#### Scenario: Simplified schema without production fields
**Given** a message to be persisted  
**When** creating the MongoDB document  
**Then** the application MUST NOT include:
- `receivedAt` field
- `deletedAt` field
- `meta` field
- `history` field
**And** MUST use `channelId` as the `channelCode` value

---

### Requirement: JSON Export with Timezone Conversion
The application MUST export stored messages to a JSON file with Sydney timezone formatting.

#### Scenario: Export all messages to JSON
**Given** messages are stored in MongoDB  
**When** the application enters Phase 2 (export)  
**Then** the application MUST query all messages for the channel  
**And** order results by `sentAt` ascending  
**And** export to a file named `[channelId].json`

#### Scenario: Transform message format
**Given** a message from MongoDB  
**When** transforming for export  
**Then** the application MUST create an object with:
- `sentAt`: ISO 8601 string in Sydney timezone (e.g., "2025-11-24T06:10:41+11:00")
- `message`: the message text
- `quotedMessage`: the quoted message text, or empty string if undefined
- `previousMessage`: the previous message text, or empty string if undefined

#### Scenario: Convert timezone to Sydney
**Given** a `sentAt` Date object in UTC  
**When** converting for export  
**Then** the application MUST convert to `Australia/Sydney` timezone  
**And** format as ISO 8601 with timezone offset  
**And** handle both AEDT (+11:00) and AEST (+10:00) depending on the date

#### Scenario: Write JSONL format
**Given** transformed message objects  
**When** writing to the output file  
**Then** the application MUST write each object as a single-line stringified JSON  
**And** write one object per line (JSONL format)  
**And** NOT wrap objects in an array

#### Scenario: Log export statistics
**Given** the export is complete  
**When** the application finishes  
**Then** the application MUST log:
- Total number of messages exported
- Output file path
- Success message

---

### Requirement: Error Handling and User Feedback
The application MUST handle errors gracefully and provide clear feedback.

#### Scenario: Critical error during connection
**Given** a critical error occurs during Telegram or MongoDB connection  
**When** the error is caught  
**Then** the application MUST log the error details  
**And** display a user-friendly error message  
**And** exit with a non-zero status code

#### Scenario: Non-critical error during fetching
**Given** a non-critical error occurs during message fetching  
**When** the error is caught  
**Then** the application MUST log the error  
**And** continue processing remaining messages  
**And** NOT exit prematurely

#### Scenario: Completion summary
**Given** the application completes successfully  
**When** all phases are done  
**Then** the application MUST display a summary including:
- Total messages fetched
- Total messages stored
- Total messages exported
- Output file path
- Completion message

---

## Data Models

### TelegramMessage (Simplified Schema)
```typescript
interface TelegramMessage {
  _id?: ObjectId;
  channelCode: string;      // Use channelId as code
  messageId: number;
  message: string;
  quotedMessage?: {
    id: number;
    message: string;
  };
  prevMessage?: {
    id: number;
    message: string;
  };
  sentAt: Date;
}
```

### Export Format
```typescript
interface ExportedMessage {
  sentAt: string;           // ISO 8601 in Sydney timezone
  message: string;
  quotedMessage: string;    // Default to ""
  previousMessage: string;  // Default to ""
}
```

## Dependencies
- **mtcute** (`@mtcute/core`, `@mtcute/node`): Telegram client library
- **mongodb**: MongoDB driver
- **date-fns-tz**: Timezone conversion utilities
- **readline**: Built-in Node.js module for CLI prompts

## Constraints
- This is a testing application; production-grade reliability is not required
- Code duplication from existing services is acceptable for isolation
- The application runs as a standalone CLI tool, not as a service
- No integration with existing services (`telegram-service`, `interpret-service`)
