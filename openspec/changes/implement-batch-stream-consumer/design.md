# Design: Batch Stream Consumer Architecture

## Overview

This document defines the architectural design for batch message processing in Redis Stream consumers. The design introduces `BatchStreamConsumer` for parallel processing across channel groups while maintaining message ordering guarantees and backward compatibility with the existing `RedisStreamConsumer`.

## System Architecture

### Component Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                  BaseRedisStreamConsumer                     │
│                      (Abstract Class)                        │
├─────────────────────────────────────────────────────────────┤
│ Shared Responsibilities:                                     │
│ • Redis connection management                                │
│ • Message fetching (XREADGROUP)                             │
│ • Message parsing (Redis format → StreamMessage)            │
│ • Message validation (schema + expiration)                   │
│ • ACK management (XACK)                                      │
│ • Error capture (Sentry integration)                         │
│ • Lifecycle management (start/stop/close)                    │
└─────────────────────────────────────────────────────────────┘
                           ▲
                           │
                ┌──────────┴──────────┐
                │                     │
┌───────────────▼──────────┐  ┌──────▼──────────────────────┐
│  RedisStreamConsumer     │  │  BatchStreamConsumer        │
│  (Existing - Refactored) │  │  (New)                      │
├──────────────────────────┤  ├─────────────────────────────┤
│ Handler Signature:       │  │ Handler Signature:          │
│ (message, id) => void    │  │ (messages[]) => results[]   │
│                          │  │                             │
│ Processing Strategy:     │  │ Processing Strategy:        │
│ • Group by channelId:    │  │ • Group by channelId:       │
│   accountId              │  │   accountId                 │
│ • Process groups in      │  │ • Transpose to batches      │
│   parallel (max N)       │  │ • Process batches           │
│ • Within group:          │  │   SEQUENTIALLY              │
│   sequential             │  │ • Within batch: parallel    │
│                          │  │   (handler responsibility)  │
│                          │  │ • Per-message ACK tracking  │
└──────────────────────────┘  └─────────────────────────────┘
```

### Processing Model Comparison

| Aspect             | RedisStreamConsumer           | BatchStreamConsumer                   |
| ------------------ | ----------------------------- | ------------------------------------- |
| Grouping           | By channelId:accountId        | By channelId:accountId                |
| Group Processing   | Parallel (Promise.allSettled) | N/A (transposed to batches)           |
| Batch Processing   | N/A                           | Sequential (for loop)                 |
| Message Processing | Sequential within group       | Parallel within batch (handler)       |
| Ordering Guarantee | Within group                  | Within group (via sequential batches) |

## Component Design

### 1. BaseRedisStreamConsumer (Abstract)

**Purpose**: Extract and share common Redis Stream consumer logic.

**Responsibilities**:
- Manage Redis client connection
- Fetch messages using XREADGROUP
- Parse raw Redis messages into `StreamMessage<T>` format
- Validate messages (schema + expiration)
- ACK messages (XACK)
- Capture errors via Sentry
- Provide lifecycle hooks (start/stop/close)

**Key Methods**:

```typescript
abstract class BaseRedisStreamConsumer {
  // Shared configuration
  protected client: Redis;
  protected isRunning: boolean;
  protected errorCapture?: IErrorCapture;
  protected validator: IMessageValidator;
  protected retryConfig: RetryConfig;
  protected logger?: LoggerInstance;
  protected blockTimeMs: number;

  // Shared methods
  protected async fetchMessages(
    topic: StreamTopic,
    groupName: string,
    consumerName: string,
    count: number
  ): Promise<RawMessage[]>;

  protected parseMessage<T>(
    id: string,
    fieldsArray: string[]
  ): ParsedMessage<T> | null;

  protected async validateMessage<T>(
    message: StreamMessage<T>,
    id: string
  ): Promise<boolean>;

  protected async ackMessage(
    topic: StreamTopic,
    groupName: string,
    id: string
  ): Promise<void>;

