# Capability: executor-refactor

## ADDED Requirements

### Requirement: Command-specific pipelines
The `executor-service` SHALL utilize a command pipeline to orchestrate order execution.
- **WHEN** an order command (LONG, SHORT, CLOSE_ALL, CANCEL, MOVE_SL, SET_TP_SL) is received
- **THEN** the system SHALL instantiate a specific pipeline composed of steps tailored to that command.
- **AND** pipeline steps SHALL be stored in command-specific subfolders under `src/services/order-handlers/`.

#### Scenario: Subfolder organization
- **GIVEN** a LONG/SHORT command
- **THEN** the steps SHALL be loaded from `order-handlers/open-order/` subfolder.

### Requirement: Execution Context
The pipeline execution SHALL be driven by a unified context object.
- **WHEN** a pipeline starts
- **THEN** a fresh `ExecutionContext` object SHALL be created
- **AND** it SHALL contain the `payload`, `account`, `adapter`, and `logger`
- **AND** it SHALL provide a `state` object for steps to store and retrieve intermediate data (e.g. lot size, calculated prices).

#### Scenario: Verification via parallel implementation
- **GIVEN** a refactored `OrderExecutorService` using the pipeline pattern
- **WHEN** running existing integration tests
- **THEN** all tests SHALL pass with identical behavior and side-effects (database updates, event publishing) as the monolithic implementation.
