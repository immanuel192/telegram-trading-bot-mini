# Scaffold Trade Manager - OpenSpec Change

## Overview
This OpenSpec change scaffolds the **trade-manager** service, which is the execution layer of the trading system. It establishes the foundation for consuming trading signals, managing accounts, and executing trades.

## Status
✅ **Validated** - Ready for implementation

## Structure

### Documents
- **proposal.md**: High-level overview of why and what changes
- **design.md**: Architectural decisions, trade-offs, and technical details
- **tasks.md**: Ordered implementation checklist (6 phases, 70+ tasks)

### Spec Deltas (6 Capabilities)

1. **account-management** - Account model and repository
2. **service-foundation** - Trade-manager base structure
3. **message-events** - NewMessagePayload enhancement (MODIFIED)
4. **stream-consumer** - Redis Stream consumer for messages
5. **job-scheduling** - Job scheduling infrastructure
6. **account-service** - Account management service layer

## Key Features

### 1. Service Foundation
- Mirrors `telegram-service` structure for consistency
- Full n-tier architecture: config, logger, sentry, container, server
- HTTP server with health check endpoint on **port 9003** (avoids conflicts with telegram-service:9001, interpret-service:9002)
- Comprehensive test infrastructure

### 2. Account Management
- Refactored Account model following coding standards
- AccountRepository with CRUD operations
- AccountService for business logic
- Full test coverage (unit + integration)

### 3. Event Processing
- **Multiple Redis Stream consumers** with separate consumer groups per topic
- Initial consumer for `StreamTopic.MESSAGES`
- Configurable consumption mode (new vs. all messages)
- Consumer group support for distributed processing
- Extensible architecture for adding more topic consumers
- Initial implementation: log and acknowledge (no processing yet)

### 4. Job Scheduling
- Database-driven job configuration (MongoDB)
- BaseJob abstract class for implementing jobs
- Job registry system: `Map<jobId, JobClass>`
- JobService for manual job triggering (in-memory queue)
- Sample job demonstrating the pattern

### 5. Enhanced Message Events
- Added `channelCode` to `NewMessagePayload`
- Eliminates redundant database lookups in downstream services
- Breaking change: requires updates to telegram-service and tests

## Implementation Phases

### Phase 0: Account Model (Tasks 0.1-0.6)
Refactor Account model and add repository with tests

### Phase 1: Foundation (Tasks 1.1-1.20)
Scaffold trade-manager app structure and verify bootstrap

### Phase 2: Event Integration (Tasks 2.1-2.7)
Update NewMessagePayload and telegram-service

### Phase 3: Stream Consumer (Tasks 3.1-3.11)
Implement Redis Stream consumer for messages

### Phase 4: Job Scheduling (Tasks 4.1-4.26)
Build complete job scheduling infrastructure

### Phase 5: Account Service (Tasks 5.1-5.8)
Create AccountService with full test coverage

### Phase 6: Final Validation (Tasks 6.1-6.10)
Run all tests, verify build, and create PR

## Dependencies

### Required
- MongoDB (state persistence)
- Redis (event streaming)
- Sentry (error tracking)
- PushSafer (notifications)

### Code Dependencies
- `libs/dal` - Models and repositories
- `libs/shared/utils` - Redis Streams, Logger, Config
- `apps/telegram-service` - Pattern reference

## Testing Strategy

### Unit Tests
- Service classes (AccountService, JobService)
- Job classes (BaseJob, sample job)
- Repository methods (mocked)

### Integration Tests
- App bootstrap and shutdown
- Database operations (real MongoDB via Docker)
- Redis Stream consumption (real Redis via Docker)
- Job scheduling and execution
- Consumer group behavior

## Validation

```bash
# Validate the OpenSpec change
openspec validate scaffold-trade-manager --strict

# View the proposal
openspec show scaffold-trade-manager

# View specific capability
openspec show scaffold-trade-manager --deltas-only

# Start implementation (when ready)
# Follow /openspec-apply workflow
```

## Design Decisions

### 1. Job Configuration Storage
**Decision**: MongoDB (not environment variables)
- **Why**: Runtime updates, multiple instances, audit trail
- **Trade-off**: Additional startup queries vs. flexibility

### 2. Job Registry Pattern
**Decision**: `Map<jobId, JobClass>` for job loading
- **Why**: Simple, type-safe, easy to extend
- **Alternative rejected**: Dynamic imports (too complex)

### 3. Consumer Mode
**Decision**: Configurable (new vs. all messages) with per-topic consumer groups
- **Why**: Development flexibility, production efficiency, support for multiple event types
- **Config**: `STREAM_CONSUMER_MODE` + per-topic group names (e.g., `STREAM_MESSAGES_GROUP_NAME`)

### 4. Port Allocation
**Decision**: Port 9003 for HTTP server
- **Why**: Avoid conflicts with telegram-service (9001) and interpret-service (9002)
- **Benefit**: All services can run simultaneously in development

### 4. Service Structure
**Decision**: Mirror telegram-service exactly
- **Why**: Consistency, proven pattern, maintainability
- **Alternative rejected**: Custom structure (inconsistency)

## Risks & Mitigations

| Risk                        | Impact                | Mitigation                               |
| --------------------------- | --------------------- | ---------------------------------------- |
| Job scheduling complexity   | Multiple moving parts | Copy proven pattern, comprehensive tests |
| Redis consumer coordination | Duplicate processing  | Consumer groups, idempotency, tests      |
| Account model refactoring   | Breaking changes      | Tests before/after, incremental changes  |

## Next Steps

1. Review proposal, design, and tasks
2. Ask clarifying questions if needed
3. Get approval from stakeholders
4. Run `/openspec-apply scaffold-trade-manager` to start implementation
5. Follow tasks.md checklist phase by phase

## Related Changes

- **Depends on**: None (new service)
- **Blocks**: Future trade execution features
- **Related**: `implement-mtcute-client` (telegram-service foundation)

## Notes

- This is a **foundational change** - no actual trade execution logic yet
- Job scheduling infrastructure is extensible for future jobs
- Account model is shared across services (lives in `libs/dal`)
- NewMessagePayload change is **breaking** - requires coordinated updates