  // Lifecycle
  async stop(): Promise<void>;
  async close(): Promise<void>;
}
```

### 2. RedisStreamConsumer (Refactored)

**Changes**:
- Extend `BaseRedisStreamConsumer`
- Use base class methods for fetch/parse/validate/ACK
- Keep existing processing logic (sequential within groups)
- **No breaking changes** to public API

**Processing Flow**:
```
1. Fetch messages (XREADGROUP)
2. Group by channelId:accountId
3. Process groups concurrently (max N groups)
4. Within each group: sequential processing
   a. Validate message
   b. Call handler(message, id)
   c. Retry on failure (exponential backoff)
   d. ACK on success
```

### 3. BatchStreamConsumer (New)

**Purpose**: Enable batch processing across multiple channel groups.

**Key Features**:
- Different handler signature (accepts array of messages)
- Transpose algorithm for batch creation
- Per-message ACK tracking
- Batch-level retry with message filtering
- Extends `BaseRedisStreamConsumer` (reuses shared logic)

**Processing Flow**:
```
1. Fetch messages (XREADGROUP)
2. Group by channelId:accountId
3. Transpose groups into batches
4. Process batches sequentially (for loop)
   - Each batch processed one after another
   - Ensures ordering within groups
5. Within each batch:
   a. Call batchHandler(batch)
   b. Handler returns per-message results
   c. ACK successful messages
   d. Retry failed messages (exponential backoff)
   e. After max retries: ACK failed messages (DLQ)
```

**Key Design Decision**: Batches are processed **sequentially** (not with `Promise.allSettled`) to maintain ordering guarantees. If Batch 0 contains message A0 and Batch 1 contains message A1, then A0 must complete before A1 begins processing. Parallelism occurs within each batch when the handler processes multiple messages concurrently.

**Batch Size**: Naturally limited by the number of active channel groups in the fetched messages. With `COUNT=20` in XREADGROUP and typically <10 active channels, batches are naturally small (<10 messages per batch).


## Batch Transpose Algorithm

### Purpose

Transform grouped messages into batches that maximize parallelism across groups while preserving message ordering within each group.

### Requirements

1. Each batch contains at most one message from each group
2. Messages from the same group appear in order across batches
3. Batch N contains the Nth message from each group (if it exists)

### Algorithm

```typescript
function transposeToBatches<T>(
  messagesByGroup: Map<string, Array<{ id, message }>>
): Array<Array<{ id, message, groupKey }>> {
  const batches: Array<Array<any>> = [];
  
  // Find maximum depth across all groups
  const maxDepth = Math.max(
    ...Array.from(messagesByGroup.values()).map(msgs => msgs.length)
  );

  // For each depth level, collect one message from each group
  for (let depth = 0; depth < maxDepth; depth++) {
    const batch: Array<any> = [];
    
    for (const [groupKey, messages] of messagesByGroup.entries()) {
      if (messages[depth]) {
        batch.push({
          ...messages[depth],
          groupKey,
        });
      }
    }
    
    if (batch.length > 0) {
      batches.push(batch);
    }
  }

  return batches;
}
```

### Example

**Input Groups**:
```
Group A (channelA:account1): [A0, A1, A2]
Group B (channelB:account1): [B0, B1]
Group C (channelC:account1): [C0]
```

**Output Batches**:
```
Batch 0 (depth=0): [A0, B0, C0]  // First message from each group
Batch 1 (depth=1): [A1, B1]      // Second message from A and B
Batch 2 (depth=2): [A2]          // Third message from A only
```

**Ordering Guarantees**:
- A0 processed before A1 before A2 (Batch 0 → Batch 1 → Batch 2)
- B0 processed before B1 (Batch 0 → Batch 1)
- C0 processed independently (Batch 0)
- Within Batch 0: A0, B0, C0 may process in parallel (handler's choice)

### Limitation: No Session Reuse

**Problem**: The transpose algorithm doesn't optimize for session reuse in interpret-service.

**Session Cache Key**: `${channelId}:${accountId}:${promptId}:${promptHash}`

**Example**:
```
Group A:1 (channelA:account1): [M1, M2, M3]
Group A:2 (channelA:account2): [M4, M5]

Transpose Batches:
- Batch 0: [M1, M4] → 2 AI sessions (A:1, A:2) → 2 API calls
- Batch 1: [M2, M5] → 2 AI sessions (A:1, A:2) → 2 API calls  
- Batch 2: [M3]     → 1 AI session  (A:1)     → 1 API call

