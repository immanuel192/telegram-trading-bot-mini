## 1. Data Model Updates

### 1.1 Add command field to OrderHistory
- [x] 1.1.1 Update `OrderHistory` interface in `libs/dal/src/models/order.model.ts` to add `command: CommandEnum` field
- [x] 1.1.2 Add JSDoc comment explaining the field's purpose
- [x] 1.1.3 Update file header documentation to mention command tracking

### 1.2 Add service name constant
- [x] 1.2.1 Add `PENDING_ORDER_CLEANUP_JOB = 'pending-order-cleanup-job'` to `ServiceName` enum in `libs/shared/utils/src/constants/service-names.ts`
- [x] 1.2.2 Add JSDoc comment for the new service name

## 2. Order Service Updates

### 2.1 Update OrderService.createOrder() to accept command
- [x] 2.1.1 Add `command: CommandEnum` to `CreateOrderInput` interface in `apps/trade-manager/src/services/order.service.ts`
- [x] 2.1.2 Update `createOrder()` method to include `command` in the INTEND history entry
- [x] 2.1.3 Update JSDoc comments to document the command parameter

### 2.2 Update order creation call sites
- [x] 2.2.1 Update `TranslateResultHandler.handleTradeOrderCreation()` in `apps/trade-manager/src/events/consumers/translate-result-handler.ts` to pass `command: command.command` to `orderService.createOrder()`
- [x] 2.2.2 Verify the command is correctly passed through

## 3. Pending Order Cleanup Job Implementation

### 3.1 Create PendingOrderCleanupJob class
- [x] 3.1.1 Create `apps/trade-manager/src/jobs/pending-order-cleanup-job.ts`
- [x] 3.1.2 Add file header documentation (purpose, inputs, outputs, core flow)
- [x] 3.1.3 Implement class extending `BaseJob` with `@RegisterJob('pending-order-cleanup-job')` decorator
- [x] 3.1.4 Add constructor with dependencies: `OrderRepository`, `PushNotificationService` from container
- [x] 3.1.5 Implement `onTick()` method with main cleanup logic

### 3.2 Implement query and filter logic
- [x] 3.2.1 Read `timeoutMinutes` from `this.jobConfig.meta?.timeoutMinutes ?? 1`
- [x] 3.2.2 Calculate cutoff time: `new Date(Date.now() - timeoutMinutes * 60 * 1000)`
- [x] 3.2.3 Query orders with `status = OrderStatus.PENDING` using `orderRepository.findAll()`
- [x] 3.2.4 Filter in-memory: `orders.filter(order => order.createdAt < cutoffTime)`
- [x] 3.2.5 Add comment: "MVP: Filtering createdAt in-memory is acceptable with assumption of few PENDING orders (\<100). TODO: If PENDING orders exceed 100, consider adding compound index {status: 1, createdAt: 1}"
- [x] 3.2.6 Log number of stale orders found

### 3.3 Implement order cleanup logic
- [x] 3.3.1 Create `cleanupOrder(order: Order)` private method
- [x] 3.3.2 Wrap cleanup in `withMongoTransaction` for atomicity
- [x] 3.3.3 Use `orderRepository.updateMany()` with `$set` for `closedAt` and `status`
- [x] 3.3.4 Use `$push` to add history entry with:
  - `_id: new ObjectId()`
  - `status: OrderHistoryStatus.CANCELED`
  - `service: ServiceName.PENDING_ORDER_CLEANUP_JOB`
  - `ts: new Date()`
  - `traceToken: ''`
  - `messageId: order.messageId`
  - `channelId: order.channelId`
  - `command: CommandEnum.NONE`
  - `info: { reason: 'Order was pending for more than configured timeout and automatically cleaned up' }`
- [x] 3.3.5 Add error handling with try-catch, log errors, capture in Sentry, continue processing

