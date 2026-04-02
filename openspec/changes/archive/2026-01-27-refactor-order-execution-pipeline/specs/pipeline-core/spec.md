# Capability: pipeline-core

## ADDED Requirements

### Requirement: Pipeline execution order
The `shared-utils` library SHALL provide a reusable `ActionPipeline` engine to support the "Onion Model" of sequential execution.
- **WHEN** multiple steps are registered in the pipeline
- **THEN** they SHALL be executed in the exact order of registration (Step 1 -> Step 2 -> ...)
- **AND** each step SHALL receive a `next()` function to hand over control to the subsequent step.

#### Scenario: Short-circuiting execution
- **GIVEN** a pipeline with 3 steps
- **WHEN** Step 2 completes without calling `next()`
- **THEN** Step 3 SHALL NOT be executed
- **AND** the pipeline SHALL terminate gracefully.

### Requirement: Deferred execution
The pipeline engine SHALL support registering steps that execute after the primary chain.
- **WHEN** a step is registered via `useDeferred()`
- **THEN** it SHALL be executed after all primary steps have completed (or aborted)
- **AND** it SHALL execute regardless of success or failure of primary steps
- **AND** it SHALL execute in sequence after the `run()` method's `finally` block is entered.

#### Scenario: Exception propagation
- **GIVEN** a pipeline with Step 1 (Error Handler) and Step 2 (Logic)
- **WHEN** Step 2 throws an error
- **THEN** Step 1 SHALL capture the error in its `catch` block wrapping `await next()`.
