# Design: Sentry Distributed Tracing Implementation

## Architecture Overview

### Current State
```
[telegram-service] --Redis Stream--> [trade-manager] --Redis Stream--> [interpret-service]
       |                                    |                                  |
   traceToken                          traceToken                        traceToken
   in logs                             in logs                           in logs
```

**Limitations**:
- Manual correlation via log search
- No visual trace representation
- No automatic parent-child relationships

### Target State
```
[telegram-service] --Redis Stream + Sentry Trace--> [trade-manager] --Redis Stream + Sentry Trace--> [interpret-service]
       |                                                   |                                                |
   Sentry Span                                       Sentry Span                                     Sentry Span
   + traceToken                                      + traceToken                                    + traceToken
       |                                                   |                                                |
       +-----------------------------------Unified Trace in Sentry UI------------------------------------+
```

**Benefits**:
- Automatic trace propagation across services
- Visual waterfall view in Sentry
- Error-trace correlation
- Performance bottleneck identification

---

## Trace Propagation Flow

### Message Flow with Trace Context

```
1. telegram-service receives Telegram message
   └─> Sentry.startSpan('receive-telegram-message')
       ├─> Generate traceToken
       ├─> Process message
       └─> Publish to StreamTopic.MESSAGES
           ├─> Sentry.startSpan('stream.publish.messages')
           ├─> Inject: _sentryTrace, _sentryBaggage
           └─> Include: traceToken

2. trade-manager consumes from StreamTopic.MESSAGES
   └─> Sentry.continueTrace({ sentryTrace, baggage })
       └─> Sentry.startSpan('stream.consume.NEW_MESSAGE')
           ├─> Extract traceToken
           ├─> Fetch message from DB
           │   └─> Sentry.startSpan('fetch-message')
           └─> Publish to StreamTopic.TRANSLATE_REQUESTS
               ├─> Sentry.startSpan('stream.publish.translate-requests')
               ├─> Inject: _sentryTrace, _sentryBaggage
               └─> Include: traceToken

3. interpret-service consumes from StreamTopic.TRANSLATE_REQUESTS
   └─> Sentry.continueTrace({ sentryTrace, baggage })
       └─> Sentry.startSpan('stream.consume.TRANSLATE_MESSAGE_REQUEST')
           ├─> Extract traceToken
           ├─> Fetch orders from DB
           │   └─> Sentry.startSpan('fetch-orders')
           ├─> AI translation
           │   └─> Sentry.startSpan('ai-translate')
           └─> Publish to StreamTopic.TRANSLATE_RESULTS
               ├─> Sentry.startSpan('stream.publish.translate-results')
               ├─> Inject: _sentryTrace, _sentryBaggage
               └─> Include: traceToken

4. trade-manager consumes from StreamTopic.TRANSLATE_RESULTS
   └─> Sentry.continueTrace({ sentryTrace, baggage })
       └─> Sentry.startSpan('stream.consume.TRANSLATE_MESSAGE_RESULT')
           ├─> Extract traceToken
           └─> Process result
```

**Result**: Single unified trace visible in Sentry UI showing all 4 hops with timing for each operation.

---

## Component Design

### 1. Stream Message Schema Extension

**Location**: `libs/shared/utils/src/stream/stream-interfaces.ts`

**Change**:
```typescript
export interface StreamMessage<T extends MessageType = MessageType> {
  version: string;
  type: T;
  payload: MessageTypePayloadMap[T];
  
  // NEW: Sentry trace propagation (optional for backward compatibility)
  _sentryTrace?: string;      // W3C trace context header
  _sentryBaggage?: string;    // Sentry baggage for trace metadata
}
```

**Rationale**:
- Optional fields maintain backward compatibility
- Underscore prefix indicates internal/system fields
- Follows Sentry's standard trace propagation format

---

### 2. Stream Publisher Instrumentation

**Location**: `libs/shared/utils/src/stream/redis-stream-publisher.ts`

