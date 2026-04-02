# Design: Improve Price Streaming Resilience

## Overview

This design addresses critical gaps in the OANDA price streaming error handling that can cause the executor-service to lose live price data indefinitely. The solution implements comprehensive error recovery with infinite retry and proper stream lifecycle management.

## Current Architecture Issues

### 1. Error Handling Gap in context.ts

```typescript
// Current implementation (line 304-307)
response.on('error', (error) => {
  isStreamActive = false;
  logger.error({ error }, 'Stream response error');
  // ❌ No reconnection mechanism triggered
  // ❌ Job doesn't know stream died
});
```

**Problem**: The error is logged but not propagated, leaving the job unaware that the stream has stopped.

### 2. Limited Retry in OandaPriceStreamingJob

```typescript
// Current implementation (line 254-260)
if (this.consecutiveFailures >= this.MAX_FAILURES) {
  logger.error(
    { consecutiveFailures: this.consecutiveFailures },
    'Max consecutive failures reached, stopping OANDA price streaming'
  );
  return; // ❌ Job stops permanently after 5 failures
}
```

**Problem**: The job gives up after 5 failures, leaving the service without price data.

### 3. No Mid-Stream Error Detection

The job only handles errors during initial connection (`startStreaming()` try-catch). Once the stream is established, there's no mechanism to detect when it stops working.

## Proposed Architecture

### 1. Enhanced Error Propagation in context.ts

The stream response error handler should allow the job to detect disconnections:

```typescript
response.on('error', (error) => {
  isStreamActive = false;
  logger.error({ error, errorCode: error.code }, 'Stream response error');
  // The stream naturally stops when response errors
  // The job will detect this when trying to use the stream
});
```

**Key insight**: We don't need to explicitly reject the promise on response errors. The stream naturally stops working, and the job can detect this through other means (e.g., lack of heartbeats, or by monitoring the stream state).

However, for immediate detection, we can enhance the job to monitor stream health.

### 2. Infinite Retry with Exponential Backoff

```typescript
// Remove MAX_FAILURES limit
private consecutiveFailures = 0;
private readonly BACKOFF_DELAYS = [1000, 2000, 4000, 8000, 30000]; // ms

async startStreaming() {
  try {
    // ... establish stream connection ...
    
    // ✅ CRITICAL: Reset counter on successful connection
    this.consecutiveFailures = 0;
    logger.info('OANDA price streaming started successfully');
    
  } catch (error) {
    // Increment failure counter
    this.consecutiveFailures++;
    
    // Calculate backoff delay (capped at max)
    const delayIndex = Math.min(
      this.consecutiveFailures - 1,
      this.BACKOFF_DELAYS.length - 1
    );
    const delay = this.BACKOFF_DELAYS[delayIndex];
    
    logger.error(
      { consecutiveFailures: this.consecutiveFailures, delay },
      'Stream connection failed, retrying with backoff'
    );
    
    // Retry indefinitely unless shutting down
    setTimeout(() => {
      if (!this.isShuttingDown) {
        this.startStreaming();
      }
    }, delay);
  }
}
```

**Benefits**:
- Continues retrying indefinitely
- Caps maximum delay at 30 seconds (after 5+ failures)
- Resets to 1-second delay on successful reconnection (counter = 0)
- Prevents overwhelming the OANDA API during outages
- Allows fast recovery after brief network glitches
- Allows service to recover from extended outages

**Example Timeline**:
```
T+0s:   Initial connection succeeds (consecutiveFailures = 0)
T+60s:  ECONNRESET error occurs
T+60s:  consecutiveFailures = 1, retry in 1 second
T+61s:  Connection fails again
T+61s:  consecutiveFailures = 2, retry in 2 seconds
T+63s:  Connection fails again
T+63s:  consecutiveFailures = 3, retry in 4 seconds
T+67s:  Connection succeeds! ✅
T+67s:  consecutiveFailures = 0 (RESET)
T+120s: ECONNRESET error occurs again
T+120s: consecutiveFailures = 1, retry in 1 second (back to fast retry!)
T+121s: Connection succeeds! ✅
```

