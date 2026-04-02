# Design Document: Enhance Order Execution Reliability

**Change ID:** `enhance-order-execution-reliability`

## Architecture Overview

This change enhances three independent but related aspects of the trading system:

```
┌─────────────────────────────────────────────────────────────┐
│                    System Improvements                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────┐│
│  │ Pips Support     │  │ Groq Fallback    │  │ Op Hours   ││
│  │ (executor-svc)   │  │ (interpret-svc)  │  │ (jobs)     ││
│  └──────────────────┘  └──────────────────┘  └────────────┘│
│         │                      │                    │        │
│         ▼                      ▼                    ▼        │
│  Better Risk Mgmt      Higher Availability   Cost Savings   │
└─────────────────────────────────────────────────────────────┘
```

## Design Decisions

### 1. Pips Support for New Orders

#### Decision: Reuse Existing Conversion Logic

**Rationale:**
- `convertPipsToPrice` method already exists for `SET_TP_SL` command
- Proven logic with correct calculations for LONG/SHORT
- Maintains consistency across the codebase
- Reduces duplication and maintenance burden

**Alternative Considered:**
- Implement separate conversion logic for new orders
- **Rejected:** Would duplicate logic and increase maintenance

#### Decision: Move Entry Price Resolution Earlier

**Rationale:**
- Pips conversion requires entry price
- Current flow resolves entry AFTER TP/SL processing
- Moving earlier enables pips conversion
- Minimal impact on existing flow

**Note on Market Orders:**
Trade-manager already injects live price into payload for market orders, ensuring entry price is available for SL/TP calculation. This addresses the edge case where cached price might not be available in executor-service.

**Implementation:**
```typescript
// Before (lines 249-263 after TP/SL processing)
let entryToUse = entry;
if (!entry) {
  entryToUse = await getCachedPrice();
}

// After (lines 230-243 before TP/SL processing)
let entryToUse = entry;
if (!entry) {
  entryToUse = await getCachedPrice();
}
// ... TP/SL processing can now use entryToUse
```

**Trade-offs:**
- ✅ Pro: Enables pips conversion
- ✅ Pro: Minimal code changes
- ✅ Pro: Trade-manager provides entry for market orders
- ⚠️ Consideration: Entry price fetched even if not needed (negligible impact)

#### Decision: Validate Pip Value Configuration

**Rationale:**
- Pip value of 0 or negative would cause incorrect calculations
- Missing pip value should use safe default (0.1)
- Validation prevents silent calculation errors
- Logging helps identify configuration issues

**Implementation:**
```typescript
const pipValue = account.symbols?.[symbol]?.pipValue ?? 0.1;

if (pipValue <= 0) {
  this.logger.error({ symbol, pipValue }, 'Invalid pip value - using default 0.1');
  pipValue = 0.1;
}
```

**Trade-offs:**
- ✅ Pro: Prevents calculation errors
- ✅ Pro: Clear error messages for debugging
- ⚠️ Consideration: Adds validation overhead (minimal)

#### Decision: Log Pips Conversion in Order History

**Rationale:**
- Auditability: Track what conversions were applied
- Debugging: Understand why specific prices were used
- Consistency: Similar to SET_TP_SL command logging
- Transparency: Users can see conversion details

**Implementation:**
```typescript
// Add INFO history entry
await orderHistoryService.addHistory({
  orderId,
  action: 'pips_to_price_conversion',
  level: 'INFO',
  details: {
    conversions: [
      { type: 'SL', pips: 100, price: 4190, pipValue: 0.1, entry: 4200 },
      { type: 'TP', pips: 200, price: 4220, pipValue: 0.1, entry: 4200 }
    ]
  }
});
```

**Trade-offs:**
- ✅ Pro: Full auditability
- ✅ Pro: Easier debugging
- ⚠️ Consideration: Additional DB write (acceptable overhead)

#### Decision: Support Multiple TP Tiers with Pips

**Rationale:**
- Signals can specify TP ranges in pips (e.g., "TP 70-150pips")
- AI interprets this as multiple TP tiers: [70, 100, 150]
- Existing `TakeProfitSelectorService` already handles multiple TPs
- Conversion logic works the same for single or multiple TPs