**Pattern**:
```typescript
async publish<T extends MessageType>(
  topic: StreamTopic,
  message: StreamMessage<T>
): Promise<string> {
  return await Sentry.startSpan(
    {
      name: `stream.publish.${topic}`,
      op: 'queue.publish',
      attributes: {
        'messaging.system': 'redis',
        'messaging.destination': topic,
        'messaging.message.type': message.type,
      },
    },
    async (span) => {
      // Inject Sentry trace context
      const traceData = Sentry.getTraceData();
      const enrichedMessage = {
        ...message,
        _sentryTrace: traceData.sentryTrace,
        _sentryBaggage: traceData.baggage,
      };

      // Add custom attributes
      span.setData('traceToken', message.payload.traceToken);
      span.setData('messageType', message.type);

      // Publish to Redis
      const messageId = await this.client.xadd(
        topic,
        '*',
        'data',
        JSON.stringify(enrichedMessage)
      );

      span.setData('messageId', messageId);
      return messageId;
    }
  );
}
```

**Key Points**:
- Wraps publish operation in Sentry span
- Injects trace context into message
- Adds `traceToken` as span attribute for searchability
- Uses OpenTelemetry semantic conventions for messaging

---

### 3. Stream Consumer Instrumentation

**Location**: `libs/shared/utils/src/stream/consumers/base-message-handler.ts`

**Pattern**:
```typescript
export abstract class BaseMessageHandler<T extends MessageType> {
  protected async processWithTracing(
    message: StreamMessage<T>,
    id: string,
    handler: () => Promise<void>
  ): Promise<void> {
    // Continue trace from publisher
    await Sentry.continueTrace(
      {
        sentryTrace: message._sentryTrace,
        baggage: message._sentryBaggage,
      },
      async () => {
        await Sentry.startSpan(
          {
            name: `stream.consume.${message.type}`,
            op: 'queue.process',
            attributes: {
              'messaging.system': 'redis',
              'messaging.message.id': id,
              'messaging.message.type': message.type,
            },
          },
          async (span) => {
            span.setData('traceToken', message.payload.traceToken);
            span.setData('streamMessageId', id);

            // Execute actual handler
            await handler();
          }
        );
      }
    );
  }
}
```

**Key Points**:
- `continueTrace` links consumer span to publisher span
- Creates parent-child relationship in trace
- Extracts and logs `traceToken` for correlation
- Wraps handler execution in span for timing

---

### 4. Granular Operation Spans

**Database Operations**:
```typescript
await Sentry.startSpan({ name: 'fetch-message', op: 'db.query' }, async (span) => {
  span.setData('channelId', channelId);
  span.setData('messageId', messageId);
  const message = await this.telegramMessageRepository.findByChannelAndMessageId(...);
  span.setData('found', !!message);
  return message;
});
```

**AI Inference**:
```typescript
await Sentry.startSpan({ name: 'ai-translate', op: 'ai.inference' }, async (span) => {
  span.setData('promptId', promptId);
  span.setData('provider', 'gemini'); // or 'groq'
  const result = await this.aiService.translateMessage(...);
  span.setData('isCommand', result.isCommand);
  span.setData('confidence', result.confidence);
  return result;
});
```

**Stream Publishing**:
```typescript
await Sentry.startSpan({ name: 'publish-translate-request', op: 'queue.publish' }, async (span) => {
  span.setData('accountId', accountId);
  span.setData('promptId', promptId);
  const streamId = await this.streamPublisher.publish(...);
  span.setData('streamMessageId', streamId);
  return streamId;
});
```

---

## Span Naming Conventions

### Operation Types (op)
- `queue.publish`: Publishing to Redis Stream
- `queue.process`: Consuming from Redis Stream
- `db.query`: Database read operations
- `db.mutation`: Database write operations
- `ai.inference`: AI/LLM API calls
- `http.client`: External HTTP requests

### Span Names
- **Pattern**: `{resource}.{action}` or `{operation-description}`
- **Examples**:
  - `stream.publish.messages`
  - `stream.consume.NEW_MESSAGE`
  - `fetch-message`
  - `ai-translate`
  - `publish-translate-request`

---

## Trace Attributes

### Standard Attributes (all spans)
- `traceToken`: Custom trace token for log correlation
- `service`: Service name (from `APP_NAME`)

### Messaging Spans
- `messaging.system`: `redis`
- `messaging.destination`: Stream topic name
- `messaging.message.type`: Message type enum
- `messaging.message.id`: Redis Stream message ID

### Database Spans
- `db.system`: `mongodb`
- `db.operation`: Operation type (find, update, insert, etc.)
- `db.collection`: Collection name

### AI Spans
- `ai.provider`: `gemini` or `groq`
- `ai.model`: Model name
- `ai.prompt_id`: Prompt rule ID
- `ai.is_command`: Whether result is a command
- `ai.confidence`: Confidence score

