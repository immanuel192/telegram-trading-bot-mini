# Tasks: Refactor Order Execution to Command Pipeline

## Phase 1: Foundation (Shared) [DONE]

- [x] Create `libs/shared/src/utils/pipeline` utility
  - [x] Implement `IPipelineStep` interface
  - [x] Implement `ActionPipeline` runner with `use()` and `useDeferred()` support
  - [x] Add unit tests for the pipeline runner
- [x] Export pipeline utility from `libs/shared/src/index.ts`
- [x] Implement test

## Phase 2: Executor Scaffolding [DONE]

- [x] Define `ExecutionContext` in `apps/executor-service/src/services/order-handlers/execution-context.ts`
- [x] Create directory structure for command steps:
  - [x] `apps/executor-service/src/services/order-handlers/common`
  - [x] `apps/executor-service/src/services/order-handlers/open-order`
  - [x] `apps/executor-service/src/services/order-handlers/close-order`
  - [x] `apps/executor-service/src/services/order-handlers/update-order`

## Phase 3: Wiring & Scaffolding

- [X] Create `PipelineOrderExecutorService` in `apps/executor-service/src/services/order-handlers/pipeline-executor.service.ts`
  - Initialize `ActionPipeline` instances for all command types (LONG, SHORT, CLOSE_ALL, CLOSE_BAD_POSITION, CANCEL, MOVE_SL, SET_TP_SL)
- [X] Implement `ResolveAccountStep` and `ResolveAdapterStep` (required for all pipelines)
- [X] Update `OrderExecutionHandler` to use `PipelineOrderExecutorService`
- [X] **Verification**: Run integration tests and confirm they ALL FAIL (as pipelines are empty)

## Phase 4: Gradual Migration (Command by Command)

### 4.1 Migration: Open Order (`LONG` & `SHORT`)
- [ ] Analyze `handleOpenOrder` in existing `OrderExecutorService`
- [ ] Implement Middlewares:
  - [X] `MarketHoursStep` (migrated from `validateMarketHours`)
  - [X] `MaxPositionsStep` (migrated from `validateMaxOpenPositions`)
  - [X] `PriceResolverStep` (migrated from `getCachedPrice`)
  - [X] `PipsConversionStep`
  - [X] `LotSizeCalculationStep`
  - [ ] `BrokerExecutionStep` (migrated from `orderOpenService.executeOpenOrder`)
  - [ ] `DatabaseFinalizerStep` (deferred step)
- [X] Register steps in `LONG` and `SHORT` pipelines
- [X] Mark migrated logic in `OrderExecutorService` and other related files with comments so that we know where to remove after migration.
- [X] **Verification**: Run `order-open.integration.spec.ts` (Goal: 100% Pass)

### 4.2 Migration: Close Order (`CLOSE_ALL` & `CLOSE_BAD_POSITION`)
- [X] Analyze `handleCloseOrder` and `handleCloseBadPosition`
- [X] Implement Middlewares:
  - [X] `CloseConfigCheckStep` (for `CLOSE_BAD_POSITION` disable check)
  - [X] `CloseAllStep` (using `handleCloseOrderHelper`)
- [X] Register steps in `CLOSE_ALL` and `CLOSE_BAD_POSITION` pipelines
- [X] Mark migrated logic in `OrderExecutorService` and other related files with comments so that we know where to remove after migration.
- [X] **Verification**: Run `order-close.integration.spec.ts` (Goal: 100% Pass for CLOSE_ALL)

### 4.3 Migration: Update Order (`MOVE_SL` & `SET_TP_SL`)
- [X] Analyze `handleMoveStopLoss` and `handleSetTakeProfitStopLoss`
- [X] Implement Middlewares:
  - [X] `UpdateCalculationStep`
  - [X] `BrokerUpdateStep`
  - [X] `LinkedOrderSyncStep`
- [X] Register steps in pipelines
- [X] Mark migrated logic in `OrderExecutorService` and other related files with comments so that we know where to remove after migration.
- [X] **Verification**: Run `order-update.integration.spec.ts` (Goal: 100% Pass)

### 4.4 Migration: Cancel Order (`CANCEL`)
- [X] Analyze `handleCancelOrder`
- [X] Register steps in pipeline
- [X] Mark migrated logic in `OrderExecutorService` and other related files with comments so that we know where to remove after migration.
- [X] **Verification**: Run `order-cancel.integration.spec.ts` (Goal: 100% Pass)

## Phase 5: Finalization & Cleanup

- [X] Ensure `GlobalErrorStep` (Deferred) is handling results publishing for all pipelines
- [X] Verify 100% pass rate on all integration tests in `apps/executor-service/test/integration/services/order-executor-commands/`
- [X] Remove old `OrderExecutorService` and legacy calculation services
- [X] Rename `PipelineOrderExecutorService` to `OrderExecutorService`
- [X] Final end-to-end verification

## Validation
- [X] Run `openspec validate refactor-order-execution-pipeline --strict`
