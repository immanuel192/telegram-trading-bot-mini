# Setup Event Infrastructure for Message Interpretation

**Change ID**: `setup-interpret-events`  
**Status**: Proposed  
**Created**: 2025-11-28

## Overview

This change establishes the foundational event infrastructure required for the interpret-service to function as the LLM-powered translation layer between raw Telegram messages and structured trading commands. It defines three new message types, extends the Account model with broker specifications, and scaffolds the complete interpret-service infrastructure.

## Motivation

The current system has a gap in the message interpretation pipeline:
- **telegram-service** ingests raw messages from Telegram
- **trade-manager** needs structured trading commands to execute
- **interpret-service** exists but has no infrastructure to bridge this gap

This change fills that gap by:
1. Defining message contracts for requesting and receiving translations
2. Adding broker specifications to accounts for context-aware interpretation
3. Building the complete service infrastructure for interpret-service

## Capabilities Affected

### 1. message-events
**Type**: Extension  
**Impact**: Adds three new message types to the existing message-events spec

**Changes**:
- `TRANSLATE_MESSAGE_REQUEST`: Request message translation with context
- `TRANSLATE_MESSAGE_RESULT`: Return structured commands with confidence
- `SYMBOL_FETCH_LATEST_PRICE`: Request latest symbol prices

**Key Features**:
- Message expiry mechanism (10s default)
- Context-aware interpretation (previous/quoted messages, current orders)
- Confidence scoring for AI decisions
- Comprehensive command structure (8 action types, 2 order types)

### 2. account-management
**Type**: Extension  
**Impact**: Adds broker specifications to Account model

**Changes**:
- New `BrokerSpecs` interface with 7 fields
- Optional `brokerSpecs` field on Account model
- Full CRUD support in AccountRepository

**Key Features**:
- Contract size and lot sizing constraints
- Price tick specifications
- Leverage and currency information
- Enables position sizing calculations

### 3. service-foundation
**Type**: New  
**Impact**: Creates complete infrastructure for interpret-service

**Changes**:
- Service configuration with Redis and LLM settings
- Event-driven architecture (no HTTP server, no jobs)
- Stream consumer and publisher setup
- Graceful lifecycle management

**Key Features**:
- Mirrors trade-manager structure for consistency
- Sentry integration for error tracking
- Shared database with other services
- Comprehensive bootstrap testing

## Implementation Approach

### Phase 1: Message Type Definitions (Tasks 1-5)
1. Define command enums and interfaces
2. Create TRANSLATE_MESSAGE_REQUEST schema
3. Create TRANSLATE_MESSAGE_RESULT schema
4. Create SYMBOL_FETCH_LATEST_PRICE schema
5. Add comprehensive unit tests

**Deliverable**: All message types defined and validated

### Phase 2: Account Model Enhancement (Tasks 6-7)
1. Add BrokerSpecs interface to Account model
2. Update AccountRepository
3. Add integration tests for CRUD operations

**Deliverable**: Account model supports broker specifications

### Phase 3: Interpret-Service Infrastructure (Tasks 8-18)
1. Update service configuration
2. Create service interfaces and container
3. Setup event infrastructure (consumers/publishers)
4. Create server wiring and lifecycle management
5. Add bootstrap integration tests

**Deliverable**: Interpret-service can start, consume messages, and shutdown gracefully

### Phase 4: Validation (Tasks 19-21)
1. Install required packages
2. Run full test suite
3. Add stream topic enums for future use

**Deliverable**: All tests pass, no regressions

## Testing Strategy

### Unit Tests
- Message schema validation (TypeBox)
- Enum value validation
- Command structure validation
- Edge cases (empty arrays, optional fields)

### Integration Tests
- Account CRUD with brokerSpecs
- Service bootstrap and shutdown
- Database connection management
- Stream consumer/publisher creation

### Test Coverage Goals
- Message schemas: 100% (critical for data integrity)
- Account model: 90%+ (existing + new fields)
- Service infrastructure: 80%+ (bootstrap paths)

## Dependencies

### External Dependencies
- `@sinclair/typebox`: Schema validation (existing)
- `@upstash/redis`: Redis Streams (existing)
- MongoDB: Data persistence (existing)

### Internal Dependencies
- `libs/shared/utils`: Message types and stream infrastructure
- `libs/dal`: Account model and repositories
- Existing Redis Stream patterns from telegram-service and trade-manager

### Service Dependencies
- **interpret-service** depends on:
  - Redis (Upstash) for message streams
  - MongoDB for data persistence
  - LLM API (Gemini) for message interpretation (not in this change)

## Risks and Mitigations

