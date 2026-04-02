# Design: Auto-Sync Linked Order TP/SL

## Overview
This document captures the architectural decisions and design rationale for implementing automatic TP/SL synchronization across linked orders.

## Context
Orders can be linked together (via the `linkedOrders` field) to represent related positions such as:
- DCA (Dollar Cost Averaging) entries for the same position
- Split positions from a single signal
- Partial close scenarios

When traders update TP/SL on one order, they expect all linked orders to maintain the same risk management levels. Currently, this synchronization must be done manually, leading to inconsistent risk management.

## Design Decisions

### 1. Job-Based Approach vs. Direct Synchronous Updates

**Decision**: Use a manual-trigger job to handle synchronization rather than inline synchronous updates.

**Rationale**:
- **Separation of Concerns**: Keeps the core order execution logic focused on single-order operations
- **Error Isolation**: Failures in syncing linked orders don't fail the primary operation
- **Reusability**: The job can be triggered from multiple places (order creation, TP/SL updates)
- **Testability**: Job logic can be tested independently
- **Future Extensibility**: Easy to add retry logic, batching, or other enhancements

**Trade-offs**:
- Slightly more complex architecture
- Small delay between primary update and linked order updates (acceptable for this use case)

### 2. Manual-Trigger-Only Job (No Cron Schedule)

**Decision**: Force `cronExpression` to `undefined` in the job's `init()` method.

**Rationale**:
- This job should ONLY run when explicitly triggered by business logic
- Scheduled execution doesn't make sense for this use case
- Prevents accidental scheduled runs if job is misconfigured in database

**Implementation**:
```typescript
async init(): Promise<void> {
  // Override cronExpression to prevent scheduled execution
  this.jobConfig.config.cronExpression = undefined;
  await super.init();
}
```

### 3. Endless Loop Prevention Strategy

**Decision**: Add `skipLinkedOrderSync` flag to `ExecuteOrderRequestPayload.meta`.

**Rationale**:
- **Simple and Explicit**: Easy to understand and debug
- **Minimal Changes**: Only requires adding one optional field
- **Effective**: Breaks recursion at the source

**Alternative Considered**: Track synced orders in memory (Set)
- **Rejected**: More complex, requires state management, harder to debug

**Flow**:
1. User updates Order A's TP/SL
2. System syncs to linked Order B (with `skipLinkedOrderSync: true`)
3. Order B update detects flag and skips sync
4. No recursion occurs

### 4. Sync Both TP and SL (When Present)

**Decision**: Sync both TP and SL values when they exist, not just the one being updated.

**Rationale**:
- **Consistency**: Ensures all linked orders have identical risk management
- **User Expectation**: Traders expect linked orders to be fully synchronized
- **Simplicity**: Avoids complex logic to track which value was updated

**Implementation**:
- Extract both `sl` and `tp` from the payload
- Pass both to the sync job (even if one is undefined)
- Job updates only the values that are provided

### 5. Reuse Existing Update Logic

**Decision**: The sync job calls `handleUpdateTakeProfitStopLoss` rather than duplicating logic.

**Rationale**:
- **DRY Principle**: Avoid code duplication
- **Consistency**: Ensures sync uses the same validation and update logic
- **Maintainability**: Changes to update logic automatically apply to sync

**Implementation**:
```typescript
// In job's onTick()
await this.container.orderExecutor['handleUpdateTakeProfitStopLoss'](
  adapter,
  payload,
  account
);
```

Note: Accessing private method via bracket notation is acceptable here as the job is part of the same service boundary.

### 6. Error Handling Strategy

**Decision**: Log and continue on sync failures; don't fail the primary operation.

**Rationale**:
- **Resilience**: Primary order operation should succeed even if sync fails
- **Observability**: Errors are logged and sent to Sentry for investigation
- **User Experience**: User's primary action (create order, update TP/SL) completes successfully

**Trade-offs**:
- Linked orders may become out of sync if errors occur
- Requires monitoring to detect and fix sync failures

## Data Flow

### Order Creation with Linked Orders
```
User creates LONG order with linkedOrders=[B, C] and TP/SL
    ↓
handleOpenOrder executes
    ↓
Order A created successfully
    ↓
Detect linkedOrders array
    ↓
For each linked order:
    ↓
    Trigger auto-sync-tp-sl-linked-order job
        ↓
        Job builds payload with skipLinkedOrderSync=true
        ↓
        Job calls handleUpdateTakeProfitStopLoss
        ↓
        Order B/C updated (no further sync due to flag)
```

### TP/SL Update with Linked Orders
```
User updates Order A's TP/SL
    ↓
handleUpdateTakeProfitStopLoss executes
    ↓
Check skipLinkedOrderSync flag (false/undefined)
    ↓
Order A updated successfully
    ↓
Detect linkedOrders array
    ↓
For each linked order:
    ↓
    Trigger auto-sync-tp-sl-linked-order job
        ↓
        Job builds payload with skipLinkedOrderSync=true
        ↓
        Job calls handleUpdateTakeProfitStopLoss
        ↓
        Order B/C updated (no further sync due to flag)
```

## Testing Strategy

### Unit Tests
- Job initialization (verify no cron created)
- Job parameter validation
- skipLinkedOrderSync flag handling

### Integration Tests
- End-to-end sync on order creation
- End-to-end sync on TP/SL update
- Endless loop prevention
- Partial sync (only SL or only TP)
- Error handling (linked order not found, sync failure)

## Future Enhancements (Out of Scope)

1. **Bi-directional Sync Detection**: Detect circular references and warn users
2. **Sync History Tracking**: Add history entries to track sync operations
3. **Configurable Sync Behavior**: Allow accounts to disable auto-sync
4. **Batch Sync**: Optimize by batching multiple linked order updates
5. **Sync Other Parameters**: Extend to lot size, leverage, etc.

## Risks and Mitigations

| Risk                                       | Impact | Likelihood | Mitigation                             |
| ------------------------------------------ | ------ | ---------- | -------------------------------------- |
| Endless loop despite flag                  | High   | Low        | Comprehensive testing, monitoring      |
| Sync job fails silently                    | Medium | Medium     | Sentry alerts, logging                 |
| Performance impact with many linked orders | Medium | Low        | Sequential processing via job queue    |
| Race conditions                            | Low    | Low        | Job queue ensures sequential execution |

## Conclusion

This design provides a robust, maintainable solution for automatic TP/SL synchronization across linked orders. The job-based approach with explicit loop prevention ensures reliability while maintaining code quality and separation of concerns.
