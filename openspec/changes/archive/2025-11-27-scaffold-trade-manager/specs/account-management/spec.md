## ADDED Requirements

### Requirement: Account Data Model
The system SHALL provide an Account entity to represent trading accounts with their configurations.

#### Scenario: Account structure
- **WHEN** an Account is created
- **THEN** it SHALL include the following fields:
  - `_id`: MongoDB ObjectId (optional)
  - `accountId`: Unique business identifier (string)
  - `description`: Optional account description (string)
  - `isActive`: Boolean flag for account status
  - `telegramChannelCode`: Associated Telegram channel (string)
  - `accountType`: Type of account (enum: MT5 or API)

#### Scenario: Account type enumeration
- **WHEN** defining account types
- **THEN** the system SHALL support:
  - `MT5`: MetaTrader 5 account type
  - `API`: API-based account type

### Requirement: Account Repository
The system SHALL provide an AccountRepository for CRUD operations on Account entities.

#### Scenario: Find account by business ID
- **WHEN** searching for an account by accountId
- **THEN** the repository SHALL return the matching Account or null

#### Scenario: Find all active accounts
- **WHEN** querying for active accounts
- **THEN** the repository SHALL return all accounts where isActive is true

#### Scenario: Set account active status
- **WHEN** updating an account's active status
- **THEN** the repository SHALL update the isActive field and return true if modified

#### Scenario: Repository follows base pattern
- **WHEN** implementing AccountRepository
- **THEN** it SHALL extend BaseRepository<Account>
- **AND** it SHALL use the COLLECTIONS.ACCOUNT collection name

### Requirement: Account Model Code Standards
The Account model SHALL follow the project's coding standards and architecture rules.

#### Scenario: File documentation
- **WHEN** viewing the Account model file
- **THEN** it SHALL include a header comment describing:
  - Purpose of the file
  - Exported entities
  - Core data flow

#### Scenario: Model location
- **WHEN** organizing the codebase
- **THEN** the Account model SHALL reside in `libs/dal/src/models/account.model.ts`
- **AND** the AccountRepository SHALL reside in `libs/dal/src/repositories/account.repository.ts`

### Requirement: Account Repository Testing
The AccountRepository SHALL have comprehensive integration tests.

#### Scenario: Test coverage
- **WHEN** testing AccountRepository
- **THEN** integration tests SHALL verify:
  - findByAccountId returns correct account
  - findByAccountId returns null for non-existent account
  - findAllActive returns only active accounts
  - setActiveStatus updates the status correctly
  - setActiveStatus returns false when account not found
