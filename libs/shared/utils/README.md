# Shared Utils Library

Shared utilities and infrastructure for the Telegram Auto Trading Bot monorepo.

## Overview

This library provides common functionality used across all services:
- **Configuration**: Centralized config management with environment variable support
- **Logging**: Structured logging with Pino
- **Redis Streams**: Message queue infrastructure for inter-service communication
- **Error Capture**: Sentry integration for error tracking and distributed tracing
- **Metrics**: Performance monitoring and metrics collection
- **Message Validation**: TypeBox schema validation for stream messages

## Redis Stream Infrastructure

### Architecture

The system uses Redis Streams for asynchronous, reliable message passing between services:

```
telegram-service → [MESSAGES stream] → trade-manager
trade-manager → [TRANSLATE_REQUESTS stream] → interpret-service
interpret-service → [TRANSLATE_RESULTS stream] → trade-manager
```

### Key Components

#### StreamMessage Interface

All messages follow a common structure:

```typescript
interface StreamMessage<T extends MessageType> {
  version: string;
  type: T;
  payload: MessageTypePayloadMap[T];
  _sentryTrace?: string;      // Optional: Sentry trace header
  _sentryBaggage?: string;    // Optional: Sentry baggage header
}
```

#### RedisStreamPublisher

Publishes messages to Redis Streams with automatic trace context injection:

```typescript
const publisher = new RedisStreamPublisher({ url: REDIS_URL, logger });

await publisher.publish(StreamTopic.MESSAGES, {
  version: '1.0',
  type: MessageType.NEW_MESSAGE,
  payload: { /* ... */ }
});
// Automatically injects _sentryTrace and _sentryBaggage for distributed tracing
```

#### BaseMessageHandler

Base class for all message handlers with built-in distributed tracing:

```typescript
export class MyHandler extends BaseMessageHandler<MessageType.MY_MESSAGE> {
  async handle(message: StreamMessage<MessageType.MY_MESSAGE>, id: string): Promise<void> {
    // Use processWithTracing for automatic trace continuation
    return this.processWithTracing(message, id, async () => {
      // Your handler logic here
      // Trace context is automatically propagated
    });
  }
}
```

#### RedisStreamConsumer

Consumes messages from Redis Streams with consumer group support:

```typescript
const consumer = new RedisStreamConsumer({
  url: REDIS_URL,
  consumerGroup: 'my-service',
  consumerName: 'worker-1',
  streams: [StreamTopic.MESSAGES],
  handlers: { [MessageType.NEW_MESSAGE]: myHandler },
  logger,
  errorCapture
});

await consumer.start();
```

## Distributed Tracing

### Overview

The library implements Sentry distributed tracing for end-to-end visibility across services.

### Trace Propagation

**Automatic Injection (Publisher):**
```typescript
// RedisStreamPublisher automatically injects trace context
await publisher.publish(topic, message);
// Message now includes _sentryTrace and _sentryBaggage fields
```

**Automatic Continuation (Consumer):**
```typescript
// BaseMessageHandler.processWithTracing automatically continues the trace
async handle(message, id) {
  return this.processWithTracing(message, id, async () => {
    // Your code runs within the continued trace context
  });
}
```

### Adding Granular Spans

Wrap operations in Sentry spans for detailed performance monitoring:

```typescript
import * as Sentry from '@sentry/node';

// Database query span
const result = await Sentry.startSpan(
  {
    name: 'fetch-user',
    op: 'db.query',
    attributes: { userId: '123' }
  },
  async (span) => {
    const user = await db.findUser('123');
    span.setAttribute('found', !!user);
    return user;
  }
);

// AI inference span
const translation = await Sentry.startSpan(
  {
    name: 'ai-translate',
    op: 'ai.inference',
    attributes: { provider: 'gemini', promptId: 'abc' }
  },
  async (span) => {
    const result = await ai.translate(message);
    span.setAttribute('confidence', result.confidence);
    return result;
  }
);
```

