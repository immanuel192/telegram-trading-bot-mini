## Context

The trade-manager service is the execution layer of the trading system. It sits downstream of telegram-service and interpret-service, consuming interpreted trading signals and executing trades based on risk management rules.

This is a foundational service that requires:
- Event-driven architecture (Redis Streams consumer)
- Job scheduling for periodic tasks (market data refresh, account monitoring)
- Account management with configuration
- Extensible design for future trading strategies

The design draws from proven patterns in the existing codebase (telegram-service) and the trading-view-alert project (job scheduling).

## Goals / Non-Goals

### Goals
- Establish trade-manager service with proper n-tier architecture
- Implement job scheduling infrastructure for periodic tasks
- Create account management layer with repository pattern
- Setup Redis Stream consumer for signal processing
- Maintain consistency with existing service patterns (telegram-service)
- Ensure comprehensive test coverage (unit + integration)

### Non-Goals
- Actual trade execution logic (future work)
- Exchange integrations (future work)
- Risk management algorithms (future work)
- UI/Admin panel (future work)

## Decisions

### 1. Service Structure
**Decision**: Mirror telegram-service structure exactly
- **Why**: Consistency across services, proven pattern, easier maintenance
- **Alternatives**: 
  - Custom structure: Rejected due to inconsistency
  - Minimal structure: Rejected due to future extensibility needs

### 2. Job Scheduling Model
**Decision**: Database-driven job configuration (MongoDB)
- **Why**: 
  - Runtime configuration updates without deployment
  - Multiple instances of same job with different configs
  - Audit trail of job configurations
- **Alternatives**:
  - Environment variables: Rejected due to lack of flexibility
  - Code-based config: Rejected due to deployment overhead

**Job Model Schema**:
```typescript
{
  jobId: string;        // Job class identifier (allows duplicates)
  name: string;         // Unique instance name
  isActive: boolean;    // Enable/disable without deletion
  config: JobSchedulerConfig; // Cron, timezone, etc.
  meta?: object;        // Extensible metadata bag
}
```

### 3. Job Registry Pattern
**Decision**: Use `Map<jobId, JobClass>` for job loading
- **Why**: 
  - Simple lookup by jobId
  - Type-safe job instantiation
  - Easy to extend with new jobs
- **Alternatives**:
  - Dynamic imports: Rejected due to complexity
  - Service locator: Rejected due to over-engineering

### 4. Account Model Location
**Decision**: Keep Account model in `libs/dal/src/models`
- **Why**: Shared across multiple services (trade-manager, future admin service)
- **Refactoring**: Move business logic to proper locations, keep model pure

### 5. NewMessagePayload Enhancement
**Decision**: Add `channelCode` to payload
- **Why**: 
  - Eliminates redundant DB lookups in downstream services
  - Improves performance
  - Reduces coupling to database
- **Impact**: Breaking change for consumers (must update tests)

### 6. Consumer Group Strategy
**Decision**: Support multiple topics with separate consumer groups per topic
- **Why**: 
  - Trade-manager will consume multiple event types (messages, signals, etc.)
  - Each topic needs independent consumer group configuration
  - Allows scaling consumers per topic independently
- **Config Pattern**: Per-topic configuration (e.g., `STREAM_MESSAGES_GROUP_NAME`, `STREAM_SIGNALS_GROUP_NAME`)
- **Consumption Mode**: Configurable via `STREAM_CONSUMER_MODE` (new vs. all messages)

### 7. Port Allocation
**Decision**: Use port 9003 for trade-manager HTTP server
- **Why**: 
  - Avoid conflicts with telegram-service (9001) and interpret-service (9002)
  - Sequential port numbering for easy management
  - Allows all services to run simultaneously in development
- **Port Map**:
  - telegram-service: 9001
  - interpret-service: 9002
  - trade-manager: 9003

### 8. Job Service (Manual Triggering)
**Decision**: In-memory queue using `fastq`
- **Why**: 
  - Prevents concurrent execution of same job
  - Simple API for manual triggers
  - Matches trading-view-alert pattern
- **Alternatives**:
  - Direct execution: Rejected due to concurrency issues
  - Separate queue service: Rejected due to over-engineering

## Architecture

