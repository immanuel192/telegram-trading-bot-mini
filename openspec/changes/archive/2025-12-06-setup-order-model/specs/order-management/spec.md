# order-management Specification

## Purpose
Defines the Order data model and repository for managing virtual trading orders. Orders represent trading intentions derived from Telegram messages and coordinate execution requests to the executor-service.

## ADDED Requirements

### Requirement: Order Data Model
The system SHALL provide an Order entity to represent virtual trading orders with their execution parameters and message associations.

#### Scenario: Order structure
- **WHEN** an Order is created
- **THEN** it SHALL include the following fields:
  - `_id`: MongoDB ObjectId (optional)
  - `messageId`: Telegram message ID that triggered this order (number)
  - `channelId`: Telegram channel ID where the message originated (string)
  - `accountId`: Account identifier for executor-service (string)
  - `orderId`: Unique order identifier generated using short-unique-id package (string)
  - `type`: Order direction - LONG or SHORT (OrderType enum)
  - `executionType`: Execution method - market or limit (OrderExecutionType enum)
  - `symbol`: Symbol resolved by interpret-service (string)
  - `actualSymbol`: Actual symbol name resolved after executor runs (string, optional)
  - `lotSize`: Position size in lots (number)
  - `price`: Entry price for market orders or limit price for limit orders (number)
  - `history`: Array for tracking order lifecycle events (initially empty array)

#### Scenario: Order type enumeration
- **WHEN** defining order direction types
- **THEN** the system SHALL support:
  - `LONG`: Long position (buy)
  - `SHORT`: Short position (sell)
- **AND** the enum SHALL be named `OrderType`

#### Scenario: Order execution type enumeration
- **WHEN** defining order execution types
- **THEN** the system SHALL support:
  - `market`: Execute immediately at market price
  - `limit`: Pending order at specified price
- **AND** the enum SHALL be named `OrderExecutionType`

#### Scenario: Message association
- **WHEN** an Order is created
- **THEN** it SHALL be associated with a specific Telegram message via messageId and channelId
- **AND** one message MAY generate multiple orders
- **AND** the combination of (messageId, channelId) SHALL be indexed for efficient querying

#### Scenario: Account association
- **WHEN** an Order is created
- **THEN** it SHALL reference an accountId
- **AND** the accountId SHALL match the executor-service account identifier
- **AND** the accountId field SHALL be indexed for efficient querying

#### Scenario: Order ID generation
- **WHEN** generating an orderId
- **THEN** the system SHALL use the short-unique-id package
- **AND** the orderId SHALL be unique across all orders
- **AND** the orderId field SHALL have a unique index

#### Scenario: Symbol resolution
- **WHEN** an Order is created
- **THEN** it SHALL include a `symbol` field with the symbol name resolved by interpret-service
- **AND** it MAY include an `actualSymbol` field populated after executor-service resolves the final symbol name
- **AND** the `actualSymbol` field SHALL be optional

#### Scenario: Order history tracking
- **WHEN** an Order is created
- **THEN** it SHALL include a `history` field as an empty array
- **AND** the history structure SHALL be defined for future use
- **AND** history population logic is out of scope for this change

### Requirement: Order Repository
The system SHALL provide an OrderRepository for CRUD operations on Order entities.

#### Scenario: Find orders by message
- **WHEN** searching for orders by messageId and channelId
- **THEN** the repository SHALL return all matching Orders
- **AND** the query SHALL use the compound index on (messageId, channelId)

#### Scenario: Find orders by account
- **WHEN** searching for orders by accountId
- **THEN** the repository SHALL return all matching Orders
- **AND** the query SHALL use the index on accountId

#### Scenario: Find order by orderId
- **WHEN** searching for an order by orderId
- **THEN** the repository SHALL return the matching Order or null
- **AND** the query SHALL use the unique index on orderId

#### Scenario: Repository follows base pattern
- **WHEN** implementing OrderRepository
- **THEN** it SHALL extend BaseRepository<Order>
- **AND** it SHALL use the COLLECTIONS.ORDERS collection name

### Requirement: Order Database Indexes
The system SHALL create database indexes on Order fields for efficient querying.

#### Scenario: Message compound index
- **WHEN** the database schema is initialized
- **THEN** a compound index SHALL be created on (messageId, channelId)
- **AND** the index SHALL support efficient lookups of orders by message

#### Scenario: Account index
- **WHEN** the database schema is initialized
- **THEN** an index SHALL be created on the accountId field
- **AND** the index SHALL support efficient lookups of orders by account

#### Scenario: OrderId unique index
- **WHEN** the database schema is initialized
- **THEN** a unique index SHALL be created on the orderId field
- **AND** the index SHALL enforce orderId uniqueness
- **AND** the index SHALL support efficient lookups by orderId

### Requirement: Order Model Code Standards
The Order model SHALL follow the project's coding standards and architecture rules.

#### Scenario: File documentation
- **WHEN** viewing the Order model file
- **THEN** it SHALL include a header comment describing:
  - Purpose of the file
  - Exported entities
  - Core data flow

#### Scenario: Model location
- **WHEN** organizing the codebase
- **THEN** the Order model SHALL reside in `libs/dal/src/models/order.model.ts`
- **AND** the OrderRepository SHALL reside in `libs/dal/src/repositories/order.repository.ts`

#### Scenario: Field documentation
- **WHEN** defining Order fields
- **THEN** each field SHALL have JSDoc comments explaining its purpose
- **AND** relationships to other entities SHALL be documented
- **AND** the virtual nature of orders SHALL be documented

### Requirement: Order Repository Testing
The OrderRepository SHALL have comprehensive integration tests.

#### Scenario: Test coverage
- **WHEN** testing OrderRepository
- **THEN** integration tests SHALL verify:
  - create() successfully creates an order with all required fields
  - findByOrderId() returns the correct order
  - findByOrderId() returns null for non-existent orderId
  - findByMessage() returns all orders for a specific message
  - findByMessage() returns empty array when no orders exist
  - findByAccountId() returns all orders for a specific account
  - findByAccountId() returns empty array when no orders exist
  - orderId uniqueness is enforced by the database

#### Scenario: Test data cleanup
- **WHEN** running integration tests
- **THEN** tests SHALL clean up created orders after execution
- **AND** tests SHALL use isolated test data to avoid conflicts

### Requirement: Order Model Export
The Order model and related types SHALL be properly exported from the DAL package.

#### Scenario: Model exports
- **WHEN** importing from @telegram-trading-bot-mini/dal
- **THEN** the following SHALL be available:
  - Order interface
  - OrderType enum
  - OrderExecutionType enum
  - OrderRepository class

#### Scenario: Collection enum update
- **WHEN** adding the Order model
- **THEN** the COLLECTIONS enum SHALL include an ORDERS entry
- **AND** the collection name SHALL be 'orders'
