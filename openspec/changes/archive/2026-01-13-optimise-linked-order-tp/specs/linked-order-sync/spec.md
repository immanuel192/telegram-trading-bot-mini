# Spec: Linked Order Take Profit Optimization

## Overview

This capability enhances the linked order feature for DCA (Dollar Cost Averaging) strategies by allowing different Take Profit (TP) levels for the orphan order versus the newly created linked order. This reduces the risk of both orders hitting stop loss when price reverses before reaching the shared TP.

**Related Specs**:
- `linked-order-sync`: Base linked order functionality
- `order-execution-flow`: Order execution and TP/SL management
- `account-management`: Account configuration structure

---

## ADDED Requirements

### Requirement: Account Configuration for TP Optimization

The system SHALL provide a configuration option to enable Take Profit optimization for linked orders.

**Configuration Field**:
- **Name**: `linkedOrderOptimiseTp`
- **Type**: `boolean`
- **Location**: `Account.configs.linkedOrderOptimiseTp`
- **Default**: `false` (disabled)

**Behavior**:
- When `true`: Linked orders receive the next less aggressive TP level
- When `false`: Linked orders receive the same TP as the current order (existing behavior)

#### Scenario: Configuration Field Exists in Account Model

**Given** an Account document in MongoDB  
**When** the account is loaded by executor-service  
**Then** the `configs.linkedOrderOptimiseTp` field SHALL be accessible  
**And** the field SHALL default to `false` if not specified

#### Scenario: Documentation Explains TP Optimization Purpose

**Given** a developer reads the Account model JSDoc  
**When** they view the `linkedOrderOptimiseTp` field documentation  
**Then** the documentation SHALL explain:
- Purpose: Reduce risk of both linked orders hitting SL
- Behavior: Orphan order gets next TP level (less aggressive)
- Default: `false`
- Example scenario showing benefit

---

### Requirement: Take Profit Selector Returns Multiple Levels

The `TakeProfitSelectorService.selectTakeProfit()` method SHALL return up to two Take Profit levels when multiple TPs are available.

**Return Value**:
- **Type**: `Array<{ price?: number; pips?: number }>` (1-2 elements)
- **Element [0]**: TP for current order (based on `takeProfitIndex`)
- **Element [1]**: Next TP level (based on `takeProfitIndex + 1`), if available

**Selection Logic**:
1. Sort TPs by profitability (LONG: descending, SHORT: ascending)
2. Select TP at `takeProfitIndex` → Element [0]
3. If `takeProfitIndex + 1` exists in sorted array → Element [1]
4. Return array with 1 or 2 elements

#### Scenario: Returns Two TPs When Multiple Available

**Given** a LONG order with TPs `[{ price: 4094 }, { price: 4111 }, { price: 4150 }]`  
**And** `account.configs.takeProfitIndex = 0`  
**When** `selectTakeProfit()` is called  
**Then** the method SHALL return:
```json
[
  { "price": 4150 },  // Index 0 (highest, most aggressive, furthest)
  { "price": 4111 }   // Index 1 (next highest, less aggressive, closer)
]
```

#### Scenario: Returns Single TP When Only One Available

**Given** a LONG order with TPs `[{ price: 4094 }]`  
**And** `account.configs.takeProfitIndex = 0`  
**When** `selectTakeProfit()` is called  
**Then** the method SHALL return:
```json
[
  { "price": 4094 }  // Only one element
]
```

#### Scenario: Returns Single TP When Index Plus One Out of Bounds

**Given** a LONG order with TPs `[{ price: 4094 }, { price: 4111 }]`  
**And** `account.configs.takeProfitIndex = 1`  
**When** `selectTakeProfit()` is called  
**Then** the method SHALL return:
```json
[
  { "price": 4094 }  // Index 1, no index 2 available
]
```

#### Scenario: Sorts Correctly for SHORT Orders

**Given** a SHORT order with TPs `[{ price: 2600 }, { price: 2550 }, { price: 2500 }]`  
**And** `account.configs.takeProfitIndex = 0`  
**When** `selectTakeProfit()` is called  
**Then** the method SHALL return:
```json
[
  { "price": 2500 },  // Index 0 (lowest, most aggressive for SHORT)
  { "price": 2550 }   // Index 1 (next lowest)
]
```

---

### Requirement: Linked Order TP Selection Based on Optimization Flag

When syncing TP/SL to linked orders, the system SHALL select the appropriate TP level based on the `linkedOrderOptimiseTp` configuration.

**Selection Logic**:
- **If** `linkedOrderOptimiseTp = true` **AND** second TP available:
  - Use `selectedTakeProfit[1]` for linked order
- **Else**:
  - Use `selectedTakeProfit[0]` for linked order (existing behavior)

#### Scenario: Optimization Enabled - Different TPs for Orders

**Given** an orphan order (Order A) exists for account "acc-1"  
**And** `account.configs.linkedOrderOptimiseTp = true`  
**And** a new linked order (Order B) is created with TPs `[4094, 4111, 4150]` (sorted: `[4150, 4111, 4094]`)  
**When** the executor-service syncs TP/SL to Order A  
**Then** Order B SHALL have `tp.tp1Price = 4150` (index 0, most aggressive, furthest)  
**And** Order A SHALL have `tp.tp1Price = 4111` (index 1, less aggressive, closer, MORE LIKELY TO HIT)

