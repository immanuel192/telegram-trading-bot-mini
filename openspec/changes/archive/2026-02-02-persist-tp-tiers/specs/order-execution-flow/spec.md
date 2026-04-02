## ADDED Requirements

### Requirement: Take Profit Normalization
The order execution pipeline SHALL include a dedicated step to normalize take profit levels before selection and execution.

#### Scenario: Normalizing TPs from signal
- **WHEN** the `NormaliseTakeProfitStep` executes
- **THEN** it SHALL extract all take profits from the execution state
- **AND** it SHALL filter out duplicate or invalid levels
- **AND** it SHALL sort the levels by profitability (LONG: descending price, SHORT: ascending price)
- **AND** it SHALL store the sorted list back in the state for subsequent steps

### Requirement: Selective Take Profit Application
The system SHALL support selecting a subset of normalized take profits for broker execution while preserving the full set for monitoring.

#### Scenario: Selecting TP for broker
- **WHEN** the `SelectTakeProfitStep` executes
- **THEN** it SHALL use the normalized take profits from the state
- **AND** it SHALL select the target TP(s) based on the account's `takeProfitIndex` configuration
- **AND** it MAY generate an "optimized" average TP if multiple levels are available and configured

## MODIFIED Requirements

### Requirement: Order Execution Service
The executor-service SHALL provide an OrderExecutorService that orchestrates order execution via broker adapters.

#### Scenario: OrderExecutorService execution pipeline
- **WHEN** OrderExecutorService processes an order
- **THEN** it SHALL run a pipeline that includes:
  - Account and adapter resolution
  - Entry price and stop loss calculation
  - **Take profit normalization** (new step)
  - **Take profit selection** (updated step)
  - Broker execution
  - Database persistence of results, including all normalized TP tiers
  - Result publication
