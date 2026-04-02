# Proposal: Improve Price Streaming Resilience

## Why

The OANDA price streaming job is critical infrastructure for the trading system. When it fails due to network errors like `ECONNRESET`, the entire service loses access to live price data, making it unable to:

- Execute new trades (no current prices for order placement)
- Monitor existing positions (no price updates for stop-loss/take-profit triggers)
- Calculate accurate profit/loss (stale price data)
- Respond to market movements in real-time

**Current Impact**: The job crashes on network errors and does not recover automatically, requiring manual intervention. After 5 consecutive failures, it stops permanently, leaving the service in a degraded state indefinitely.

**Business Risk**: Without live prices, the trading system cannot function. This creates significant risk exposure as positions cannot be managed properly and new trading opportunities are missed.

**Urgency**: This is a production issue that has already occurred (user reported `ECONNRESET` error causing job crash). The system needs to be resilient to transient network issues to ensure continuous operation.

## Problem Statement

The current OANDA price streaming implementation has critical gaps in error handling that can cause the executor-service to crash:

1. **Response Error Handling Gap**: In `context.ts` (lines 304-307), when a stream response error occurs (e.g., `ECONNRESET`), the error is only logged without any recovery mechanism. This causes the job to crash without attempting reconnection.

2. **No Stream-Level Error Recovery**: The `OandaPriceStreamingJob` only handles errors during initial connection (`startStreaming()` try-catch), but does not handle errors that occur after the stream is established.

3. **Limited Retry Strategy**: While exponential backoff exists for initial connection failures, it stops after 5 attempts (`MAX_FAILURES`), leaving the service without price streaming indefinitely.

4. **Single Point of Failure**: The price streaming job is critical infrastructure - if it fails permanently, the entire trading system loses access to live prices, making it unable to execute trades or monitor positions effectively.

## Current Behavior

**When `ECONNRESET` or similar network errors occur:**
- The error is logged in `context.ts` line 306
- The stream stops receiving data
- The job does not detect the disconnection
- No reconnection attempt is made
- The application continues running but without live price updates
- Eventually, the lack of price data causes downstream failures

**Existing retry logic only covers:**
- Initial connection failures (before stream starts)
- Limited to 5 consecutive attempts
- Does not handle mid-stream disconnections

## Proposed Solution

### 1. **Stream Response Error Handling**
Enhance `context.ts` to propagate response errors to the caller instead of just logging them, allowing the job to detect and handle disconnections.

### 2. **Continuous Reconnection Strategy**
- Remove the `MAX_FAILURES` limit - the job should retry indefinitely until the app exits
- Implement exponential backoff with a reasonable maximum delay (e.g., 30 seconds)
- Reset backoff on successful connection
- Add jitter to prevent thundering herd if multiple instances restart simultaneously

### 3. **Stream Health Monitoring**
- Detect when the stream stops receiving data (no heartbeats within expected interval)
- Automatically trigger reconnection when stream appears dead
- Track stream uptime and reconnection metrics

### 4. **Graceful Error Recovery**
- Clean up resources (stop existing stream) before attempting reconnection
- Prevent multiple simultaneous reconnection attempts
- Ensure the job can be stopped cleanly even during reconnection

## Success Criteria

1. **Resilience**: The streaming job recovers automatically from all transient network errors (ECONNRESET, ETIMEDOUT, etc.)
2. **Persistence**: The job retries indefinitely (with backoff) until the application is intentionally stopped
3. **Observability**: All errors are logged with context and captured in Sentry for monitoring
4. **Testability**: Integration tests verify error recovery and reconnection behavior
5. **Clean Shutdown**: The job can be stopped gracefully even during error recovery

## Out of Scope

- Alternative price data sources or fallback mechanisms
- Circuit breaker patterns for detecting systemic OANDA outages
- Rate limiting or request throttling
- Stream health metrics/dashboards (beyond logging)
- Heartbeat timeout detection (future enhancement)

## Implementation Approach

1. Modify `context.ts` to emit/reject on response errors instead of just logging
2. Update `OandaPriceStreamingJob` to handle stream disconnections
3. Remove `MAX_FAILURES` limit and implement infinite retry with backoff
4. Add comprehensive error handling for all stream lifecycle events
5. Create integration tests for various error scenarios
6. Update existing tests to verify new behavior

## Dependencies

- No new external dependencies required
- Builds on existing retry logic and error handling patterns
- Uses existing Sentry integration for error tracking
