# Implementation Tasks for Observability Metrics

## Phase 1: Foundation Setup

### Task 1: Create Metrics Utility Library
- **Description**: Create a shared utility library for safe metric emission with error handling and environment configuration
- **Files**: `libs/shared/utils/src/metrics.ts`
- **Acceptance Criteria**: 
  - Wrapper functions for `Sentry.metrics.count` and `Sentry.metrics.gauge`
  - Environment-based enabling/disabling of metrics
  - Error handling that prevents metric failures from affecting business logic
  - Type-safe metric names and tag structures
- **Dependencies**: None
- **Validation**: Unit tests for metric emission, error handling, and environment configuration
- **Status**: ✅ COMPLETED

## Phase 2: Telegram Service Implementation

### Task 2: Implement Telegram Service Metrics and Trace Tokens
- **Description**: Add all specified custom metrics and trace token propagation to telegram-service
- **Files**: `apps/telegram-service/src/services/telegram-client.service.ts`
- **Acceptance Criteria**:
  - Message processing counter with channel and trace token tags
  - Stream lag gauge calculation from sentAt timestamp
  - Queue depth gauge updates on queue changes
  - Error counter with type, channel, and trace token tags
  - Media detection counter for media messages
  - Message edit and delete counters
  - Processing rate gauge calculated per minute
  - All stream messages include traceToken field
  - Trace token is preserved from original message (using existing simple utilities)
- **Dependencies**: Task 1 (Metrics Utility)
- **Validation**: Integration tests with mock Telegram messages to verify metric emission and trace token propagation

### Task 4: Enhance Telegram Service Health Check
- **Description**: Add Redis connectivity validation to telegram-service health check
- **Files**: `apps/telegram-service/src/servers/http-server.ts`
- **Acceptance Criteria**:
  - Redis connectivity validation with 5-second timeout
  - Response includes `redis` field with `connected` or `disconnected` status
  - Error field included when Redis is disconnected
- **Dependencies**: None
- **Validation**: Health check endpoint tests with Redis failure scenarios

### Task 4: Telegram Service Comprehensive Testing
- **Description**: Complete testing suite for telegram-service observability features
- **Files**: Test files in `apps/telegram-service/tests/`
- **Acceptance Criteria**:
  - Unit tests for all metric emission scenarios
  - Integration tests for trace token propagation
  - Health check endpoint tests with various Redis states
  - Performance tests to ensure minimal overhead
  - End-to-end tests with real Telegram message flow
- **Dependencies**: Tasks 2, 3
- **Validation**: All tests pass with >90% code coverage for observability features

## Phase 3: Interpret Service Implementation

### Task 5: Implement Interpret Service Metrics and Trace Tokens
- **Description**: Add placeholder metrics and trace token support to interpret-service
- **Files**: `apps/interpret-service/src/services/stream-consumer.service.ts`, `apps/interpret-service/src/services/interpret.service.ts`
- **Acceptance Criteria**:
  - Placeholder metric calls for future signal processing
  - Placeholder metric calls for future LLM performance
  - Proper tag structure for placeholder metrics
  - Placeholder metrics are no-ops until actual implementation
  - Trace token extraction from stream messages (using existing simple utilities)
  - Trace token usage in all log statements
  - Trace token inclusion in placeholder metric emissions
  - Trace token propagation to downstream streams
- **Dependencies**: Task 1 (Metrics Utility)
- **Validation**: Integration tests verifying trace token flow and placeholder metric structure

### Task 6: Enhance Interpret Service Health Check
- **Description**: Add Redis connectivity validation to interpret-service health check
- **Files**: `apps/interpret-service/src/servers/http-server.ts`
- **Acceptance Criteria**:
  - Redis connectivity validation with 5-second timeout
  - Response includes `redis` field with `connected` or `disconnected` status
  - Error field included when Redis is disconnected
- **Dependencies**: None
- **Validation**: Health check endpoint tests with Redis failure scenarios

### Task 7: Interpret Service Comprehensive Testing
- **Description**: Complete testing suite for interpret-service observability features
- **Files**: Test files in `apps/interpret-service/tests/`
- **Acceptance Criteria**:
  - Unit tests for placeholder metric structure
  - Integration tests for trace token extraction and propagation
  - Health check endpoint tests with various Redis states
  - Performance tests to ensure minimal overhead
  - End-to-end tests with mock stream messages
