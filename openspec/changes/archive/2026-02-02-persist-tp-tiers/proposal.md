## Why

To enable multi-tier take profit monitoring with live prices. Currently, the system only persists the first take profit level (TP1), which prevents the monitoring job from tracking when subsequent TP levels (TP2, TP3) are reached. Persisting all tiers is a prerequisite for the multi-tier TP monitoring feature.

## What Changes

- **DAL Enhancement**: Update the `Order` model to include a `meta.takeProfitTiers` field that stores an array of all validated and sorted take profit levels.
- **Pipeline Refactoring**: Split the current `SelectTakeProfitStep` logic into two distinct steps:
    1. `NormaliseTakeProfitStep`: Validates and sorts all take profits from the signal, storing them in the execution state.
    2. `SelectTakeProfitStep`: Picks the specific TP(s) to send to the broker based on account configuration (`takeProfitIndex`).
- **Persistence Update**: Modify `OpenOrderStep` and `UpdateOrderDatabaseStep` to save the full list of normalized TP tiers into the `meta.takeProfitTiers` field of the `Order` document.
- **Backward Compatibility**: Keep the existing `tp` field (storing TP1) as-is for backward compatibility with existing components.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `order-management`: Extend the `Order` model and persistence logic to support multi-tier take profits.
- `order-execution-flow`: Refactor the TP selection and normalization logic within the order execution pipeline.

## Impact

- **DAL**: `libs/dal/src/models/order.model.ts` (Model update)
- **Executor Service**:
    - `apps/executor-service/src/services/calculations/take-profit-selector.service.ts` (Refactoring logic)
    - `apps/executor-service/src/services/order-handlers/common/` (New normalization step and updated selection step)
    - `apps/executor-service/src/services/order-handlers/open-order/open-order.step.ts` (Persistence logic)
    - `apps/executor-service/src/services/order-handlers/update-order/update-order-database.step.ts` (Persistence logic)
    - `apps/executor-service/src/services/order-handlers/pipeline-executor.service.ts` (Pipeline configuration)
- **Testing**: Unit tests for the new/updated steps and integration tests for the full TP persistence flow.
