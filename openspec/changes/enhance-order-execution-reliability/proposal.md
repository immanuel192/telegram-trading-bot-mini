# Proposal: Enhance Order Execution Reliability

**Change ID:** `enhance-order-execution-reliability`  
**Status:** Draft  
**Created:** 2026-01-19

## Overview

This change enhances the reliability and robustness of order execution across three critical areas:

1. **Pips Support for New Orders**: Enable TP/SL specification using pips for both market and limit orders during order creation
2. **Groq AI Fallback**: Implement automatic fallback to alternative Groq models when primary model is over capacity
3. **Operation Hours Enforcement**: Prevent background jobs from executing outside configured trading hours

## Why

### Business Value

**Risk Management:** Pips-based TP/SL support ensures proper risk management for all order types, preventing orders from being created without stop loss protection when signals specify SL in pips rather than absolute prices.

**Service Reliability:** Groq AI fallback mechanism improves service availability during peak usage, ensuring trading signals are not lost due to temporary model capacity issues. This directly impacts user experience and trading opportunities.

**Cost Optimization:** Operation hours enforcement reduces unnecessary API calls to brokers during market closure, lowering costs for metered APIs and preventing rate limit consumption that could affect trading during active hours.

### User Impact

- **Traders:** More reliable order execution with consistent TP/SL behavior regardless of specification format (price vs pips)
- **System Operators:** Reduced service degradation during AI model capacity issues
- **Cost Management:** Lower operational costs through intelligent job scheduling

### Technical Debt Reduction

This change addresses three technical gaps identified during production usage:
1. Incomplete pips support (only SET_TP_SL, not order creation)
2. Single point of failure in AI translation (no fallback)
3. Inefficient resource usage (jobs running during market closure)

## Problem Statement

### 1. Pips Support Gap for New Orders

**Current State:**
- `SET_TP_SL` command supports pips-to-price conversion
- New order creation (`handleOpenOrder`) does NOT convert pips to prices
- Pips are passed directly to broker adapter, which expects prices
- Result: TP/SL are silently NOT attached to orders when specified in pips

**Impact:**
- Orders created without stop loss protection when SL specified in pips
- Orders created without take profit when TP specified in pips
- Risk management failure for pips-based signals

**Evidence:**
```typescript
// Current code in handleOpenOrder (line 249-263)
// Entry price resolution happens AFTER TP/SL processing
// Pips cannot be converted without entry price

// Line 324-342: Pips passed directly to adapter
stopLoss: shouldDeferStopLoss ? undefined : adjustedStopLoss,  // May contain pips
takeProfits: selectedTakeProfit,  // May contain pips
```

### 2. Groq Model Capacity Issues

**Current State:**
- Single model configuration (`AI_GROQ_MODEL`)
- No fallback mechanism when model is over capacity
- Errors propagate directly to user as failed translations

**Impact:**
- Service degradation during peak usage
- Lost trading signals due to 503 errors
- No graceful degradation path

**Evidence:**
```
503 {"error":{"message":"meta-llama/llama-4-maverick-17b-128e-instruct is currently over capacity. Please try again and back off exponentially. Visit https://groqstatus.com to see if there is an active incident.","type":"internal_server_error"}}
```

### 3. Background Jobs Running Outside Trading Hours

**Current State:**
- `fetch-price-job` and `fetch-balance-job` run on fixed schedules
- No operation hours validation
- Unnecessary API calls to brokers during closed hours
- Potential rate limit consumption

**Impact:**
- Wasted API quota during market closure
- Unnecessary Redis cache updates
- Potential rate limiting during closed hours
- Increased costs for metered APIs

## Proposed Solution

### 1. Pips-to-Price Conversion for New Orders

**Approach:**
- Move entry price resolution earlier in `handleOpenOrder` (before TP/SL processing)
- Reuse existing `convertPipsToPrice` logic for both market and limit orders
- Convert pips to prices before passing to broker adapter

**Key Changes:**
1. Restructure `handleOpenOrder` to resolve entry price first
2. Add pips-to-price conversion for both SL and TP
3. Maintain existing behavior for price-based SL/TP

**Assumptions:**
- When TP/SL specified in pips, only single tier (not multiple TPs)
- Pips conversion requires entry price (must be available)
- For market orders without entry, use cached price or defer

### 2. Groq Model Fallback

**Approach:**
- Add `AI_GROQ_MODEL_FALLBACK` configuration
- Extract request logic into reusable function
- Implement single retry on 503 errors
- Use fallback model for retry attempt

**Key Changes:**
1. Add fallback model configuration
2. Refactor `translateMessage` to extract request logic
3. Add error handling with 503 detection
4. Retry once with fallback model

**Assumptions:**
- Only retry on HTTP 503 (over capacity)
- Single retry attempt (no exponential backoff)
- Accept higher latency for fallback
- Fallback model has same capabilities as primary

### 3. Operation Hours Enforcement for Jobs

**Approach:**
- Extract operation hours validation from `OrderExecutorService`
- Create reusable service/utility
- Add validation to `fetch-price-job` and `fetch-balance-job`
- Skip execution when outside operation hours

**Key Changes:**
1. Extract `validateMarketHours` logic to standalone service
2. Update both jobs to check operation hours before execution
3. Use `AccountService` to fetch account configuration
4. Log skipped executions for observability

**Assumptions:**
- Jobs have access to `accountId` via adapter
- `AccountService.getAccountById` is performant (cached)
- Operation hours apply to background jobs (not just order execution)
- All adapters in a job share same operation hours (account-level)

## Scope

### In Scope
- Pips conversion for new order creation (market and limit)
- Groq fallback mechanism for 503 errors
- Operation hours validation for price and balance jobs
- Unit and integration tests for all changes
- Documentation updates

### Out of Scope
- Pips support for other order types (already supported in `SET_TP_SL`)
- Multiple fallback models (only one fallback)
- Exponential backoff for Groq retries
- Symbol-level operation hours for jobs
- Operation hours for other background jobs

## Dependencies

- Existing `convertPipsToPrice` method in `OrderExecutorService`
- Existing `OperationTimeCheckerService` in executor-service
- Existing `AccountService` with caching
- Groq SDK error handling

## Risks and Mitigations

| Risk                                          | Impact | Mitigation                                                         |
| --------------------------------------------- | ------ | ------------------------------------------------------------------ |
| Entry price not available for pips conversion | High   | Use cached price for market orders, require entry for limit orders |
| Fallback model has different capabilities     | Medium | Use similar model tier, validate schema support                    |
| Operation hours check adds latency to jobs    | Low    | Use cached account data, minimal overhead                          |
| Jobs skip execution incorrectly               | Medium | Comprehensive testing, logging for debugging                       |

## Success Criteria

1. **Pips Support:**
   - Market and limit orders with pips-based SL/TP are created with correct prices
   - Existing price-based SL/TP continues to work
   - No regression in order execution flow

2. **Groq Fallback:**
   - 503 errors trigger fallback to alternative model
   - Fallback succeeds with valid translation
   - Single retry only (no infinite loops)

3. **Operation Hours:**
   - Jobs skip execution outside configured hours
   - Jobs execute normally during operation hours
   - Skipped executions are logged

## Open Questions

1. Should pips conversion log the conversion details in order history?
2. Should fallback model be configurable per channel or global only?
3. Should operation hours validation be per-adapter or per-account?
4. Should we add metrics for fallback usage and skipped job executions?

## Next Steps

1. Review and approve proposal
2. Create detailed spec deltas for each capability
3. Create task breakdown
4. Implement changes with tests
5. Validate in staging environment