### Risk 1: Message Schema Complexity
**Risk**: Complex command structure with many optional fields could lead to validation errors  
**Mitigation**: Comprehensive TypeBox schemas with unit tests for all scenarios  
**Severity**: Medium

### Risk 2: Context Window Size
**Risk**: Passing large order arrays could exceed reasonable message sizes  
**Mitigation**: Document expected limits, monitor message sizes, consider pagination in future  
**Severity**: Low

### Risk 3: Service Coordination
**Risk**: Three-way communication adds complexity and potential failure points  
**Mitigation**: Clear message contracts, trace tokens, comprehensive logging, Sentry integration  
**Severity**: Medium

### Risk 4: Broker Specs Variance
**Risk**: Different brokers have different specifications, hard to standardize  
**Mitigation**: Make brokerSpecs optional, document expected values, validate on use  
**Severity**: Low

## Future Work

### Not Included in This Change
- Actual LLM integration and message processing
- Trade-manager request handler implementation
- Trade-manager result handler implementation
- Symbol price fetching implementation
- Trade-executor service
- HTTP server for health checks
- Metrics and monitoring endpoints

### Planned Follow-up Changes
1. **Implement LLM Integration**: Add actual message interpretation logic
2. **Add Request/Result Handlers**: Complete the message flow in trade-manager
3. **Add Symbol Price Service**: Implement price fetching from brokers
4. **Add Health Checks**: HTTP endpoints for monitoring
5. **Add Metrics**: Prometheus metrics for observability

## Success Criteria

This change is successful when:
- [ ] All three message types are defined with TypeBox validation
- [ ] All message type unit tests pass
- [ ] Account model includes brokerSpecs field
- [ ] Account integration tests pass with brokerSpecs
- [ ] Interpret-service can start and stop cleanly
- [ ] Interpret-service bootstrap test passes
- [ ] Stream consumers are created successfully
- [ ] Stream publisher is created successfully
- [ ] No regressions in existing tests
- [ ] All TypeScript compilation succeeds
- [ ] No lint errors

## Documentation

### Files Created
- `libs/shared/utils/src/interfaces/messages/command.types.ts`
- `libs/shared/utils/src/interfaces/messages/translate-message-request.ts`
- `libs/shared/utils/src/interfaces/messages/translate-message-result.ts`
- `libs/shared/utils/src/interfaces/messages/symbol-fetch-latest-price.ts`
- `apps/interpret-service/src/server.ts`
- `apps/interpret-service/src/container.ts`
- `apps/interpret-service/src/events/index.ts`
- `apps/interpret-service/src/interfaces/*`
- `apps/interpret-service/test/integration/bootstrap.spec.ts`
- `apps/interpret-service/test/setup.ts`

### Files Modified
- `libs/shared/utils/src/interfaces/messages/message-type.ts`
- `libs/shared/utils/src/interfaces/messages/index.ts`
- `libs/dal/src/models/account.model.ts`
- `libs/dal/src/models/index.ts`
- `apps/interpret-service/src/config.ts`
- `apps/interpret-service/src/main.ts`
- `apps/interpret-service/src/logger.ts`
- `apps/interpret-service/src/sentry.ts`
- `libs/shared/utils/src/stream/stream-interfaces.ts` (add stream topics)

### Tests Created
- `libs/shared/utils/test/unit/translate-message-request.spec.ts`
- `libs/shared/utils/test/unit/translate-message-result.spec.ts`
- `libs/shared/utils/test/unit/symbol-fetch-latest-price.spec.ts`
- `libs/dal/test/integration/account.repository.spec.ts` (new test cases)
- `apps/interpret-service/test/integration/bootstrap.spec.ts`

## Related Changes

- **Depends on**: None (builds on existing infrastructure)
- **Blocks**: LLM integration implementation
- **Blocks**: Trade-manager message handlers
- **Blocks**: Trade-executor service
- **Related to**: `scaffold-trade-manager` (similar service structure)
- **Related to**: `refine-telegram-service-infrastructure` (stream patterns)

## Approval Checklist

Before implementation:
- [ ] Proposal reviewed and approved
- [ ] Design reviewed and approved
- [ ] Tasks reviewed and approved
- [ ] Spec deltas reviewed and approved
- [ ] Open questions resolved
- [ ] Dependencies identified and available
- [ ] Test strategy approved
- [ ] Risk mitigations approved

## Notes

- This is infrastructure-only; no actual message processing logic
- Interpret-service will be purely event-driven (no HTTP, no jobs)
- All services share the same MongoDB database (MVP simplification)
- Message expiry is set to 10s by default (configurable in future)
- Confidence scores use standard ML convention (0-1 range)
- Broker specs use snake_case to match broker API conventions
