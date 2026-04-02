# linked-order-sync Specification

## Purpose
TBD - created by archiving change auto-sync-linked-order-tpsl. Update Purpose after archive.
## Requirements
### Requirement: Linked Order TP/SL Sync on Order Creation
The executor-service SHALL automatically synchronize Take Profit and Stop Loss values to all linked orders when creating a new order.

#### Scenario: Sync TP/SL after successful order opening
- **WHEN** an order is successfully opened via `handleOpenOrder`
- **AND** the order has a non-empty `linkedOrders` array
- **AND** the order has TP and/or SL values
- **THEN** the system SHALL:
  1. Fetch the created order from database to get final TP/SL values
  2. For each orderId in the `linkedOrders` array:
     - Fetch the linked order to verify it exists
     - Extract the linked order's `accountId`
     - Build job parameters with `accountId`, `orderId`, and current `sl`/`tp` values
     - Trigger `auto-sync-tp-sl-linked-order` job with params and traceToken
  3. Log the number of linked orders being synced

#### Scenario: Skip sync when no linked orders
- **WHEN** an order is successfully opened
- **AND** the order has no `linkedOrders` or an empty `linkedOrders` array
- **THEN** the system SHALL NOT trigger any sync jobs

#### Scenario: Skip sync when no TP/SL values
- **WHEN** an order is successfully opened
- **AND** the order has `linkedOrders`
- **AND** the order has neither TP nor SL values
- **THEN** the system SHALL NOT trigger any sync jobs

#### Scenario: Error handling during sync trigger
- **WHEN** triggering sync jobs for linked orders
- **AND** a sync job trigger fails for one linked order
- **THEN** the system SHALL:
  - Log the error with orderId and error details
  - Continue triggering sync for remaining linked orders
  - NOT fail the main order creation operation

### Requirement: Linked Order TP/SL Sync on Update
The executor-service SHALL automatically synchronize Take Profit and Stop Loss values to all linked orders when updating TP/SL.

#### Scenario: Sync TP/SL after successful update
- **WHEN** TP/SL is successfully updated via `handleUpdateTakeProfitStopLoss`
- **AND** `payload.meta.skipLinkedOrderSync` is false or undefined
- **AND** the order has a non-empty `linkedOrders` array
- **THEN** the system SHALL:
  1. Fetch the order from database
  2. Extract the updated `sl` and/or `tp` values from the payload
  3. For each orderId in the `linkedOrders` array:
     - Fetch the linked order to get its `accountId`
     - Build job parameters with the same `sl`/`tp` values
     - Trigger `auto-sync-tp-sl-linked-order` job
  4. Log the number of linked orders being synced

#### Scenario: Skip sync when skipLinkedOrderSync flag is set
- **WHEN** TP/SL update is triggered
- **AND** `payload.meta.skipLinkedOrderSync` is true
- **THEN** the system SHALL NOT trigger any sync jobs
- **AND** the system SHALL proceed with the normal TP/SL update

#### Scenario: Sync only updated values
- **WHEN** only SL is updated (TP is undefined in payload)
- **AND** the order has `linkedOrders`
- **THEN** the system SHALL trigger sync jobs with only the `sl` parameter
- **AND** the `tp` parameter SHALL be undefined

- **WHEN** only TP is updated (SL is undefined in payload)
- **AND** the order has `linkedOrders`
- **THEN** the system SHALL trigger sync jobs with only the `tp` parameter
- **AND** the `sl` parameter SHALL be undefined

#### Scenario: Prevent endless loop
- **WHEN** the sync job triggers `handleUpdateTakeProfitStopLoss`
- **AND** the payload includes `meta.skipLinkedOrderSync: true`
- **THEN** the system SHALL NOT trigger additional sync jobs
- **AND** the update SHALL complete without recursion

### Requirement: Auto-Sync Job History Tracking
The auto-sync-tp-sl-linked-order job SHALL record its execution in the order history to provide clear audit trail and distinguish job-triggered updates from user-initiated actions.

#### Scenario: Record job execution in order history
- **WHEN** the `auto-sync-tp-sl-linked-order` job executes
- **AND** the target order is validated and exists in OPEN status
- **THEN** the job SHALL add a history entry to the order BEFORE calling `handleUpdateTakeProfitStopLoss` with:
  - `status: OrderHistoryStatus.UPDATE`
  - `service: 'auto-sync-tp-sl-linked-order-job'`
  - `command: CommandEnum.NONE` (indicating automated action)
  - `info.sourceOrderId`: The orderId that triggered this sync (if applicable)
  - `info.sl`: The stop loss value being applied (if provided)
  - `info.tp`: The take profit value being applied (if provided)
  - `info.reason: 'linked-order-sync'` or `'deferred-sl-update'`
  - `traceToken`: The trace token from the job trigger

#### Scenario: History sequence for linked order sync
- **WHEN** an order with linkedOrders has its TP/SL updated
- **THEN** the order history SHALL show the following sequence:
  1. UPDATE entry from `executor-service` (the original TP/SL update)
  2. For each linked order:
     - UPDATE entry from `auto-sync-tp-sl-linked-order-job` (job execution marker)
     - UPDATE entry from `executor-service` (the actual TP/SL update result)

#### Scenario: History for deferred SL update
- **WHEN** a market order is opened without entry price
- **AND** the job is triggered to set deferred SL after execution
- **THEN** the order history SHALL show:
  1. OPEN entry from `executor-service` (order opened)
  2. UPDATE entry from `auto-sync-tp-sl-linked-order-job` (job execution marker with `reason: 'deferred-sl-update'`)
  3. UPDATE entry from `executor-service` (SL update result)

### Requirement: Execute Order Request Payload Extension
The system SHALL support a skipLinkedOrderSync flag to prevent recursive synchronization.

#### Scenario: Add skipLinkedOrderSync to meta
- **WHEN** defining the `ExecuteOrderRequestPayload` schema
- **THEN** the `meta` object SHALL include an optional `skipLinkedOrderSync` boolean field
- **AND** the field SHALL be documented as preventing recursive sync operations
- **AND** the field SHALL default to false when not provided

#### Scenario: Validate skipLinkedOrderSync in payload
- **WHEN** an `ExecuteOrderRequestPayload` is validated
- **AND** the payload includes `meta.skipLinkedOrderSync: true`
- **THEN** the validation SHALL pass
- **AND** the payload SHALL be accepted by the executor-service

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

