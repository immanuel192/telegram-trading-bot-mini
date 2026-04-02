## MODIFIED Requirements

### Requirement: Account Data Model
The system SHALL provide an Account entity to represent trading accounts with their configurations.

#### Scenario: Account structure
- **WHEN** an Account is created
- **THEN** it SHALL include the following fields:
  - `_id`: MongoDB ObjectId (optional)
  - `accountId`: Unique business identifier (string) - **MUST match executor-service accountId**
  - `description`: Optional account description (string)
  - `isActive`: Boolean flag for account status
  - `telegramChannelCode`: Associated Telegram channel (string)
  - `accountType`: Type of account (enum: MT5 or API)

#### Scenario: Account type enumeration
- **WHEN** defining account types
- **THEN** the system SHALL support:
  - `MT5`: MetaTrader 5 account type
  - `API`: API-based account type

#### Scenario: AccountId cross-service consistency
- **WHEN** documenting the `accountId` field
- **THEN** it SHALL include a comment explaining:
  - This accountId should be the same with the executor-service accountId
  - This ensures cross-service account identification and consistency