### 3.4 Implement notification logic
- [x] 3.4.1 Create `sendNotificationIfEnabled(order: Order)` private method
- [x] 3.4.2 Read `notificationAccountIds` from `this.jobConfig.meta?.notificationAccountIds ?? []`
- [x] 3.4.3 Check if `order.accountId` is in the whitelist
- [x] 3.4.4 If yes, send notification with title and message containing orderId, symbol, accountId
- [x] 3.4.5 Wrap in try-catch, log notification errors but don't fail cleanup

### 3.5 Add logging
- [x] 3.5.1 Log job start with timeout configuration
- [x] 3.5.2 Log number of stale orders found
- [x] 3.5.3 Log each order cleaned (orderId, accountId, symbol)
- [x] 3.5.4 Log notification sent/skipped
- [x] 3.5.5 Log job completion with summary

## 4. Database Index Documentation

### 4.1 Document index strategy
- [x] 4.1.1 Add comment in `libs/dal/src/infra/db.ts` near Orders indexes explaining that existing `status` index is used for cleanup job
- [x] 4.1.2 Document that createdAt filtering is done in-memory for MVP
- [x] 4.1.3 Add TODO comment about compound index if scale increases

## 5. Testing

### 5.1 Unit tests for OrderService
- [x] 5.1.1 Update `apps/trade-manager/test/unit/services/order.service.spec.ts` to test command field in createOrder()
- [x] 5.1.2 Verify command is correctly stored in INTEND history entry

### 5.2 Integration tests for TranslateResultHandler
- [x] 5.2.1 Update `apps/trade-manager/test/integration/events/consumers/translate-result-handler.spec.ts` to verify command is passed when creating orders
- [x] 5.2.2 Verify LONG command creates order with command=LONG in history
- [x] 5.2.3 Verify SHORT command creates order with command=SHORT in history

### 5.3 Integration tests for PendingOrderCleanupJob
- [x] 5.3.1 Create `apps/trade-manager/test/integration/jobs/pending-order-cleanup-job.spec.ts`
- [x] 5.3.2 Test: Job identifies stale orders based on default timeout (1 minute)
- [x] 5.3.3 Test: Job identifies stale orders based on custom timeout from meta
- [x] 5.3.4 Test: Job closes stale orders and sets closedAt, status=CLOSED
- [x] 5.3.5 Test: Job adds CANCELED history entry with correct fields (service, command=NONE, reason)
- [x] 5.3.6 Test: Job sends notification for whitelisted accounts
- [x] 5.3.7 Test: Job skips notification for non-whitelisted accounts
- [x] 5.3.8 Test: Job skips notification when whitelist is empty
- [x] 5.3.9 Test: Job continues processing on transaction failure
- [x] 5.3.10 Test: Job uses correct service name in history
- [x] 5.3.11 Test: Job does not clean orders younger than timeout
- [x] 5.3.12 Test: Job uses MongoDB transaction for atomicity

## 6. Job Registration and Configuration

### 6.1 Register job in job manager
- [x] 6.1.1 Verify job is automatically registered via `@RegisterJob` decorator
- [x] 6.1.2 Import job class in `apps/trade-manager/src/jobs/index.ts` if needed

### 6.2 Create job database document
- [x] 6.2.1 Document the required job configuration in a migration script or manual setup guide:
  ```json
  {
    "jobId": "pending-order-cleanup-job",
    "name": "pending-order-cleanup-job",
    "isActive": true,
    "config": {
      "cronExpression": "*/1 * * * *",
      "timezone": "UTC"
    },
    "meta": {
      "timeoutMinutes": 1,
      "notificationAccountIds": []
    }
  }
  ```

## 7. Documentation

### 7.1 Update code documentation
- [x] 7.1.1 Ensure all new files have proper header comments
- [x] 7.1.2 Add JSDoc comments for all public methods
- [x] 7.1.3 Document the cleanup flow in OrderHistory interface comments

### 7.2 Update README if needed
- [x] 7.2.1 Document the new job in trade-manager README (if applicable)
- [x] 7.2.2 Explain how to configure timeout and notification whitelist