Total: 5 messages → 5 API calls (NO reduction!)
```

**Root Cause**: Each batch has only ONE message per group, so we can't batch multiple messages to the SAME session.

---

## Revised: Group-Based Batching Strategy

### Purpose

Maximize session reuse by sending multiple messages from the SAME group to the SAME AI session in a single API call.

### Requirements

1. Group messages by `channelId:accountId` (same as before)
2. Take N messages from SAME group to send together
3. Process groups in parallel (Promise.allSettled)
4. Process batches sequentially to maintain ordering within groups
5. Return per-message success/failure for granular ACK management

### Algorithm

```typescript
function createGroupBatches<T>(
  messagesByGroup: Map<string, Array<{ id, message }>>,
  batchSizePerGroup: number = 3
): Array<Array<{ groupKey: string; messages: Array<{ id, message }> }>> {
  const batches = [];
  
  // Clone the map to avoid mutating original
  const groupsClone = new Map(
    Array.from(messagesByGroup.entries()).map(([k, v]) => [k, [...v]])
  );
  
  // Keep processing until all groups are empty
  while (hasMessagesInAnyGroup(groupsClone)) {
    const batch = [];
    
    for (const [groupKey, messages] of groupsClone.entries()) {
      // Take up to batchSizePerGroup messages from this group
      const groupMessages = messages.splice(0, batchSizePerGroup);
      
      if (groupMessages.length > 0) {
        batch.push({
          groupKey,
          messages: groupMessages
        });
      }
    }
    
    if (batch.length > 0) {
      batches.push(batch);
    }
  }
  
  return batches;
}
```

### Example

**Input Groups**:
```
Group A:1 (channelA:account1): [M1, M2, M3, M4, M5]
Group A:2 (channelA:account2): [M6, M7, M8]
```

**Output Batches** (batchSizePerGroup = 3):
```
Batch 0:
  - Group A:1: [M1, M2, M3] → Send to AI session (channelA:account1:prompt:hash) → 1 API call
  - Group A:2: [M6, M7, M8] → Send to AI session (channelA:account2:prompt:hash) → 1 API call
  
Batch 1 (sequential after Batch 0):
  - Group A:1: [M4, M5]     → Send to AI session (channelA:account1:prompt:hash) → 1 API call

Total: 8 messages → 3 API calls (62.5% reduction!)
```

**Ordering Guarantees**:
- M1, M2, M3 processed before M4, M5 (Batch 0 → Batch 1)
- M6, M7, M8 processed together (Batch 0)
- Groups A:1 and A:2 processed in parallel within Batch 0
- Messages within each group maintain order

### Benefits

| Metric                       | Transpose Algorithm | Group-Based Batching |
| ---------------------------- | ------------------- | -------------------- |
| API Calls (8 msgs, 2 groups) | 8 calls             | 3 calls              |
| Session Reuse                | None                | High                 |
| API Call Reduction           | 0%                  | 62.5%                |
| Ordering Guarantee           | ✅ Within group      | ✅ Within group       |
| Parallel Processing          | ✅ Across groups     | ✅ Across groups      |

### Configuration

```typescript
interface RedisStreamConsumerConfig {
  // ... existing config
  batchSizePerGroup?: number; // Default: 3, max messages per group per batch
}
```

**Tuning Guidelines**:
- **Small batches (1-2)**: Lower latency, more API calls
- **Medium batches (3-5)**: Balanced latency and cost
- **Large batches (6-10)**: Higher latency, fewer API calls
- **Recommended**: Start with 3, tune based on metrics


## Handler Signature Design

### Current Handler (RedisStreamConsumer)

```typescript
type MessageHandler<T extends MessageType> = (
  message: StreamMessage<T>,
  id: string
) => Promise<void>;
```

**Usage**:
```typescript
consumer.start(
  StreamTopic.TRANSLATE_REQUESTS,
  'group',
  'consumer',
  async (message, id) => {
    // Process one message
    await aiService.translate(message.payload);
  }
);
```

### Batch Handler (BatchStreamConsumer)

```typescript
type BatchMessageHandler<T extends MessageType> = (
  messages: Array<{
    message: StreamMessage<T>;
    id: string;
    groupKey: string; // channelId:accountId
  }>
) => Promise<Array<{
  id: string;
  success: boolean;
  error?: Error;
}>>;
```

**Usage**:
```typescript
batchConsumer.start(
  StreamTopic.TRANSLATE_REQUESTS,
  'group',
  'consumer',
  async (messages) => {
    // Process batch of messages
    const results = await Promise.allSettled(
      messages.map(m => aiService.translate(m.message.payload))
    );
    
    // Map results back to message IDs
    return messages.map((msg, idx) => ({
      id: msg.id,
      success: results[idx].status === 'fulfilled',
      error: results[idx].status === 'rejected' 
        ? results[idx].reason 
        : undefined,
    }));
  }
);
```

## ACK Management Strategy

### Challenge
When processing a batch, some messages may succeed while others fail. We need to:
1. ACK only successful messages
2. Retry failed messages
3. Prevent infinite retries (DLQ after max retries)

### Solution: Per-Message Result Tracking

```typescript
interface MessageResult {
  id: string;
  success: boolean;
  error?: Error;
}

