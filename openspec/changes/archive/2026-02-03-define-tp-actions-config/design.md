## Context

The system currently handles single TP levels or basic multiple TPs where all positions close at once or based on a fixed index. We are introducing a multi-tier TP monitoring system where specific actions (partial close and SL move) can be defined for each TP tier hit. This design focuses on the data model changes in `Account.configs`.

## Goals / Non-Goals

**Goals:**
- Define `TpAction` interface and related types/enums.
- Add multi-tier TP monitoring configuration to the `Account` model.
- Ensure type safety for close percentages and SL move levels.

**Non-Goals:**
- Implementing the monitoring logic in `trade-manager` or `executor-service`.
- Adding symbol-level overrides for partial TP (as requested, this is account-level only).
- Handling the actual order execution.

## Decisions

### 1. Data Structure in `Account.configs`
We will add `enableTpMonitoring` as a boolean toggle and `tp1Action` through `tp4Action` of type `TpAction`.
*Rationale:* Keeps the structure flat and easy to read/configure for the MVP.

### 2. `TpAction` Interface
```typescript
export interface TpAction {
  closePercent?: number | 'REMAINING';
  moveSL?: 'ENTRY' | 'TP1' | 'TP2' | 'TP3';
}
```
*Rationale:* Directly matches the requirement for flexible partial closes and SL adjustments.

### 3. Usage of Enums/Unions
We will define enums or unions for `closePercent` ('REMAINING') and `moveSL` ('ENTRY' | 'TP1' | 'TP2' | 'TP3') to ensure consistency.
*Rationale:* Improves developer experience and reduces configuration errors.

## Risks / Trade-offs

- **[Risk]** Data model bloat in `Account` configs. → **Mitigation**: Keep individual field documentation concise but clear.
- **[Risk]** Complexity in monitoring logic later. → **Mitigation**: Define clean configuration now so the logic has a clear contract to follow.
