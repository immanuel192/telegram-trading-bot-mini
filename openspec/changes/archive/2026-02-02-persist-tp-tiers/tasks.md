## 1. Data Access Layer (DAL) Updates

- [x] 1.1 **Update Order Interface**: Modify `Order` interface in `libs/dal/src/models/order.model.ts` to include `takeProfitTiers` within the `meta` object.
    - **Outcome**: A new `takeProfitTiers` field is available in the `Order` document with JSdocs explaining its purpose for monitoring.
    - **Expectation**: Interface should define an array of objects: `{ price: number; isUsed?: boolean; }`.
- [x] 1.2 **Update Repository Integration Tests**: Enhances `libs/dal/test/repositories/order.repository.spec.ts` to verify the persistence of the new `meta` fields.
    - **Outcome**: Tests confirm that when an order is saved with `meta.takeProfitTiers`, the data is accurately retrieved from MongoDB.
    - **Expectation**: Test cases include saving multiple tiers and asserting their presence and order in the retrieved document.

## 2. Core Service Refactoring (Executor Service)

- [x] 2.1 **Update Execution Context State**: Add `normalisedTakeProfits` field to `BaseExecutionState` in `apps/executor-service/src/services/order-handlers/execution-context.ts`.
    - **Outcome**: Pipeline steps can share the fully validated and sorted set of take profits via the context state.
    - **Expectation**: Type should be `Array<{ price?: number; pips?: number }>`.
- [x] 2.2 **Refactor TakeProfitSelectorService**: Extract normalization logic from `selectTakeProfit` into a new `normaliseTakeProfits` method in `apps/executor-service/src/services/calculations/take-profit-selector.service.ts`.
    - **Outcome**: Separation of concerns between "making TPs consistent" and "picking TPs for execution".
    - **Expectation**: The method should handle filtering (removing invalid prices) and directional sorting (Long: high-to-low, Short: low-to-high).
- [x] 2.3 **Update selectTakeProfit Method**: Modify the signature to accept the normalized array directly or pull from state.
    - **Outcome**: A cleaner, focused method that only applies index-based selection and optimization (averaging).

## 3. Pipeline Step Implementation

- [x] 3.1 **Create NormaliseTakeProfitStep**: Implement new step in `apps/executor-service/src/services/order-handlers/common/normalise-take-profit.step.ts`.
    - **Outcome**: A reusable pipeline step that prepares the `normalisedTakeProfits` state for subsequent usage.
    - **Expectation**: The step calls `selectorService.normaliseTakeProfits` and stores the result in `ctx.state.normalisedTakeProfits`.
- [x] 3.2 **Refactor SelectTakeProfitStep**: Update `apps/executor-service/src/services/order-handlers/common/select-take-profit.step.ts` to use the normalized state.
    - **Outcome**: The step no longer performs validation or sorting, only selection based on account config.
- [x] 3.3 **Pipeline Re-Wiring**: Update `PipelineOrderExecutorService` in `apps/executor-service/src/services/order-handlers/pipeline-executor.service.ts` to incorporate the new step sequence.
    - **Outcome**: The correct execution flow: `PipsConversion` -> `NormaliseTakeProfit` -> `SelectTakeProfit`.
    - **Expectation**: Applies to `LONG`, `SHORT`, and `SET_TP_SL` command pipelines.

## 4. Persistence Integration

- [x] 4.1 **Update OpenOrderStep**: Modify `updateOrderAfterOpen` in `apps/executor-service/src/services/order-handlers/open-order/open-order.step.ts`.
    - **Outcome**: The full list of normalized TP tiers is persisted when a position is first opened.
    - **Expectation**: `setUpdate['meta.takeProfitTiers']` is populated from `state.normalisedTakeProfits` mapping to the correct DB sub-interface.
- [x] 4.2 **Update UpdateOrderDatabaseStep**: Modify `execute` in `apps/executor-service/src/services/order-handlers/update-order/update-order-database.step.ts`.
    - **Outcome**: When TP levels are updated via `SET_TP_SL`, the full tier list in the database is refreshed.
    - **Expectation**: Both the legacy `tp` object and the new `meta.takeProfitTiers` are updated atomically.
- [x] 4.3 **Backward Compatibility Verification**: Ensure legacy `tp` field still stores TP1.
    - **Outcome**: Existing trade-manager and monitoring logic is unaffected while new features gain rich data.

## 5. Testing and Validation

- [x] 5.1 **Unit Testing Steps**: Create/Update unit tests for `NormaliseTakeProfitStep` and `SelectTakeProfitStep`.
    - **Expectation**: Mock the context and verify the state transitions correctly between steps.
- [x] 5.2 **Unit Testing Selector Service**: Update `apps/executor-service/test/unit/services/calculations/take-profit-selector.service.spec.ts`.
    - **Expectation**: Verify sorting logic for both Long and Short directions with various TP sets.
- [x] 5.3 **End-to-End Integration Verification**: Run `executor-service` integration tests (e.g., `translate-message-flow.spec.ts` if it covers the full chain).
    - **Outcome**: Verification that a signal with 3 TPs results in an `Order` document having 3 objects in `meta.takeProfitTiers` in correct order.