async function processBatch(
  batch: BatchMessage[],
  batchHandler: BatchMessageHandler,
  topic: StreamTopic,
  groupName: string
): Promise<void> {
  let remainingMessages = batch;
  let retries = 0;

  while (retries <= maxRetries) {
    try {
      // Call handler with current batch
      const results = await batchHandler(remainingMessages);

      // ACK successful messages
      const successIds = results
        .filter(r => r.success)
        .map(r => r.id);
      
      await Promise.all(
        successIds.map(id => ackMessage(topic, groupName, id))
      );

      // Filter to only failed messages for retry
      const failedIds = results
        .filter(r => !r.success)
        .map(r => r.id);
      
      if (failedIds.length === 0) {
        return; // All succeeded
      }

      remainingMessages = batch.filter(m => 
        failedIds.includes(m.id)
      );

      // Check if max retries exceeded
      if (retries >= maxRetries) {
        // ACK failed messages to prevent infinite loop (DLQ)
        await Promise.all(
          failedIds.map(id => ackMessage(topic, groupName, id))
        );
        
        // Capture errors
        results
          .filter(r => !r.success)
          .forEach(r => errorCapture.captureException(r.error));
        
        return;
      }

      // Exponential backoff
      retries++;
      await sleep(calculateDelay(retries));

    } catch (error) {
      // Handler threw an error (not returned in results)
      retries++;
      
      if (retries > maxRetries) {
        // ACK all to prevent infinite loop
        await Promise.all(
          batch.map(m => ackMessage(topic, groupName, m.id))
        );
        errorCapture.captureException(error);
        return;
      }
      
      await sleep(calculateDelay(retries));
    }
  }
}
```

## Retry Strategy

**Configuration** (shared with existing consumer):
```typescript
interface RetryConfig {
  maxRetries: number;          // Default: 2
  initialDelayMs: number;      // Default: 500ms
  maxDelayMs: number;          // Default: 30000ms
  backoffMultiplier: number;   // Default: 2
}
```

**Behavior**:
1. **Immediate retry**: Failed messages retried in same consume loop
2. **Exponential backoff**: Delay doubles each retry (500ms → 1s → 2s)
3. **Max retries**: After 2 retries, ACK and move to DLQ
4. **Per-message tracking**: Only retry failed messages, not entire batch

**Comparison**:

| Scenario                   | Current Consumer        | Batch Consumer              |
| -------------------------- | ----------------------- | --------------------------- |
| Single message fails       | Retry 3 times, then ACK | Retry 3 times, then ACK     |
| Multiple messages, 1 fails | All retried together    | Only failed message retried |
| Handler throws error       | Retry entire group      | Retry entire batch          |

## Error Handling

### Parse Errors
```typescript
// Message cannot be parsed from Redis format
// Action: ACK immediately, capture error
if (!parsedMessage) {
  await ackMessage(topic, groupName, id);
  errorCapture.captureException(parseError, { id });
  continue;
}
```

### Validation Errors
```typescript
// Message fails schema validation or is expired
// Action: ACK immediately, capture error
if (!isValid) {
  await ackMessage(topic, groupName, id);
  errorCapture.captureException(validationError, { id, message });
  continue;
}
```

### Handler Errors
```typescript
// Handler returns failure or throws error
// Action: Retry with exponential backoff, then ACK (DLQ)
try {
  const results = await batchHandler(batch);
  // Process results...
} catch (error) {
  retries++;
  if (retries > maxRetries) {
    await ackAll(batch);
    errorCapture.captureException(error);
  } else {
    await sleep(delay);
    // Retry
  }
}
```

## Performance Considerations

### Memory Usage
- **Batch size**: Limited by `COUNT` parameter in XREADGROUP (default: 20)
- **Concurrent batches**: Processed sequentially to control memory
- **Message payload**: No change from current implementation

### Throughput
- **Current**: Sequential within groups, parallel across groups
- **Batch**: Parallel within batches, sequential across batches
- **Expected improvement**: 2-3x for AI-heavy workloads

### Latency
- **First message**: Slightly higher (waits for batch to form)
- **Overall**: Lower due to parallelism
- **Tail latency**: Naturally bounded by batch size (typically <10 messages)

## Testing Strategy

### Unit Tests
1. **Batch transpose algorithm**
   - Empty groups
   - Single group
   - Multiple groups with varying depths
   - Edge cases (all same depth, one very deep)

2. **ACK tracking**
   - All messages succeed
   - Some messages fail
   - All messages fail
   - Handler throws error

3. **Retry logic**
   - Successful retry
   - Max retries exceeded
   - Exponential backoff calculation

### Integration Tests
1. **End-to-end batch processing**
   - Publish messages to multiple channels
   - Verify batch formation
   - Verify ACK behavior
   - Verify ordering within groups

2. **Error scenarios**
   - Handler failures
   - Redis connection errors
   - Validation errors

3. **Backward compatibility**
   - Existing `RedisStreamConsumer` tests still pass
   - No changes to existing behavior

## Migration Guide

### For interpret-service

**Before**:
```typescript
const consumer = new RedisStreamConsumer(config);

