# order-management Specification

## Purpose
TBD - created by archiving change setup-order-model. Update Purpose after archive.
## Requirements
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
  - `lotSize`: Initial position size in lots (number)
  - **`lotSizeRemaining`: Current remaining units in the position (number, optional)**
  - `price`: Entry price for market orders or limit price for limit orders (number)
  - `history`: Array for tracking order lifecycle events (initially empty array)
  - `meta.takeProfitTiers`: Array of all validated and sorted take profit levels (each with `price` and optional `isUsed`)

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

### Requirement: Order History Command Tracking
The system SHALL track which command triggered each order history entry to provide better audit trail and debugging capability.

#### Scenario: Command field in history entry
- **WHEN** an order history entry is created
- **THEN** it SHALL include a `command` field of type `CommandEnum`
- **AND** the field SHALL indicate which command (LONG, SHORT, MOVE_SL, SET_TP_SL, CLOSE_BAD_POSITION, CLOSE_ALL, CANCEL, LIMIT_EXECUTED, NONE) triggered this history entry

#### Scenario: INTEND history with command
- **WHEN** an order is created from a LONG or SHORT command
- **THEN** the initial INTEND history entry SHALL include the `command` field set to the creating command (LONG or SHORT)
- **AND** the command SHALL be passed from `TranslateResultHandler` through `OrderService.createOrder()`

#### Scenario: Cleanup history with NONE command
- **WHEN** an automated cleanup job creates a history entry
- **THEN** the `command` field SHALL be set to `CommandEnum.NONE`
- **AND** this indicates the action was not triggered by a user command

### Requirement: Stale Pending Order Cleanup
The system SHALL automatically clean up orders that remain in PENDING status beyond a configured timeout to prevent orphaned orders from accumulating.

#### Scenario: Cleanup job execution
- **WHEN** the pending order cleanup job runs
- **THEN** it SHALL query all orders with `status = PENDING`
- **AND** it SHALL filter orders where `createdAt` is older than the configured timeout (default 1 minute)
- **AND** it SHALL process each stale order within a MongoDB transaction

#### Scenario: Order closure on cleanup
- **WHEN** a stale pending order is identified
- **THEN** the system SHALL:
  - Set `closedAt` to current timestamp
  - Update `status` to `OrderStatus.CLOSED`
  - Add a history entry with:
    - `status = OrderHistoryStatus.CANCELED`
    - `service = ServiceName.PENDING_ORDER_CLEANUP_JOB`
    - `traceToken = ''` (empty, as this is automated)
    - `messageId` and `channelId` copied from the order
    - `command = CommandEnum.NONE`
    - `info.reason` explaining the cleanup reason
- **AND** all updates SHALL be committed atomically in a single transaction

#### Scenario: Cleanup notification
- **WHEN** a stale order is cleaned up
- **AND** the order's `accountId` is in the job's notification whitelist
- **THEN** a push notification SHALL be sent with:
  - Title indicating stale order cleanup
  - Message containing: `orderId`, `symbol`, and `accountId`

#### Scenario: Notification whitelist control
- **WHEN** the cleanup job is configured
- **THEN** the job meta SHALL include a `notificationAccountIds` array
- **AND** only orders belonging to accounts in this array SHALL trigger notifications
- **AND** if the array is empty, no notifications SHALL be sent

#### Scenario: Configurable timeout
- **WHEN** the cleanup job is configured
- **THEN** the job meta SHALL include a `timeoutMinutes` field (default: 1)
- **AND** orders with `createdAt` older than `Date.now() - (timeoutMinutes * 60 * 1000)` SHALL be considered stale

#### Scenario: Query performance for MVP
- **WHEN** querying for pending orders
- **THEN** the system SHALL use the existing `status` index for the initial query
- **AND** the system SHALL filter by `createdAt` in-memory
- **AND** the code SHALL include a comment documenting the MVP assumption of few PENDING orders (\u003c100)
- **AND** the code SHALL include a TODO to consider a compound index `{status: 1, createdAt: 1}` if PENDING orders exceed 100

### Requirement: Atomic Order Creation and Linking
The system SHALL support creating orders and linking them to related orders (e.g., orphan orders) using atomic database operations, ensuring data consistency without requiring a global wrapping transaction.

#### Scenario: Create and Link to Orphan
- **WHEN** creating a new order (e.g., from a TAKE_PROFIT command)
- **AND** an "orphan" order exists (an order awaiting this specific link)
- **THEN** the system SHALL create the new order
- **AND** the system SHALL atomically receive the new order's ID
- **AND** the system SHALL atomically update the orphan order to reference the new order ID (e.g. using `$push`)

#### Scenario: Independent Commit
- **WHEN** the order creation process completes
- **THEN** the order data SHALL be visible to other services (eventual consistency)
- **AND** the operation SHALL NOT depend on the commit of a parent transaction loop

### Requirement: Multi-Tier Take Profit Storage
The system SHALL store all identified take profit levels from a signal to enable comprehensive monitoring.

#### Scenario: Persisting all TP levels
- **WHEN** an order is opened or updated by the executor-service
- **THEN** all normalized take profit levels SHALL be saved to the `meta.takeProfitTiers` field
- **AND** the legacy `tp` field SHALL continue to store the primary take profit (TP1) for backward compatibility