- **Dependencies**: Tasks 5, 6
- **Validation**: All tests pass with >90% code coverage for observability features

## Phase 4: Trade Manager Implementation

### Task 8: Implement Trade Manager Metrics and Trace Tokens
- **Description**: Add custom metrics and trace token support to trade-manager
- **Files**: `apps/trade-manager/src/services/trade-execution.service.ts`, `apps/trade-manager/src/services/signal-processor.service.ts`
- **Acceptance Criteria**:
  - Trade execution counter with account, symbol, side, and trace token tags
  - Risk management event counter with rule, account, and trace token tags
  - Trade error counter with type, account, and trace token tags
  - Trace token extraction from signal stream messages (using existing simple utilities)
  - Trace token usage in all log statements
  - Trace token inclusion in all metric emissions
- **Dependencies**: Task 1 (Metrics Utility)
- **Validation**: Integration tests with mock trade executions to verify metric emission and trace token usage

### Task 9: Enhance Trade Manager Health Check
- **Description**: Add Redis connectivity validation to trade-manager health check
- **Files**: `apps/trade-manager/src/servers/http-server.ts`
- **Acceptance Criteria**:
  - Redis connectivity validation with 5-second timeout
  - Response includes `redis` field with `connected` or `disconnected` status
  - Error field included when Redis is disconnected
- **Dependencies**: None
- **Validation**: Health check endpoint tests with Redis failure scenarios

### Task 10: Trade Manager Comprehensive Testing
- **Description**: Complete testing suite for trade-manager observability features
- **Files**: Test files in `apps/trade-manager/tests/`
- **Acceptance Criteria**:
  - Unit tests for all metric emission scenarios
  - Integration tests for trace token extraction and usage
  - Health check endpoint tests with various Redis states
  - Performance tests to ensure minimal overhead
  - End-to-end tests with mock signal processing
- **Dependencies**: Tasks 8, 9
- **Validation**: All tests pass with >90% code coverage for observability features

## Phase 5: Integration and Validation

### Task 11: End-to-End Trace Token Testing
- **Description**: Create comprehensive tests for trace token propagation across all services
- **Files**: New integration test files
- **Acceptance Criteria**:
  - Trace token flows from telegram-service through interpret-service to trade-manager
  - Trace tokens are consistent in logs across all services
  - Trace tokens are included in all metrics
- **Dependencies**: Tasks 2, 5, 8 (Trace Token Implementation)
- **Validation**: Integration test suite with full message pipeline

### Task 12: Metrics Dashboard Verification
- **Description**: Verify all metrics appear correctly in Sentry dashboard with proper tags and values
- **Files**: Documentation and monitoring setup
- **Acceptance Criteria**:
  - All specified metrics are visible in Sentry
  - Metrics have correct tags (channel, traceToken, type, etc.)
  - Metric values are accurate and update in real-time
  - Placeholder metrics from interpret-service are properly structured
- **Dependencies**: Tasks 2, 5, 8 (Metrics Implementation)
- **Validation**: Manual verification in Sentry dashboard with test data

### Task 13: Performance Impact Assessment
- **Description**: Measure and validate that metric emission and trace token propagation don't impact service performance
- **Files**: Performance test scripts and documentation
- **Acceptance Criteria**:
  - Metric emission adds less than 5ms overhead per operation
  - Trace token processing adds less than 1ms overhead
  - Health checks complete within specified timeouts
  - Memory usage increase is minimal (< 10MB per service)
- **Dependencies**: All implementation tasks
- **Validation**: Load tests with and without observability features

### Task 14: Documentation and Deployment
- **Description**: Create documentation for observability features and prepare deployment configuration
- **Files**: README updates, deployment scripts, monitoring guides
- **Acceptance Criteria**:
  - Documentation for metric names, tags, and meanings
  - Troubleshooting guide for trace token issues
  - Deployment configuration for production metrics
  - Monitoring alert configurations
- **Dependencies**: All previous tasks
- **Validation**: Documentation review and deployment dry-run
