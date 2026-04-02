# order-tracking Spec Delta

## MODIFIED Requirements

### Requirement: Order Data Model
The system SHALL provide an Order entity to represent virtual trading orders with message associations and order linking capabilities.

#### Scenario: Order structure
- **WHEN** an Order is created
- **THEN** it SHALL include the following fields:
  - `_id`: MongoDB ObjectId (optional)
  - `messageId`: Telegram message ID that triggered this order (string)
  - `channelId`: Telegram channel ID where the message originated (string)
  - `accountId`: Account identifier for executor-service (string)
  - `orderId`: Unique order identifier generated using short-unique-id package (string)
  - `type`: Order direction - LONG or SHORT (OrderType enum)
  - `executionType`: Execution method - market or limit (OrderExecutionType enum)
  - `symbol`: Symbol resolved by interpret-service (string)
  - `actualSymbol`: Actual symbol name resolved after executor runs (string, optional)
  - `lotSize`: Position size in lots (number)
  - `price`: Entry price for market orders or limit price for limit orders (number)
  - `linkedOrders`: Array of related order IDs (string array, optional)
  - `history`: Array for tracking order lifecycle events (initially empty array)

#### Scenario: Message association tracking
- **WHEN** an Order is created
- **THEN** it SHALL include `messageId` field with the original Telegram message ID
- **AND** it SHALL include `channelId` field with the original Telegram channel ID
- **AND** these fields SHALL enable tracing orders back to their originating messages
- **AND** one message MAY generate multiple orders across different accounts

#### Scenario: Linked orders tracking
- **WHEN** an Order is created
- **THEN** it MAY include a `linkedOrders` field
- **AND** `linkedOrders` SHALL be an optional array of order IDs (strings)
- **AND** it SHALL default to an empty array if not provided
- **AND** it SHALL enable tracking relationships between orders (e.g., DCA orders, partial closes)

#### Scenario: Order linking use cases
- **WHEN** orders are linked
- **THEN** the system SHALL support:
  - DCA (Dollar Cost Averaging) orders linked to initial entry
  - Partial close orders linked to main position
  - Related orders from the same signal
  - Order modifications linked to original order
- **AND** linked orders SHALL be queryable for analysis

### Requirement: Order Database Indexes
The system SHALL create database indexes on Order fields for efficient message-based and order-based queries.

#### Scenario: Message compound index
- **WHEN** the database schema is initialized
- **THEN** a compound index SHALL be created on (messageId, channelId)
- **AND** the index SHALL support efficient lookups of orders by originating message
- **AND** the index SHALL enable querying all orders generated from a specific Telegram message

#### Scenario: Existing indexes preservation
- **WHEN** adding new indexes
- **THEN** existing indexes SHALL be preserved:
  - `orderId` unique index
  - `status` index
  - `createdAt` index
  - `accountId` and `status` compound index

### Requirement: Order Repository
The system SHALL provide an OrderRepository with methods for message-based order queries.

#### Scenario: Find orders by message
- **WHEN** querying orders by message
- **THEN** the repository SHALL provide a method:
  ```typescript
  findByMessage(messageId: string, channelId: string): Promise<Order[]>
  ```
- **AND** it SHALL use the compound index on (messageId, channelId)
- **AND** it SHALL return all orders associated with the message
- **AND** it SHALL return an empty array if no orders exist

#### Scenario: Find linked orders
- **WHEN** querying linked orders
- **THEN** the repository SHALL provide a method:
  ```typescript
  findLinkedOrders(orderId: string): Promise<Order[]>
  ```
- **AND** it SHALL find all orders where `linkedOrders` array contains the given orderId
- **AND** it SHALL enable bidirectional order relationship queries

### Requirement: Order Model Testing
The Order model SHALL have comprehensive integration tests covering message tracking and order linking.

#### Scenario: Message-based order creation
- **WHEN** creating orders with messageId and channelId
- **THEN** integration tests SHALL verify:
  - Orders are created with correct message associations
  - Multiple orders can share the same messageId and channelId
  - Orders are queryable by message
  - Compound index is used for queries

#### Scenario: Linked orders functionality
- **WHEN** creating orders with linkedOrders
- **THEN** integration tests SHALL verify:
  - Orders are created with correct linkedOrders array
  - Empty array is default when linkedOrders not provided
  - Linked orders are queryable
  - Multiple orders can be linked together

#### Scenario: Order relationship queries
- **WHEN** querying order relationships
- **THEN** integration tests SHALL verify:
  - findByMessage returns all orders for a message
  - findLinkedOrders returns all related orders
  - Order relationships are maintained correctly
  - Queries perform efficiently with indexes
