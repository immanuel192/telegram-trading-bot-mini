# Tasks: Optimise Linked Order Take Profit Strategy

## Phase 1: Data Model & Core Service Logic

### Task 1.1: Add `linkedOrderOptimiseTp` Configuration Field ✅
**Status**: COMPLETED
**File**: `libs/dal/src/models/account.model.ts`

**Changes**:
- Add `linkedOrderOptimiseTp?: boolean` to `Account.configs` interface
- Add JSDoc documentation explaining:
  - Purpose: Enable TP optimization for linked orders in DCA strategies
  - Behavior: When true, linked orders get next less aggressive TP level
  - Default: false (disabled)
  - Example scenario showing benefit

**Acceptance Criteria**:
- Field added to TypeScript interface
- Documentation clearly explains when/why to use
- Default value documented as `false`

---

### Task 1.2: Modify `selectTakeProfit` to Return Two TP Levels ✅
**Status**: COMPLETED
**File**: `apps/executor-service/src/services/calculations/take-profit-selector.service.ts`

**Changes**:
- Update `selectTakeProfit()` method (lines 94-106)
- Current logic: Returns `[sortedTPs[takeProfitIndex]]` (one element)
- New logic:
  ```typescript
  const selectedTP = sortedTPs[takeProfitIndex];
  const nextTP = sortedTPs[takeProfitIndex + 1]; // May be undefined
  
  // Return array with 1 or 2 elements
  return nextTP ? [selectedTP, nextTP] : [selectedTP];
  ```
- Update JSDoc to document return value can have 1-2 elements
- Add logging for when second TP is included

**Acceptance Criteria**:
- Returns array with 2 elements when `takeProfitIndex + 1` exists in sorted array
- Returns array with 1 element when only one TP available
- Returns array with 1 element when `takeProfitIndex + 1` is out of bounds
- Existing behavior preserved when only one TP needed
- Debug logging shows both TPs when available

---

### Task 1.3: Add Unit Tests for `TakeProfitSelectorService` ✅
**Status**: COMPLETED
**File**: `apps/executor-service/test/unit/services/calculations/take-profit-selector.service.spec.ts` (new file)

**Test Cases**:
1. **Returns single TP when only one available**
   - Input: `takeProfits = [{ price: 4094 }]`, `takeProfitIndex = 0`
   - Expected: `[{ price: 4094 }]`

2. **Returns two TPs when multiple available**
   - Input: `takeProfits = [{ price: 4094 }, { price: 4111 }]`, `takeProfitIndex = 0`
   - Expected (LONG): `[{ price: 4111 }, { price: 4094 }]` (sorted descending)

3. **Returns single TP when index + 1 out of bounds**
   - Input: `takeProfits = [{ price: 4094 }, { price: 4111 }]`, `takeProfitIndex = 1`
   - Expected (LONG): `[{ price: 4094 }]` (only one element)

4. **Sorts correctly for LONG orders**
   - Input: `takeProfits = [{ price: 4094 }, { price: 4111 }, { price: 4150 }]`
   - Expected: `[{ price: 4150 }, { price: 4111 }]` (highest two, descending)

5. **Sorts correctly for SHORT orders**
   - Input: `takeProfits = [{ price: 2600 }, { price: 2550 }, { price: 2500 }]`
   - Expected: `[{ price: 2500 }, { price: 2550 }]` (lowest two, ascending)

6. **Respects forceNoTakeProfit flag**
   - Input: `account.configs.forceNoTakeProfit = true`
   - Expected: `undefined` (no TPs returned)

**Acceptance Criteria**:
- All test cases pass
- Code coverage > 90% for `TakeProfitSelectorService`
- Tests follow existing test structure in `apps/executor-service/test/unit`

---

## Phase 2: Integration & Sync Logic

### Task 2.1: Update Linked Order TP Sync Logic ✅
**Status**: COMPLETED
**File**: `apps/executor-service/src/services/order-executor.service.ts`

**Changes** (lines 430-445):
- Extract TP selection logic into private method `selectTpForLinkedOrder()`
- Current code:
  ```typescript
  tp: selectedTakeProfit?.[0]?.price
    ? { price: selectedTakeProfit[0].price }
    : undefined,
  ```
- New code:
  ```typescript
  tp: this.selectTpForLinkedOrder(selectedTakeProfit, account),
  ```