This ensures that:
- Brief network glitches recover quickly (1-2 second retry)
- Extended outages don't overwhelm the API (capped at 30s)
- After recovery, the system is ready for fast retry again

### 3. Stream Lifecycle State Machine

```
┌─────────────┐
│  STOPPED    │
└──────┬──────┘
       │ init()
       ▼
┌─────────────┐
│ CONNECTING  │◄────────┐
└──────┬──────┘         │
       │ success        │
       ▼                │
┌─────────────┐         │
│  STREAMING  │         │
└──────┬──────┘         │
       │ error          │
       ▼                │
┌─────────────┐         │
│   BACKOFF   │─────────┘
└──────┬──────┘  retry
       │ stop()
       ▼
┌─────────────┐
│  STOPPED    │
└─────────────┘
```

**States**:
- **STOPPED**: Initial state or after shutdown
- **CONNECTING**: Attempting to establish stream
- **STREAMING**: Active stream receiving data
- **BACKOFF**: Waiting before retry after error

### 4. Error Detection Strategy

**Immediate Detection** (for request/connection errors):
- Caught in `startStreaming()` try-catch
- Triggers immediate backoff and retry

**Response Error Detection** (for mid-stream errors):
- `response.on('error')` sets `isStreamActive = false`
- Stream stops processing chunks
- Job can optionally monitor heartbeat intervals to detect dead streams

**Chunk Processing Errors** (non-fatal):
- Caught in chunk handler try-catch
- Logged and sent to Sentry
- Stream continues operating

## Implementation Strategy

### Phase 1: Core Error Handling (Group 1)

1. Enhance `context.ts` error handlers to provide better error context
2. Ensure errors are properly logged with error codes
3. Verify stream cleanup happens correctly

### Phase 2: Job Resilience (Group 2)

1. Remove `MAX_FAILURES` limit
2. Implement infinite retry with backoff
3. Add stream cleanup before reconnection
4. Enhance error logging and Sentry integration
5. Improve shutdown handling

### Phase 3: Testing (Group 3)

1. Create integration tests for various error scenarios:
   - ECONNRESET during streaming
   - ETIMEDOUT during connection
   - Rapid successive failures
   - Shutdown during backoff
   - Chunk processing errors
2. Verify infinite retry behavior
3. Verify proper cleanup and resource management

### Phase 4: Documentation (Group 4)

1. Update code comments
2. Document error recovery behavior
3. Add JSDoc for error handling methods

## Error Scenarios and Handling

| Error Type   | When It Occurs              | Detection               | Recovery        |
| ------------ | --------------------------- | ----------------------- | --------------- |
| ECONNRESET   | Mid-stream connection reset | `response.on('error')`  | Backoff + retry |
| ECONNREFUSED | Initial connection refused  | `req.on('error')`       | Backoff + retry |
| ETIMEDOUT    | Connection timeout          | `req.on('error')`       | Backoff + retry |
| ENOTFOUND    | DNS resolution failure      | `req.on('error')`       | Backoff + retry |
| HTTP 4xx/5xx | API error response          | Response status check   | Backoff + retry |
| Parse Error  | Malformed JSON chunk        | Chunk handler try-catch | Log + continue  |
| Redis Error  | Cache write failure         | Chunk handler try-catch | Log + continue  |

## Resource Management

### Stream Cleanup Checklist

Before each reconnection:
1. Call `streamStop()` if it exists
2. Set `streamStop = undefined`
3. Ensure `isStreamActive = false`
4. Clear any pending timers
5. Wait for cleanup to complete

### Preventing Resource Leaks

- Only one active stream at a time
- Proper cleanup on errors
- Cancel timers on shutdown
- No dangling promises

