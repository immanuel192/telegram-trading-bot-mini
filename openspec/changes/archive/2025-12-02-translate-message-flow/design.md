# Design: Translate Message Flow

## Architecture Overview

This change implements the first step in the message interpretation pipeline: sending raw Telegram messages from `trade-manager` to `interpret-service` for LLM-based translation.

```
telegram-service → [NEW_MESSAGE] → trade-manager → [TRANSLATE_MESSAGE_REQUEST] → interpret-service
                                         ↓
                                    MongoDB (history)
```

## Infrastructure Changes

### MongoDB Replica Set
To support multi-document transactions, the MongoDB instance must run as a **Replica Set**.
- **Local Development**: Update `docker-compose.yml` to run MongoDB with `--replSet rs0` and auto-initialize it.
- **Connection Strings**: All services must update their `MONGODB_URI` to include `?replicaSet=rs0`.

**Impact**:
- Existing local databases will need to be recreated (volume reset).
- All services (`telegram-service`, `interpret-service`, `trade-manager`) need config updates.

## Component Design

### 1. Message History Types

**Location**: `libs/dal/src/models/telegram-message.model.ts`

Add two new history types to `MessageHistoryTypeEnum`:

```typescript
export enum MessageHistoryTypeEnum {
  NEW_MESSAGE = 'new-message',
  EDIT_MESSAGE = 'edit-message',
  TRANSLATE_MESSAGE = 'translate-message',    // NEW: When sending to interpret-service
  TRANSLATE_RESULT = 'translate-result',      // NEW: When receiving from interpret-service
}
```

**Rationale**: 
- Separate history types for request and response allow clear audit trail
- Follows existing pattern of lowercase-hyphenated naming
- Distinguishes between message lifecycle events (NEW, EDIT) and processing events (TRANSLATE)

### 2. MongoDB Transaction Utility

**Location**: `libs/dal/src/infra/transaction.ts` (new file)

Create a reusable transaction helper that wraps MongoDB's `withTransaction` API:

```typescript
export async function withMongoTransaction<T>(
  operation: (session: ClientSession) => Promise<T>
): Promise<T>
```

**Key Features**:
- Accepts an async callback that receives a MongoDB session
- Automatically handles session lifecycle (start, commit, abort)
- Propagates errors for caller handling
- Returns the operation result

**Rationale**:
- Centralizes transaction boilerplate
- Ensures consistent error handling
- Makes transaction usage simple and reusable
- Follows MongoDB best practices

**Usage Pattern**:
```typescript
await withMongoTransaction(async (session) => {
  // 1. Update database
  await repository.addHistoryEntry(channelId, messageId, historyEntry, session);
  
  // 2. Publish event
  await streamPublisher.publish(topic, message);
  
  // If publish fails, transaction auto-rolls back
});
```

### 3. New Message Handler Enhancement

**Location**: `apps/trade-manager/src/events/consumers/new-message-handler.ts`

Transform the placeholder handler into a functional implementation:

**Current State**: Logs and acknowledges messages
**New State**: 
1. Fetch message from database
2. Start MongoDB transaction
3. Add history entry with `TRANSLATE_MESSAGE` type
4. Publish `TRANSLATE_MESSAGE_REQUEST` event
5. Commit transaction

**Dependencies**:
- `TelegramMessageRepository` (injected via constructor)
- `IStreamPublisher` (injected via constructor)
- `withMongoTransaction` utility

**Error Handling**:
- Transaction automatically rolls back on any error
- Errors captured by Sentry (via base handler)
- Message remains in Redis Stream for retry

### 4. Configuration Enhancement

**Location**: `apps/trade-manager/src/config.ts`

Add TTL configuration to `TradeManagerConfig`:

```typescript
export interface TradeManagerConfig extends BaseConfig {
  // ... existing fields
  MESSAGE_HISTORY_TTL_SECONDS: number;
}

const defaultConfig: Record<keyof TradeManagerConfig, any> = {
  // ... existing fields
  MESSAGE_HISTORY_TTL_SECONDS: 10, // 10 seconds, matches telegram-service pattern
};
```

**Default Value**: 10 seconds (matching `telegram-service` pattern)

