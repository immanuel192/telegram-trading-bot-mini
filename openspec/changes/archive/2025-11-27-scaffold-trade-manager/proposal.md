# Proposal: Scaffold Trade Manager Service

## Why

The trade-manager service is a critical component of the trading system that will:
- Consume interpreted trading signals from Redis Streams
- Manage trading accounts and their configurations
- Execute trades based on signals and risk management rules
- Schedule periodic jobs for account management and monitoring

Currently, we have `telegram-service` (ingests messages) and `interpret-service` (parses signals), but we lack the execution layer. The trade-manager will complete this pipeline.

## What Changes

### 0. Account Model Refactoring
- Refactor the existing Account model to follow coding standards
- Move code to appropriate locations per architecture rules
- Add AccountRepository with full CRUD operations
- Add comprehensive integration tests for the repository

### 1. Base Structure Setup
- Create `apps/trade-manager` with the same structure as `telegram-service`
- Include: config, logger, container, sentry, errors, main.ts, server.ts
- Configure for: Redis Streams, PushSafer API, Sentry, MongoDB
- Setup test infrastructure (integration and unit test placeholders)
- Add basic integration test to verify app bootstrap

### 2. Telegram Service Event Enhancement
- Extend `NewMessagePayload` to include `channelCode` field
- Eliminate redundant database lookups in downstream services
- Update all affected tests in shared-utils and telegram-service

### 3. Redis Stream Consumer
- Implement consumer for `StreamTopic.MESSAGES` in trade-manager
- Configure consumption mode (new messages only vs. from beginning)
- Add configuration to control consumer behavior
- Initial implementation: acknowledge messages without processing

### 4. Job Scheduling System
- Implement job scheduling infrastructure based on trading-view-alert pattern
- Create Job model (MongoDB collection: `trade-manager-jobs`)
- Implement BaseJob abstract class and job registry system
- Create JobService for manual job triggering (in-memory queue)
- Integrate job scheduler and job service into app bootstrap
- Add sample job implementation with tests

### 5. Account Management Service
- Create AccountService for managing trading accounts
- Register service in dependency injection container
- Add comprehensive unit and integration tests

## Impact

### New Capabilities
- Trade execution service foundation
- Job scheduling for periodic tasks
- Account management layer
- Event-driven architecture for signal processing

### Dependencies
- Requires existing DAL models and repositories
- Depends on Redis Streams infrastructure
- Uses shared utilities from libs/shared

### Migration
- No migration needed (new service)
- Existing services (telegram-service, interpret-service) continue to operate independently

### Testing
- All new code will have unit and integration tests
- Integration tests will use Docker for dependencies (MongoDB, Redis)

## Risks

- **Complexity**: Job scheduling adds significant complexity. Mitigation: Start with simple implementation, add features incrementally.
- **Redis Stream Coordination**: Multiple consumers need proper group management. Mitigation: Follow established patterns from telegram-service.
- **Account Model Changes**: Refactoring might affect existing code. Mitigation: Comprehensive test coverage before and after changes.

## Open Questions

1. Should job configurations be stored in MongoDB or environment variables?
   - **Decision**: MongoDB for flexibility and runtime updates
2. What should be the default consumer group behavior (new only vs. from beginning)?
   - **Decision**: Configurable via environment variable, default to new only
3. Should AccountService handle exchange-specific logic?
   - **Decision**: No, keep it generic. Exchange logic belongs in separate services.