consumer.start(
  StreamTopic.TRANSLATE_REQUESTS,
  'group',
  'consumer',
  async (message, id) => {
    const result = await aiService.translate(message.payload);
    await publisher.publish(StreamTopic.TRANSLATE_RESULTS, result);
  }
);
```

**After**:
```typescript
const batchConsumer = new BatchStreamConsumer(config);

batchConsumer.start(
  StreamTopic.TRANSLATE_REQUESTS,
  'group',
  'consumer',
  async (messages) => {
    // Batch AI calls
    const results = await Promise.allSettled(
      messages.map(m => 
        aiService.translate(m.message.payload)
      )
    );

    // Publish results
    await Promise.all(
      results
        .filter(r => r.status === 'fulfilled')
        .map((r, idx) => 
          publisher.publish(
            StreamTopic.TRANSLATE_RESULTS,
            r.value
          )
        )
    );

    // Return per-message results
    return messages.map((msg, idx) => ({
      id: msg.id,
      success: results[idx].status === 'fulfilled',
      error: results[idx].status === 'rejected' 
        ? results[idx].reason 
        : undefined,
    }));
  }
);
```

## Future Enhancements (Out of Scope)

1. **Dynamic batch sizing**: Adjust batch size based on message arrival rate
2. **Batch timeout**: Don't wait for full batch if messages arrive slowly
3. **Priority batching**: Process high-priority messages first
4. **Kafka migration**: For higher throughput scenarios
5. **Dead Letter Queue**: Separate stream for failed messages

## Conclusion

This design provides a clean, backward-compatible way to add batch processing to Redis Stream consumers. The key benefits are:

1. **Performance**: 2-3x improvement for AI-heavy workloads
2. **Backward compatibility**: Existing consumers unchanged
3. **Code reuse**: Shared base class minimizes duplication
4. **Flexibility**: Services can choose sequential or batch processing
5. **Reliability**: Robust ACK/retry logic maintains message guarantees
