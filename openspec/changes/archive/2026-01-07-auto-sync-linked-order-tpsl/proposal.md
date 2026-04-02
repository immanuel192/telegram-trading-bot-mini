# Proposal: Auto-Sync Linked Order TP/SL

## Change ID
`auto-sync-linked-order-tpsl`

## Problem Statement
Currently, when one order in a linked order group updates its Take Profit (TP) or Stop Loss (SL), the other linked orders remain out of sync. This creates inconsistent risk management across related positions, as traders expect linked orders (e.g., DCA orders, split positions) to maintain synchronized TP/SL levels.

The issue occurs in three scenarios:
1. **LONG/SHORT commands**: When creating orders with `linkedOrders` AND TP/SL values
2. **SET_TP_SL command**: When updating TP/SL for an order that has `linkedOrders`
3. **MOVE_SL command**: When updating SL for an order that has `linkedOrders`

## Proposed Solution
Implement automatic TP/SL synchronization across linked orders by:

1. **Creating a new manual-trigger-only job** (`AutoSyncTpSlLinkedOrderJob`) in executor-service that:
   - Accepts parameters: `accountId`, `orderId`, `sl`, `tp`, `sourceOrderId` (optional)
   - Validates the target order exists and is in OPEN status
   - **Records job execution in order history** before updating TP/SL to provide audit trail
   - Reuses existing `handleUpdateTakeProfitStopLoss` logic
   - Forces `cronExpression` to `undefined` to prevent scheduled execution
   - Only runs when manually triggered

2. **Updating order opening logic** to trigger sync after successful order creation:
   - Extract `linkedOrders` from the order entity
   - Determine current TP/SL values
   - Manually trigger the job for each linked order with `sourceOrderId` for traceability

3. **Updating TP/SL modification logic** to trigger sync for linked orders:
   - Detect if the order has `linkedOrders`
   - Trigger the job with the same TP/SL values for all linked orders

4. **Preventing endless loops** by:
   - Adding `skipLinkedOrderSync` flag to `ExecuteOrderRequestPayload.meta`
   - Setting this flag when the job triggers sync operations
   - Skipping sync logic when this flag is present

5. **Providing clear audit trail** by:
   - Job adds history entry with `service: 'auto-sync-tp-sl-linked-order-job'` before updating
   - History includes `sourceOrderId`, `reason`, and TP/SL values
   - Distinguishes automated actions (`CommandEnum.NONE`) from user commands

## Affected Components
- **executor-service**:
  - New job: `apps/executor-service/src/jobs/auto-sync-tp-sl-linked-order.job.ts`
  - Modified: `apps/executor-service/src/services/order-executor.service.ts`
  - Modified: `apps/executor-service/src/jobs/index.ts`
  
- **shared/utils**:
  - Modified: `libs/shared/utils/src/interfaces/messages/execute-order-request-payload.ts`

- **dal**:
  - No changes needed (Order model already has `linkedOrders` field)

## Success Criteria
1. When an order with linked orders is created with TP/SL, all linked orders receive the same TP/SL
2. When TP/SL is updated on an order with linked orders, all linked orders are updated
3. No endless loops occur during synchronization
4. Existing TP/SL update logic remains functional
5. **Job execution is recorded in order history** with appropriate service name, reason, and sourceOrderId
6. **History sequence is clear**: job marker entry appears before the actual TP/SL update entry
7. Integration tests verify all sync scenarios and history tracking

## Risks & Mitigations
- **Risk**: Endless loop if sync triggers sync
  - **Mitigation**: Use `skipLinkedOrderSync` flag to break recursion
  
- **Risk**: Job triggering fails silently
  - **Mitigation**: Proper error logging and Sentry capture in job execution
  
- **Risk**: Race conditions when multiple orders sync simultaneously
  - **Mitigation**: Sequential job queue processing (already handled by JobService)

## Dependencies
- Existing job infrastructure (`BaseJob`, `JobManager`, `JobService`)
- Existing order update logic (`OrderUpdateService.handleUpdateTakeProfitStopLoss`)
- Order model with `linkedOrders` field

## Out of Scope
- Bi-directional sync prevention beyond the `skipLinkedOrderSync` flag
- Configurable sync behavior per account
- Sync for other order parameters (lot size, leverage, etc.)