**Implementation:**
```typescript
// Convert all TP tiers from pips to prices
if (takeProfits && takeProfits.length > 0) {
  const convertedTPs = takeProfits.map(tp => {
    if (tp.pips && !tp.price) {
      const tpPrice = this.calculatePriceFromPips(
        entryToUse,
        tp.pips,
        pipValue,
        side,
        'TP'
      );
      return { price: tpPrice };
    }
    return tp;
  });
  
  // TakeProfitSelectorService selects appropriate TP based on account config
  selectedTakeProfit = await this.takeProfitSelector.selectTakeProfit(
    convertedTPs,
    command,
    account
  );
}
```

**Example:**
```
Signal: "LONG XAUUSD 4200, TP 70-150pips"
Parsed TPs: [{ pips: 70 }, { pips: 100 }, { pips: 150 }]
Converted: [{ price: 4207 }, { price: 4210 }, { price: 4215 }]
Selected (takeProfitIndex=1): { price: 4210 }
```

**Trade-offs:**
- ✅ Pro: Supports common signal format
- ✅ Pro: Reuses existing TP selection logic
- ✅ Pro: No additional complexity (same conversion loop)
- ⚠️ Consideration: All TPs must use same format (all pips or all prices)

### 2. Groq Model Fallback

#### Decision: Single Retry with Fallback Model

**Rationale:**
- 503 errors are temporary capacity issues
- Single retry balances reliability vs. latency
- Exponential backoff not needed (different model, not same endpoint)
- Prevents infinite retry loops

**Alternative Considered:**
- Multiple retries with exponential backoff
- **Rejected:** Adds latency, complexity; single fallback sufficient

#### Decision: Validate JSON Schema Support

**Rationale:**
- Primary and fallback models may have different capabilities
- JSON schema support affects accuracy
- Warning during initialization helps operators understand trade-offs
- Non-blocking validation allows service to start

**Implementation:**
```typescript
constructor(apiKey, model, fallbackModel, ...) {
  this.model = model;
  this.fallbackModel = fallbackModel;
  this.supportsJsonSchema = JSON_SCHEMA_SUPPORTED_MODELS.includes(model);
  this.fallbackSupportsJsonSchema = JSON_SCHEMA_SUPPORTED_MODELS.includes(fallbackModel);
  
  if (this.supportsJsonSchema && !this.fallbackSupportsJsonSchema) {
    logger.warn({
      primary: model,
      fallback: fallbackModel
    }, 'Fallback model does not support JSON schema - may have degraded accuracy');
  }
}
```

**Trade-offs:**
- ✅ Pro: Clear visibility of capability differences
- ✅ Pro: Non-blocking (service still starts)
- ⚠️ Consideration: Fallback may have lower accuracy (acceptable for rare case)

#### Decision: Extract Request Logic to Separate Method

**Rationale:**
- Enables code reuse for primary and fallback
- Improves testability
- Follows DRY principle
- Makes retry logic clearer

**Implementation:**
```typescript
// Before: Monolithic translateMessage method
async translateMessage(...) {
  // ... setup
  const completion = await this.client.chat.completions.create({...});
  // ... processing
}

// After: Extracted request logic
private async executeTranslationRequest(model: string, ...) {
  return await this.client.chat.completions.create({
    model,
    ...
  });
}

async translateMessage(...) {
  try {
    return await this.executeTranslationRequest(this.model, ...);
  } catch (error) {
    if (error.status === 503) {
      return await this.executeTranslationRequest(fallbackModel, ...);
    }
    throw error;
  }
}
```

**Trade-offs:**
- ✅ Pro: Clean separation of concerns
- ✅ Pro: Easy to test
- ⚠️ Consideration: Slight increase in method count (acceptable)

#### Decision: Only Fallback on 503 Errors

