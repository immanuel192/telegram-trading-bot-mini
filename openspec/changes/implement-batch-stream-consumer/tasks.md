# Tasks: Implement Batch Stream Consumer

## Overview
This task list implements the batch stream consumer capability to improve performance for I/O-bound message processing. Tasks are organized by component, with tests grouped alongside implementation.

---

## Phase 1: Base Class Extraction

### ✅ Task 1.1: Create and test BaseRedisStreamConsumer
**Files**: 
- `libs/shared/utils/src/stream/consumers/base-redis-stream-consumer.ts`
- `libs/shared/utils/test/unit/base-redis-stream-consumer.spec.ts`

**Implementation**:
- Create abstract class `BaseRedisStreamConsumer`
- Move shared properties: `client`, `isRunning`, `errorCapture`, `validator`, `retryConfig`, `logger`, `blockTimeMs`
- Move constructor logic for initializing Redis client and config
- Extract `fetchMessages()` method for XREADGROUP calls
- Extract `parseMessage()` method for parsing Redis format to `StreamMessage<T>`
- Extract `validateMessage()` method for schema and expiration checks
- Extract `ackMessage()` method for XACK operations
- Extract `sleep()` utility method
- Implement `stop()` and `close()` lifecycle methods

**Unit Tests**:
- Base class is abstract (cannot be instantiated)
- `parseMessage()` correctly converts Redis format to StreamMessage
- `parseMessage()` handles invalid JSON gracefully
- `validateMessage()` calls validator correctly
- `ackMessage()` calls Redis XACK with correct parameters

**Validation**:
- TypeScript compiles without errors
- All unit tests pass
- Base class cannot be instantiated directly

**Dependencies**: None

---

### ✅ Task 1.2: Refactor and test RedisStreamConsumer
**Files**: 
- `libs/shared/utils/src/stream/consumers/redis-stream-consumer.ts`
- `libs/shared/utils/test/integration/redis-stream-consumer.spec.ts` (existing tests)

**Implementation**:
- Change class declaration to extend `BaseRedisStreamConsumer`
- Update constructor to call `super(config)`
- Keep `maxConcurrentGroups` as instance property
- Replace direct Redis calls with base class methods:
  - Use `this.fetchMessages()` instead of `this.client.xreadgroup()`
  - Use `this.parseMessage()` for message parsing
  - Use `this.validateMessage()` for validation
  - Use `this.ackMessage()` for ACK operations
- Keep existing processing logic unchanged (sequential within groups, concurrent across groups)
- Keep `processBatched()` method for concurrency control
- Keep `processWithRetry()` method for retry logic

**Integration Tests**:
- Run existing integration test suite
- Verify all existing tests pass without modification
- Verify behavior is identical to pre-refactor

**Validation**:
- All existing unit tests pass
- All existing integration tests pass
- No changes to public API
- No behavior changes

**Dependencies**: Task 1.1

---

### ✅ Task 1.3: Update exports
**File**: `libs/shared/utils/src/stream/consumers/index.ts`

**Implementation**:
- Export `BaseRedisStreamConsumer` from index.ts
- Keep existing exports unchanged

**Validation**:
- TypeScript compiles without errors
- Exports are accessible from `@telegram-trading-bot-mini/shared/utils`

**Dependencies**: Task 1.1, Task 1.2

**Note**: During implementation, we further improved the design by:
- Moving `start()` method to base class (Template Method pattern)
- Making `_consumeLoop()` abstract - each derived class implements its own processing strategy
- This eliminates duplication and provides clearer separation of concerns

---

## Phase 2: Batch Consumer Implementation

### ✅ Task 2.1: Define batch handler types
**File**: `libs/shared/utils/src/stream/stream-interfaces.ts`

**Implementation**:
- Add `BatchMessageHandler<T>` type:
  ```typescript
  export type BatchMessageHandler<T extends MessageType> = (
    messages: Array<{
      message: StreamMessage<T>;
      id: string;
      groupKey: string;
    }>
  ) => Promise<Array<{
    id: string;
    success: boolean;
    error?: Error;
  }>>;
  ```

**Validation**:
- TypeScript compiles without errors
- Types are exported correctly

**Dependencies**: None

**Note**: During implementation, we also:
- Added `MessageHandler<T>` type for single-message processing
- Made `IStreamConsumer` generic by handler type: `IStreamConsumer<THandler>`
- This allows each consumer to explicitly declare its handler type for better type safety

---

### ✅ Task 2.2: Implement and test BatchStreamConsumer
**Files**: 
- `libs/shared/utils/src/stream/consumers/batch-stream-consumer.ts`
- `libs/shared/utils/test/unit/batch-stream-consumer.spec.ts`
- `libs/shared/utils/test/integration/batch-stream-consumer.spec.ts`

**Implementation**:
- Create class extending `BaseRedisStreamConsumer`
- Implement `start()` method with batch handler signature
- Implement `_consumeLoop()` method:
  - Fetch messages using `this.fetchMessages()`
  - Group messages by `channelId:accountId`
  - Call `transposeToBatches()` to create batches
  - Process each batch sequentially with `processBatch()` (for loop, not Promise.allSettled)
