## ADDED Requirements

### Requirement: Pending Order Cleanup Job Implementation
The trade-manager SHALL provide a PendingOrderCleanupJob that extends BaseJob to automatically clean up stale pending orders.

#### Scenario: Job registration
- **WHEN** the pending order cleanup job is implemented
- **THEN** it SHALL be decorated with `@RegisterJob('pending-order-cleanup-job')`
- **AND** it SHALL extend `BaseJob`
- **AND** it SHALL be registered in the job registry for automatic loading

#### Scenario: Job dependencies
- **WHEN** the job is instantiated
- **THEN** it SHALL have access to:
  - `OrderRepository` for querying and updating orders
  - `PushNotificationService` for sending notifications
  - `Container` for accessing other services
  - `Logger` for logging execution details

#### Scenario: Job execution schedule
- **WHEN** the job is configured in the database
- **THEN** it SHALL use cron expression `*/1 * * * *` (every 1 minute)
- **AND** it SHALL run in UTC timezone
- **AND** it SHALL be active by default (`isActive: true`)

#### Scenario: Job meta configuration
- **WHEN** the job document is created in the database
- **THEN** the `meta` field SHALL include:
  - `timeoutMinutes`: number (default: 1) - How long before a PENDING order is considered stale
  - `notificationAccountIds`: string[] (default: []) - Account IDs that should receive cleanup notifications
- **AND** these values SHALL be configurable without code changes

#### Scenario: onTick implementation
- **WHEN** the job's `onTick()` method executes
- **THEN** it SHALL:
  1. Read `timeoutMinutes` from job meta (default 1 if not set)
  2. Calculate cutoff time as `Date.now() - (timeoutMinutes * 60 * 1000)`
  3. Query all orders with `status = OrderStatus.PENDING`
  4. Filter orders in-memory where `createdAt < cutoffTime`
  5. Process each stale order sequentially
  6. Log the number of stale orders found and cleaned

#### Scenario: Transaction-based order cleanup
- **WHEN** processing a single stale order
- **THEN** the job SHALL use `withMongoTransaction` to ensure atomicity
- **AND** within the transaction it SHALL:
  - Update the order document with `closedAt` and `status`
  - Push a new history entry to the order's `history` array
- **AND** if the transaction fails, it SHALL log the error and continue with the next order

#### Scenario: Error handling in job execution
- **WHEN** an error occurs during job execution
- **THEN** the error SHALL be logged with job name and order details
- **AND** the error SHALL be captured in Sentry
- **AND** the job SHALL NOT crash the service
- **AND** the job SHALL continue processing remaining orders
- **AND** the next scheduled execution SHALL proceed normally

#### Scenario: Notification sending
- **WHEN** an order is successfully cleaned up
- **THEN** the job SHALL check if `order.accountId` is in `meta.notificationAccountIds`
- **AND** if true, it SHALL send a push notification
- **AND** if notification sending fails, it SHALL log the error but NOT fail the cleanup
- **AND** notification is best-effort, order cleanup is critical

#### Scenario: Service name constant
- **WHEN** creating history entries for cleanup
- **THEN** the job SHALL use `ServiceName.PENDING_ORDER_CLEANUP_JOB` as the service identifier
- **AND** this constant SHALL be added to `libs/shared/utils/src/constants/service-names.ts`
- **AND** the value SHALL be `'pending-order-cleanup-job'`

#### Scenario: Integration test coverage
- **WHEN** testing the pending order cleanup job
- **THEN** integration tests SHALL verify:
  - Job correctly identifies stale orders based on timeout
  - Job closes orders and adds history entries
  - Job respects notification whitelist
  - Job handles custom timeout configuration
  - Job continues on transaction failures
  - Job uses correct service name in history
