## Context
The Telegram Auto Trading Bot processes messages through multiple services (telegram-service → interpret-service → trade-manager). Currently, there is no systematic way to track the processing history of a message as it flows through the pipeline. This creates challenges for:
- Debugging failed message processing
- Understanding where messages get stuck
- Auditing the complete lifecycle of trading signals
- Investigating production issues

The user has already created the `TelegramMessageHistory` interface in the data model. This design document outlines how services will populate and maintain this history.

## Goals / Non-Goals

### Goals
- Provide complete audit trail of message processing across all services
- Enable debugging by showing which service last processed a message and when
- Track both successful event emissions and failures
- Use atomic database operations to ensure history is persisted even if downstream operations fail
- Establish a consistent pattern that all services can follow

### Non-Goals
- Real-time monitoring dashboard (future enhancement)
- Automatic retry based on history (separate concern)
- History cleanup/archival (can be added later if needed)
- Modifying existing message processing logic beyond adding history tracking

## Decisions

### Decision 1: Append-Only History Pattern
**What**: Services only add new entries to the history array, never modify or delete existing entries.

**Why**: 
- Simplifies concurrency - no conflicts from multiple services trying to update the same entry
- Preserves complete audit trail
- Aligns with event sourcing principles
- Makes debugging easier by showing the full sequence of events

**Alternatives considered**:
- Update existing entries: Rejected due to concurrency complexity and potential data loss
- Separate history collection: Rejected as it complicates queries and transactions

### Decision 2: Atomic History Updates with MongoDB $push
**What**: Use MongoDB's `$push` operator to atomically append history entries when publishing events.

**Why**:
- Ensures history is persisted even if stream publishing fails
- Prevents race conditions in concurrent scenarios
- Single database operation reduces failure points
- Allows us to record failures in the history

**Implementation**:
```typescript
await telegramMessageRepository.addHistoryEntry(
  channelCode,
  messageId,
  {
    createdAt: new Date(),
    fromService: ServiceName.TELEGRAM_SERVICE,
    targetService: ServiceName.INTERPRET_SERVICE,
    streamEvent: { messageEventType, messageId: streamMessageId },
    errorMessage: error?.message // only if publishing failed
  }
);
```

### Decision 3: ServiceName Enum in Shared Utils
**What**: Create a centralized enum for all service names in `libs/shared/utils`.

**Why**:
- Prevents typos and inconsistencies
- Provides type safety
- Makes it easy to see all services in the system
- Can be imported by all services and DAL

**Location**: `libs/shared/utils/src/constants/service-names.ts`

### Decision 4: History Entry on Event Emission (Not Reception)
**What**: Services add history entries when they emit events to the next service, not when they receive events.

**Why**:
- The emitting service knows the target service
- Aligns with the "push new entry" philosophy
- Receiving service doesn't need to update old entries
- Simpler to implement and reason about

**Flow**:
1. telegram-service receives message from Telegram
2. telegram-service processes and persists message with empty history
3. telegram-service publishes to stream AND atomically adds history entry (fromService=telegram-service, targetService=interpret-service)
4. interpret-service receives message, processes it
5. interpret-service publishes to next stream AND atomically adds history entry (fromService=interpret-service, targetService=trade-manager)

## Architecture Pattern

### Message Flow with History Tracking
```
┌─────────────────┐
│ Telegram API    │
└────────┬────────┘
         │ New message
         ▼
┌─────────────────────────────────────────┐
│ telegram-service                        │
│ 1. Persist message (history: [])       │
│ 2. Publish to stream                    │
│ 3. Atomic: $push history entry          │
│    - fromService: telegram-service      │
│    - targetService: interpret-service   │
│    - streamEvent: {...}                 │
│    - errorMessage: (if publish failed)  │
└────────┬────────────────────────────────┘
         │ Redis Stream
         ▼
┌─────────────────────────────────────────┐
│ interpret-service                       │
│ 1. Process message                      │
│ 2. Publish to stream                    │
│ 3. Atomic: $push history entry          │
│    - fromService: interpret-service     │
│    - targetService: trade-manager       │
└────────┬────────────────────────────────┘
         │ Redis Stream
         ▼
┌─────────────────────────────────────────┐
│ trade-manager                           │
│ 1. Execute trade                        │
│ 2. (Optional) Publish completion event  │
│ 3. Atomic: $push history entry          │
└─────────────────────────────────────────┘
```

### Error Handling
If stream publishing fails:
1. Catch the error
2. Still persist history entry with `errorMessage` populated
3. Log error and send to Sentry
4. This creates an audit trail of failures

## Data Model

The `TelegramMessageHistory` interface (already created by user):
```typescript
export interface TelegramMessageHistory {
  createdAt: Date;           // When this history entry was created
  fromService: string;       // Service emitting the event
  targetService: string;     // Service that should receive the event
  errorMessage?: string;     // Error if event emission failed
  streamEvent?: {
    messageEventType: string;  // Type of event emitted
    messageId: string;         // Stream message ID
  };
}
```

## Risks / Trade-offs

### Risk: History Array Growth
**Risk**: For long-running messages, history array could grow large.

**Mitigation**: 
- In practice, most messages go through 2-3 services (small array)
- MongoDB handles arrays well up to thousands of elements
- Can add TTL or archival later if needed
- Monitor array sizes in production

### Risk: Partial Failures
**Risk**: History entry persisted but stream publish fails (or vice versa).

**Mitigation**:
- Atomic operation ensures history is always persisted
- If stream publish fails, history records the error
- This is actually a feature - we want to know about failures
- Retry mechanisms can be built on top of this history

### Trade-off: Write Amplification
**Trade-off**: Every event emission now requires a database write.

**Justification**:
- Debugging and audit capabilities are worth the cost
- MongoDB updates are fast (single document, atomic operation)
- Can optimize later with batching if needed
- Production visibility is critical for trading system

## Migration Plan

### Phase 1: telegram-service (This Change)
1. Add ServiceName enum
2. Update TelegramMessageRepository with addHistoryEntry method
3. Update telegram-service to populate history
4. Deploy and verify history tracking works

### Phase 2: interpret-service (Future)
1. Update interpret-service to add history entries when publishing
2. Verify end-to-end history tracking

### Phase 3: trade-manager (Future)
1. Update trade-manager to add history entries
2. Complete end-to-end audit trail

### Rollback
- No breaking changes - history field is optional
- Can deploy without enabling history tracking
- Can disable history tracking by skipping the addHistoryEntry call

## Open Questions
None - the user has provided clear requirements and the data model is already defined.
