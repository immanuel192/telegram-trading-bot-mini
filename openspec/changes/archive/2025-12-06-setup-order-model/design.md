# Design: Setup Order Model

## Overview
This design document outlines the Order model architecture, which serves as a virtual order tracking system bridging the gap between interpreted trading commands and executor-service requests.

## Architecture Context

### System Flow
```
Telegram Message → interpret-service → TRANSLATE_MESSAGE_RESULT
                                              ↓
                                        trade-manager
                                              ↓
                                     Creates Order(s) ← Order Model
                                              ↓
                                    executor-service (tvbot)
                                              ↓
                                    Actual Order Execution
```

### Virtual vs Actual Orders
**Important Distinction:**
- **Virtual Orders (Order model):** Tracked by trade-manager, represent trading intentions
- **Actual Orders:** Managed by executor-service (tvbot), represent real broker orders

The Order model provides:
- Audit trail of trading decisions
- Coordination between message interpretation and execution
- Ability to track multiple orders per message
- Foundation for future order lifecycle management

## Data Model Design

### Order Entity
```typescript
interface Order extends Document {
  _id?: ObjectId;
  
  // Message Association
  messageId: number;        // Telegram message that triggered this order
  channelId: string;        // Telegram channel ID
  
  // Account Association
  accountId: string;        // Links to executor-service account
  
  // Order Identity
  orderId: string;          // Unique ID (short-unique-id)
  
  // Order Parameters
  type: OrderType;          // LONG | SHORT
  executionType: OrderExecutionType;  // market | limit
  symbol: string;           // Symbol from interpret-service
  actualSymbol?: string;    // Resolved symbol from executor
  lotSize: number;          // Position size
  price: number;            // Entry/limit price
  
  // Audit Trail
  history: any[];           // Future: order lifecycle events
}
```

### Enumerations
```typescript
enum OrderType {
  LONG = 'LONG',
  SHORT = 'SHORT'
}

enum OrderExecutionType {
  market = 'market',
  limit = 'limit'
}
```

## Database Design

### Collection
- **Name:** `orders`
- **Location:** Same MongoDB database as other collections (MVP constraint)

### Indexes
1. **Compound Index (messageId, channelId)**
   - Purpose: Find all orders for a specific message
   - Use case: When processing message edits or tracking message-to-order relationships
   - Expected cardinality: Low (1-5 orders per message typically)

2. **Index (accountId)**
   - Purpose: Find all orders for a specific account
   - Use case: Account-level order queries, reporting
   - Expected cardinality: Medium-High (many orders per account)

3. **Unique Index (orderId)**
   - Purpose: Enforce orderId uniqueness, fast lookup by orderId
   - Use case: Order status checks, updates
   - Expected cardinality: 1:1 (one document per orderId)

### Index Selection Rationale
- **(messageId, channelId):** Compound index because these fields are always queried together
- **accountId:** Separate index for account-scoped queries
- **orderId:** Unique constraint + fast lookup for order-specific operations

## Repository Design

### OrderRepository
Extends `BaseRepository<Order>` and adds domain-specific methods:

```typescript
class OrderRepository extends BaseRepository<Order> {
  // Find by unique orderId
  findByOrderId(orderId: string): Promise<Order | null>
  
  // Find all orders for a message
  findByMessage(messageId: number, channelId: string): Promise<Order[]>
  
  // Find all orders for an account
  findByAccountId(accountId: string): Promise<Order[]>
}
```

Inherits from BaseRepository:
- `create(order: Order)`
- `findById(id: string)`
- `findOne(filter)`
- `findAll(filter)`
- `update(id, update)`
- `delete(id)`

## Design Decisions

### 1. Virtual Orders
**Decision:** Orders are virtual, not synchronized with executor-service
**Rationale:**
- Executor-service (tvbot) maintains its own order state
- Order model serves as intent tracking and audit trail
- Simpler architecture, no complex state synchronization
- Future: Can add sync logic if needed

**Trade-offs:**
- ✅ Simpler implementation
- ✅ No distributed state management complexity
- ❌ Potential for drift between virtual and actual orders
- ❌ Requires separate query to executor-service for actual order status