- Implement `transposeToBatches()` method:
  - Find max depth across all groups
  - For each depth, collect one message from each group
  - Return array of batches
- Implement `processBatch()` method:
  - Call batch handler with current batch
  - Track per-message results
  - ACK successful messages
  - Retry failed messages with exponential backoff
  - After max retries, ACK failed messages and capture errors
- Implement `stop()` method to override base and wait for consume loop

**Unit Tests**:
1. **Batch transpose algorithm**:
   - Empty groups → empty batches
   - Single group with 3 messages → 3 batches of 1 message each
   - Three groups with depths [3, 2, 1] → 3 batches: [3 msgs, 2 msgs, 1 msg]
   - Three groups with equal depth [2, 2, 2] → 2 batches of 3 messages each
   - Verify groupKey is preserved in batch messages
   - Verify message ordering within groups

2. **ACK tracking**:
   - All messages succeed → all ACKed
   - All messages fail → none ACKed, all retried
   - Partial failure (2 succeed, 1 fails) → 2 ACKed, 1 retried
   - Handler throws error → no ACKs, entire batch retried
   - Max retries exceeded → failed messages ACKed (DLQ)

3. **Retry logic**:
   - First retry → 500ms delay
   - Second retry → 1000ms delay
   - Third retry → 2000ms delay
   - Max retries exceeded → ACK and capture error
   - Only failed messages included in retry batch
   - Successful retry → ACK and no further retries

**Integration Tests**:
1. **End-to-end batch processing**:
   - Publish messages to 3 different channels (3, 2, 1 messages each)
   - Verify batch formation (3 batches: [3 msgs, 2 msgs, 1 msg])
   - Verify batches processed sequentially (not in parallel)
   - Verify message ordering within each channel
   - Verify all messages are ACKed
   - Verify Redis Stream state (pending messages, consumer group state)

2. **Error scenarios**:
   - Parse error → message ACKed and skipped
   - Validation error → message ACKed and skipped
   - Expired message → message ACKed and skipped
   - Partial batch failure → successful messages ACKed, failed retried
   - Handler error → entire batch retried
   - Redis connection error → reconnect and continue
   - Sentry error capture → errors logged to Sentry

3. **Lifecycle**:
   - Consumer start/stop/close
   - Graceful shutdown with in-flight batches
   - No memory leaks or connection issues

**Validation**:
- TypeScript compiles without errors
- All unit tests pass
- All integration tests pass
- Code coverage for batch consumer is >90%

**Dependencies**: Task 1.1, Task 2.1

---

### ✅ Task 2.3: Export BatchStreamConsumer
**File**: `libs/shared/utils/src/stream/consumers/index.ts`

**Implementation**:
- Add export for `BatchStreamConsumer`
- Add export for `BatchMessageHandler` type

**Validation**:
- TypeScript compiles without errors
- Exports are accessible from `@telegram-trading-bot-mini/shared/utils`

**Dependencies**: Task 2.2

**Note**: Phase 2 implementation created the foundation with transpose algorithm. Phase 3 will refine the batching strategy based on actual session caching requirements.

---

## Phase 3: Refine Batching Strategy for Session Reuse

### Task 3.1: Update BatchStreamConsumer batching algorithm
**Files**: 
- `libs/shared/utils/src/stream/consumers/batch-stream-consumer.ts`
- `libs/shared/utils/src/stream/stream-interfaces.ts`

**Problem Analysis**:
Current transpose algorithm creates batches with ONE message per group:
- Group A:1 [M1, M2, M3] + Group A:2 [M4, M5] → Batches: [M1, M4], [M2, M5], [M3]
- Result: 1 message → 1 AI session → NO reduction in API calls
- Session cache: `${channelId}:${accountId}:${promptId}:${promptHash}`
- **We're not batching messages to the SAME session!**

**New Strategy**:
Group-based batching: Take N messages from SAME group to send to SAME AI session
- Group A:1 [M1, M2, M3, M4, M5] + Group A:2 [M6, M7, M8]
- Batch 1: Group A:1 [M1, M2, M3], Group A:2 [M6, M7, M8] (parallel)
- Batch 2: Group A:1 [M4, M5] (sequential after Batch 1)
- Result: 3 messages → 1 AI call (67% reduction!)

**Implementation**:
1. Add `batchSizePerGroup` config parameter (default: 3, max messages per group per batch)
2. Replace `transposeToBatches()` with `createGroupBatches()`:
   ```typescript
   private createGroupBatches(
     messagesByGroup: Map<string, Message[]>,
     batchSizePerGroup: number
   ): Array<Array<{ groupKey: string; messages: Message[] }>> {
     const batches = [];
     
     // Keep processing until all groups are empty
     while (hasMessagesInAnyGroup(messagesByGroup)) {
       const batch = [];
       
       for (const [groupKey, messages] of messagesByGroup) {
         // Take up to batchSizePerGroup messages from this group
         const groupMessages = messages.splice(0, batchSizePerGroup);
         if (groupMessages.length > 0) {
           batch.push({ groupKey, messages: groupMessages });
         }
       }
       
       if (batch.length > 0) {
         batches.push(batch);
       }
     }
     
     return batches;
   }
   ```
