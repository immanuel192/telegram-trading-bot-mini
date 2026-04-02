# Design: TRANSLATE_MESSAGE_RESULT Consumer Setup

## Overview
This change adds consumer infrastructure to `trade-manager` for processing `TRANSLATE_MESSAGE_RESULT` events from `interpret-service`. The design follows the existing pattern used for `NEW_MESSAGE` consumption, with a separate consumer mode configuration for flexibility.

## Architecture

### Message Flow
```
interpret-service → [TRANSLATE_MESSAGE_RESULT] → StreamTopic.TRANSLATE_RESULTS → trade-manager
```

### Component Diagram
```
┌─────────────────────┐
│ interpret-service   │
│                     │
│ TranslateRequest    │
│ Handler             │
└──────────┬──────────┘
           │ publishes
           ▼
┌─────────────────────┐
│ StreamTopic.        │
│ TRANSLATE_RESULTS   │
└──────────┬──────────┘
           │ consumes
           ▼
┌─────────────────────┐
│ trade-manager       │
│                     │
│ TranslateResult     │
│ Handler             │
└─────────────────────┘
```

## Design Decisions

### Decision 1: Separate Consumer Mode Configuration
**Question**: Should `TRANSLATE_RESULTS` use the same consumer mode as `MESSAGES`?

**Answer**: No, use separate configuration.

**Rationale**:
- Different streams may have different replay requirements
- `MESSAGES` stream might need to replay all messages during development
- `TRANSLATE_RESULTS` might only need new results in production
- Follows the pattern established in `interpret-service` with `STREAM_CONSUMER_MODE_REQUESTS`
- Provides maximum flexibility for operations

**Implementation**:
- Add `STREAM_CONSUMER_MODE_TRANSLATE_RESULTS` to `TradeManagerConfig`
- Default to `StreamConsumerMode.NEW` (only process new results)

### Decision 2: Handler Responsibility
**Question**: What should `TranslateResultHandler` do initially?

**Answer**: Log received results only, no business logic.

**Rationale**:
- Establishes consumer infrastructure first
- Allows verification of message flow end-to-end
- Business logic (trade execution) will be added in future changes
- Follows incremental development approach
- Makes testing simpler and more focused

**Implementation**:
- Extend `BaseMessageHandler<MessageType.TRANSLATE_MESSAGE_RESULT>`
- Log all received message details (messageId, channelId, promptId, isCommand, commands)
- No database operations
- No trade execution

### Decision 3: Consumer Group Naming
**Question**: What should the consumer group name be?

**Answer**: Use `config('APP_NAME')` (i.e., "trade-manager")

**Rationale**:
- Consistent with existing `MESSAGES` consumer
- Simple and predictable
- Works for single-instance MVP constraint
- Easy to evolve when scaling to multiple instances

### Decision 4: Testing Strategy
**Question**: What level of testing is needed?

**Answer**: Integration tests only.

**Rationale**:
- Consumer setup is integration-level concern
- Need to verify actual Redis Stream consumption
- Handler logic is trivial (just logging)
- Unit tests would provide minimal value
- Follows project preference for integration over unit tests

## Implementation Plan

### Phase 1: Configuration (Task 1)
1. Add `STREAM_CONSUMER_MODE_TRANSLATE_RESULTS` to `TradeManagerConfig` interface
2. Add default value `StreamConsumerMode.NEW` to `defaultConfig`
3. Update `.env.sample` if needed

### Phase 2: Handler Implementation (Task 2)
1. Create `apps/trade-manager/src/events/consumers/translate-result-handler.ts`
2. Extend `BaseMessageHandler<MessageType.TRANSLATE_MESSAGE_RESULT>`
3. Implement `handle()` method to log received results
4. Log: messageId, channelId, promptId, isCommand, commandsCount, confidence

### Phase 3: Consumer Setup (Task 3)
1. Update `apps/trade-manager/src/events/index.ts`:
   - Add `resultConsumer` to `ConsumerRegistry` interface
   - Create consumer group for `TRANSLATE_RESULTS` in `createConsumers()`
   - Create `RedisStreamConsumer` instance for results
   - Wire up `TranslateResultHandler` in `startConsumers()`
   - Add shutdown logic in `stopConsumers()`

### Phase 4: Testing (Task 4)
1. Create integration test: `apps/trade-manager/test/integration/events/consumers/translate-result-handler.spec.ts`
2. Test scenarios:
   - Consumer receives and logs `TRANSLATE_MESSAGE_RESULT`
   - Handler extracts and logs all expected fields
   - Consumer acknowledges message successfully

## Error Handling
- Consumer errors handled by `BaseMessageHandler` and captured in Sentry
- No custom error handling needed at this stage
- Failed messages will be retried by Redis Stream consumer

## Monitoring
- Log all received results with trace token for correlation
- Include promptId, messageId, channelId in logs
- Log command count and confidence for observability

## Future Considerations
- Trade execution logic will be added in future changes
- Result processing may need to update message history
- May need to correlate results with original requests
- Performance optimization may be needed for high-volume channels
