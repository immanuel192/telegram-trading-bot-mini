# message-events Spec Delta

## MODIFIED Requirements

### Requirement: TRANSLATE_MESSAGE_RESULT Event
The system SHALL publish translation results with support for multiple commands per message.

#### Scenario: Payload includes commands array
- **WHEN** TRANSLATE_MESSAGE_RESULT is published
- **THEN** the payload includes a `commands` field containing an array of TranslationResult objects
- **AND** the array contains at least one item

#### Scenario: Backward compatibility fields maintained
- **WHEN** TRANSLATE_MESSAGE_RESULT is published
- **THEN** the payload still includes legacy fields (isCommand, command, confidence, reason, extraction)
- **AND** these fields reflect the first command in the array for backward compatibility
- **AND** consumers can migrate to use `commands` array at their own pace
- **AND** logging/tracing/metrics report ALL commands for complete observability

#### Scenario: Single command message
- **WHEN** a message contains one command
- **THEN** the `commands` array has one item
- **AND** legacy fields match this single command

#### Scenario: Multiple command message
- **WHEN** a message contains multiple commands
- **THEN** the `commands` array has multiple items
- **AND** logs include ALL commands with their details
- **AND** Sentry traces include attributes for EACH command
- **AND** consumers using `commands` array can process all commands

### Requirement: TRANSLATE_MESSAGE_REQUEST Event
The system SHALL publish translation requests without accountId for performance optimization.

#### Scenario: Payload excludes accountId
- **WHEN** TRANSLATE_MESSAGE_REQUEST is published
- **THEN** the payload does NOT include an `accountId` field
- **AND** only includes promptId for AI prompt selection

#### Scenario: One request per unique promptId
- **WHEN** multiple accounts share the same promptId
- **THEN** only one TRANSLATE_MESSAGE_REQUEST is published for that promptId
- **AND** the request is not duplicated per account

## ADDED Requirements

### Requirement: Commands Array Validation
The system SHALL validate the commands array in TRANSLATE_MESSAGE_RESULT payload.

#### Scenario: Minimum one command required
- **WHEN** building TRANSLATE_MESSAGE_RESULT payload
- **THEN** the handler validates that commands array has at least one item
- **AND** throws an error if the array is empty

#### Scenario: Each command is valid
- **WHEN** validating commands array
- **THEN** each command has required fields (isCommand, command, confidence, reason)
- **AND** extraction is present when isCommand is true
- **AND** extraction is undefined when isCommand is false

### Requirement: Remove accountId from Translation Messages
The system SHALL remove accountId from TRANSLATE_MESSAGE_REQUEST and TRANSLATE_MESSAGE_RESULT for performance optimization.

#### Scenario: TRANSLATE_MESSAGE_REQUEST without accountId
- **WHEN** trade-manager publishes TRANSLATE_MESSAGE_REQUEST
- **THEN** the payload does NOT include accountId field
- **AND** only includes promptId for AI prompt selection
- **AND** message size is reduced

#### Scenario: TRANSLATE_MESSAGE_RESULT without accountId
- **WHEN** interpret-service publishes TRANSLATE_MESSAGE_RESULT
- **THEN** the payload does NOT include accountId field
- **AND** consumers do not depend on accountId

#### Scenario: Deduplicate requests by promptId
- **WHEN** multiple accounts have the same promptId
- **THEN** trade-manager publishes only one TRANSLATE_MESSAGE_REQUEST
- **AND** reduces message volume in Redis streams
