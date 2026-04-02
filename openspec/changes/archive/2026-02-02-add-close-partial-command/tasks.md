## 1. Shared Utilities and Models

**Scope**: Modifying the core message protocols and data entities to support partial closure state. This establishes the foundation for cross-service communication.

- [x] 1.1 Add `CLOSE_PARTIAL` to `CommandEnum` in `libs/shared/utils/src/interfaces/messages/command-enum.ts`.
- [x] 1.2 Update JSDoc for `command` and `lotSize` in `libs/shared/utils/src/interfaces/messages/execute-order-request-payload.ts` to indicate that for `CLOSE_PARTIAL`, `lotSize` represents the reduction amount.
- [x] 1.3 Add `lotSizeRemaining?: number` to `Order` interface in `libs/dal/src/models/order.model.ts` and update `lotSize` JSDoc to specify it as the initial size.
- [x] 1.4 Update `Order` model unit tests to ensure `lotSizeRemaining` defaults correctly and is handled during serialization.

**Outcome**: A system that recognizes `CLOSE_PARTIAL` as a valid command and an `Order` model capable of tracking position reduction.
**Expectation**: Zero regression on existing commands; the `Order` model must remain backward compatible with existing documents in MongoDB.

## 2. Trade Manager Transformers

**Scope**: Implementing the logic that generates internal execution requests from trading intents (e.g., TP triggers). This builds the "intent-to-request" bridge.

- [x] 2.1 Create `apps/trade-manager/src/services/transformers/close-partial-command.transformer.ts` with utility functions (adjusted from standard class pattern per user feedback).
- [x] 2.2 Implement utility function `transformToClosePartialPayload` to generate `ExecuteOrderRequestPayload` for `CLOSE_PARTIAL`.
- [x] 2.3 Implement numeric `messageId` suffix logic: `originalMessageId * 100 + tierIndex` (e.g., TP1 index 1 -> 12301).
- [x] 2.4 Add unit tests for the new transformer verifying correct payload generation and ID mapping.

**Outcome**: A reusable transformer that creates properly formatted execution requests for partial closures with traceable IDs.
**Expectation**: The generated `messageId` must fit within a standard Integer range and correctly link back to the originating Telegram message.

## 3. Executor Service: Foundation and Adapters

**Scope**: Extending the broker interface and the Oanda implementation to support unit-based closures, and ensuring the executor initializes tracking fields.

- [x] 3.1 Update `apps/executor-service/src/adapters/interfaces.ts`: Add optional `amount?: number` to `CloseOrderParams`.
- [x] 3.2 Update `apps/executor-service/src/adapters/oanda/oanda.adapter.ts`: Implement partial closure in `closeOrder` by passing `units` to the OANDA API if provided.
- [x] 3.3 Update `apps/executor-service/src/services/order-handlers/open-order/open-order.step.ts`: Initialize `lotSizeRemaining` in the database when an order is opened.
- [x] 3.4 Update Oanda adapter unit tests to verify both full closure (no amount) and partial closure (with amount).

**Outcome**: Broker adapters capable of granular position reduction and a system that initializes the "remaining" state as soon as a trade opens.
**Expectation**: `OandaAdapter` must retain its current behavior of closing the entire trade if no amount is provided.

## 4. Executor Service: Close Partial Pipeline

**Scope**: Orchestrating the complete command pipeline for `CLOSE_PARTIAL`, including state validation, pips-to-lots conversion (if needed), and atomic database updates.

- [x] 4.1 Create `ValidateClosePartialStep` to verify `lotSize <= lotSizeRemaining`. If `lotSize` is greater, cap it to `lotSizeRemaining` and flag the order history with a `WARNING`.
- [x] 4.2 Update `BrokerCloseStep` and `CalculatePnlAfterCloseOrderStep` to handle the `amount` parameter and ensure PnL is retrieved correctly for the closed portion.
- [x] 4.3 Configure the `CLOSE_PARTIAL` pipeline in `PipelineOrderExecutorService` incorporating `ResolveAccountStep`, `ResolveOrderStep`, `ResolveAdapterStep`, and the new validation steps.
- [x] 4.4 Implement atomic updates in the final step using MongoDB `$inc`:
    - Decrement `lotSizeRemaining` by the closed amount.
    - Increment `pnl.pnl` by the realized PnL returned from the broker.
- [x] 4.5 Add integration test in `apps/executor-service/test/integration/close-partial-flow.spec.ts` covering:
    - Multiple partial closes on one order.
    - Closing the final remainder (verifying status moves to CLOSED).
    - Capping an over-closure request.
- [x] 4.6 Create and integrate `ForceFullCloseStep` into `CLOSE_ALL` and `CLOSE_BAD_POSITION` pipelines to prevent accidental partial closures.

**Outcome**: A fully operational `CLOSE_PARTIAL` execution flow that is robust against race conditions and provides a clear audit trail.
**Expectation**: Database state must remain in sync with broker results; `pnl.pnl` must accurately reflect the total realized profit of the trade across all its partial closures.
