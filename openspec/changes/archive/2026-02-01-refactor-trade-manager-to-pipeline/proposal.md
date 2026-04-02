## Why

The current `trade-manager` service uses a monolithic `TranslateResultHandler` (~800 lines) with complex, nested logic that is difficult to maintain, test, and adapt. Refactoring it to use the Command Pipeline pattern (already successful in `executor-service`) will improve code clarity, testability, and AI-readiness by breaking logic into atomic, reusable steps, while also resolving stability issues caused by long-running transactions.

## What Changes

- **Refactor Architecture**: Replace the procedural logic in `TranslateResultHandler` with a new `CommandProcessingPipelineService` using the Action Pipeline pattern.
- **Atomic Operations**: Remove the long-running MongoDB transaction that wraps the entire processing loop, replacing it with atomic operations per step to prevent write conflicts.
- **Step Extraction**: Break down business logic (entry validation, order creation, message edit checks) into individual, isolated classes in `src/services/command-processing/steps/`.
- **Service Simplification**: Transition `OrderService` to a pure data-access layer, moving business logic into pipeline steps.
- **Legacy Handler**: Keep `TranslateResultHandler` as a thin orchestration layer to maintain the external interface and ensure safe migration.

## Capabilities

### New Capabilities
<!-- Capabilities being introduced. Replace <name> with kebab-case identifier (e.g., user-auth, data-export, api-rate-limiting). Each creates specs/<name>/spec.md -->
- `trade-manager-pipeline`: Defines the new pipeline structural requirements effectively extending the `service-foundation` capability for the `trade-manager`.

### Modified Capabilities
<!-- Existing capabilities whose REQUIREMENTS are changing (not just implementation).
     Only list here if spec-level behavior changes. Each needs a delta spec file.
     Use existing spec names from openspec/specs/. Leave empty if no requirement changes. -->
- `order-management`: Updates the technical implementation requirements for how orders are created and linked (specifically the removal of the transaction requirement for order creation flows).

## Impact

- **Codebase**: Heavy refactoring in `apps/trade-manager`, specifically `TranslateResultHandler` and `OrderService`.
- **Database**: Removal of `withMongoTransaction` usage in the main processing loop; relying on atomic operators.
- **Testing**: Integration tests for `trade-manager` will need verification to ensure the new pipeline produces identical results to the old logic.
