# Proposal: Optimise Linked Order Take Profit Strategy

## Problem Statement

Currently, when using DCA (Dollar Cost Averaging) strategies with linked orders, both the orphan order and the linked order share the **same Take Profit (TP)** level. This creates a risk scenario:

**Current Behavior:**
```
Message 1: "Gold buy now" → Order A created (no TP/SL)
Message 2: "💥GOLD Buy 4091-4089, TP: 4094, TP: 4111, SL: 4086"
  → Order B created with TP1: 4094
  → Order A synced with TP1: 4094 (same as Order B)
```

**Problem Scenario:**
```
1. Price goes up to 4090 (close to TP 4094, but doesn't hit)
2. Price reverses and goes down
3. Hits SL at 4086
4. Result: BOTH orders hit SL → Total loss
```

**Desired Behavior:**
```
With TP optimization:
  → Order B (new order) gets TP[0]: 4150 (index 0 - MOST aggressive, FURTHEST from entry)
  → Order A (orphan) gets TP[1]: 4111 (index 1 - LESS aggressive, CLOSER to entry)

Why this works:
- TPs sorted: [4150, 4111, 4094] (LONG: highest first = most aggressive)
- Order A (orphan, entered earlier): Gets 4111 (closer TP, MORE LIKELY TO HIT)
- Order B (new, just entered): Gets 4150 (further TP, waits for higher price)
- If price goes to 4120: Order A hits TP at 4111 ✓, Order B still waiting
- If price reverses after 4120: At least Order A took profit!
```

## Proposed Solution

### 1. Add Configuration Flag

Add `linkedOrderOptimiseTp` to `Account.configs`:
- **Type**: `boolean`
- **Default**: `false`
- **Purpose**: Enable TP optimization for linked orders in DCA strategies

### 2. Enhance Take Profit Selector

Modify `TakeProfitSelectorService.selectTakeProfit()` to return **two TP levels** when available:
- **Current**: Returns `[selectedTP]` (one element)
- **New**: Returns `[selectedTP, nextTP]` (two elements when possible)

**Logic**:
```typescript
// Current: takeProfitIndex = 0
sortedTPs = [4111, 4094] // LONG: highest first

// Return:
[
  sortedTPs[0],  // 4111 - for current order
  sortedTPs[1]   // 4094 - for linked order (if exists)
]

// If only one TP:
[sortedTPs[0]]  // Use same for both
```

### 3. Update Sync Logic

In `OrderExecutorService.handleOpenOrder()` (line 438-444), when syncing TP/SL to linked orders:

**Current**:
```typescript
tp: selectedTakeProfit?.[0]?.price 
  ? { price: selectedTakeProfit[0].price } 
  : undefined
```

**New**:
```typescript
// If optimization enabled and second TP available
const tpForLinkedOrder = account.configs?.linkedOrderOptimiseTp && selectedTakeProfit?.[1]
  ? { price: selectedTakeProfit[1].price }
  : selectedTakeProfit?.[0]?.price 
    ? { price: selectedTakeProfit[0].price }
    : undefined;
```

### 4. Add History Logging (Optional)

When TP optimization is applied, log in `Order.history`:
```typescript
{
  status: OrderHistoryStatus.INFO,
  service: 'executor-service',
  info: {
    message: 'TP optimization applied for linked order',
    currentOrderTP: selectedTakeProfit[0].price,
    linkedOrderTP: selectedTakeProfit[1].price,
  }
}
```

## Scope

**In Scope:**
- ✅ Add `linkedOrderOptimiseTp` field to `Account.configs`
- ✅ Modify `TakeProfitSelectorService.selectTakeProfit()` to return two TPs
- ✅ Update sync logic in `OrderExecutorService.handleOpenOrder()`
- ✅ Add unit tests for `TakeProfitSelectorService`
- ✅ Add integration tests for linked order TP sync
- ✅ Update documentation (`linked-orders.md`, architecture rules)
- ✅ Extract long methods into private functions for readability

**Out of Scope:**
- ❌ Applying optimization to `MOVE_SL` or `SET_TP_SL` commands (only `LONG`/`SHORT`)
- ❌ Retroactive updates to existing orders
- ❌ UI/dashboard changes

## Benefits

1. **Improved Risk Management**: Reduces scenario where both orders hit SL
2. **Profit Protection**: Orphan order has chance to capture more profit
3. **Flexible Strategy**: Optional feature, disabled by default
4. **DCA Optimization**: Better suited for Dollar Cost Averaging strategies

## Trade-offs

**Pros:**
- Better risk/reward for DCA strategies
- Orphan order gets more profit potential
- New order gets quicker profit taking

**Cons:**
- Slightly more complex logic
- Requires at least 2 TP levels in signal
- May not suit all trading strategies (hence optional)

## Implementation Phases

### Phase 1: Data Model & Service Logic
1. Add `linkedOrderOptimiseTp` to Account model
2. Update `TakeProfitSelectorService.selectTakeProfit()`
3. Add unit tests for TP selector

### Phase 2: Integration & Sync Logic
4. Update `OrderExecutorService.handleOpenOrder()` sync logic
5. Add integration tests for linked order scenarios
6. Add history logging (if feasible)

### Phase 3: Documentation & Refactoring
7. Update `linked-orders.md` documentation
8. Update architecture rules
9. Refactor long methods if needed

## Validation Criteria

- ✅ When `linkedOrderOptimiseTp = false`: Behavior unchanged (both orders get same TP)
- ✅ When `linkedOrderOptimiseTp = true` with 2+ TPs: Current order gets TP[0], linked gets TP[1]
- ✅ When `linkedOrderOptimiseTp = true` with 1 TP: Both orders get same TP
- ✅ History logging shows which TP was assigned to which order
- ✅ All existing tests pass
- ✅ New tests cover edge cases (1 TP, no TPs, optimization on/off)