## Monitoring and Observability

### Logging Strategy

**Error Logs** (level: error):
- Error object with stack trace
- Error code (ECONNRESET, etc.)
- Consecutive failure count
- Account ID and symbols
- Timestamp

**Recovery Logs** (level: info):
- Successful reconnection
- Number of failures before recovery
- Stream uptime

**Debug Logs** (level: debug):
- Heartbeats
- Chunk processing (optional)

### Sentry Integration

**Error Context**:
- Tags: `component: oanda-price-streaming`, `action: stream-error`, `accountId`
- Extra: `symbols`, `consecutiveFailures`, `errorCode`, `errorMessage`

**Grouping**: Errors should group by error code to identify patterns

## Testing Strategy

### Integration Tests

1. **Error Recovery Tests**:
   - Mock stream to emit ECONNRESET
   - Verify job reconnects automatically
   - Verify backoff delays are correct

2. **Infinite Retry Tests**:
   - Mock stream to fail 10+ times
   - Verify job continues retrying
   - Verify no MAX_FAILURES limit

3. **Shutdown Tests**:
   - Start job, trigger error, call stop during backoff
   - Verify clean shutdown
   - Verify no reconnection after stop

4. **Chunk Error Tests**:
   - Mock Redis to fail during cache write
   - Verify stream continues
   - Verify error is logged

### Test Utilities

```typescript
// Helper to simulate stream errors
const simulateStreamError = (errorCode: string) => {
  const error = new Error('Stream error');
  (error as any).code = errorCode;
  mockOandaClient.pricing.streamAsync.mockRejectedValue(error);
};

// Helper to verify backoff timing
const verifyBackoffDelay = async (expectedDelay: number) => {
  const startTime = Date.now();
  await sleep(expectedDelay + 100); // Buffer
  expect(mockOandaClient.pricing.streamAsync).toHaveBeenCalled();
};
```

## Rollout Plan

1. **Deploy to staging**: Monitor for 24 hours
2. **Verify error recovery**: Simulate network issues
3. **Check Sentry**: Ensure errors are captured correctly
4. **Monitor logs**: Verify reconnection behavior
5. **Deploy to production**: Gradual rollout with monitoring

## Future Enhancements (Out of Scope)

1. **Heartbeat Timeout Detection**: Automatically reconnect if no heartbeat received within expected interval
2. **Circuit Breaker**: Detect systemic OANDA outages and back off more aggressively
3. **Fallback Data Source**: Use alternative price feeds when OANDA is unavailable
4. **Metrics Dashboard**: Track stream uptime, reconnection frequency, error rates
5. **Jitter in Backoff**: Add randomization to prevent thundering herd

## Risk Assessment

| Risk                                      | Likelihood | Impact | Mitigation                           |
| ----------------------------------------- | ---------- | ------ | ------------------------------------ |
| Infinite retry causes resource exhaustion | Low        | Medium | Cap max delay at 30s, proper cleanup |
| Rapid reconnection overwhelms OANDA       | Low        | Medium | Exponential backoff prevents this    |
| Errors not properly detected              | Medium     | High   | Comprehensive integration tests      |
| Memory leaks from uncleaned streams       | Low        | High   | Strict cleanup before reconnection   |
| Job can't be stopped during retry         | Low        | Medium | Check `isShuttingDown` before retry  |

## Success Metrics

1. **Resilience**: 99.9% uptime for price streaming (excluding OANDA outages)
2. **Recovery Time**: Average < 10 seconds to recover from transient errors
3. **Error Rate**: < 1% of streaming sessions experience unrecoverable errors
4. **Clean Shutdown**: 100% of stop() calls complete within 5 seconds

## Conclusion

This design provides a robust, production-ready solution for OANDA price streaming resilience. By implementing infinite retry with exponential backoff, comprehensive error handling, and proper resource management, the executor-service will maintain continuous access to live price data even during network instability or temporary OANDA outages.
