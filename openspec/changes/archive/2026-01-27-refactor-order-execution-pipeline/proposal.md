# Proposal: Refactor Order Execution to Command Pipeline Pattern

## Problem Statement
The `OrderExecutorService` in `executor-service` has grown excessively complex (~1100 lines). Core business logic, validation rules, math calculations, and broker interactions are blended within monolithic methods like `handleOpenOrder`. This structure is difficult to maintain, hard for AI to safely refactor, and makes it challenging to add new features or cross-cutting concerns (e.g., granular logging, metrics, or conditional execution).

## Proposed Solution
Implement a **Command Pipeline Pattern** (Middleware-style) to decompose order execution into small, single-responsibility "Steps". Logic will flow through an `ExecutionContext` (Data Bag) managed by a central pipeline runner.

### Key Components

1.  **Shared Pipeline Runner (`libs/shared`)**:
    *   A generic, reusable engine supporting the "Onion Model" (`next()` style).
    *   Support for "Always/Deferred" steps that run at the end of the chain regardless of success/failure (useful for DB updates, Sentry).

2.  **Unified Execution Context**:
    *   A class/interface in `executor-service` that carries the `payload`, `account`, `adapter`, and derived `state` (lot size, prices, execution results).
    *   The state will be progressively populated by steps.

3.  **Step-Based Logic**:
    *   Move validation (Market Hours, Max Positions) to dedicated steps.
    *   Move calculations (Lot Size, Pips conversion) to dedicated steps.
    *   Move side-effects (Broker calls, DB updates, Event publishing) to dedicated steps.

4.  **Parallel Implementation**:
    *   We will initially keep the existing `OrderExecutorService` and build the new `PipelineOrderExecutorService` alongside it.
    *   The transition will be verified using existing integration tests.

## Impact

### Maintainability
*   Individual files will be < 200 lines.
*   New features can be added by creating a new step and registering it.
*   Logic is isolated and unit-testable.

### Performance
*   Overhead is minimal (< 0.1ms per pipeline execution).
*   Easier to profile individual steps.

### AI-Friendliness
*   Clear boundaries for refactoring.
*   Explicit data flow.

## Verification Plan
1.  **Unit Tests**: Test individual Pipeline Steps in isolation.
2.  **Integration Tests**: Reuse all existing `executor-service` integration tests. These tests should pass identically with the new implementation.
3.  **Phased Rollout**: Build, Test, Approve, and then Cleanup.
