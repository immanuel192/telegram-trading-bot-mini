# Tasks: Setup TRANSLATE_MESSAGE_RESULT Consumer

## Overview
Implement consumer infrastructure in `trade-manager` to receive and log `TRANSLATE_MESSAGE_RESULT` events from `interpret-service`.

## Task List

### ✅ Task 0: Verify interpret-service TRANSLATE_MESSAGE_RESULT Emission
**Objective**: Confirm that `interpret-service` correctly publishes `TRANSLATE_MESSAGE_RESULT` to `StreamTopic.TRANSLATE_RESULTS`

**Steps**:
1. Review `apps/interpret-service/src/events/consumers/translate-request-handler.ts`
2. Verify `publishResult()` method publishes to `StreamTopic.TRANSLATE_RESULTS`
3. Verify message type is `MessageType.TRANSLATE_MESSAGE_RESULT`
4. Review existing integration tests to confirm emission is tested

**Verification**:
- [x] Code review confirms correct stream topic
- [x] Code review confirms correct message type
- [x] Existing tests verify emission

**Files**:
- `apps/interpret-service/src/events/consumers/translate-request-handler.ts` (review only)
- `apps/interpret-service/test/integration/events/consumers/translate-request-handler.spec.ts` (review only)

---

### Task 1: Add Configuration for TRANSLATE_RESULTS Consumer
**Objective**: Add consumer mode configuration for the `TRANSLATE_RESULTS` stream

**Steps**:
1. Update `apps/trade-manager/src/config.ts`:
   - Add `STREAM_CONSUMER_MODE_TRANSLATE_RESULTS: StreamConsumerMode` to `TradeManagerConfig` interface
   - Add default value `StreamConsumerMode.NEW` to `defaultConfig`
   - Add JSDoc comment explaining the config

**Verification**:
- [x] Config interface includes new field
- [x] Default value is `StreamConsumerMode.NEW`
- [x] JSDoc comment added

**Files**:
- `apps/trade-manager/src/config.ts`

---

### Task 2: Implement TranslateResultHandler
**Objective**: Create handler to consume and log `TRANSLATE_MESSAGE_RESULT` events

**Steps**:
1. Create `apps/trade-manager/src/events/consumers/translate-result-handler.ts`:
   - Import `BaseMessageHandler`, `MessageType`, `StreamMessage`
   - Import `TranslateMessageResultPayload` from shared-utils
   - Create class extending `BaseMessageHandler<MessageType.TRANSLATE_MESSAGE_RESULT>`
   - Implement constructor accepting logger and errorCapture
   - Implement `handle()` method:
     - Extract payload fields (messageId, channelId, promptId, isCommand, commands, meta)
     - Log message received with all relevant fields
     - Log command count if commands exist
     - Log confidence from meta
     - Use `logMessageReceived()` helper from base class

**Verification**:
- [x] Handler extends `BaseMessageHandler` correctly
- [x] `handle()` method logs all expected fields
- [x] Uses trace token for correlation
- [x] No business logic (only logging)

**Files**:
- `apps/trade-manager/src/events/consumers/translate-result-handler.ts` (new)

---

### Task 3: Setup Consumer Infrastructure
**Objective**: Wire up the `TRANSLATE_RESULTS` consumer in trade-manager

**Steps**:
1. Update `apps/trade-manager/src/interfaces/consumer.interface.ts`:
   - Add `resultConsumer: IStreamConsumer` to `ConsumerRegistry` interface

2. Update `apps/trade-manager/src/events/index.ts`:
   - Import `TranslateResultHandler`
   - In `createConsumers()`:
     - Get `STREAM_CONSUMER_MODE_TRANSLATE_RESULTS` from config
     - Calculate `resultsStartId` based on consumer mode ('0' or '$')
     - Call `createConsumerGroup()` for `StreamTopic.TRANSLATE_RESULTS`
     - Create `resultConsumer` instance with validator
     - Add to log message about consumer modes
     - Return `resultConsumer` in registry
   - In `startConsumers()`:
     - Instantiate `TranslateResultHandler` with logger and errorCapture
     - Call `consumers.resultConsumer.start<MessageType.TRANSLATE_MESSAGE_RESULT>()`
     - Pass `StreamTopic.TRANSLATE_RESULTS`, group name, consumer name, and handler
   - In `stopConsumers()`:
     - Call `await consumers.resultConsumer.stop()`

**Verification**:
- [x] Consumer group created for `TRANSLATE_RESULTS`
- [x] Consumer instance created with validator
- [x] Handler wired up correctly
- [x] Shutdown includes result consumer

**Files**:
- `apps/trade-manager/src/interfaces/consumer.interface.ts`
- `apps/trade-manager/src/events/index.ts`

---

### Task 4: Add Integration Tests
**Objective**: Verify consumer receives and processes `TRANSLATE_MESSAGE_RESULT` events

**Steps**:
1. Create `apps/trade-manager/test/integration/events/consumers/translate-result-handler.spec.ts`:
   - Setup test context with Redis, logger, and handler
   - Create test publisher for `StreamTopic.TRANSLATE_RESULTS`
   - Test scenario: "should receive and log TRANSLATE_MESSAGE_RESULT"
     - Publish test `TRANSLATE_MESSAGE_RESULT` message
     - Start consumer with handler
     - Wait for message processing
     - Verify handler was called
     - Verify message acknowledged
     - Stop consumer
   - Test scenario: "should log all expected fields"
     - Publish message with commands
     - Verify log includes: messageId, channelId, promptId, isCommand, commandsCount, confidence
   - Cleanup: delete stream and consumer group

**Verification**:
- [x] Test publishes to correct stream topic
- [x] Test verifies handler receives message
- [x] Test verifies all fields logged
- [x] Test cleanup removes test data
- [x] All tests pass

**Files**:
- `apps/trade-manager/test/integration/events/consumers/translate-result-handler.spec.ts` (new)

---

## Task Dependencies

```
Task 0 (Verify) → Task 1 (Config) → Task 2 (Handler) → Task 3 (Consumer Setup) → Task 4 (Tests)
```

## Verification Checklist
- [x] All tasks completed
- [x] `npx nx test trade-manager` passes
- [ ] `npx nx lint trade-manager` passes (pre-existing lint config issue)
- [x] Consumer logs show received results
- [x] No compilation errors
