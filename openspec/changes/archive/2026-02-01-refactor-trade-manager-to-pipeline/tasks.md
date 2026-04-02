## 1. Infrastructure Scaffolding

- [x] 1.1 Create `apps/trade-manager/src/services/command-processing/execution-context.ts`
    - **Description**: Define the `CommandProcessingContext` class and its state interface. This must hold the `Account`, `Command`, `Extraction`, and resulting `ExecuteOrderRequestPayload[]`.
    - **Outcome**: A stable context object that can be passed between pipeline steps.
- [x] 1.2 Create `apps/trade-manager/src/services/command-processing-pipeline.service.ts`
    - **Description**: Implement the orchestrator service that initializes a single `ActionPipeline` instance. It should handle all commands using conditional steps.
    - **Outcome**: A centralized service ready to manage and execute command processing.
- [x] 1.3 Register `CommandProcessingPipelineService` in `apps/trade-manager/src/container.ts`
    - **Description**: Wire up the new service in the DI container, providing all necessary dependencies (OrderService, transformer, etc.).
    - **Outcome**: The service is available for injection into the `TranslateResultHandler`.

## 2. Step Implementation (Core Logic)

- [x] 2.1 Create `SentryStartStep` and `SentryCommitStep` in `apps/trade-manager/src/services/command-processing/steps/tracing.step.ts`
    - **Description**: Extract Sentry tracing logic from the handler into reusable steps.
    - **Outcome**: Consistent observability across pipeline execution.
- [x] 2.2 Create `MessageEditCheckStep` in `apps/trade-manager/src/services/command-processing/steps/message-edit.step.ts`
    - **Description**: Extract logic from `TranslateResultHandler` that uses `MessageEditHandlerService` to determine if a message is an edit and if the normal flow should be skipped.
    - **Outcome**: Decoupled message edit detection logic.
- [x] 2.3 Create `CommandTransformationStep` in `apps/trade-manager/src/services/command-processing/steps/transform-command.step.ts`
    - **Description**: Wrap the `CommandTransformerService.transform` call into a pipeline step.
    - **Outcome**: Payload generation logic integrated into the pipeline.
- [x] 2.4 Create `ValidateEntryPriceStep` in `apps/trade-manager/src/services/command-processing/steps/validate-entry.step.ts`
    - **Description**: Extract the entry price validation logic (comparing AI entry to market price via `PriceCacheService`) into a standalone step.
    - **Outcome**: Robust, testable entry price validation.
- [x] 2.5 Create `OrderCreationStep` in `apps/trade-manager/src/services/command-processing/steps/create-order.step.ts`
    - **Description**: Extract the `handleTradeOrderCreation` logic. This step should call `OrderService.createOrder` and handle linked/orphan orders.
    - **Outcome**: Order persistence logic isolated from the handler.
- [x] 2.6 Create `PublishExecutionRequestStep` in `apps/trade-manager/src/services/command-processing/steps/publish-request.step.ts`
    - **Description**: Extract `publishAndLogPayloads` logic. Publishes payloads to the Redis stream and writes to `TelegramMessageHistory`.
    - **Outcome**: Order execution requests are reliably published.
- [x] 2.7 Create `CaptureAuditMetadataStep` in `apps/trade-manager/src/services/command-processing/steps/audit-metadata.step.ts`
    - **Description**: Extract `updateMessageLivePrice` logic to update the Telegram message with the latest market price for auditing.
    - **Outcome**: Audit metadata is accurately captured at the end of the pipeline.

## 3. Handler Refactoring & Integration

- [x] 3.1 Initialize and configure the pipeline in `CommandProcessingPipelineService`
    - **Description**: Define the sequence of steps for the unified command processing pipeline in the pipeline service's constructor or initialization method.
    - **Outcome**: A functional pipeline for processing all trading commands.
- [x] 3.2 Refactor `TranslateResultHandler` to inject `CommandProcessingPipelineService`
    - **Description**: Update the consumer handler to replace its internal loop logic with a call to the new pipeline service.
    - **Outcome**: A significantly simplified handler (~50-100 lines vs ~800).
- [x] 3.3 Verify existing usage of `withMongoTransaction` is removed from Handler loop
    - **Description**: Ensure the code no longer wraps the entire multi-account/multi-command loop in a single transaction.
    - **Outcome**: Improved database performance and zero "Write Conflict" errors.
- [x] 3.4 Cleanup unused methods in `TranslateResultHandler`
    - **Description**: Remove private methods that were extracted into steps (e.g., `validateEntryPrice`, `publishAndLogPayloads`).
    - **Outcome**: Clean, focused handler codebase.

## 4. Verification

- [x] 4.1 Run existing integration tests for `TranslateResultHandler`
    - **Description**: Execute `nx test trade-manager -- integration`.
    - **Outcome**: 100% pass rate, ensuring no regression in business logic.
- [x] 4.2 Generate and run unit tests for new pipeline steps and services
    - **Description**: Create unit tests for all new steps in `src/services/command-processing/steps/` and the pipeline service.
    - **Outcome**: Comprehensive unit test coverage for the new architecture.
- [x] 4.3 Verify database integrity (Manual/Final)
    - **Description**: Manually inspect the `orders` and `telegramMessages` collections after running test scenarios to ensure linking and audit data are correct.
    - **Outcome**: Data consistency matches or exceeds the previous implementation.
