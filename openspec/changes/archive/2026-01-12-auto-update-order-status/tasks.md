# Tasks: Auto Update Order Status Job

## 0. Preparation: Enhance Transaction Data

### 0.1 Update TransactionItem interface
- [x] **Task**: Modify `apps/executor-service/src/adapters/interfaces.ts`.
- [x] **Details**: Add `closedPrice?: number` to the `TransactionItem` interface.
- [x] **Validation**: Ensure no compilation errors in dependent adapters.

### 0.2 Update OandaAdapter
- [x] **Task**: Modify `apps/executor-service/src/adapters/oanda/oanda.adapter.ts`.
- [x] **Details**: In `getTransactions()`, extract the `price` from `tradesClosed` items and populate `item.closedPrice`.
- [x] **Validation**: Unit tests verifying `getTransactions` returns the price.

## 1. Implementation in executor-service

### 1.1 Create the job class
- [x] **Task**: Create `apps/executor-service/src/jobs/auto-update-order-status.job.ts`.
- [x] **Details**: 
    - Implement `AutoUpdateOrderStatusJob` extending `BaseJob`.
    - Add JSDoc recommending schedule `30 * * * * *`.
    - Logic: Query `OPEN` orders, sort by `_id ASC`, limit 50.
    - Group by `accountId`.
    - Use `brokerFactory` to get adapter.
    - Call `adapter.getTransactions`.
    - Use MongoDB transactions to update each group of orders.
    - Map `TransactionItem` to `Order` updates (status, exit price, pnl, history).
    - **History Entry**: Include message `Auto closed due to {reason}` in the history info.
    - Add error handling and Sentry capture.
- [x] **Validation**: Manual check of code structure and types.

### 1.2 Register the job
- [x] **Task**: Export the job from `apps/executor-service/src/jobs/index.ts`.
- [x] **Validation**: Ensure job is available in the system.

## 2. Model & DB Enhancements (Optional)

### 2.1 Verify and add indexes
- **Task**: Check `libs/dal/src/infra/db.ts` to ensure efficient querying for the job.
- **Details**: Verify `{ status: 1 }` or `{ accountId: 1, status: 1 }` exists. If not, add them. (Already verified: they exist).
- **Validation**: Run database initialization.

## 3. Testing

### 3.1 Integration tests for the job
- [x] **Task**: Create `apps/executor-service/test/integration/jobs/auto-update-order-status.job.spec.ts`.
- [x] **Details**: 
    - Mock broker `getTransactions` response.
    - Seed `OPEN` orders in DB.
    - Run job and verify orders are updated to `CLOSED` with correct data.
    - Verify history entries are created.
    - Verify error handling (one account failure doesn't stop others).
- [x] **Validation**: `npx jest apps/executor-service/test/integration/jobs/auto-update-order-status.job.spec.ts`.

### 3.2 Unit tests for status mapping (optional if integration covers)
- [x] **Task**: Add unit tests in `apps/executor-service/test/unit/jobs/auto-update-order-status.job.spec.ts` if logic is complex.
- [x] **Validation**: Run jest. (Covered by integration tests).

## 4. Final Validation
- [x] **Task**: Run `openspec validate auto-update-order-status --strict`.
- [x] **Validation**: Ensure no validation errors.
