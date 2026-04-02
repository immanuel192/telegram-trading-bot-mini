# Tasks: Auto-Sync Linked Order TP/SL

## Overview
Implementation tasks for automatic TP/SL synchronization across linked orders. Tasks are grouped by component and include validation steps.

---

## Phase 1: Shared Infrastructure Updates

### Task 1.1: Add skipLinkedOrderSync flag to ExecuteOrderRequestPayload
**File**: `libs/shared/utils/src/interfaces/messages/execute-order-request-payload.ts`

- [x] Add `skipLinkedOrderSync` optional boolean field to `meta` object in `ExecuteOrderRequestPayloadSchema`
- [x] Add JSDoc comment explaining this flag prevents recursive sync operations
- [x] Verify TypeBox schema validation includes the new field
- [x] **Integration test**: Verify payload with `skipLinkedOrderSync: true` passes validation

---

## Phase 2: Executor Service - Job Implementation

### Task 2.1: Create AutoSyncTpSlLinkedOrderJob
**File**: `apps/executor-service/src/jobs/auto-sync-tp-sl-linked-order.job.ts`

- [x] Create new job class extending `BaseJob<Container, TParams>`
- [x] Define `TParams` interface with: `accountId: string`, `orderId: string`, `sl?: { price?: number }`, `tp?: { price?: number }`, `sourceOrderId?: string`
- [x] Decorate with `@RegisterJob('auto-sync-tp-sl-linked-order')`
- [x] Override `init()` to force `cronExpression` to `undefined` (prevent scheduled execution)
- [x] Implement `onTick()` to:
  - Validate params (accountId and orderId are required)
  - Fetch order from repository to verify it exists and is in OPEN status
  - Add comment: "Only support OPEN status for now, PENDING is out of scope"
  - **Add history entry to order** indicating job execution with:
    - `status: OrderHistoryStatus.UPDATE`
    - `service: 'auto-sync-tp-sl-linked-order-job'`
    - `command: CommandEnum.NONE` (automated action)
    - `info: { sourceOrderId, sl, tp, reason: 'linked-order-sync' }`
  - Get broker adapter using `container.brokerFactory.getAdapter(accountId)`
  - Build `ExecuteOrderRequestPayload` with `skipLinkedOrderSync: true` in meta
  - Call `container.orderExecutor['handleUpdateTakeProfitStopLoss']()` (access private method)
  - Log success/failure with orderId and traceToken
- [x] Add proper error handling with Sentry capture
- [ ] **Unit test**: Verify job doesn't create cron instance
- [x] **Unit test**: Verify job validates required params
- [x] **Unit test**: Verify job rejects orders not in OPEN status
- [x] **Integration test**: Verify job successfully updates TP/SL for a given order
- [x] **Integration test**: Verify job adds history entry before updating TP/SL

### Task 2.2: Register AutoSyncTpSlLinkedOrderJob
**File**: `apps/executor-service/src/jobs/index.ts`

- [x] Import `./auto-sync-tp-sl-linked-order.job` to auto-register the job
- [x] **Integration test**: Verify job is registered in JobRegistry

---

## Phase 3: Executor Service - Order Opening Logic

### Task 3.1: Refactor handleOpenOrder to use job for TP/SL updates
**File**: `apps/executor-service/src/services/order-executor.service.ts`

- [x] Replace the deferred SL logic (lines ~286-323) with job-based approach
- [ ] After successful order open and database update (line ~284):
  - Check if deferred SL is needed (`shouldDeferStopLoss && result.executedPrice`)
  - If yes, trigger job with `skipLinkedOrderSync: true` to update only this order's SL
  - Build params: `{ accountId, orderId, sl: recalculatedStopLoss, sourceOrderId: orderId }`
- [ ] Check if order has `linkedOrders` and TP/SL values to sync
- [ ] If `linkedOrders` exists and has length > 0 AND (sl or tp exists):
  - Fetch the created order from database to get final TP/SL values
  - For each linked orderId:
    - Build job params: `{ accountId, orderId: linkedOrderId, sl, tp, sourceOrderId: orderId }`
    - Call `jobService.triggerJob({ jobName: 'auto-sync-tp-sl-linked-order', params, traceToken })`
  - Log the number of linked orders being synced
