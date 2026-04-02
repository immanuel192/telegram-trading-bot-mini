# telegram-message-model Spec Delta

## MODIFIED Requirements

### Requirement: Message History Types
The MessageHistoryTypeEnum SHALL include types for tracking message translation flow.

#### Scenario: Translation request tracking
- **WHEN** trade-manager sends a message to interpret-service for translation
- **THEN** it SHALL create a history entry with type `TRANSLATE_MESSAGE`
- **AND** the history entry SHALL include:
  - `type`: `MessageHistoryTypeEnum.TRANSLATE_MESSAGE`
  - `createdAt`: Current timestamp
  - `fromService`: `'trade-manager'`
  - `targetService`: `'interpret-service'`
  - `streamEvent.messageEventType`: `MessageType.TRANSLATE_MESSAGE_REQUEST`
  - `streamEvent.messageId`: Redis Stream message ID

#### Scenario: Translation result tracking
- **WHEN** trade-manager receives a translation result from interpret-service
- **THEN** it SHALL create a history entry with type `TRANSLATE_RESULT`
- **AND** the history entry SHALL include:
  - `type`: `MessageHistoryTypeEnum.TRANSLATE_RESULT`
  - `createdAt`: Current timestamp
  - `fromService`: `'interpret-service'`
  - `targetService`: `'trade-manager'`
  - `streamEvent.messageEventType`: `MessageType.TRANSLATE_MESSAGE_RESULT`
  - `streamEvent.messageId`: Redis Stream message ID
  - `errorMessage`: Optional error if translation failed

#### Scenario: Enum values
- **WHEN** accessing MessageHistoryTypeEnum
- **THEN** it SHALL include the following values:
  - `NEW_MESSAGE = 'new-message'`
  - `EDIT_MESSAGE = 'edit-message'`
  - `TRANSLATE_MESSAGE = 'translate-message'` (NEW)
  - `TRANSLATE_RESULT = 'translate-result'` (NEW)
