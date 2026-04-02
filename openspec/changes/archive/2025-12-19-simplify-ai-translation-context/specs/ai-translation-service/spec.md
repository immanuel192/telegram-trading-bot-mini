## MODIFIED Requirements

### Requirement: AI Service Interface
The system SHALL provide a unified interface for AI-powered message translation that focuses on intent detection and data extraction only, without order validation.

#### Scenario: Translate message with intent detection and extraction
- **WHEN** translateMessage is called with messageText and message context (prevMessage, quotedMessage, quotedFirstMessage)
- **THEN** the system returns a TranslationResult containing command type, extracted symbol, and trading data
- **AND** the system does NOT validate against order state
- **AND** the TranslationResult structure remains unchanged (isCommand, command, confidence, reason, extraction)

#### Scenario: Handle non-command messages
- **WHEN** a message does not contain trading signal information
- **THEN** the system returns command="NONE" with isCommand=false

#### Scenario: Extract symbol without order validation
- **WHEN** a message contains "#eth sl entry"
- **THEN** the system extracts symbol="ETHUSDT" and command="MOVE_SL"
- **AND** the system does NOT check if an ETHUSDT order exists
- **AND** the system returns isCommand=true (trade-manager will validate later)

### Requirement: Message Context Structure
The system SHALL use message context containing only message-related fields, excluding order state.

#### Scenario: Build context with message fields only
- **WHEN** buildMessageContext is called
- **THEN** the context contains prevMessage, quotedMessage, and quotedFirstMessage
- **AND** the context does NOT contain orders field

#### Scenario: Use quoted message for symbol inference
- **WHEN** message is "cancel it" and quotedMessage contains "#btc long"
- **THEN** AI can infer symbol from quotedMessage
- **AND** AI does NOT need orders to make this inference

## REMOVED Requirements

### Requirement: Order Context Integration
**Reason**: Moving order validation to trade-manager for deterministic logic
**Migration**: trade-manager will fetch and validate orders after receiving AI translation result

#### Scenario: Fetch account-specific orders (REMOVED)
- This validation now happens in trade-manager

#### Scenario: Validate symbol matches order (REMOVED)
- This validation now happens in trade-manager

#### Scenario: Check order executed status (REMOVED)
- This validation now happens in trade-manager

### Requirement: Order Repository Dependency
**Reason**: interpret-service no longer needs direct database access to orders
**Migration**: Remove OrderRepository injection from TranslateRequestHandler

## ADDED Requirements

### Requirement: Stateless Message Translation
The system SHALL translate messages without maintaining or requiring order state.

#### Scenario: Translate same message consistently
- **WHEN** the same message is translated multiple times
- **THEN** the system returns identical intent and extraction results
- **AND** the result is independent of current order state

#### Scenario: Intent detection for context-dependent commands
- **WHEN** message is "cancel #btc"
- **THEN** AI detects command="CANCEL" and symbol="BTCUSDT"
- **AND** AI returns isCommand=true
- **AND** AI does NOT determine if cancellation is valid (trade-manager decides)

#### Scenario: Extract all trading data from message
- **WHEN** message is "long #eth 3500 sl 3600 tp 3400-3300"
- **THEN** AI extracts symbol="ETHUSDT", entry=3500, stopLoss=3600, takeProfits=[3400, 3300]
- **AND** AI returns command="LONG" with isCommand=true
- **AND** AI does NOT validate if these values are reasonable for current market

### Requirement: Simplified Prompt Structure
The system SHALL use prompts focused on pattern recognition and extraction without validation logic.

#### Scenario: Prompt contains extraction rules only
- **WHEN** AI prompt is loaded
- **THEN** prompt contains symbol extraction rules, intent detection keywords, and number parsing logic
- **AND** prompt does NOT contain order validation rules or conditional logic

#### Scenario: Reduced prompt size
- **WHEN** AI prompt is measured
- **THEN** prompt size is approximately 400-500 lines (50% reduction from previous ~1000 lines)
- **AND** token count is approximately 4000-5000 tokens
