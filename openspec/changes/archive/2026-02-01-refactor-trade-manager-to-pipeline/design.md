## Context

The `trade-manager` service's `TranslateResultHandler` has grown into a monolithic class (~800 lines) that orchestrates complex logic: message parsing, account lookup, order creation, linking logic, and audit trail updates. It currently wraps the process in a long-running MongoDB transaction, which causes stability issues and write conflicts. We need to align this service with the `executor-service` architecture by adopting the **Command Pipeline Pattern**.

## Goals / Non-Goals

**Goals:**
- **Modularize Logic:** Break down `TranslateResultHandler` into atomic, reusable **Steps**.
- **Remove Long Transactions:** Replace the loop-level transaction with granular atomic operations to improve database stability.
- **Improve Testability:** enable unit testing of individual steps (e.g., Entry Validation) in isolation.
- **AI-Readiness:** Create small, focused files that are easier for AI agents to reason about and modify.
- **Safe Migration:** Ensure existing integration tests pass without modification to the external behavior.

**Non-Goals:**
- **Changing Business Logic:** The actual rules for how orders are created or validated should remain identical.
- **Refactoring Other Handlers:** This scope is limited to `TranslateResultHandler`.

## Decisions

### 1. Command Processing Pipeline Architecture
**Decision**: Implement a `CommandProcessingPipelineService` that orchestrates the execution of a unified pipeline for all commands. Use the existing `ActionPipeline` utility from `@shared/utils`.

**Rationale**:
- **Simplicity**: Unlike `executor-service`, the `trade-manager` flow is highly uniform across all commands. A single pipeline with conditional steps is more maintainable than a map of variations.
- **Consistency**: Maintaining the pipeline pattern allows for future extensibility while keeping the current implementation straightforward.

### 2. Transaction Strategy: Atomic Operations over Long Transactions
**Decision**: Remove the `withMongoTransaction` wrapper around the processing loop. Instead, use atomic MongoDB operators (`$set`, `$push`) within individual steps.

**Rationale**:
- **Stability**: Eliminates "Write Conflict" errors caused by long-running transactions holding locks while waiting for external I/O (caches, streams).
- **Simplicity**: Reduces complexity in dependency injection (passing `session` objects everywhere).
- **Trade-off**: Slightly reduced consistency in catastrophic failure scenarios (e.g., order created but audit trail fails), but deemed acceptable for the MVP/Phase 1 as the system is eventually consistent.

### 3. Service Decomposition
**Decision**:
- `TranslateResultHandler`: Becomes a thin adapter. It parses the stream message, iterates over accounts, and calls `pipeline.execute(context)`.
- `OrderService`: Becomes a pure Data Access Object (DAO) wrapper. Business logic like "Find Orphan Order" moves to `FindOrphanOrderStep`.
- `Pipeline Steps`: All business logic extracts to `src/services/command-processing/steps/`.

## Risks / Trade-offs

- **[Risk] Migration Logic Errors**: Moving complex logic (like "Linked Orders") might introduce regressions.
    - **Mitigation**: Strictly verify against existing integration tests. Do not modify tests; use them as the source of truth.
- **[Risk] Partial Failure State**: Without a global transaction, a failure in Step 4 might leave effects from Step 1-3 committed.
    - **Mitigation**: Design steps to be idempotent where possible. Critical steps (Order Creation) are single atomic writes.
