# Message Payload Alignment

## Purpose

This capability aligns the `TRANSLATE_MESSAGE_RESULT` message payload structure with the AI response schema from `gemini-response-schema.ts`, ensuring consistency between AI output and inter-service communication.

## ADDED Requirements

### Requirement: AI Response Schema Alignment
The system SHALL structure `TRANSLATE_MESSAGE_RESULT` payload to match Gemini AI response schema exactly.

#### Scenario: Publish AI response fields directly
- **WHEN** interpret-service publishes `TRANSLATE_MESSAGE_RESULT`
- **THEN** payload includes `isCommand`, `confidence`, `reason`, `command`, and `extraction` fields matching AI schema
- **AND** payload preserves `promptId`, `traceToken`, `receivedAt`, `messageId`, `channelId` for tracing

#### Scenario: Include extraction object when command detected
- **WHEN** AI classifies message as trading command (`isCommand=true`)
- **THEN** payload includes `extraction` object with all AI-provided fields
- **AND** extraction includes: `symbol`, `isImmediate`, `meta`, `entry`, `entryZone`, `stopLoss`, `takeProfits`, `closeIds`, `validationError`

#### Scenario: Null extraction for non-commands
- **WHEN** AI classifies message as non-command (`isCommand=false`)
- **THEN** payload includes `extraction=null`
- **AND** payload still includes `command=NONE`, `confidence`, and `reason`

### Requirement: Command Enum Definition
The system SHALL define CommandEnum matching AI response schema command types.

#### Scenario: Export CommandEnum from shared-utils
- **WHEN** services need to reference command types
- **THEN** `CommandEnum` is exported from `@telegram-trading-bot-mini/shared/utils`
- **AND** enum includes: LONG, SHORT, MOVE_SL, SET_TP_SL, CLOSE_BAD_POSITION, CLOSE, CLOSE_ALL, CANCEL, NONE

#### Scenario: Validate command enum in payload
- **WHEN** `TRANSLATE_MESSAGE_RESULT` is validated
- **THEN** `command` field must be one of CommandEnum values
- **AND** validation rejects messages with invalid command values

### Requirement: Extraction Schema Validation
The system SHALL validate extraction object structure in message payload.

#### Scenario: Validate required extraction fields
- **WHEN** `extraction` is not null
- **THEN** payload validation requires `symbol` and `isImmediate` fields
- **AND** validation allows optional fields: `entry`, `entryZone`, `stopLoss`, `takeProfits`, `closeIds`, `validationError`

#### Scenario: Validate take profit structure
- **WHEN** `extraction.takeProfits` is present
- **THEN** validation ensures it is an array of objects
- **AND** each object has optional `price` or `pips` number fields

#### Scenario: Validate meta object structure
- **WHEN** `extraction.meta` is present
- **THEN** validation ensures it is an object
- **AND** object has optional boolean fields: `reduceLotSize`, `adjustEntry`

## MODIFIED Requirements

### Requirement: Trade Manager Payload Consumption
The system SHALL update trade-manager to consume new payload structure.

#### Scenario: Extract AI response fields from payload
- **WHEN** trade-manager consumes `TRANSLATE_MESSAGE_RESULT`
- **THEN** handler extracts `isCommand`, `confidence`, `reason`, `command`, `extraction` from payload
- **AND** handler logs AI confidence and command type
- **AND** handler uses extraction data for future trade execution logic

#### Scenario: Handle extraction object for commands
- **WHEN** payload has `isCommand=true` and non-null `extraction`
- **THEN** handler can access all extraction fields: `symbol`, `entry`, `entryZone`, `stopLoss`, `takeProfits`, `closeIds`
- **AND** handler translates AI command to internal trade actions (future implementation)

#### Scenario: Handle non-command messages
- **WHEN** payload has `isCommand=false` and `extraction=null`
- **THEN** handler logs message as non-command with reason
- **AND** handler skips trade execution logic

### Requirement: Interpret Service Payload Publishing
The system SHALL update interpret-service to publish new payload structure.

#### Scenario: Map AI response to payload directly
- **WHEN** interpret-service receives AI translation result
- **THEN** service maps AI response fields directly to `TRANSLATE_MESSAGE_RESULT` payload
- **AND** service does not transform or interpret AI response
- **AND** service preserves all AI fields: `isCommand`, `confidence`, `reason`, `command`, `extraction`

#### Scenario: Validate payload before publishing
- **WHEN** interpret-service constructs `TRANSLATE_MESSAGE_RESULT` payload
- **THEN** service validates payload against `TranslateMessageResultPayloadSchema`
- **AND** service rejects invalid payloads with clear error message

## Related Capabilities

- **ai-translation-service**: Defines AI response schema that payload aligns with
- **message-events**: Extends TRANSLATE_MESSAGE_RESULT message type
- **stream-publisher**: Used to publish aligned payload structure