### Service Dependencies
```
trade-manager
├── libs/dal (Account, Job models & repositories)
├── libs/shared/utils (Redis Streams, Logger, Config)
└── External Services
    ├── MongoDB (state persistence)
    ├── Redis (event streaming)
    ├── Sentry (error tracking)
    └── PushSafer (notifications)
```

### Data Flow
```
Redis Stream (messages) 
  → trade-manager consumer 
  → (future) signal processing 
  → (future) trade execution
```

### Job Scheduling Flow
```
App Bootstrap
  → Load Job configs from MongoDB
  → Instantiate Job classes via registry
  → Initialize cron jobs
  → Start job scheduler
  → Initialize job service (manual trigger queue)
```

### Graceful Shutdown Flow
```
SIGTERM/SIGINT received
  → Stop all cron jobs (prevent new executions)
  → Drain job triggering queue (wait for manual triggers)
  → Stop all stream consumers
  → Close database connections
  → Exit process (code 0)
```

**Timeout Handling**: If draining takes >30s, log warning and continue shutdown to prevent hanging.


## Risks / Trade-offs

### Risk: Job Scheduling Complexity
- **Impact**: Multiple moving parts (cron, registry, service, queue)
- **Mitigation**: 
  - Copy proven pattern from trading-view-alert
  - Comprehensive integration tests
  - Start with simple sample job

### Risk: Redis Stream Consumer Coordination
- **Impact**: Multiple instances might process same message
- **Mitigation**: 
  - Use consumer groups properly
  - Implement idempotency in handlers
  - Add integration tests for consumer behavior

### Risk: Account Model Refactoring
- **Impact**: Might break existing code if not careful
- **Mitigation**: 
  - Add tests before refactoring
  - Incremental changes
  - Verify no other services use Account model yet

### Trade-off: Database-driven Job Config vs. Code Config
- **Chosen**: Database-driven
- **Gain**: Flexibility, runtime updates, multiple instances
- **Cost**: Additional database queries on startup, more complex setup
- **Justification**: Flexibility outweighs performance cost (startup only)

## Migration Plan

### Phase 1: Foundation (Tasks 0-1)
1. Refactor Account model
2. Add AccountRepository with tests
3. Scaffold trade-manager app structure
4. Verify bootstrap integration test passes

### Phase 2: Event Integration (Tasks 2-3)
1. Update NewMessagePayload in shared-utils
2. Update telegram-service to include channelCode
3. Update all affected tests
4. Implement Redis Stream consumer in trade-manager
5. Verify consumer can receive and acknowledge messages

### Phase 3: Job Scheduling (Task 4)
1. Create Job model and repository
2. Implement BaseJob abstract class
3. Create job registry system
4. Implement JobService
5. Create sample job with tests
6. Integrate into app bootstrap

### Phase 4: Account Management (Task 5)
1. Create AccountService
2. Register in container
3. Add unit and integration tests

### Rollback Strategy
- Each phase is independent
- Can disable trade-manager without affecting other services
- Job scheduling can be disabled via configuration
- Consumer can be stopped without data loss (messages remain in stream)

## Testing Strategy

### Unit Tests
- All service classes (AccountService, JobService)
- Job classes (BaseJob, sample job)
- Repository methods

### Integration Tests
- App bootstrap (server starts successfully)
- Database operations (repositories)
- Redis Stream consumer (message consumption)
- Job scheduling (cron execution, manual triggering)

### Test Infrastructure
- Docker Compose for dependencies (MongoDB, Redis)
- Shared test utilities from `libs/shared/test-utils`
- Jest configuration matching telegram-service

## Open Questions

### Q1: Should we implement job persistence (execution history)?
- **Status**: Deferred to future work
- **Rationale**: Not needed for MVP, adds complexity

### Q2: How to handle job failures?
- **Status**: Use Sentry for error capture, log failures
- **Future**: Add retry logic, dead letter queue

### Q3: Should AccountService handle account creation/deletion?
- **Status**: Yes, full CRUD operations
- **Rationale**: Service owns account lifecycle

### Q4: What's the relationship between Job model and JobBase class?
- **Answer**: 
  - Job model (MongoDB): Configuration and metadata
  - JobBase class: Execution logic
  - Mapping: `jobId` field links model to class via registry
