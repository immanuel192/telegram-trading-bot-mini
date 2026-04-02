## Context
Stale pending orders occur when the order creation succeeds but execution request fails or is never processed. Without cleanup, these orders accumulate and create confusion about actual system state.

## Goals / Non-Goals
**Goals:**
- Automatically clean up orders that remain PENDING beyond configured timeout
- Maintain complete audit trail with command tracking in order history
- Allow per-account notification control to prevent flooding
- Use existing database indexes for MVP performance

**Non-Goals:**
- Retry logic for failed execution requests (separate concern)
- Account-level notification preferences in Account model (future enhancement)
- Root cause analysis of why orders become stale (observability concern)
- Compound database indexes (acceptable for MVP with few PENDING orders)

## Decisions

### Decision: Add `command` field to OrderHistory
**Why**: Currently, OrderHistory only tracks `status` which doesn't indicate what action triggered the history entry. Adding `command` provides better audit trail and debugging capability.

**Alternatives considered:**
- Store command in `info` field: Less type-safe, harder to query
- Don't track command: Loses valuable debugging information

### Decision: Use job meta for notification whitelist
**Why**: Simpler to implement than account-level settings, centralized control, easy to modify without code changes.

**Alternatives considered:**
- Account model notification settings: More granular but requires model changes, overkill for MVP
- Global notification flag: Too coarse-grained, would flood or silence all accounts

### Decision: Filter createdAt in-memory
**Why**: MVP assumption is few PENDING orders (\u003c100). Existing `status` index is sufficient for initial query.

**Alternatives considered:**
- Compound index `{status: 1, createdAt: 1}`: Premature optimization, adds index maintenance overhead
- Query by createdAt range: Requires scanning all orders, worse than filtering PENDING in-memory

## Risks / Trade-offs

**Risk**: False positives (closing valid pending orders)  
**Mitigation**: Conservative 1-minute default timeout, configurable via job meta

**Risk**: Performance degradation if PENDING orders grow  
**Mitigation**: Document assumption and add TODO for compound index if needed

**Risk**: Notification flooding  
**Mitigation**: Account whitelist in job meta, only configured accounts receive notifications

## Migration Plan
1. Deploy code changes (no data migration needed)
2. Create job document in database with initial configuration
3. Job starts automatically on next trade-manager restart
4. Monitor logs for cleanup activity
5. Adjust timeout and notification whitelist as needed

**Rollback**: Delete job document or set `isActive: false`

## Open Questions
None - all clarifications received from user.
