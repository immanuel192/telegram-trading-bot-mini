# account-configuration Spec Delta

## MODIFIED Requirements

### Requirement: Account Data Model
The system SHALL provide an Account entity to represent trading accounts with their configurations, prompt rule associations, and trading preferences.

#### Scenario: Account structure
- **WHEN** an Account is created
- **THEN** it SHALL include the following fields:
  - `_id`: MongoDB ObjectId (optional)
  - `accountId`: Unique business identifier (string) - **MUST match executor-service accountId**
  - `description`: Optional account description (string)
  - `isActive`: Boolean flag for account status
  - `telegramChannelCode`: Associated Telegram channel (string)
  - `accountType`: Type of account (enum: MT5 or API)
  - `promptId`: Reference to PromptRule for AI translation (string, required)
  - `brokerSpecs`: Broker-specific specifications (optional)
  - `brokerConfig`: Broker connection configuration (optional)
  - `configs`: Trading configuration options (optional)
  - `symbols`: Symbol-specific settings (optional)

#### Scenario: Trading configuration options
- **WHEN** an Account includes trading configurations
- **THEN** the `configs` field SHALL be an optional object containing:
  - `closeOppositePosition`: Boolean flag (optional, default true) indicating whether to close opposite positions when opening a new position

#### Scenario: Symbol-specific settings
- **WHEN** an Account includes symbol-specific configurations
- **THEN** the `symbols` field SHALL be an optional object with:
  - Keys: Symbol names (string)
  - Values: Symbol configuration objects containing:
    - `forceStopLossByPercentage`: Number (optional) to force stop loss by percentage

### Requirement: Broker Configuration
The system SHALL provide a BrokerConfig interface for storing broker connection details and authentication credentials.

#### Scenario: BrokerConfig structure
- **WHEN** a BrokerConfig is defined
- **THEN** it SHALL include the following fields:
  - `exchangeCode`: Exchange/broker identifier (string, required)
  - `apiKey`: API key for authentication (string, required)
  - `apiSecret`: API secret for authentication (string, optional)
  - `isSandbox`: Sandbox/testnet mode flag (boolean, optional, default false)
  - `accountId`: Broker account identifier (string, optional) - **RENAMED from oandaAccountId**
  - `serverUrl`: Custom server URL (string, optional)
  - `jwtToken`: JWT token for web terminal authentication (string, optional)
  - `refreshToken`: Refresh token for web terminal authentication (string, optional)

#### Scenario: Web terminal authentication
- **WHEN** using web terminal brokers (XM, Exness)
- **THEN** the BrokerConfig SHALL support:
  - `jwtToken` for session authentication
  - `refreshToken` for token renewal
- **AND** these fields SHALL be optional
- **AND** they SHALL be used instead of loginId

#### Scenario: Generic account identifier
- **WHEN** configuring broker accounts
- **THEN** the `accountId` field SHALL be used for all brokers (not just Oanda)
- **AND** it SHALL replace the deprecated `oandaAccountId` field
- **AND** it SHALL be optional for backward compatibility

### Requirement: Account Database Indexes
The system SHALL create database indexes on Account fields for efficient querying.

#### Scenario: BrokerConfig accountId index
- **WHEN** the database schema is initialized
- **THEN** an index SHALL be created on `brokerConfig.accountId`
- **AND** the index SHALL support efficient lookups by broker account ID

#### Scenario: Message-based indexes
- **WHEN** the database schema is initialized
- **THEN** compound indexes SHALL be created for:
  - `messageId` and `channelId` (compound)
  - `orderId` (single)
  - `traceToken` (single)
  - `symbol` (single)
- **AND** these indexes SHALL support efficient message and order tracking queries

### Requirement: Account Model Testing
The Account model SHALL have comprehensive tests covering new configuration fields.

#### Scenario: Trading configuration persistence
- **WHEN** creating an Account with `configs` field
- **THEN** the configuration SHALL be properly persisted
- **AND** it SHALL be retrievable with correct values
- **AND** accounts without `configs` SHALL remain valid (backward compatibility)

#### Scenario: Symbol-specific configuration persistence
- **WHEN** creating an Account with `symbols` field
- **THEN** the symbol configurations SHALL be properly persisted
- **AND** they SHALL be retrievable with correct values
- **AND** multiple symbols MAY be configured independently

#### Scenario: BrokerConfig token fields persistence
- **WHEN** creating an Account with `jwtToken` and `refreshToken` in BrokerConfig
- **THEN** the tokens SHALL be properly persisted
- **AND** they SHALL be retrievable for authentication
- **AND** existing accounts without tokens SHALL remain valid
