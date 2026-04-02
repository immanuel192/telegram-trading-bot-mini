# Proposal: Implement Batch Stream Consumer

## Change ID
`implement-batch-stream-consumer`

## Problem Statement

The current `RedisStreamConsumer` processes messages one at a time within each channel group, which creates performance bottlenecks when handlers need to make external API calls (e.g., AI services, databases). This sequential processing prevents opportunities for:

1. **Batching external API calls**: AI services can process multiple prompts more efficiently in a single request or in parallel
2. **Parallel processing across channels**: Messages from different channels could be processed simultaneously
3. **Resource optimization**: Better utilization of I/O-bound operations

### Current Behavior

```typescript
// Current: Sequential processing within each channelId:accountId group
for (const { id, message } of groupMessages) {
  await handler(message, id); // One AI call per message
  await ack(id);
}
```

**Performance Impact**:
- 3 messages from Channel A → 3 sequential AI calls
- 2 messages from Channel B → 2 sequential AI calls
- Total: 5 sequential AI calls (even though A and B could run in parallel)

### Desired Behavior

```typescript
// Batch: Process one message from each channel concurrently
// Batch 1: [A[0], B[0], C[0]] - process in parallel
// Batch 2: [A[1], B[1]]       - process in parallel
// Batch 3: [A[2]]             - process alone

await batchHandler([
  { message: A[0], id: '1-0', groupKey: 'channelA:account1' },
  { message: B[0], id: '1-1', groupKey: 'channelB:account1' },
  { message: C[0], id: '1-2', groupKey: 'channelC:account1' },
]);
```

**Performance Improvement**:
- Batch 1: 3 messages processed in parallel (1 AI call duration)
- Batch 2: 2 messages processed in parallel (1 AI call duration)
- Batch 3: 1 message processed (1 AI call duration)
- Total: 3 AI call durations instead of 5

## Proposed Solution

Implement a new `BatchStreamConsumer` class that:

1. **Accepts batch handlers** with a different signature that receives multiple messages
2. **Transposes messages** from groups into batches (one message per group per batch)
3. **Maintains ordering** within each `channelId:accountId` group
4. **Handles ACK per message** based on individual success/failure
5. **Retries failed messages** immediately with exponential backoff
6. **Shares common logic** with existing `RedisStreamConsumer` via a base class

### Architecture

```
BaseRedisStreamConsumer (abstract)
├── Shared: fetch, parse, validate, ACK, retry config
├── RedisStreamConsumer (existing)
│   └── Sequential processing within groups
└── BatchStreamConsumer (new)
    └── Batch processing across groups
```

### Key Design Decisions

1. **Separate class vs extending existing**: New class to avoid breaking changes and different handler signatures
2. **Base class extraction**: Minimize code duplication by sharing fetch/parse/ACK logic
3. **Backward compatibility**: Existing consumers continue to work unchanged
4. **Batch transpose algorithm**: Ensures ordering within groups while maximizing parallelism
5. **Per-message ACK tracking**: Individual success/failure tracking for reliable message processing

## Scope

### In Scope
- Create `BaseRedisStreamConsumer` abstract class with shared logic
- Refactor `RedisStreamConsumer` to extend base class
- Implement `BatchStreamConsumer` with batch handler support
- Update type definitions for batch handler signature
- Update type definitions for batch handler signature
- Migrate `interpret-service` to use `BatchStreamConsumer`
- Integration tests for batch consumer
- Unit tests for batch transpose logic

### Out of Scope
- Migrating other services (telegram-service, trade-manager) to batch consumer
- Changes to Redis Stream infrastructure
- Changes to message validation logic
- Performance benchmarking (can be done post-implementation)

## Success Criteria

1.  **Functional**:
    - Batch consumer processes messages from multiple channels concurrently
    - Message ordering preserved within each `channelId:accountId`
    - ACK/retry logic works correctly per message
    - Existing consumers continue to work unchanged

2.  **Performance**:
    - `interpret-service` AI processing time reduced (measured via Sentry metrics)
    - No increase in failed message rate

3.  **Quality**:
    - All tests passing (unit + integration)
    - Code coverage maintained or improved
    - No linting errors

## Migration Path

### Phase 1: Foundation (This Change)
- Implement `BaseRedisStreamConsumer`
- Refactor `RedisStreamConsumer` to use base
- Implement `BatchStreamConsumer`
- Add tests

### Phase 2: interpret-service Migration (This Change)
- Update `TranslateRequestHandler` to use batch handler signature
- Switch to `BatchStreamConsumer` in event setup
- Verify metrics show performance improvement

### Phase 3: Future (Out of Scope)
- Consider Kafka migration for higher throughput scenarios

## Risks and Mitigations

| Risk                        | Impact | Mitigation                                               |
| --------------------------- | ------ | -------------------------------------------------------- |
| Breaking existing consumers | High   | Use separate class, no changes to existing code          |
| Complex ACK management      | Medium | Per-message tracking with clear success/failure states   |
| Retry logic complexity      | Medium | Reuse existing retry config, fail-fast after max retries |
| Batch transpose bugs        | Medium | Comprehensive unit tests for edge cases                  |
| Performance regression      | Low    | Keep existing consumer as fallback, measure with Sentry  |

## Dependencies

- None (self-contained change in `libs/shared/utils`)

## Timeline Estimate

- Base class extraction: 2-3 hours
- Batch consumer implementation: 4-5 hours
- Tests: 2-3 hours
- interpret-service migration: 2-3 hours
- **Total**: 10-14 hours

## Open Questions

None - design has been discussed and approved.
