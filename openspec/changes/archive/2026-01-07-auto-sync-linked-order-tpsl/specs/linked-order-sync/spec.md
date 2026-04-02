# Linked Order TP/SL Synchronization Specification Delta

## ADDED Requirements

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