### Span Naming Conventions

Follow these conventions for consistency:

**Operations:**
- `db.query` - Database read operations
- `db.mutation` - Database write operations
- `queue.publish` - Publishing to message queue
- `queue.process` - Processing from message queue
- `ai.inference` - AI/LLM operations
- `http.client` - External HTTP calls

**Names:**
- Use kebab-case: `fetch-user`, `publish-result`
- Be specific: `fetch-active-accounts` not `get-accounts`
- Include entity type: `fetch-message`, `add-history-entry`

### Span Attributes

Always include relevant attributes for filtering and debugging:

```typescript
span.setAttribute('traceToken', message.payload.traceToken);
span.setAttribute('channelId', channelId);
span.setAttribute('accountId', accountId);
span.setAttribute('found', !!result);
span.setAttribute('count', items.length);
```

### Best Practices

1. **Use processWithTracing**: Always use `BaseMessageHandler.processWithTracing()` for stream handlers
2. **Add granular spans**: Wrap key operations (DB, AI, external calls) in spans
3. **Include attributes**: Add relevant business context to spans
4. **Keep spans focused**: Each span should represent a single logical operation
5. **Handle errors**: Spans automatically capture errors, no need to manually set status
6. **Avoid over-instrumentation**: Don't create spans for trivial operations (<1ms)

### Debugging

**View traces in Sentry:**
1. Search by `traceToken` to find specific message flow
2. View trace waterfall to see operation timing
3. Check span attributes for business context
4. Look for error status in spans

**Common issues:**
- **Trace not found**: Check sampling rate, verify Sentry is enabled
- **Broken trace**: Ensure all handlers use `processWithTracing()`
- **Missing spans**: Verify Sentry import and span creation
- **Wrong parent**: Ensure spans are created within trace context

## Message Validation

All stream messages are validated using TypeBox schemas:

```typescript
import { MessageValidator } from '@telegram-trading-bot-mini/shared/utils';

const validator = new MessageValidator();

// Validate message
const result = validator.validate(MessageType.NEW_MESSAGE, payload);
if (!result.valid) {
  console.error('Validation errors:', result.errors);
}
```

## Configuration

Use the shared config pattern:

```typescript
import { createConfig, BaseConfig } from '@telegram-trading-bot-mini/shared/utils';

interface MyConfig extends BaseConfig {
  MY_SETTING: string;
}

export const config = createConfig<MyConfig>({
  MY_SETTING: process.env.MY_SETTING || 'default'
});
```

## Logging

Use the shared logger:

```typescript
import { createLogger } from '@telegram-trading-bot-mini/shared/utils';

const logger = createLogger('my-service');

logger.info({ userId: '123' }, 'User logged in');
logger.error({ error }, 'Failed to process');
```

## Testing

The library provides test utilities:

```typescript
import { 
  getTestRedisUrl,
  getTestMongoUrl,
  sleep 
} from '@telegram-trading-bot-mini/shared/test-utils';

// Use in tests
const redis = new Redis(getTestRedisUrl());
```

### Sentry Mocking

For tests, mock Sentry to avoid actual API calls:

```typescript
jest.mock('@sentry/node', () => ({
  startSpan: jest.fn((options, callback) => {
    const mockSpan = {
      setAttribute: jest.fn(),
      setData: jest.fn(),
      setStatus: jest.fn(),
      end: jest.fn(),
    };
    return callback(mockSpan);
  }),
  continueTrace: jest.fn((context, callback) => callback()),
  getTraceData: jest.fn(() => ({
    'sentry-trace': 'mock-trace-header',
    baggage: 'mock-baggage',
  })),
}));
```

## API Reference

See TypeScript definitions for detailed API documentation:
- `src/stream/` - Redis Stream infrastructure
- `src/config.ts` - Configuration management
- `src/logger.ts` - Logging utilities
- `src/error-capture/` - Error tracking
- `src/interfaces/messages/` - Message type definitions
