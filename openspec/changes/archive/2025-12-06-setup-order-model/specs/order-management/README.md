# Order Management Capability

## Purpose
Provides the Order data model and repository for tracking virtual trading orders within the system. Orders represent trading intentions derived from Telegram messages and coordinate execution with the executor-service.

## Responsibility
- Define Order entity structure with all execution parameters
- Provide OrderRepository for CRUD operations
- Maintain database indexes for efficient order queries
- Support multiple orders per message
- Track order-to-message and order-to-account relationships

## Key Concepts

### Virtual Orders
Orders in this system are **virtual** - they represent trading intentions tracked by trade-manager. The actual order execution and state management is handled by the executor-service (tvbot). This separation allows:
- Audit trail of trading decisions
- Coordination between message interpretation and execution
- Flexibility in order lifecycle management

### Order Relationships
- **Message → Orders:** One-to-many (one message can generate multiple orders)
- **Account → Orders:** One-to-many (one account can have multiple orders)
- **Order → Message:** Many-to-one (each order links to exactly one message)

### Order Types
- **LONG:** Buy/long position
- **SHORT:** Sell/short position

### Execution Types
- **market:** Execute immediately at current market price
- **limit:** Pending order at specified price

## Data Flow
```
Telegram Message
    ↓
interpret-service (translates to commands)
    ↓
trade-manager (creates Order records)
    ↓
executor-service (executes actual trades)
```

## Main Components

### Order Model (`libs/dal/src/models/order.model.ts`)
Defines the Order entity with:
- Message association (messageId, channelId)
- Account association (accountId)
- Order identity (orderId - unique)
- Order parameters (type, executionType, symbol, lotSize, price)
- Symbol resolution (symbol, actualSymbol)
- History tracking (placeholder for future use)

### OrderRepository (`libs/dal/src/repositories/order.repository.ts`)
Provides data access methods:
- `findByOrderId(orderId)` - Find by unique order ID
- `findByMessage(messageId, channelId)` - Find all orders for a message
- `findByAccountId(accountId)` - Find all orders for an account
- Plus inherited BaseRepository methods (create, update, delete, etc.)

### Database Indexes
- **(messageId, channelId)** - Compound index for message-based queries
- **accountId** - Index for account-based queries
- **orderId** - Unique index for order identity and fast lookup

## Relationships to Other Capabilities

### Dependencies
- **telegram-message-model:** Orders reference Telegram messages via messageId and channelId
- **account-management:** Orders reference accounts via accountId
- **service-foundation:** Uses BaseRepository pattern

### Dependents
- **trade-manager:** Will use Order model to track virtual orders
- **Future executor integration:** Will reference orders for execution coordination

## Usage Examples

### Creating an Order
```typescript
const orderRepo = new OrderRepository();
const order: Order = {
  messageId: 12345,
  channelId: '-1001234567890',
  accountId: 'account-123',
  orderId: uid.rnd(), // Using short-unique-id
  type: OrderType.LONG,
  executionType: OrderExecutionType.market,
  symbol: 'BTCUSD',
  lotSize: 0.1,
  price: 50000,
  history: []
};
await orderRepo.create(order);
```

### Finding Orders for a Message
```typescript
const orders = await orderRepo.findByMessage(12345, '-1001234567890');
// Returns all orders created from this message
```

### Finding Orders for an Account
```typescript
const accountOrders = await orderRepo.findByAccountId('account-123');
// Returns all orders for this account
```

## Testing
Integration tests verify:
- Order creation with all required fields
- Finding orders by orderId, message, and account
- OrderId uniqueness enforcement
- Proper index usage
- Data cleanup and isolation

## Future Enhancements
- Order status tracking (pending, filled, cancelled, rejected)
- Order history population with lifecycle events
- Synchronization with executor-service actual orders
- TTL index for automatic order cleanup
- Order aggregation and reporting queries