**New Private Method**:
```typescript
/**
 * Select appropriate TP for linked order based on optimization config
 * @param selectedTakeProfit - Array of selected TPs (1-2 elements)
 * @param account - Account with configs
 * @returns TP object for linked order or undefined
 */
private selectTpForLinkedOrder(
  selectedTakeProfit: { price?: number; pips?: number }[] | undefined,
  account: Account
): { price?: number } | undefined {
  if (!selectedTakeProfit || selectedTakeProfit.length === 0) {
    return undefined;
  }

  // If optimization enabled and second TP available, use it
  if (account.configs?.linkedOrderOptimiseTp && selectedTakeProfit[1]?.price) {
    this.logger.debug(
      {
        accountId: account.accountId,
        currentOrderTP: selectedTakeProfit[0].price,
        linkedOrderTP: selectedTakeProfit[1].price,
      },
      'Using optimized TP for linked order'
    );
    return { price: selectedTakeProfit[1].price };
  }

  // Default: use same TP as current order
  return selectedTakeProfit[0]?.price 
    ? { price: selectedTakeProfit[0].price }
    : undefined;
}
```

**Acceptance Criteria**:
- Method extracted successfully
- When `linkedOrderOptimiseTp = true` and 2 TPs available: Uses `selectedTakeProfit[1]`
- When `linkedOrderOptimiseTp = false`: Uses `selectedTakeProfit[0]` (existing behavior)
- When only 1 TP available: Uses `selectedTakeProfit[0]` regardless of flag
- Debug logging shows which TP was selected
- `handleOpenOrder` method length reduced

---

### Task 2.2: Add History Logging for TP Optimization ✅
**Status**: COMPLETED
**File**: `apps/executor-service/src/services/order-executor.service.ts`

**Changes** (after line 444):
- Add history entry when TP optimization is applied
- Only log when `linkedOrderOptimiseTp = true` and second TP was used

**Code**:
```typescript
// Log TP optimization in history (if applied)
if (
  account.configs?.linkedOrderOptimiseTp &&
  selectedTakeProfit?.[1]?.price &&
  order.linkedOrders &&
  order.linkedOrders.length > 0
) {
  await this.orderRepository.updateOne(
    { orderId },
    {
      $push: {
        history: {
          _id: new ObjectId(),
          status: OrderHistoryStatus.INFO,
          service: ServiceName.EXECUTOR_SERVICE,
          ts: new Date(),
          traceToken,
          messageId: payload.messageId,
          channelId: payload.channelId,
          command,
          info: {
            message: 'TP optimization applied for linked orders',
            currentOrderTP: selectedTakeProfit[0].price,
            linkedOrderTP: selectedTakeProfit[1].price,
            linkedOrderCount: order.linkedOrders.length,
          },
        },
      } as any,
    }
  );
}
```

**Acceptance Criteria**:
- History entry added only when optimization is actually applied
- Entry includes both TP values for audit trail
- Entry includes count of linked orders
- Does not add entry when optimization is disabled or not applicable

---

### Task 2.3: Add Integration Tests for Linked Order TP Sync ✅
**Status**: COMPLETED
**File**: `apps/executor-service/test/integration/services/order-executor-linked-tp.integration.spec.ts`

**Test Scenarios**:

1. **Optimization Disabled - Both Orders Get Same TP**
   - Setup: `linkedOrderOptimiseTp = false`, 2 TPs available
   - Execute: Create orphan order, then linked order with TPs
   - Verify: Both orders have `tp.tp1Price = 4111` (same TP)

2. **Optimization Enabled - Orders Get Different TPs**
   - Setup: `linkedOrderOptimiseTp = true`, TPs = [4094, 4111]
   - Execute: Create orphan order, then linked order
   - Verify:
     - New order (Order B): `tp.tp1Price = 4111` (index 0, most aggressive)
     - Orphan order (Order A): `tp.tp1Price = 4094` (index 1, less aggressive)

3. **Optimization Enabled - Only One TP Available**
   - Setup: `linkedOrderOptimiseTp = true`, TPs = [4094]
   - Execute: Create orphan order, then linked order
   - Verify: Both orders have `tp.tp1Price = 4094` (same TP, fallback)

4. **Optimization Enabled - SHORT Order**
   - Setup: `linkedOrderOptimiseTp = true`, TPs = [2600, 2550, 2500]
   - Execute: Create SHORT orphan, then SHORT linked
   - Verify:
     - New order: `tp.tp1Price = 2500` (lowest, most aggressive for SHORT)
     - Orphan order: `tp.tp1Price = 2550` (next lowest)