**Rationale:**
- 503 = over capacity (temporary, retry makes sense)
- 400 = bad request (retry won't help)
- 401 = auth error (retry won't help)
- 429 = rate limit (should use backoff, not fallback)

**Alternative Considered:**
- Fallback on all errors
- **Rejected:** Would mask real issues (auth, validation, etc.)

### 3. Operation Hours Enforcement for Jobs

#### Decision: Reuse Existing OperationTimeCheckerService

**Rationale:**
- Service already exists with proven logic
- Handles timezone conversions correctly
- Supports complex schedules (overnight, weekly)
- Maintains consistency with order execution

**Alternative Considered:**
- Implement separate validation in each job
- **Rejected:** Code duplication, inconsistent behavior

#### Decision: Add isMarketOpen Method to Service

**Rationale:**
- Encapsulates validation logic
- Easier to use than current `validateMarketHours`
- Returns simple boolean (clearer intent)
- Can be reused across multiple jobs

**Implementation:**
```typescript
// New method in OperationTimeCheckerService
isMarketOpen(account: Account): boolean {
  const opHoursConfig = 
    account.symbols?.[symbol]?.operationHours || 
    account.configs?.operationHours;
  
  if (!opHoursConfig) return true; // No config = always open
  
  return this.isInside(opHoursConfig);
}
```

**Trade-offs:**
- ✅ Pro: Simple, reusable interface
- ✅ Pro: Handles missing config gracefully
- ⚠️ Consideration: Symbol-level hours not supported in jobs (acceptable for MVP)

#### Decision: Keep Validation in Jobs (Not Adapters)

**Rationale:**
- **Separation of Concerns:** Adapters should only handle broker API communication, nothing more
- Operation hours is business logic, not broker communication
- Jobs orchestrate business rules before calling adapters
- Keeps adapter interface clean and focused

**Alternative Considered:**
- Add `isMarketOpen()` method to adapter interface
- **Rejected:** Violates single responsibility principle; adapters should not know about operation hours

**Implementation:**
```typescript
// In job (correct approach)
for (const adapter of adapters) {
  const account = await accountService.getAccountById(adapter.accountId);
  
  if (!operationTimeChecker.isMarketOpen(account)) {
    logger.info({ accountId: adapter.accountId }, 'Skipping - market closed');
    continue;
  }
  
  await adapter.fetchPrice(symbols); // Adapter just talks to broker
}

// NOT in adapter (rejected approach)
// adapter.isMarketOpen() would mix concerns
```

**Trade-offs:**
- ✅ Pro: Clean separation of concerns
- ✅ Pro: Adapters remain focused on broker API
- ✅ Pro: Easier to test (business logic separate from API calls)
- ⚠️ Consideration: Slight code duplication across jobs (mitigated by shared service)

#### Decision: Track Metrics for Operation Hours

**Rationale:**
- Monitor skip rates to detect configuration issues
- Alert on unexpected skip patterns
- Track execution rates during operation hours
- Visibility into job behavior

**Implementation:**
```typescript
// Track skip
gaugeMetric('executor.job.skip.operation_hours', 1, {
  jobName: 'fetch-price-job',
  accountId: adapter.accountId,
  exchangeCode: adapter.exchangeCode
});

// Track execution
gaugeMetric('executor.job.execute.success', 1, {
  jobName: 'fetch-price-job',
  accountId: adapter.accountId,
  operationHoursValidated: true
});
```

**Trade-offs:**
- ✅ Pro: Operational visibility
- ✅ Pro: Early detection of issues
- ⚠️ Consideration: Additional metric overhead (minimal)

#### Decision: Skip Execution vs. Throw Error

**Rationale:**
- Jobs run on schedule, not on-demand
- Skipping is expected behavior (market closed)
- Throwing error would trigger alerts unnecessarily
- Logging provides observability

**Alternative Considered:**
- Throw error when outside hours
- **Rejected:** Would create noise in error tracking

#### Decision: Per-Adapter Validation

**Rationale:**
- Different accounts may have different operation hours
- Jobs process multiple adapters
- Each adapter needs independent validation
- Allows mixed execution (some skip, some execute)

**Implementation:**
```typescript
// In fetch-price-job.ts
for (const adapter of adapters) {
  const account = await accountService.getAccountById(adapter.accountId);
  
  if (!operationTimeChecker.isMarketOpen(account)) {
    logger.info({ accountId: adapter.accountId }, 'Skipping - market closed');
    continue; // Skip this adapter
  }
  
  await adapter.fetchPrice(symbols);
}
```

**Trade-offs:**
- ✅ Pro: Flexible, per-account control
- ✅ Pro: Partial execution possible
- ⚠️ Consideration: Multiple account fetches (mitigated by caching)

## Data Flow

### Pips Conversion Flow

```
Order Request (with pips)
    │
    ▼
Resolve Entry Price
    │
    ▼
Convert Pips to Price
    │  ├─ SL: entry ± (pips × pipValue)
    │  └─ TP: entry ± (pips × pipValue)
    │
    ▼
Pass to Broker Adapter (with prices)
    │
    ▼
Order Created with SL/TP
```

### Groq Fallback Flow

```
Translation Request
    │
    ▼
Try Primary Model
    │
    ├─ Success ──────────────┐
    │                        │
    ├─ 503 Error             │
    │   │                    │
    │   ▼                    │
    │  Try Fallback Model    │
    │   │                    │
    │   ├─ Success ─────────┤
    │   └─ Fail ────────────┤
    │                        │
    └─ Other Error ─────────┤
                             │
                             ▼
                        Return Result
```

### Operation Hours Validation Flow

```
Job Tick (scheduled)
    │
    ▼
For Each Adapter
    │
    ├─ Get Account Config
    │   │
    │   ▼
    ├─ Check Operation Hours
    │   │
    │   ├─ Market Open ──────┐
    │   │                    │
    │   └─ Market Closed     │
    │       │                │
    │       ▼                │
    │   Log & Skip           │
    │                        │
    └────────────────────────┤
                             │
                             ▼
                    Execute Job Logic
```

## Performance Considerations

### Pips Conversion
- **Impact:** Negligible (simple arithmetic)
- **Optimization:** None needed

### Groq Fallback
- **Impact:** +1-3 seconds on fallback (acceptable for rare case)
- **Mitigation:** Only on 503 errors (infrequent)

### Operation Hours Validation
- **Impact:** +1 DB query per adapter per job tick
- **Mitigation:** AccountService caching (in-memory)
- **Estimated:** <10ms per validation

## Error Handling

### Pips Conversion Errors
- **Missing entry price:** Defer SL/TP (existing behavior)
- **Invalid pip value:** Use default 0.1
- **Calculation error:** Log and skip TP/SL

### Groq Fallback Errors
- **Fallback model not configured:** Log warning, return error
- **Both models fail:** Return error to caller
- **Network error:** Propagate to caller

### Operation Hours Validation Errors
- **Invalid timezone:** Log error, execute anyway (fail-safe)
- **Invalid schedule:** Log error, execute anyway (fail-safe)
- **Account not found:** Log error, skip adapter

## Testing Strategy

### Unit Tests
- Pips conversion calculations (LONG/SHORT)
- Groq request extraction
- Operation hours validation logic

### Integration Tests
- End-to-end order creation with pips
- Groq fallback with mocked 503 errors
- Job execution with operation hours

### Edge Cases
- Missing entry price
- Mixed price/pips
- Fallback model unavailable
- No operation hours configured

## Rollout Plan

1. **Phase 1:** Deploy pips support (low risk)
2. **Phase 2:** Deploy Groq fallback (medium risk)
3. **Phase 3:** Deploy operation hours (low risk)

**Rollback Strategy:**
- Each feature independent
- Can disable via config
- No database migrations required

## Monitoring

### Metrics to Track
- Pips conversion rate (% of orders using pips)
- Groq fallback usage (count, success rate)
- Job skip rate (% of executions skipped)

### Alerts
- High fallback rate (>10% of requests)
- Fallback failures (both models down)
- Unexpected job skip rate

## Future Enhancements

### Pips Support
- Pips for MOVE_SL command (note: already supported via SET_TP_SL conversion)

### Groq Fallback

#### Circuit Breaker Pattern (High Priority)
**Problem:** Current implementation retries primary model on every 503, adding 1-2s latency per request during outages.

**Solution:** Implement circuit breaker to temporarily switch to fallback after sustained failures:
- Open circuit after 3 consecutive 503s within 60s
- Use fallback exclusively for 30s
- Retry primary after 30s
- Close circuit if primary succeeds

**Trigger Criteria:**
- Request volume > 1000 messages/day
- 503 rate > 5% (currently at 2-3%)
- Multiple service instances
- Latency becomes critical

**Estimated Effort:** 3-4 hours implementation + 2 hours testing

**Current Status:** Documented in spec, deferred for MVP. Production data shows 2-3% 503 rate (6-10 per 300 messages), which is manageable with simple retry but would benefit from circuit breaker as volume grows.

#### Other Enhancements
- Multiple fallback models (cascade)
- Exponential backoff for same model
- Model selection based on load

### Operation Hours
- Symbol-level hours for jobs
- Dynamic schedule updates
- Holiday calendar support