3. Update `BatchMessageHandler` type signature:
   ```typescript
   export type BatchMessageHandler<T extends MessageType> = (
     groupKey: string,           // Single group key (e.g., "channelA:account1")
     messages: Array<{           // Messages from THAT group only
       message: StreamMessage<T>;
       id: string;
     }>
   ) => Promise<
     Array<{
       id: string;
       success: boolean;
       error?: Error;
     }>
   >;
   ```
   **Note**: Handler is called ONCE per group. Consumer processes batches sequentially, groups within batch in parallel:
   ```typescript
   for (const batch of batches) {
     // batch = [{ groupKey: 'A:1', messages: [...] }, { groupKey: 'A:2', messages: [...] }]
     const results = await Promise.allSettled(
       batch.map(({ groupKey, messages }) => 
         handler(groupKey, messages)  // Called once per group
       )
     );
   }
   ```
4. Update `RedisStreamConsumerConfig` to add `batchSizePerGroup?: number`
5. Update `processBatch()` to handle group batches instead of individual messages

**Validation**:
- TypeScript compiles without errors
- Batches are created correctly (multiple messages per group)
- Ordering maintained within each group
- Groups processed in parallel

**Dependencies**: Task 2.2

---

## Phase 4: Documentation and Cleanup

### Task 4.1: Update documentation
**Files**: 
- `libs/shared/utils/README.md`
- `openspec/changes/implement-batch-stream-consumer/README.md`
- `.agent/rules/architecture.md` (if applicable)

**Implementation**:
- Update shared-utils README with "Batch Stream Consumer" section
- Explain group-based batching strategy vs transpose algorithm
- Document when to use batch vs sequential consumer
- Provide code examples for both consumer types
- Document configuration options (`batchSizePerGroup`)
- Explain session reuse benefits
- Document performance considerations and trade-offs

**Validation**:
- Documentation is clear and accurate
- Code examples compile and run
- Architecture rules updated if needed

**Dependencies**: Task 3.4

---

### Task 4.2: Performance testing and validation
**Files**: 
- `apps/interpret-service/test/performance/batch-processing.perf.spec.ts` (new)

**Implementation**:
1. Create performance test suite
2. Test scenarios:
   - Baseline: Sequential processing (1 msg → 1 AI call)
   - Batch processing: Group batching (3 msgs → 1 AI call)
   - Measure:
     * Total processing time
     * AI API call count
     * Session cache hit rate
     * Throughput (messages/second)
3. Verify performance improvements:
   - API calls reduced by ~67% (3 msgs → 1 call)
   - Processing time reduced (parallel groups)
   - Session cache hit rate increased

**Validation**:
- Performance tests pass
- Metrics show expected improvements
- No regression in message ordering or reliability

**Dependencies**: Task 3.4

---

### Task 4.3: Final validation and deployment checklist
**Files**: 
- `openspec/changes/implement-batch-stream-consumer/DEPLOYMENT.md` (new)

**Implementation**:
1. Create deployment checklist:
   - [ ] All unit tests pass
   - [ ] All integration tests pass
   - [ ] Performance tests show improvements
   - [ ] Documentation updated
   - [ ] Configuration reviewed (`batchSizePerGroup` tuned)
   - [ ] Monitoring/alerting configured
   - [ ] Rollback plan documented
2. Verify backward compatibility:
   - RedisStreamConsumer still works for other services
   - No breaking changes to shared interfaces
3. Production readiness:
   - Error handling comprehensive
   - Logging sufficient for debugging
   - Metrics emitted for monitoring

**Validation**:
- All checklist items completed
- Stakeholders approve deployment
- Rollback plan tested

**Dependencies**: Task 4.1, Task 4.2

---

## Summary

### Phase 1: Base Class Extraction ✅
- Created `BaseRedisStreamConsumer` with shared logic
- Refactored `RedisStreamConsumer` to extend base class
- Moved `start()` to base class (Template Method pattern)
- Made `_consumeLoop()` abstract

### Phase 2: Batch Consumer Implementation ✅
- Defined `MessageHandler` and `BatchMessageHandler` types
- Made `IStreamConsumer` generic by handler type
- Created `BatchStreamConsumer` with transpose algorithm
- Exported from shared utils

### Phase 3: Refine Batching Strategy for Session Reuse
- Update `BatchStreamConsumer` batching algorithm to group-based (N messages per group)
- Update `BatchMessageHandler` signature (groupKey + messages)
- Ensure handler is called once per group
- **Out of scope**: interpret-service integration (will be done separately)

### Phase 4: Documentation and Validation
- Update documentation
- Performance testing
- Deployment checklist

### Expected Benefits:
- **67% reduction in AI API calls** (3 msgs → 1 call)
- **Improved throughput** via parallel group processing
- **Better session reuse** (multiple messages to same session)
- **Maintained ordering** within each account
- **Graceful degradation** with retry logic
