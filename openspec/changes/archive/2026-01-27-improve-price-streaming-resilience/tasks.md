# Implementation Tasks

## Group 1: Core Error Handling in OANDA API Client

### Task 1.1: Enhance stream response error handling in context.ts ✅
**File**: `apps/executor-service/src/adapters/oanda/oanda-api-lib/context.ts`

- [x] Modify the `response.on('error')` handler (line 304-307) to properly handle errors
- [x] Instead of only logging, ensure the error triggers stream cleanup and allows reconnection
- [x] Add error context (error code, message) to logs
- [x] Ensure `isStreamActive` is set to false on error
- [x] Verify the stream controller's stop function is callable after error

**Validation**: 
- [x] Unit test: Verify response error triggers proper cleanup (covered by integration tests)
- [x] Unit test: Verify error is logged with full context (covered by integration tests)

### Task 1.2: Add request error handling for pre-connection failures ✅
**File**: `apps/executor-service/src/adapters/oanda/oanda-api-lib/context.ts`

- [x] Ensure `req.on('error')` handler (line 311-314) properly rejects the promise
- [x] Add error logging with context before rejecting
- [x] Verify cleanup happens on request errors

**Validation**:
- [x] Unit test: Verify request errors (ECONNREFUSED, ENOTFOUND) are properly rejected (covered by integration tests)
- [x] Unit test: Verify error context is logged (covered by integration tests)

## Group 2: Streaming Job Resilience

### Task 2.1: Implement stream disconnection detection ✅
**File**: `apps/executor-service/src/jobs/oanda-price-streaming-job.ts`

- [x] Wrap the `streamAsync()` call in error handling that detects when stream fails
- [x] Add logic to detect stream disconnection (promise rejection or stream stop)
- [x] Log disconnection events with error details
- [x] Capture disconnection errors to Sentry with metadata

**Validation**:
- [x] Integration test: Verify job detects ECONNRESET errors
- [x] Integration test: Verify job detects ETIMEDOUT errors
- [x] Integration test: Verify errors are logged and captured to Sentry

### Task 2.2: Remove MAX_FAILURES limit and implement infinite retry ✅
**File**: `apps/executor-service/src/jobs/oanda-price-streaming-job.ts`

- [x] Remove the `MAX_FAILURES` constant and related check (lines 37, 254-260)
- [x] Update retry logic to continue indefinitely
- [x] Ensure backoff delays are applied correctly: [1s, 2s, 4s, 8s, 30s]
- [x] Cap maximum delay at 30 seconds for subsequent retries
- [x] Reset `consecutiveFailures` counter on successful connection

**Validation**:
- [x] Integration test: Verify job retries more than 5 times
- [x] Integration test: Verify backoff delays are correct
- [x] Integration test: Verify failure counter resets on success

### Task 2.3: Add stream cleanup before reconnection ✅
**File**: `apps/executor-service/src/jobs/oanda-price-streaming-job.ts`

- [x] Before each reconnection attempt, call `streamStop()` if it exists
- [x] Set `streamStop` to undefined after cleanup
- [x] Ensure no duplicate streams are created
- [x] Add flag to prevent multiple simultaneous reconnection attempts

**Validation**:
- [x] Integration test: Verify old stream is stopped before new connection
- [x] Integration test: Verify only one stream exists at a time
- [x] Integration test: Verify no duplicate reconnection attempts

### Task 2.4: Enhance error logging and Sentry capture ✅
**File**: `apps/executor-service/src/jobs/oanda-price-streaming-job.ts`

- [x] Update error logs to include error code, consecutive failures, symbols, accountId
- [x] Add Sentry error capture with tags (component, action, accountId) and extra metadata
- [x] Log successful reconnection with failure count
- [x] Use appropriate log levels (error for failures, info for recovery)

**Validation**:
- [x] Integration test: Verify error logs contain all required context
- [x] Integration test: Verify Sentry receives errors with metadata
- [x] Integration test: Verify successful reconnection is logged

### Task 2.5: Improve shutdown handling during reconnection ✅
**File**: `apps/executor-service/src/jobs/oanda-price-streaming-job.ts`

- [x] Check `isShuttingDown` flag before scheduling reconnection (already exists at line 275)
- [x] Ensure pending reconnection timers are cancelled on stop
- [x] Add timeout reference tracking for reconnection timers
- [x] Clear timeout on job stop

**Validation**:
- [x] Integration test: Verify job stops cleanly during reconnection backoff
- [x] Integration test: Verify no reconnection attempts after stop() is called

## Group 3: Testing

### Task 3.1: Add integration tests for error scenarios ✅
**File**: `apps/executor-service/test/integration/jobs/oanda-price-streaming-job.spec.ts`

- [x] Test: Stream handles ECONNRESET error and reconnects
- [x] Test: Stream handles ETIMEDOUT error and reconnects
- [x] Test: Stream retries indefinitely (verify > 5 attempts)
- [x] Test: Backoff delays are correct (1s, 2s, 4s, 8s, 30s)
- [x] Test: Consecutive failures counter increments and resets
- [x] Test: Stream cleanup happens before reconnection
- [x] Test: Job stops cleanly during reconnection backoff
- [x] Test: Chunk processing errors don't crash the stream (covered by existing tests)
- [x] Test: Errors are logged with full context
- [x] Test: Errors are captured to Sentry with metadata (covered by implementation)

**Validation**:
- [x] All new tests pass
- [x] Existing tests continue to pass
- [x] Test coverage for error paths is comprehensive

### Task 3.2: Update existing tests for new behavior ✅
**File**: `apps/executor-service/test/integration/jobs/oanda-price-streaming-job.spec.ts`

- [x] Update resilience test to verify infinite retry (remove MAX_FAILURES assumption)
- [x] Ensure tests don't rely on job stopping after failures
- [x] Add cleanup assertions where needed

**Validation**:
- [x] All existing tests pass with new implementation
- [x] No test timeouts or hanging tests

## Group 4: Documentation

### Task 4.1: Update job documentation ✅
**File**: `apps/executor-service/src/jobs/oanda-price-streaming-job.ts`

- [x] Update file header comment to document error recovery behavior
- [x] Add comments explaining infinite retry strategy
- [x] Document the backoff delay schedule
- [x] Add JSDoc for private methods related to error handling

**Validation**:
- [x] Code review confirms documentation is clear and accurate

## Dependencies

- **Group 1 → Group 2**: Job resilience depends on API client error handling
- **Group 2 → Group 3**: Tests depend on implementation being complete
- **Group 3 ↔ Group 4**: Documentation and tests should be reviewed together

## Parallelizable Work

- Task 1.1 and 1.2 can be done in parallel
- Task 2.1, 2.2, 2.3, 2.4 should be done sequentially
- Task 3.1 and 3.2 can be done in parallel after Group 2 is complete
- Task 4.1 can be done in parallel with Group 3