### 2. Multiple Orders Per Message
**Decision:** Support multiple orders per message via (messageId, channelId) relationship
**Rationale:**
- One message may contain multiple trading signals
- Different accounts may execute the same message differently
- Flexibility for future multi-leg strategies

**Trade-offs:**
- ✅ Flexible data model
- ✅ Supports complex trading scenarios
- ❌ Slightly more complex queries
- ❌ Need to handle order grouping in application logic

### 3. OrderId Generation
**Decision:** Use short-unique-id package for orderId generation
**Rationale:**
- Already installed in project
- Generates short, URL-safe IDs
- Sufficient uniqueness for order volume
- Human-readable for debugging

**Trade-offs:**
- ✅ Short, readable IDs
- ✅ No dependency on database auto-increment
- ❌ Theoretical collision risk (acceptable for expected volume)
- ❌ Not sequential (if ordering by creation time, use _id or add timestamp)

### 4. History Field
**Decision:** Define history as empty array, populate in future
**Rationale:**
- Placeholder for future order lifecycle tracking
- Keeps model extensible
- Avoids premature design of history structure

**Trade-offs:**
- ✅ Future-proof design
- ✅ No premature optimization
- ❌ History structure undefined (will need future spec)
- ❌ No immediate value from this field

### 5. Symbol vs ActualSymbol
**Decision:** Separate fields for interpreted symbol and executor-resolved symbol
**Rationale:**
- interpret-service may use different symbol naming than executor
- Allows tracking of symbol resolution process
- Useful for debugging symbol mapping issues

**Trade-offs:**
- ✅ Clear separation of concerns
- ✅ Audit trail for symbol resolution
- ❌ Potential confusion about which symbol to use
- ❌ Extra field to maintain

## Future Considerations

### Order Lifecycle Management
Future enhancements may include:
- Order status field (pending, filled, cancelled, rejected)
- Timestamps (createdAt, updatedAt, executedAt)
- Execution details (fill price, fill time, execution fees)
- Error tracking (rejection reasons, retry attempts)

### Order History Structure
Future history entries might include:
```typescript
interface OrderHistoryEntry {
  timestamp: Date;
  event: 'created' | 'submitted' | 'filled' | 'cancelled' | 'rejected';
  details?: any;
  error?: string;
}
```

### Synchronization with Executor
If needed, future work could add:
- Periodic sync jobs to reconcile virtual vs actual orders
- Webhook handlers for executor-service order updates
- Conflict resolution strategies

## Testing Strategy

### Integration Tests
Focus on:
- CRUD operations via repository
- Index usage verification
- Uniqueness constraint enforcement
- Multi-order scenarios

### Test Data Patterns
```typescript
// Typical test order
{
  messageId: 12345,
  channelId: '-1001234567890',
  accountId: 'test-account-1',
  orderId: 'abc123',  // Generated via short-unique-id
  type: OrderType.LONG,
  executionType: OrderExecutionType.market,
  symbol: 'BTCUSD',
  lotSize: 0.1,
  price: 50000,
  history: []
}
```

## Migration Strategy
No data migration needed - this is a new collection. The database initialization will create the collection and indexes on first deployment.

## Performance Considerations

### Expected Volume
- Messages per day: ~100-1000 (depends on channel activity)
- Orders per message: 1-5 average
- Expected daily order volume: 100-5000 orders

### Index Performance
- All indexes fit in memory for expected volume
- Compound index (messageId, channelId) is selective enough
- Unique index on orderId provides O(1) lookup

### Retention Policy
Consider adding TTL index in future if order history grows large:
```typescript
// Future consideration
await getSchema(COLLECTIONS.ORDERS).createIndex(
  { createdAt: 1 },
  { expireAfterSeconds: 7776000 } // 90 days
);
```

## Security Considerations
- No sensitive data in Order model (prices and symbols are public)
- AccountId links to executor-service but doesn't expose credentials
- Standard MongoDB access controls apply

## Compliance and Audit
The Order model provides:
- Complete audit trail of trading decisions
- Linkage from Telegram message to order execution
- Foundation for regulatory reporting if needed
- Debugging capability for order issues
