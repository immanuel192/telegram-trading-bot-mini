# Partial Order Closure Delta

Update the execution pipeline and result publishing to support TP monitoring synchronization.

## ADDED Requirements

### Requirement: Persistence of Tier Usage
The `CLOSE_PARTIAL` pipeline must mark the triggered take profit tier as used in the database.

#### Scenario: Update Tier in DB
- **WHEN** Successfully closing a partial position triggered by a TP tier
- **THEN** Update `meta.takeProfitTiers` to set `isUsed: true` for the corresponding price level.

### Requirement: Enriched Execution Result
Execution result events for partial closures must include the current state of remaining lots and TP tiers.

#### Scenario: Publish Full Status in Result
- **WHEN** Publishing `EXECUTE_ORDER_RESULT` for a partial close
- **THEN** Include `lotSizeRemaining` and the full list of `takeProfitTiers` with their updated `isUsed` status.
