# OpenSpec Proposal: Optimise Linked Order Take Profit Strategy

## Summary

This proposal introduces an **optional TP optimization feature** for linked orders in DCA (Dollar Cost Averaging) strategies. When enabled, the orphan order receives a different (less aggressive) Take Profit level than the newly created linked order, reducing the risk of both orders hitting stop loss when price reverses.

## Change ID

`optimise-linked-order-tp`

## Status

✅ **Validated** - Ready for review and approval

## Problem

Currently, when using linked orders for DCA strategies:
- Both the orphan order and linked order share the **same TP level**
- If price approaches TP but reverses before hitting it, **both orders hit SL**
- This defeats the purpose of DCA (averaging into positions)

**Example**:
```
Order A (orphan): Entry unknown, TP: 4094, SL: 4086
Order B (linked): Entry 4091, TP: 4094, SL: 4086

Price movement: 4091 → 4090 (close to TP) → reverses → 4086 (SL hit)
Result: Both orders hit SL, total loss
```

## Solution

Add optional `linkedOrderOptimiseTp` configuration to allow different TP levels:

**When enabled**:
```
Signal TPs: [4094, 4111, 4150]
Sorted TPs (LONG): [4150, 4111, 4094] (highest first = most aggressive)

Order B (new, just entered): TP = 4150 (index 0, furthest, most aggressive)
Order A (orphan, entered earlier): TP = 4111 (index 1, closer, MORE LIKELY TO HIT)

Price movement: Entry 4091 → 4120 → reverses
Result: Order A hits TP at 4111 ✓ (takes profit!)
        Order B still waiting for 4150 (might miss if price reverses)
        
Benefit: At least ONE order took profit instead of BOTH hitting SL!
```

## Key Features

1. **Optional Feature**: Disabled by default (`linkedOrderOptimiseTp = false`)
2. **Backward Compatible**: Existing behavior unchanged when disabled
3. **Flexible**: Works with any number of TP levels (falls back to same TP if only one available)
4. **Auditable**: Logs TP optimization in order history
5. **Minimal Impact**: Small code changes, no database migrations

## Implementation Highlights

### 1. Configuration Field
```typescript
// libs/dal/src/models/account.model.ts
interface Account {
  configs?: {
    linkedOrderOptimiseTp?: boolean;  // NEW: default false
    // ... existing fields
  }
}
```

### 2. Enhanced TP Selector
```typescript
// Returns 1-2 TPs instead of just 1
selectTakeProfit(): Promise<Array<{ price?: number }>> {
  const selectedTP = sortedTPs[takeProfitIndex];
  const nextTP = sortedTPs[takeProfitIndex + 1];
  return nextTP ? [selectedTP, nextTP] : [selectedTP];
}
```

### 3. Smart TP Selection for Linked Orders
```typescript
// New private method
private selectTpForLinkedOrder(selectedTakeProfit, account) {
  if (account.configs?.linkedOrderOptimiseTp && selectedTakeProfit[1]) {
    return { price: selectedTakeProfit[1].price };  // Use next TP
  }
  return { price: selectedTakeProfit[0].price };  // Use same TP
}
```

## Files Changed

### Core Implementation
- `libs/dal/src/models/account.model.ts` - Add config field
- `apps/executor-service/src/services/calculations/take-profit-selector.service.ts` - Return 2 TPs
- `apps/executor-service/src/services/order-executor.service.ts` - Update sync logic

### Tests
- `apps/executor-service/test/unit/services/calculations/take-profit-selector.service.spec.ts` (new)
- `apps/executor-service/test/integration/services/order-executor-linked-tp.spec.ts` (new)

### Documentation
- `docs/linked-orders.md` - Add TP optimization section
- `.agent/rules/architecture.md` - Reference new feature

## Validation

✅ OpenSpec validation passed with `--strict` flag

**Spec Deltas**:
- 4 ADDED requirements
- 1 MODIFIED requirement (backward compatibility)
- 11 scenarios covering all edge cases

## Tasks Breakdown

**Total**: 10 tasks across 3 phases
- **Phase 1** (Data Model & Core Logic): 3 tasks
- **Phase 2** (Integration & Sync): 3 tasks  
- **Phase 3** (Documentation & Refactoring): 4 tasks

**Estimated Effort**: 12-17 hours

## Next Steps

1. **Review** this proposal with the team
2. **Approve** the change if acceptable
3. **Run** `/openspec-apply optimise-linked-order-tp` to begin implementation
4. **Follow** tasks.md for step-by-step implementation

## Questions?

- See `proposal.md` for detailed problem statement and solution
- See `tasks.md` for complete task breakdown with acceptance criteria
- See `specs/linked-order-tp-optimization/spec.md` for formal requirements and scenarios
