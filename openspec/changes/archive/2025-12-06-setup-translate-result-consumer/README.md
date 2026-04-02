# Setup TRANSLATE_MESSAGE_RESULT Consumer

## Overview
This change establishes the consumer infrastructure in `trade-manager` to receive and process `TRANSLATE_MESSAGE_RESULT` events from `interpret-service`, completing the message translation flow.

## What This Change Does

### 1. Verifies interpret-service Emission
- Confirms `interpret-service` correctly publishes `TRANSLATE_MESSAGE_RESULT` to `StreamTopic.TRANSLATE_RESULTS`
- Reviews existing tests to ensure emission is verified

### 2. Adds Consumer Configuration
- Adds `STREAM_CONSUMER_MODE_TRANSLATE_RESULTS` to `trade-manager` config
- Allows independent control of translation results consumption mode
- Defaults to `StreamConsumerMode.NEW` (only new results)

### 3. Implements Result Handler
- Creates `TranslateResultHandler` extending `BaseMessageHandler`
- Logs all received translation results with full context
- No business logic - just observability for now

### 4. Sets Up Consumer Infrastructure
- Creates consumer group for `StreamTopic.TRANSLATE_RESULTS`
- Wires up `TranslateResultHandler` in consumer lifecycle
- Manages graceful startup and shutdown

### 5. Adds Integration Tests
- Verifies consumer receives `TRANSLATE_MESSAGE_RESULT` events
- Confirms all expected fields are logged
- Tests message acknowledgment

## Message Flow

```
┌─────────────────────┐
│ interpret-service   │
│                     │
│ 1. Translate msg    │
│ 2. Build result     │
│ 3. Publish to       │
│    TRANSLATE_       │
│    RESULTS          │
└──────────┬──────────┘
           │
           │ TRANSLATE_MESSAGE_RESULT
           │
           ▼
┌─────────────────────┐
│ StreamTopic.        │
│ TRANSLATE_RESULTS   │
└──────────┬──────────┘
           │
           │ consume
           │
           ▼
┌─────────────────────┐
│ trade-manager       │
│                     │
│ 4. Receive result   │
│ 5. Log details      │
│ 6. Acknowledge      │
│                     │
│ (Future: Execute    │
│  trades)            │
└─────────────────────┘
```

## Key Design Decisions

### Separate Consumer Mode
Each stream has its own consumer mode configuration:
- `STREAM_CONSUMER_MODE_MESSAGES`: For NEW_MESSAGE events
- `STREAM_CONSUMER_MODE_TRANSLATE_RESULTS`: For TRANSLATE_MESSAGE_RESULT events

This provides operational flexibility for different replay scenarios.

### Logging Only (For Now)
The initial implementation only logs received results. Trade execution logic will be added in a future change. This allows:
- Verification of end-to-end message flow
- Observability of translation results
- Incremental development approach

### Integration Tests Only
Following the project's preference for integration over unit tests, only integration tests are added. The handler logic is simple (logging), so unit tests would provide minimal value.

## Files Changed

### New Files
- `apps/trade-manager/src/events/consumers/translate-result-handler.ts`
- `apps/trade-manager/test/integration/events/consumers/translate-result-handler.spec.ts`

### Modified Files
- `apps/trade-manager/src/config.ts`
- `apps/trade-manager/src/interfaces/consumer.interface.ts`
- `apps/trade-manager/src/events/index.ts`

## Testing

### Integration Tests
```bash
npx nx test trade-manager
```

### Manual Testing
1. Start all services (telegram-service, interpret-service, trade-manager)
2. Send a message to a monitored Telegram channel
3. Check trade-manager logs for `TRANSLATE_MESSAGE_RESULT` entries
4. Verify all expected fields are logged

## Future Work
- Add trade execution logic based on translation results
- Update message history with result processing
- Implement error handling for failed result processing
- Add retry mechanisms for transient failures

## Related Changes
- `setup-interpret-events`: Established `TRANSLATE_MESSAGE_REQUEST` and `TRANSLATE_MESSAGE_RESULT` message types
- `translate-message-flow`: Implemented translation request publishing in trade-manager
- `implement-interpret-ai-service`: Implemented AI translation in interpret-service
