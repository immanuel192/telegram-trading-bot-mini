## Context
Currently, interpret-service fetches account-specific orders from the database and passes them to the AI for validation. The AI is expected to:
1. Detect command intent (MOVE_SL, CANCEL, CLOSE, etc.)
2. Extract trading data (symbol, entry, SL, TP)
3. Validate symbol matches against orders
4. Check order `executed` status (true = OPEN, false = PENDING)
5. Decide final command based on validation

This creates several problems:
- AI models struggle with complex conditional logic (even Maverick hallucinates)
- Prompts are ~1000 lines and growing
- Validation logic is scattered between AI prompts and code
- Hard to debug when AI makes wrong decisions
- Tight coupling between services

## Goals / Non-Goals

**Goals:**
- AI focuses ONLY on pattern recognition and extraction
- Deterministic validation logic lives in code (trade-manager)
- Reduce prompt size by ~50%
- Improve AI reliability and reduce hallucinations
- Clear separation: interpret-service = "what user means", trade-manager = "can we do it?"

**Non-Goals:**
- Implementing trade-manager validation logic (separate change)
- Changing message flow or stream architecture
- Modifying AI provider selection logic

## Decisions

### Decision 1: Remove Orders from MessageContext
**What**: Remove `orders` field from `MessageContext` interface
**Why**: AI doesn't need order state to detect intent and extract data
**Impact**: Breaking change to interface contract

### Decision 2: Keep TranslationResult Interface Unchanged
**What**: AI still returns the same `TranslationResult` structure with `isCommand`, `command`, `confidence`, `reason`, `extraction`
**Why**: No need to change the interface - we just change HOW the AI determines these values (without order validation)
**Impact**: No breaking changes to downstream consumers (trade-manager)
**Example**:
```typescript
// AI output (same structure as before)
{
  "isCommand": true,
  "command": "MOVE_SL",
  "confidence": 0.9,
  "reason": "Detected 'sl entry' keyword and extracted symbol ETHUSDT",
  "extraction": {
    "symbol": "ETHUSDT",
    "isImmediate": true,
    "stopLoss": undefined,  // AI doesn't set this anymore
    // ... other fields
  }
}
```
**Key difference**: AI no longer validates against orders, so it might return `command: "MOVE_SL"` even if no matching order exists. trade-manager will validate and potentially change to `NONE`.

### Decision 3: Simplify Prompts
**What**: Remove all order validation logic from prompts
**Why**: Reduces prompt from ~1000 lines to ~400 lines
**Impact**: Faster AI responses, lower token costs

### Decision 4: Keep Message Context Fields
**What**: Keep `prevMessage`, `quotedMessage`, `quotedFirstMessage` in context
**Why**: These are needed for understanding user intent (e.g., "cancel it" refers to quoted message)
**Impact**: No change to these fields

## Alternatives Considered

**Alternative 1: Improve AI Prompts Further**
- Tried adding more explicit validation rules
- Result: Even Maverick (17B model) still hallucinates
- Conclusion: AI is not reliable for complex conditional logic

**Alternative 2: Use Larger Model (70B+)**
- Pro: Might handle complex logic better
- Con: 10x more expensive, still not guaranteed
- Conclusion: Not worth the cost for deterministic logic

**Alternative 3: Hybrid (AI + Code Validation)**
- Pro: Keep some validation in AI, fallback to code
- Con: Duplicated logic, harder to maintain
- Conclusion: Clean separation is better

## Risks / Trade-offs

**Risk 1: More Code Complexity in trade-manager**
- Mitigation: Validation logic is straightforward and testable
- Trade-off: Code complexity vs. AI reliability (code wins)

**Risk 2: Breaking Change to Interface**
- Mitigation: Only affects interpret-service ↔ trade-manager contract
- Trade-off: One-time migration vs. long-term maintainability

**Risk 3: AI Might Miss Edge Cases**
- Mitigation: AI only does extraction, not validation
- Trade-off: Edge cases handled in code (easier to fix)

## Migration Plan

### Phase 1: Update interpret-service (This Change)
1. Remove `OrderRepository` from `TranslateRequestHandler`
2. Update `MessageContext` interface (remove `orders`)
3. Update `buildMessageContext` to not fetch orders
4. Simplify AI prompts (remove validation logic)
5. Update all tests

### Phase 2: Update trade-manager (Separate Change)
1. Add `CommandValidator` service
2. Implement validation logic for each command type
3. Update `TranslateResultHandler` to validate before executing
4. Add comprehensive tests

### Rollback Plan
- Keep old prompts as `prompt-v2-*.txt.backup`
- If issues arise, revert interface changes and restore order fetching
- Estimated rollback time: < 1 hour

## Open Questions
None - design is straightforward
