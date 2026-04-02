# trade-manager Spec Delta

## ADDED Requirements

### Requirement: Process Multiple Commands from Translation Result
The system SHALL process all commands in the `commands` array from TRANSLATE_MESSAGE_RESULT events.

#### Scenario: Iterate through commands array
- **WHEN** TranslateResultHandler receives a TRANSLATE_MESSAGE_RESULT event
- **THEN** the handler extracts the `commands` array from the payload
- **AND** iterates through each command in the array
- **AND** processes each command independently

#### Scenario: Handle single command message
- **WHEN** the `commands` array contains one item
- **THEN** the handler processes that single command
- **AND** behavior is identical to legacy single-command handling

#### Scenario: Handle multiple command message
- **WHEN** the `commands` array contains multiple items
- **THEN** the handler processes each command in sequence
- **AND** each command is logged independently
- **AND** metrics are emitted for each command

#### Scenario: Access explicit trading side
- **WHEN** processing a command with extraction data
- **THEN** the handler can access `extraction.side` field
- **AND** the side value is 'buy' or 'sell' or undefined
- **AND** the side is used for trade execution logic

### Requirement: Backward Compatibility with Legacy Fields
The system SHALL support both legacy flattened fields and new commands array during migration period.

#### Scenario: Prefer commands array when available
- **WHEN** both legacy fields and `commands` array are present in payload
- **THEN** the handler uses the `commands` array
- **AND** legacy fields are ignored

#### Scenario: Fallback to legacy fields if commands missing
- **WHEN** `commands` array is not present in payload (old messages)
- **THEN** the handler falls back to legacy fields (isCommand, command, extraction)
- **AND** processes as a single command
- **AND** logs a warning about using legacy format

#### Scenario: Validate commands array is not empty
- **WHEN** `commands` array is present
- **THEN** the handler validates it has at least one item
- **AND** throws an error if the array is empty

### Requirement: Enhanced Logging for Multiple Commands
The system SHALL provide detailed logging for multi-command scenarios.

#### Scenario: Log command count
- **WHEN** processing a TRANSLATE_MESSAGE_RESULT event
- **THEN** the handler logs the total number of commands detected
- **AND** includes this in the initial log message

#### Scenario: Log each command details
- **WHEN** iterating through commands
- **THEN** the handler logs each command with:
  - Command index (1-based)
  - Command type
  - Symbol
  - Trading side (if available)
  - Confidence score

#### Scenario: Log multi-command summary
- **WHEN** all commands are processed
- **THEN** the handler logs a summary including:
  - Total commands processed
  - Number of successful commands
  - Number of failed commands (if any)

### Requirement: Metrics for Multiple Commands
The system SHALL emit metrics for each command in multi-command scenarios.

#### Scenario: Emit per-command metrics
- **WHEN** processing each command
- **THEN** the handler emits a metric with:
  - Metric name: 'trade.command.received'
  - Command type as attribute
  - Symbol as attribute
  - Command index as attribute

#### Scenario: Emit multi-command metric
- **WHEN** processing a message with multiple commands
- **THEN** the handler emits a metric:
  - Metric name: 'trade.multi_command.received'
  - Command count as value
  - Channel ID as attribute

#### Scenario: Overall processing duration unchanged
- **WHEN** emitting overall processing duration metric
- **THEN** the metric measures from original receivedAt to completion
- **AND** includes all commands in the measurement

## ADDED Requirements (Performance Optimization)

### Requirement: Publish One Request Per Unique PromptId
The system SHALL publish one TRANSLATE_MESSAGE_REQUEST per unique promptId instead of per account.

#### Scenario: Group accounts by promptId
- **WHEN** NewMessageHandler processes a NEW_MESSAGE event
- **THEN** it groups active accounts by their promptId
- **AND** publishes one TRANSLATE_MESSAGE_REQUEST per unique promptId
- **AND** does NOT publish one request per account

#### Scenario: Multiple accounts with same promptId
- **WHEN** 3 accounts have the same promptId
- **THEN** only 1 TRANSLATE_MESSAGE_REQUEST is published
- **AND** message volume is reduced by 66%

#### Scenario: Multiple accounts with different promptIds
- **WHEN** 3 accounts have 2 different promptIds (2 accounts share one, 1 has unique)
- **THEN** 2 TRANSLATE_MESSAGE_REQUESTs are published
- **AND** each request corresponds to one unique promptId

### Requirement: Remove accountId from Translation Flow
The system SHALL remove accountId from TRANSLATE_MESSAGE_REQUEST and TRANSLATE_MESSAGE_RESULT handling.

#### Scenario: NewMessageHandler does not include accountId
- **WHEN** building TRANSLATE_MESSAGE_REQUEST payload
- **THEN** the payload does NOT include accountId field
- **AND** only includes promptId for AI prompt selection

#### Scenario: TranslateResultHandler does not expect accountId
- **WHEN** processing TRANSLATE_MESSAGE_RESULT
- **THEN** the handler does NOT extract accountId from payload
- **AND** does NOT use accountId in logging or metrics

#### Scenario: History entries store promptId only
- **WHEN** adding translation history to telegram message
- **THEN** the history notes include promptId
- **AND** do NOT include accountId
- **AND** maintain audit trail with promptId reference
