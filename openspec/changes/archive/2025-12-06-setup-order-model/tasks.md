# Tasks: Setup Order Model

## Phase 1: Order Model Definition
**Capability:** order-management

### Task 1.1: Create Order Model
- [x] **File:** `libs/dal/src/models/order.model.ts`

Create the Order model with:
- File header documentation (Purpose, Exports, Core Flow)
- OrderType enum (LONG, SHORT)
- OrderExecutionType enum (market, limit)
- Order interface extending Document with all specified fields:
  - _id (optional ObjectId)
  - messageId (number)
  - channelId (string)
  - accountId (string)
  - orderId (string) - with JSDoc noting short-unique-id generation
  - type (OrderType)
  - executionType (OrderExecutionType)
  - symbol (string)
  - actualSymbol (optional string)
  - lotSize (number)
  - price (number)
  - history (empty array, typed as any[] for now)
- JSDoc comments for each field explaining purpose and relationships
- Document that orders are virtual and executor-service manages actual orders

**Validation:**
- File compiles without errors
- All enums and interfaces are properly typed
- JSDoc comments are present and descriptive

### Task 1.2: Update COLLECTIONS Enum
- [x] **File:** `libs/dal/src/infra/db.ts`

- Add `ORDERS = 'orders'` to the COLLECTIONS enum
- Maintain alphabetical ordering within the enum

**Validation:**
- Enum compiles without errors
- Collection name follows naming convention

### Task 1.3: Create Database Indexes
- [x] **File:** `libs/dal/src/infra/db.ts`

In the `initSchemas` function, add index creation for orders:
- Compound index on (messageId, channelId)
- Index on accountId
- Unique index on orderId

Follow the existing pattern used for other collections.

**Validation:**
- Indexes are created in the correct format
- Code follows existing patterns in the file

### Task 1.4: Export Order Model
- [x] **File:** `libs/dal/src/models/index.ts`

Add exports for:
- Order interface
- OrderType enum
- OrderExecutionType enum

**Validation:**
- Exports are accessible from @telegram-trading-bot-mini/dal
- No circular dependencies introduced

## Phase 2: Order Repository Implementation
**Capability:** order-management

### Task 2.1: Create OrderRepository
- [x] **File:** `libs/dal/src/repositories/order.repository.ts`

Create OrderRepository class that:
- Extends BaseRepository<Order>
- Implements protected get collection() returning getSchema<Order>(COLLECTIONS.ORDERS)
- Implements findByOrderId(orderId: string): Promise<Order | null>
- Implements findByMessage(messageId: number, channelId: string): Promise<Order[]>
- Implements findByAccountId(accountId: string): Promise<Order[]>
- Includes file header documentation
- Includes JSDoc for each method

**Validation:**
- Repository compiles without errors
- All methods have proper type signatures
- Follows BaseRepository pattern

### Task 2.2: Export OrderRepository
- [x] **File:** `libs/dal/src/index.ts`

Add export for OrderRepository class.

**Validation:**
- OrderRepository is accessible from @telegram-trading-bot-mini/dal
- No build errors

## Phase 3: Integration Tests
**Capability:** order-management

### Task 3.1: Create OrderRepository Integration Tests
- [x] **File:** `libs/dal/test/integration/order.repository.spec.ts`

Create integration tests that verify:
- **Test Setup:**
  - Connect to test database before all tests
  - Clean up orders collection before each test
  - Close database connection after all tests
- **Create Order:**
  - Successfully creates an order with all required fields
  - Generated _id is populated
  - All fields are persisted correctly
- **Find by OrderId:**
  - Returns correct order when orderId exists
  - Returns null when orderId doesn't exist
- **Find by Message:**
  - Returns all orders for a specific (messageId, channelId)
  - Returns empty array when no orders exist for message
  - Handles multiple orders per message correctly
- **Find by AccountId:**
  - Returns all orders for a specific accountId
  - Returns empty array when no orders exist for account
- **OrderId Uniqueness:**
  - Attempting to create orders with duplicate orderId throws error
  - Unique index is enforced

Use the existing test patterns from other repository tests (e.g., account.repository.spec.ts).

**Validation:**
- All tests pass
- Tests use proper setup/teardown
- Tests are isolated and don't affect each other
- Test coverage includes success and failure cases

### Task 3.2: Run All DAL Tests
- [x] **Command:** `npx nx test dal`

Ensure all existing tests still pass with the new Order model.

**Validation:**
- All tests pass
- No regressions introduced
- Build completes successfully

## Phase 4: Validation
**Capability:** order-management

### Task 4.1: Validate OpenSpec
- [x] **Command:** `openspec validate setup-order-model --strict`

Run OpenSpec validation to ensure:
- All spec requirements are properly formatted
- No validation errors
- Proposal structure is correct

**Validation:**
- Validation passes with no errors
- All requirements have at least one scenario
- Spec deltas are properly structured

### Task 4.2: Build Verification
- [x] **Command:** `npx nx build dal`

Ensure the DAL package builds successfully with the new Order model.

**Validation:**
- Build completes without errors
- No TypeScript compilation errors
- All exports are properly generated

## Summary
This change adds the Order model to the DAL layer with:
- ✅ Order model with enums and proper typing
- ✅ Database indexes for efficient querying
- ✅ OrderRepository with basic CRUD operations
- ✅ Comprehensive integration tests
- ✅ Proper exports and documentation

The Order model provides the foundation for trade-manager to track virtual orders before delegating execution to the executor-service.
