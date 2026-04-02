# Spec Delta: Groq Model Fallback

**Capability:** `groq-model-fallback`  
**Related Specs:** `ai-translation-service`

## ADDED Requirements

### Requirement: Fallback to alternative model on capacity errors

The interpret-service SHALL automatically retry translation requests with a fallback Groq model when the primary model returns a 503 over-capacity error.

#### Scenario: Primary model over capacity, fallback succeeds

**Given** the primary Groq model is `llama-4-maverick-17b-128e-instruct`
**And** the fallback model is `llama-3.3-70b-versatile`
**And** a translation request for message "Buy XAUUSD at 4200"

**When** the primary model returns HTTP 503 with message "over capacity"

**Then** the system SHALL:
1. Detect the 503 error
2. Log the fallback attempt
3. Retry the request with fallback model
4. Return the translation result from fallback model
5. Track fallback usage in metrics

#### Scenario: Both primary and fallback fail

**Given** the primary model returns 503
**And** the fallback model also returns 503

**When** translation is attempted

**Then** the system SHALL:
1. Try primary model (fails with 503)
2. Try fallback model once (fails with 503)
3. Return error response to caller
4. NOT retry infinitely
5. Log both failures

#### Scenario: Primary model succeeds (no fallback needed)

**Given** the primary model is available

**When** translation is requested

**Then** the system SHALL:
1. Use primary model
2. Return result successfully
3. NOT attempt fallback
4. NOT log fallback attempts

#### Scenario: Non-503 error (no fallback)

**Given** the primary model returns HTTP 400 (bad request)

**When** translation is attempted

**Then** the system SHALL:
1. Return the error immediately
2. NOT attempt fallback
3. Only fallback on 503 errors

### Requirement: Configure fallback model

The interpret-service SHALL support configuration of a fallback Groq model via environment variable.

#### Scenario: Fallback model configured

**Given** environment variable `AI_GROQ_MODEL_FALLBACK=llama-3.3-70b-versatile`

**When** the service initializes

**Then** the system SHALL:
1. Load the fallback model configuration
2. Validate the model name
3. Use this model for fallback attempts

#### Scenario: No fallback model configured

**Given** `AI_GROQ_MODEL_FALLBACK` is not set

**When** a 503 error occurs

**Then** the system SHALL:
1. Log warning about missing fallback
2. Return error without retry
3. NOT crash or throw exception

### Requirement: Single retry attempt

The interpret-service SHALL attempt fallback exactly once per translation request, preventing infinite retry loops.

#### Scenario: Fallback attempted only once

**Given** primary model returns 503
**And** fallback model returns 503

**When** translation is requested

**Then** the system SHALL:
1. Try primary model (1st attempt)
2. Try fallback model (2nd attempt)
3. Return error after fallback fails
4. NOT try primary model again
5. Total attempts: exactly 2

### Requirement: Validate fallback model capabilities

The interpret-service SHALL validate that the fallback model supports required capabilities during initialization and log warnings for capability mismatches.

#### Scenario: Fallback model lacks JSON schema support

**Given** primary model supports JSON schema
**And** fallback model does NOT support JSON schema

**When** the service initializes

**Then** the system SHALL:
1. Detect capability mismatch
2. Log warning about degraded accuracy
3. Continue initialization (non-blocking)
4. Use fallback model without JSON schema enforcement when needed

#### Scenario: Both models support JSON schema

**Given** both primary and fallback models support JSON schema

**When** the service initializes

**Then** the system SHALL:
1. Validate both models
2. NOT log warnings
3. Use JSON schema for both models

### Requirement: Track fallback usage metrics

The interpret-service SHALL emit metrics for fallback usage to enable monitoring and alerting.

#### Scenario: Track successful fallback

**Given** primary model fails with 503
**And** fallback model succeeds

**When** translation completes

**Then** the system SHALL:
1. Emit metric: `ai.groq.fallback.success`
2. Include tags: primary model, fallback model, channel ID
3. Track latency of fallback request separately

#### Scenario: Track failed fallback

**Given** both primary and fallback models fail

**When** translation fails

**Then** the system SHALL:
1. Emit metric: `ai.groq.fallback.failure`
2. Include error details in tags
3. Track total failure count

## Future Enhancements

### Circuit Breaker Pattern for Sustained Outages

**Context:**
The current implementation retries with fallback model on every 503 error, which adds 1-2 seconds latency per request during Groq outages. For sustained outages (multiple consecutive 503s), this approach results in:
- Repeated failed attempts to primary model
- Accumulated latency across multiple requests
- Unnecessary load on already-overloaded primary model

**Observed Pattern:**
Production data shows 2-3% 503 rate (6-10 errors per 300 messages), indicating occasional capacity issues that could benefit from circuit breaker pattern.

**Proposed Enhancement:**
Implement a circuit breaker that temporarily switches to fallback model after detecting sustained primary model failures:

```typescript
// Circuit breaker state
interface CircuitBreakerState {
  failureCount: number;        // Consecutive 503 failures
  lastFailureTime: number;     // Timestamp of last failure
  circuitOpenUntil: number;    // When to retry primary model
}

// Configuration
const FAILURE_THRESHOLD = 3;      // Open circuit after 3 consecutive 503s
const CIRCUIT_OPEN_DURATION = 30000; // Keep circuit open for 30 seconds
const FAILURE_WINDOW = 60000;     // Reset failure count after 60s of no failures
```

**Behavior:**
1. **Normal operation:** Use primary model
2. **After 3 consecutive 503s within 60s:** Open circuit, use fallback for 30s
3. **After 30s:** Try primary model again
4. **If primary succeeds:** Close circuit, reset counter
5. **If primary fails again:** Re-open circuit for another 30s

**Benefits:**
- Reduced latency during outages (skip failed primary attempts)
- Less load on overloaded primary model (helps recovery)
- Better user experience (consistent response times)
- Cost optimization (fewer failed API calls)

**Implementation Considerations:**
- **State management:** In-memory for single instance, Redis for multi-instance
- **Configuration:** Make thresholds and duration configurable
- **Metrics:** Track circuit state changes (open/close events)
- **Logging:** Log circuit state transitions for debugging

**When to Implement:**
- Request volume exceeds 1000 messages/day
- 503 rate consistently above 5%
- Multiple interpret-service instances deployed
- Latency becomes critical for user experience

**Estimated Effort:** 3-4 hours implementation + 2 hours testing

## MODIFIED Requirements

None - This adds new fallback behavior without changing existing translation logic.

## REMOVED Requirements

None
