# Change: Pending Order Cleanup Job

## Why
Orders can be created with status `PENDING` but never transition to `OPEN` if the executor-service fails to process them, network issues occur, or messages are lost. These orphaned orders accumulate indefinitely, creating data inconsistency and making it difficult to track actual order state.

## What Changes
- Add `command` field to `OrderHistory` to track which command (LONG, SHORT, etc.) created or modified each order
- Update order creation logic in `TranslateResultHandler` and `OrderService` to populate the `command` field
- Implement `PendingOrderCleanupJob` that runs every 1 minute to find and close stale pending orders
- Add configurable timeout (default 1 minute) and notification account whitelist in job meta
- Add new service name constant `PENDING_ORDER_CLEANUP_JOB` for audit trail
- Send push notifications for cleaned orders (only for whitelisted accounts)

## Impact
- Affected specs: `order-management`, `job-scheduling`
- Affected code:
  - `libs/dal/src/models/order.model.ts` - Add `command` field to `OrderHistory`
  - `apps/trade-manager/src/events/consumers/translate-result-handler.ts` - Pass command when creating orders
  - `apps/trade-manager/src/services/order.service.ts` - Accept and store command in history
  - `apps/trade-manager/src/jobs/pending-order-cleanup-job.ts` - New job implementation
  - `libs/shared/utils/src/constants/service-names.ts` - Add new service name
  - `libs/dal/src/infra/db.ts` - Document index strategy (use existing indexes, filter in-memory)
