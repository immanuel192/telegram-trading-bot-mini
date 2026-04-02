# Capability: trade-manager-pipeline

## Requirements

### Requirement: Command Processing Pipeline
The system SHALL process all incoming command messages using a linear Action Pipeline pattern, separate from the message consumer logic.

#### Scenario: Successful Pipeline Execution
- **WHEN** a valid command message is received
- **THEN** the system initializes a pipeline specific to that command type
- **AND** executes all registered steps in sequence
- **AND** executes any deferred (cleanup/audit) steps at the end

### Requirement: Shared Execution Context
The system SHALL maintain a shared `ExecutionContext` object that persists across all steps in the pipeline, allowing steps to read and write state.

#### Scenario: State Propagation
- **WHEN** a step modifies the Execution Context (e.g., adding a payload)
- **THEN** subsequent steps in the same pipeline execution can access that modified data

### Requirement: Atomic Execution Steps
The system SHALL encapsulate distinct business logic units (e.g., validation, order creation) into isolated, atomic Steps that do not require an external wrapping transaction.

#### Scenario: Step Isolation
- **WHEN** a step executes a database write
- **THEN** usage of `withMongoTransaction` is restricted to within that step's scope only (if needed)
- **AND** the step does not rely on a parent transaction provided by the consumer

### Requirement: Pipeline Error Handling
The system SHALL halt the execution of the main pipeline steps if an error occurs, but MUST execute all registered deferred steps (e.g., for logging or cleanup).

#### Scenario: Error Interruption
- **WHEN** a step throws an error during execution
- **THEN** the pipeline stops executing remaining normal steps
- **AND** immediately proceeds to execute all "deferred" steps
- **AND** the error is captured in the execution context