5. **History Logging - Optimization Applied**
   - Setup: `linkedOrderOptimiseTp = true`, 2 TPs
   - Execute: Create linked order
   - Verify: Order history contains INFO entry with both TP values

6. **History Logging - Optimization Not Applied**
   - Setup: `linkedOrderOptimiseTp = false`
   - Execute: Create linked order
   - Verify: No TP optimization INFO entry in history

**Acceptance Criteria**:
- All test scenarios pass
- Tests use real MongoDB and Redis (integration level)
- Tests clean up data after execution
- Tests follow existing integration test patterns in `apps/executor-service/test/integration`

---

## Phase 3: Documentation & Refactoring

### Task 3.1: Update Linked Orders Documentation ✅
**Status**: COMPLETED
**File**: `docs/linked-orders.md`
**File**: `docs/linked-orders.md`

**Changes**:
- Add new section: "TP Optimization for Linked Orders"
- Explain the problem scenario (both orders hit SL)
- Explain the solution (different TPs for orphan vs new order)
- Add configuration example:
  ```json
  {
    "accountId": "acc-1",
    "configs": {
      "linkedOrderOptimiseTp": true,
      "takeProfitIndex": 0
    }
  }
  ```
- Add complete example showing TP assignment
- Update "Complete Example" section to show optimization in action

**Acceptance Criteria**:
- Documentation clearly explains when/why to use optimization
- Examples show both enabled and disabled scenarios
- Diagrams updated if necessary

---

### Task 3.2: Update Architecture Rules Documentation ❌
**Status**: BLOCKED (Gitignored file)
**File**: `.agent/rules/architecture.md`

**Changes**:
- Add note about TP optimization feature in linked orders section
- Reference `linked-orders.md` for detailed explanation
- No major structural changes needed

**Acceptance Criteria**:
- Architecture rules mention TP optimization feature
- Cross-reference to detailed documentation provided

---

### Task 3.3: Code Refactoring for Readability ✅
**Status**: COMPLETED
**File**: `apps/executor-service/src/services/order-executor.service.ts`

**Changes**:
- Review `handleOpenOrder` method length (currently ~250 lines)
- Extract TP/SL sync logic into private method `syncTpSlToLinkedOrders()`
- Ensure method follows single responsibility principle
- Add method-level comments for clarity

**Suggested Extraction**:
```typescript
/**
 * Sync TP/SL to linked orders after opening new order
 * @param order - The newly created order
 * @param selectedTakeProfit - Selected TP levels (1-2 elements)
 * @param account - Account configuration
 * @param traceToken - Trace token for logging
 */
private async syncTpSlToLinkedOrders(
  order: Order,
  selectedTakeProfit: { price?: number; pips?: number }[] | undefined,
  account: Account,
  traceToken: string
): Promise<void> {
  if (!order.linkedOrders || order.linkedOrders.length === 0) {
    return;
  }

  const tpForLinkedOrder = this.selectTpForLinkedOrder(selectedTakeProfit, account);
  const slForLinkedOrder = order.sl?.slPrice ? { price: order.sl.slPrice } : undefined;

  await this.syncLinkedOrdersTpSl(order, {
    traceToken,
    sl: slForLinkedOrder,
    tp: tpForLinkedOrder,
  });

  // Log TP optimization if applied
  await this.logTpOptimization(order, selectedTakeProfit, account, traceToken);
}
```

**Acceptance Criteria**:
- `handleOpenOrder` method length reduced to < 200 lines
- Extracted methods have clear single responsibilities
- All existing tests still pass
- Code follows architecture rules (AI-friendly structure)

---

## Summary

**Total Tasks**: 10
- **Phase 1** (Data Model & Core Logic): 3 tasks
- **Phase 2** (Integration & Sync): 3 tasks
- **Phase 3** (Documentation & Refactoring): 3 tasks + 1 summary

**Estimated Effort**:
- Phase 1: 4-6 hours
- Phase 2: 6-8 hours
- Phase 3: 2-3 hours
- **Total**: 12-17 hours

**Dependencies**:
- Task 1.2 depends on Task 1.1 (needs config field)
- Task 2.1 depends on Task 1.2 (needs updated selector)
- Task 2.3 depends on Tasks 2.1 and 2.2 (integration tests need implementation)
- Task 3.1 depends on all Phase 2 tasks (documentation needs working feature)

**Parallelizable**:
- Task 1.3 can be done in parallel with Task 1.2 (TDD approach)
- Task 3.2 and 3.3 can be done in parallel