**Rationale**:
- Keeps configuration at app level (follows existing pattern in telegram-service)
- Short TTL (10s) is appropriate for stream message expiry
- Aligns with existing `STREAM_MESSAGE_TTL_IN_SEC` pattern in telegram-service
- Allows future flexibility per service without affecting base config

### 5. Container Wiring

**Location**: `apps/trade-manager/src/container.ts`

Inject `telegramMessageRepository` into container for use by handlers.

**Location**: `apps/trade-manager/src/events/index.ts`

Pass repository and publisher to `NewMessageHandler` constructor.

## Data Flow

### Successful Flow

```
1. NEW_MESSAGE arrives in Redis Stream
2. NewMessageHandler.handle() called
3. Fetch TelegramMessage from MongoDB
4. Start transaction
   a. Create history entry with type=TRANSLATE_MESSAGE
   b. Add entry to message.history array
   c. Publish TRANSLATE_MESSAGE_REQUEST to Redis Stream
5. Commit transaction
6. interpret-service receives and processes request
```

### Error Scenarios

| Error                   | Handling                                         |
| ----------------------- | ------------------------------------------------ |
| Message not found in DB | Log error, capture in Sentry, skip processing    |
| Transaction fails       | Auto-rollback, message stays in stream for retry |
| Stream publish fails    | Transaction rolls back, history not saved        |
| Network timeout         | Transaction timeout, auto-rollback               |

## Transaction Guarantees

**Atomicity**: History entry and event publish succeed together or fail together.

**Consistency**: Message history always reflects actual events published.

**Isolation**: Concurrent updates to same message are serialized by MongoDB.

**Durability**: Once transaction commits, history is persisted.

**Trade-offs**:
- **Performance**: Transactions add ~10-20ms overhead
- **Scalability**: Requires MongoDB replica set (already in place)
- **Complexity**: Adds transaction management code

**Justification**: The audit trail and consistency guarantees outweigh the performance cost for this use case.

## Testing Strategy

### Unit Tests
- `withMongoTransaction` utility (success, error, rollback)
- `MessageHistoryTypeEnum` enum values
- Configuration defaults

### Integration Tests
- End-to-end flow: NEW_MESSAGE → history entry → TRANSLATE_REQUEST
- Transaction rollback on publish failure
- Message not found scenario
- Concurrent message processing

## Migration Path

**No migration needed**: 
- New enum values are additive
- Existing history entries remain valid
- Transaction utility is new code

## Performance Considerations

**Expected Load**: ~10-100 messages/minute (MVP)

**Transaction Overhead**: 
- Session creation: ~5ms
- Commit: ~10ms
- Total: ~15ms per message

**Bottlenecks**:
- MongoDB write latency (mitigated by replica set)
- Redis Stream publish latency (typically <5ms)

**Monitoring**:
- Track transaction duration via Sentry metrics
- Monitor MongoDB transaction conflicts
- Alert on high error rates

## Security Considerations

- No new authentication/authorization requirements
- Transactions use existing MongoDB credentials
- No sensitive data in history entries (message content already in DB)

## Alternatives Considered

### Alternative 1: No Transactions
**Approach**: Add history entry, then publish event (two separate operations)

**Pros**: Simpler code, no transaction overhead

**Cons**: 
- History may be saved but event not published (inconsistent state)
- No rollback on failure
- Harder to debug issues

**Decision**: Rejected due to consistency concerns

### Alternative 2: Event Sourcing
**Approach**: Store events in event log, rebuild state from events

**Pros**: Complete audit trail, time-travel debugging

**Cons**: 
- Significant complexity increase
- Requires event store infrastructure
- Overkill for MVP

**Decision**: Rejected as over-engineering for current needs

### Alternative 3: Saga Pattern
**Approach**: Compensating transactions for distributed rollback

**Pros**: Works across multiple databases/services

**Cons**: 
- Complex to implement and test
- Not needed (single database)

**Decision**: Rejected as unnecessary complexity

## Future Enhancements

1. **Batch Processing**: Process multiple messages in single transaction
2. **Dead Letter Queue**: Move failed messages to DLQ after N retries
3. **History Archival**: Move old history entries to cold storage
4. **Metrics Dashboard**: Visualize message processing pipeline