---

## Error Handling

### Automatic Error Capture
```typescript
await Sentry.startSpan({ name: 'operation' }, async (span) => {
  try {
    // Operation logic
  } catch (error) {
    // Sentry automatically captures error and links to span
    span.setStatus({ code: 2, message: error.message }); // ERROR status
    throw error;
  }
});
```

### Error Context
- Errors automatically linked to parent trace
- Full trace context available in Sentry error detail
- Can navigate from error → trace → all related spans

---

## Backward Compatibility

### Message Schema
- `_sentryTrace` and `_sentryBaggage` are **optional**
- Old messages without trace context will still process
- New messages will have trace context

### TraceToken System
- **Keep existing `traceToken` field** in all payloads
- Add `traceToken` as span attribute in all Sentry spans
- Both systems coexist:
  - `traceToken`: For log correlation and manual searches
  - Sentry traces: For visual waterfall and automatic correlation

### Consumer Compatibility
```typescript
// Graceful handling of missing trace context
await Sentry.continueTrace(
  {
    sentryTrace: message._sentryTrace || undefined,
    baggage: message._sentryBaggage || undefined,
  },
  async () => {
    // If no trace context, Sentry starts new trace
    // If trace context exists, continues existing trace
  }
);
```

---

## Performance Considerations

### Overhead
- **Span creation**: ~1-2ms per span
- **Trace context serialization**: ~0.5ms
- **Total overhead per message**: ~5-10ms (negligible vs AI call ~1500ms)

### Sampling
- **Current**: 10% trace sampling (already configured)
- **Impact**: Only 10% of messages create traces
- **Cost**: Minimal additional Sentry usage

### Optimization
- Avoid creating spans for trivial operations (<10ms)
- Focus on high-value spans (DB, AI, stream operations)
- Use async span creation (non-blocking)

---

## Testing Strategy

### Unit Tests
- Test span creation in isolation
- Mock Sentry SDK
- Verify span attributes

### Integration Tests
- Publish message → verify trace context injected
- Consume message → verify trace context extracted
- End-to-end flow → verify complete trace in Sentry

### Test Infrastructure
- Use existing Docker-based integration tests
- Add Sentry mock/stub for test environment
- Verify trace propagation without actual Sentry backend

---

## Migration Path

### Phase 1: Infrastructure (No Breaking Changes)
1. Update stream message schema (optional fields)
2. Instrument publisher (inject trace context)
3. Create base tracing handler
4. Update one service (trade-manager) as POC

### Phase 2: Rollout (Gradual)
1. Update remaining message handlers
2. Add granular spans for key operations
3. Integration tests for all services

### Phase 3: Validation
1. Monitor Sentry trace UI in production
2. Verify performance overhead acceptable
3. Team training on trace analysis

---

## Sentry UI Usage

### Finding Traces
1. **By traceToken**: Search for `traceToken:12345-67890` in Sentry
2. **By error**: Click on error → see "Related Trace"
3. **By performance**: Filter slow transactions (>2s)

### Analyzing Traces
- **Waterfall view**: See all spans in chronological order
- **Span details**: Click span → see attributes, timing
- **Bottleneck identification**: Longest span = bottleneck

### Example Trace
```
▼ stream.consume.NEW_MESSAGE (250ms)
  ├─ fetch-message (50ms) [db.query]
  ├─ publish-translate-request (200ms)
  │  └─ stream.publish.translate-requests (200ms)
  │     └─ [Redis XADD operation]
  
▼ stream.consume.TRANSLATE_MESSAGE_REQUEST (1800ms)
  ├─ fetch-orders (100ms) [db.query]
  ├─ ai-translate (1500ms) [ai.inference] ← BOTTLENECK
  └─ publish-result (200ms)
     └─ stream.publish.translate-results (200ms)
```

**Insight**: AI translation is the bottleneck (1500ms out of 1800ms total).

---

## Open Questions

1. **Should we add custom Sentry dashboards?**
   - **Decision**: Out of scope for initial implementation, can add later

2. **Should we increase trace sampling rate?**
   - **Decision**: Keep at 10% initially, monitor and adjust

3. **Should we remove `traceToken` after Sentry traces are stable?**
   - **Decision**: No, keep both systems for redundancy

4. **Should we instrument HTTP calls (if any)?**
   - **Decision**: Not applicable, system uses Redis Streams only
