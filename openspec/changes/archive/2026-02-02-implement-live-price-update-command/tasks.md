## 1. Shared Utilities and Message Schemas

- [x] 1.1 **Task**: Verify `LivePriceUpdatePayloadSchema` and update `MessageValidator` unit tests.
    - **Scope**: `libs/shared/utils/src/interfaces/messages/live-price-update-payload.ts` and `libs/shared/utils/test/unit/message-validator.spec.ts`.
    - **Expectation**: `MessageValidator` unit tests MUST cover positive and negative validation for `LIVE_PRICE_UPDATE` payload (nested objects, required strings, timestamp).
- [x] 1.2 **Task**: Register `LIVE_PRICE_UPDATE` schema in the centralized `MessageValidator`.
    - **Scope**: Ensure `MessageType.LIVE_PRICE_UPDATE` is mapped to `LivePriceUpdatePayloadSchema` in `libs/shared/utils/src/stream/validators/message-validator.ts`.
    - **Expectation**: Any service using the validator can correctly check the integrity of a price broadcast.

## 2. Executor Service: Live Price Broadcasting

- [x] 2.1 **Task**: Implement High-Frequency Price Publisher in `OandaPriceStreamingJob`.
    - **Scope**: `apps/executor-service/src/jobs/oanda-price-streaming-job.ts`.
    - **Implementation Details**: 
        - Initialize `private priceMap = new Map<string, { bid?: number; ask?: number }>()`.
        - In `handlePriceEvent`, lookup `universalSymbol` in the map to get `previousPrice`.
        - ONLY publish if BOTH `previousPrice` and `currentPrice` are available.
        - ONLY publish if `currentPrice.bid !== previousPrice.bid` OR `currentPrice.ask !== previousPrice.ask`.
        - Use placeholder values for `accountId` and `channelId` as defined in the payload file comments (e.g., Use adapter's accountId).
        - Update the local `priceMap` with `currentPrice` after the broadcast check.
    - **Expectation**: Minimal overhead. No extra Redis reads. No broadcast on the very first price tick (initialization). No duplicate broadcasts if price stays the same.
- [x] 2.2 **Task**: Verify Broadcast via Integration Test.
    - **Scope**: `apps/executor-service/test/integration/jobs/oanda-price-streaming-job.spec.ts`.
    - **Expectation**: Mock the OANDA stream and assert that `streamPublisher.publish` is called with the correctly structured payload when a price moves.

## 3. Trade Manager: Consumer and Registry

- [x] 3.1 **Task**: Implement `LivePriceUpdateHandler` placeholder.
    - **Scope**: `apps/trade-manager/src/events/consumers/live-price-update-handler.ts`.
    - **Expectation**: Create a handler that logs price updates as `info` for monitoring purposes.
- [x] 3.2 **Task**: Configure Stream Consumer Mode.
    - **Scope**: `apps/trade-manager/src/config.ts`.
    - **Expectation**: Add `STREAM_CONSUMER_MODE_PRICE_UPDATES` (defaulting to `NEW`) to the config interface and defaults to avoid replaying historic price spikes.
- [x] 3.3 **Task**: Register Consumer Group and Handler in `trade-manager` events index.
    - **Scope**: `apps/trade-manager/src/events/index.ts`.
    - **Expectation**: 
        - Add `StreamTopic.PRICE_UPDATES` to the group creation list.
        - Instantiate `LivePriceUpdateHandler` and register it with `consumers.priceUpdateConsumer.start(...)`.
        - Ensure proper cleanup in `stopConsumers`.
- [x] 3.4 **Task**: Verify End-to-End Delivery.
    - **Scope**: `apps/trade-manager/test/integration/events/consumers/live-price-update-handler.spec.ts`.
    - **Expectation**: Publish a message to `price-updates` stream and assert it is acknowledged (0 pending messages) by the `trade-manager` group.
