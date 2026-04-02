# account-management Specification Delta

## ADDED Requirements

### Requirement: Broker Specifications in Account Model
The Account model SHALL support broker-specific trading specifications to enable proper position sizing and order validation.

#### Scenario: BrokerSpecs structure
- **WHEN** defining broker specifications
- **THEN** the BrokerSpecs interface SHALL include:
  - `lot_size`: Units per 1 lot (contract size) as number
  - `min_lot`: Minimum allowed volume as number
  - `lot_step`: Allowed volume increments (e.g., 0.01, 0.1, 1) as number
  - `tick_size`: Smallest price movement as number
  - `tick_value`: USD value per tick per 1 lot as number
  - `leverage`: Account leverage as number
  - `currency`: Account currency code (e.g., "USD", "EUR", "AUD") as string

#### Scenario: Account model extension
- **WHEN** extending the Account model
- **THEN** it SHALL include:
  - `brokerSpecs?: BrokerSpecs` as an optional field
- **AND** all existing fields SHALL remain unchanged

#### Scenario: Creating account with broker specs
- **WHEN** creating a new account with broker specifications
- **THEN** the system SHALL:
  - Accept all BrokerSpecs fields
  - Persist all fields to MongoDB
  - Return the account with brokerSpecs populated

#### Scenario: Creating account without broker specs
- **WHEN** creating a new account without broker specifications
- **THEN** the system SHALL:
  - Accept the account without brokerSpecs field
  - Persist the account successfully
  - Return the account with brokerSpecs as undefined

#### Scenario: Updating account broker specs
- **WHEN** updating an existing account to add broker specifications
- **THEN** the system SHALL:
  - Accept the brokerSpecs object
  - Update the account document
  - Preserve all other account fields
  - Return the updated account

#### Scenario: Updating account broker specs partially
- **WHEN** updating specific broker spec fields
- **THEN** the system SHALL:
  - Update only the specified fields
  - Preserve other brokerSpecs fields
  - Maintain data consistency

#### Scenario: Retrieving account with broker specs
- **WHEN** fetching an account by accountId
- **THEN** the system SHALL:
  - Return the account with brokerSpecs if present
  - Return the account with brokerSpecs as undefined if not present
  - Include all brokerSpecs fields when present

## Field Definitions

### lot_size (Contract Size)
- **Purpose**: Defines how many units of the base currency are in one lot
- **Example**: For EURUSD, lot_size = 100000 means 1 lot = 100,000 EUR
- **Usage**: Calculate position size in base currency units

### min_lot (Minimum Volume)
- **Purpose**: Smallest allowed position size
- **Example**: min_lot = 0.01 means minimum trade is 0.01 lots
- **Usage**: Validate order sizes before execution

### lot_step (Volume Increment)
- **Purpose**: Allowed increments for position sizing
- **Example**: lot_step = 0.01 means can trade 0.01, 0.02, 0.03 lots, but not 0.015
- **Usage**: Round calculated lot sizes to valid increments

### tick_size (Price Increment)
- **Purpose**: Smallest price movement allowed
- **Example**: tick_size = 0.00001 for EURUSD (1 pip = 0.0001, 1 tick = 0.00001)
- **Usage**: Validate price levels (SL, TP, entry)

### tick_value (Tick Value)
- **Purpose**: USD value of one tick movement for one lot
- **Example**: tick_value = 1.0 means 1 tick move on 1 lot = $1
- **Usage**: Calculate profit/loss and risk

### leverage
- **Purpose**: Account leverage multiplier
- **Example**: leverage = 100 means 1:100 leverage
- **Usage**: Calculate margin requirements

### currency
- **Purpose**: Account base currency
- **Example**: currency = "USD" or "EUR" or "AUD"
- **Usage**: Currency conversion and P&L calculations

## Testing Requirements

### Requirement: Broker Specs CRUD Operations
The AccountRepository SHALL support full CRUD operations for broker specifications.

#### Scenario: Integration test for create with specs
- **WHEN** running integration tests
- **THEN** the test SHALL:
  - Create an account with full brokerSpecs
  - Verify all fields are persisted correctly
  - Verify data types match schema

#### Scenario: Integration test for update specs
- **WHEN** running integration tests
- **THEN** the test SHALL:
  - Create an account without brokerSpecs
  - Update to add brokerSpecs
  - Verify specs are added correctly
  - Verify other fields unchanged

#### Scenario: Integration test for retrieve with specs
- **WHEN** running integration tests
- **THEN** the test SHALL:
  - Create an account with brokerSpecs
  - Fetch by accountId
  - Verify all brokerSpecs fields match
  - Verify no data loss

#### Scenario: Integration test for account without specs
- **WHEN** running integration tests
- **THEN** the test SHALL:
  - Create an account without brokerSpecs
  - Fetch by accountId
  - Verify brokerSpecs is undefined
  - Verify account is valid

## Data Validation

### Requirement: Broker Specs Field Validation
When broker specifications are provided, all fields SHALL be validated for correctness.

#### Scenario: Numeric field validation
- **WHEN** validating broker specs
- **THEN** all numeric fields SHALL:
  - Be positive numbers (> 0)
  - Not be NaN or Infinity
  - Be within reasonable ranges for trading

#### Scenario: Currency code validation
- **WHEN** validating currency field
- **THEN** it SHALL:
  - Be a non-empty string
  - Follow standard currency code format (3 uppercase letters)
  - Be a recognized currency code (USD, EUR, GBP, AUD, etc.)

#### Scenario: Lot step consistency
- **WHEN** validating lot_step
- **THEN** it SHALL:
  - Be less than or equal to min_lot
  - Be a divisor of min_lot (e.g., min_lot=0.01, lot_step=0.01 is valid)
  - Allow valid lot sizes (min_lot + N * lot_step)

## Cross-References

- **Related to**: `message-events` (brokerSpecs used for position sizing in command interpretation)
- **Extends**: Existing `account-management` spec
- **Depends on**: Existing Account model and AccountRepository