- [ ] Add error handling: log failures but don't fail the main order creation
- [ ] **Integration test**: Create order with deferred SL, verify job updates SL correctly
- [ ] **Integration test**: Create order with linkedOrders and TP/SL, verify linked orders receive same TP/SL
- [ ] **Integration test**: Create order with linkedOrders but no TP/SL, verify no sync triggered

---

## Phase 4: Executor Service - TP/SL Update Logic

### Task 4.1: Add linked order sync to handleUpdateTakeProfitStopLoss
**File**: `apps/executor-service/src/services/order-executor.service.ts`

- [x] In `handleUpdateTakeProfitStopLoss`, check `payload.meta?.skipLinkedOrderSync`
- [ ] If `skipLinkedOrderSync` is true, skip linked order sync logic (prevent endless loop)
- [ ] If `skipLinkedOrderSync` is false/undefined:
  - After successful TP/SL update (line ~401), fetch the order
  - Check if order has `linkedOrders` and length > 0
  - Extract current SL and TP from payload
  - For each linked orderId:
    - Build job params with same SL/TP values: `{ accountId: order.accountId, orderId: linkedOrderId, sl, tp, sourceOrderId: order.orderId }`
    - Call `jobService.triggerJob({ jobName: 'auto-sync-tp-sl-linked-order', params, traceToken })`
  - Log the number of linked orders being synced
- [ ] Add error handling: log failures but don't fail the main update
- [ ] **Integration test**: Update TP/SL on order with linkedOrders, verify linked orders updated
- [ ] **Integration test**: Update TP/SL with skipLinkedOrderSync=true, verify no sync triggered
- [ ] **Integration test**: Update only SL on order with linkedOrders, verify only SL synced to linked orders
- [ ] **Integration test**: Update only TP on order with linkedOrders, verify only TP synced to linked orders

---

## Phase 5: Container Integration

### Task 5.1: Ensure JobService is accessible in OrderExecutorService
**File**: `apps/executor-service/src/services/order-executor.service.ts`

- [ ] Add `jobService: JobService<Container>` to constructor parameters
- [ ] Store as private field
- [ ] **Unit test**: Verify OrderExecutorService can access jobService

### Task 5.2: Update container to inject JobService into OrderExecutorService
**File**: `apps/executor-service/src/container.ts`

- [ ] Pass `jobService` to `OrderExecutorService` constructor
- [ ] **Integration test**: Verify container wires up dependencies correctly

---

## Phase 6: Testing & Validation

### Task 6.1: End-to-end integration tests
**File**: `apps/executor-service/test/integration/linked-order-sync.spec.ts`

- [ ] Test: Create LONG order with 2 linked orders and TP/SL → verify all 3 orders have same TP/SL
- [ ] Test: Create SHORT order with linked orders, then SET_TP_SL → verify all linked orders updated
- [ ] Test: Create order with linked orders, then MOVE_SL → verify all linked orders' SL updated
- [ ] Test: Verify no endless loop when order A and B are mutually linked
- [ ] Test: Verify sync continues even if one linked order fails to update
- [ ] Test: Verify sync works when linked order is in different account (if supported)

### Task 6.2: Update existing tests
- [ ] Review and update any existing tests that may be affected by the new sync logic
- [ ] Ensure mock adapters support the new flow

---

## Validation Checklist
- [ ] All unit tests pass: `nx test executor-service`
- [ ] All integration tests pass: `nx test executor-service --testPathPattern=integration`
- [ ] OpenSpec validation passes: `openspec validate auto-sync-linked-order-tpsl --strict`
- [ ] No TypeScript errors: `nx build executor-service`
- [ ] Code follows architecture rules (n-tier, dependency injection)
- [ ] Proper error handling and Sentry integration
- [ ] Logging includes relevant context (orderId, accountId, traceToken)
