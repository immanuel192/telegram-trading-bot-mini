# ai-translation-service Spec Delta

## MODIFIED Requirements

### Requirement: AI Service Interface
The system SHALL provide a unified interface for AI-powered message translation that supports multiple commands per message.

#### Scenario: Translate message with single command
- **WHEN** translateMessage is called with a message containing one trading command
- **THEN** the system returns an array with one TranslationResult containing classification and extraction

#### Scenario: Translate message with multiple commands
- **WHEN** translateMessage is called with a message containing multiple trading commands
- **THEN** the system returns an array with multiple TranslationResult items, each with its own classification and extraction

#### Scenario: Handle non-command messages
- **WHEN** a message is classified as NONE or non-command
- **THEN** the system returns an array with one TranslationResult where isCommand=false and extraction is undefined

### Requirement: AI Response Schema
The system SHALL define AI response schema as an array of command objects with explicit side information.

#### Scenario: Schema supports array of commands
- **WHEN** AI response is validated against AIResponseSchema
- **THEN** the schema accepts an array of command objects (minimum 1 item)

#### Scenario: Extraction includes trading side
- **WHEN** a command extraction is created
- **THEN** the extraction includes a `side` field with value 'buy' or 'sell'
- **AND** the side is explicitly set based on the command type (LONG=buy, SHORT=sell)

#### Scenario: Each command has complete information
- **WHEN** multiple commands are returned
- **THEN** each command has its own isCommand, command, confidence, reason, and extraction fields
- **AND** each command is independently valid

## ADDED Requirements

### Requirement: Translation Result Array Format
The system SHALL return translation results as an array to support multiple commands.

#### Scenario: Return type is array
- **WHEN** IAIService.translateMessage is called
- **THEN** the return type is Promise<TranslationResult[]>
- **AND** the array contains at least one item

#### Scenario: Single command returns single-item array
- **WHEN** a message contains only one command
- **THEN** the result array contains exactly one TranslationResult
- **AND** the result structure is identical to previous single-command format

#### Scenario: Empty or non-command returns single-item array
- **WHEN** a message is not a command
- **THEN** the result array contains one TranslationResult with command='NONE'
- **AND** isCommand is false

### Requirement: Explicit Trading Side
The system SHALL include explicit trading side in extraction data.

#### Scenario: LONG command sets side to buy
- **WHEN** a LONG command is extracted
- **THEN** extraction.side is set to 'buy'

#### Scenario: SHORT command sets side to sell
- **WHEN** a SHORT command is extracted
- **THEN** extraction.side is set to 'sell'

#### Scenario: Other commands may omit side
- **WHEN** a command like CLOSE_ALL, CANCEL, or MOVE_SL is extracted
- **THEN** extraction.side may be undefined or set based on context
- **AND** side is optional for non-directional commands

## REMOVED Requirements

### Requirement: Account-Specific Session Isolation
The system SHALL NOT use accountId for AI session caching (removed for performance optimization).

#### Scenario: Session cache key without accountId
- **WHEN** creating or retrieving an AI chat session
- **THEN** the cache key uses (channelId, promptId, promptHash) only
- **AND** does NOT include accountId
- **AND** sessions are shared across accounts with the same channel and prompt

#### Scenario: IAIService interface without accountId
- **WHEN** calling translateMessage method
- **THEN** the method signature does NOT include accountId parameter
- **AND** only requires channelId and promptId for session caching

#### Scenario: Gemini AI uses placeholder accountId
- **WHEN** Gemini AI service is used (preserved for future use)
- **THEN** it uses a hardcoded placeholder value 'default' for accountId
- **AND** session caching still works with the placeholder
- **AND** code is preserved without breaking changes
