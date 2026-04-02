## Context

Currently, the `executor-service` processes multiple take profit levels from the trading signal but only persists the first one (TP1) to the `Order` model in MongoDB. To support an upcoming feature for multi-tier take profit monitoring with live prices, we need to persist all identified and normalized TP tiers.

## Goals / Non-Goals

**Goals:**
- Persist all validated and sorted take profit tiers in the `Order` model.
- Refactor the take profit processing logic in the execution pipeline for better separation of concerns.
- Maintain backward compatibility with existing fields (`tp` field).

**Non-Goals:**
- Changing the broker adapter interfaces or how orders are placed with the broker.
- Implementing the actual live price monitoring logic (this is part of a subsequent change).

## Decisions

### 1. Unified Storage for TP Tiers
We will use a new field `meta.takeProfitTiers` within the `Order` model.
- **Rationale**: Storing TPs in `meta` avoids breaking existing logic that relies on the `tp` field. Using an array allows for any number of TP levels (as provided by the signal) while the legacy `tp` field is restricted to 3 levels.
- **Structure**:
  ```ts
  takeProfitTiers: {
    price: number;
    isUsed?: boolean;
  }[];
  ```

### 2. Pipeline Refactoring
Split `SelectTakeProfitStep` into `NormaliseTakeProfitStep` and a refined `SelectTakeProfitStep`.
- **Rationale**: Normalization (filtering and sorting) is a distinct logical operation from selection (picking which TP to execute). Normalizing once allows us to store the full set of TPs even if only one is selected for the current execution.
- **State Changes**:
  - `BaseExecutionState` (in `execution-context.ts`) will now include `normalisedTakeProfits` to pass between steps.

### 3. Persistence in Pipeline Steps
- **OpenOrderStep**: After successful execution, this step will map the `normalisedTakeProfits` from the state to the `Order` document's `meta.takeProfitTiers`.
- **UpdateOrderDatabaseStep**: Similarly, when processing a `SET_TP_SL` command, this step will update the `meta.takeProfitTiers` field.

## Risks / Trade-offs

- **[Risk] Data Inconsistency** → The `tp` field and `meta.takeProfitTiers` might drift if logic is not updated consistently. Mitigation: Ensure both are updated in the same database operation.
- **[Trade-off] Redundancy** → Storing TP1 in both `tp.tp1Price` and `meta.takeProfitTiers[0]`. This is accepted to ensure backward compatibility for services that haven't been migrated to use `takeProfitTiers` yet.