#### Scenario: Optimization Disabled - Same TP for Both Orders

**Given** an orphan order (Order A) exists for account "acc-1"  
**And** `account.configs.linkedOrderOptimiseTp = false`  
**And** a new linked order (Order B) is created with TPs `[4094, 4111, 4150]` (sorted: `[4150, 4111, 4094]`)  
**When** the executor-service syncs TP/SL to Order A  
**Then** Order B SHALL have `tp.tp1Price = 4150` (index 0, most aggressive)  
**And** Order A SHALL have `tp.tp1Price = 4150` (index 0, same as Order B)

#### Scenario: Optimization Enabled - Only One TP Available

**Given** an orphan order (Order A) exists for account "acc-1"  
**And** `account.configs.linkedOrderOptimiseTp = true`  
**And** a new linked order (Order B) is created with TPs `[4094]`  
**When** the executor-service syncs TP/SL to Order A  
**Then** Order B SHALL have `tp.tp1Price = 4094`  
**And** Order A SHALL have `tp.tp1Price = 4094` (same, fallback behavior)

---

### Requirement: History Logging for TP Optimization

When TP optimization is applied to linked orders, the system SHALL log an informational entry in the order history.

**History Entry**:
- **Status**: `OrderHistoryStatus.INFO`
- **Service**: `executor-service`
- **Info Fields**:
  - `message`: "TP optimization applied for linked orders"
  - `currentOrderTP`: TP price for current order
  - `linkedOrderTP`: TP price for linked order
  - `linkedOrderCount`: Number of linked orders

**Trigger Conditions**:
- `linkedOrderOptimiseTp = true`
- Second TP available in `selectedTakeProfit[1]`
- Linked orders exist (`order.linkedOrders.length > 0`)

#### Scenario: History Entry Added When Optimization Applied

**Given** an orphan order (Order A) exists  
**And** `account.configs.linkedOrderOptimiseTp = true`  
**And** a new linked order (Order B) is created with TPs `[4094, 4111, 4150]` (sorted: `[4150, 4111, 4094]`)  
**When** the executor-service completes order execution  
**Then** Order B's history SHALL contain an entry with:
```json
{
  "status": "info",
  "service": "executor-service",
  "info": {
    "message": "TP optimization applied for linked orders",
    "currentOrderTP": 4150,
    "linkedOrderTP": 4111,
    "linkedOrderCount": 1
  }
}
```

#### Scenario: No History Entry When Optimization Not Applied

**Given** an orphan order (Order A) exists  
**And** `account.configs.linkedOrderOptimiseTp = false`  
**And** a new linked order (Order B) is created  
**When** the executor-service completes order execution  
**Then** Order B's history SHALL NOT contain a TP optimization INFO entry

---

### Requirement: Linked Order Sync Maintains Backward Compatibility

The linked order TP/SL sync functionality SHALL maintain backward compatibility with existing behavior when optimization is disabled.

**Backward Compatibility**:
- When `linkedOrderOptimiseTp` is `undefined` or `false`: Use existing behavior
- Existing accounts without the field: Default to `false`
- All existing tests: Continue to pass without modification

#### Scenario: Existing Accounts Work Without Configuration

**Given** an existing account without `linkedOrderOptimiseTp` field  
**And** an orphan order exists  
**And** a new linked order is created with TPs `[4094, 4111, 4150]` (sorted: `[4150, 4111, 4094]`)  
**When** the executor-service syncs TP/SL  
**Then** both orders SHALL have `tp.tp1Price = 4150` (existing behavior, index 0)  
**And** no errors SHALL occur

---

## Implementation Notes

### Code Locations

1. **Account Model**:
   - File: `libs/dal/src/models/account.model.ts`
   - Add field to `Account.configs` interface

2. **Take Profit Selector**:
   - File: `apps/executor-service/src/services/calculations/take-profit-selector.service.ts`
   - Modify `selectTakeProfit()` method (lines 94-106)

3. **Order Executor**:
   - File: `apps/executor-service/src/services/order-executor.service.ts`
   - Extract method: `selectTpForLinkedOrder()` (new private method)
   - Update sync logic: Lines 438-444
   - Add history logging: After line 444

### Testing Strategy

1. **Unit Tests**:
   - Test `TakeProfitSelectorService.selectTakeProfit()` with various TP counts
   - Test `selectTpForLinkedOrder()` with optimization on/off

2. **Integration Tests**:
   - Test full linked order flow with optimization enabled
   - Test full linked order flow with optimization disabled
   - Test edge cases (1 TP, no TPs, index out of bounds)

3. **Regression Tests**:
   - Verify existing linked order tests still pass
   - Verify existing TP selection tests still pass

### Performance Considerations

- **Minimal Impact**: Only adds one array element check and one config field read
- **No Database Changes**: Uses existing collections and indexes
- **No API Changes**: Internal optimization, no external API impact

### Migration Path

- **No Migration Required**: New optional field with safe default (`false`)
- **Gradual Rollout**: Accounts can enable optimization individually
- **Rollback Safe**: Setting field to `false` reverts to original behavior
