# Spec: Observability and Monitoring

**Capability**: `observability-monitoring`  
**Related Change**: `refine-telegram-service-infrastructure`

## Overview

This spec defines observability requirements for the telegram-service, including Sentry integration, custom metrics, trace tokens, and monitoring dashboards.

## ADDED Requirements

### Requirement: Sentry Integration
The system MUST integrate with Sentry for error tracking, logging, and metrics, enabled only in production environments.

#### Scenario: Sentry enabled in production
**Given** the application is running in production environment  
**And** `SENTRY_DSN` is configured  
**When** Sentry is initialized  
**Then** Sentry MUST be enabled  
**And** all log levels (log, info, warn, error) MUST be captured  
**And** traces MUST be sampled at 10%  
**And** metrics MUST be enabled

#### Scenario: Sentry disabled in development
**Given** the application is running in development environment  
**When** Sentry is initialized  
**Then** Sentry MUST be disabled  
**And** no logs MUST be sent to Sentry  
**And** no metrics MUST be sent to Sentry

#### Scenario: Sentry DSN not configured
**Given** `SENTRY_DSN` is not set or empty  
**When** Sentry initialization is attempted  
**Then** Sentry MUST NOT be initialized  
**And** the application MUST continue running normally  
**And** a warning MAY be logged

### Requirement: Custom Metrics for Service Health
The system MUST emit custom metrics to Sentry for monitoring service health and performance.

#### Scenario: Message processing metric
**Given** a message is successfully processed  
**When** the message is saved to the database  
**Then** a `telegram.message.processed` counter MUST be incremented  
**And** the metric MUST include a tag for `channel` with the channel code

#### Scenario: Stream lag metric
**Given** a message is received from Telegram  
**When** the message processing is complete  
**Then** a `telegram.stream.lag` gauge MUST be updated  
**And** the metric value MUST be the time difference between `sentAt` and `receivedAt` in milliseconds  
**And** the metric MUST include a tag for `channel` with the channel code

#### Scenario: Processing rate metric
**Given** messages are being processed  
**When** metrics are collected  
**Then** a `telegram.processing.rate` gauge MUST show messages processed per minute  
**And** the metric MUST include a tag for `channel` with the channel code

#### Scenario: Error rate metric
**Given** an error occurs during message processing  
**When** the error is caught  
**Then** a `telegram.error` counter MUST be incremented  
**And** the metric MUST include tags for `type` (error type) and `channel`

#### Scenario: Queue depth metric
**Given** a message is added to a channel queue  
**When** the queue length changes  
**Then** a `telegram.queue.depth` gauge MUST be updated  
**And** the metric MUST include a tag for `channel` with the channel code  
**And** the value MUST be the current queue length

#### Scenario: Media detection metric
**Given** a message with media is processed  
**When** media is detected  
**Then** a `telegram.media.detected` counter MUST be incremented  
**And** the metric MUST include a tag for `type` with the media type

#### Scenario: Message edit metric
**Given** a message edit is processed  
**When** the edit is saved to the database  
**Then** a `telegram.message.edited` counter MUST be incremented  
**And** the metric MUST include a tag for `channel` with the channel code

#### Scenario: Message delete metric
**Given** a message deletion event is received  
**When** the message is marked as deleted in the database  
**Then** a `telegram.message.deleted` counter MUST be incremented  
**And** the metric MUST include a tag for `channel` with the channel code

### Requirement: Trace Token for Message Lifecycle
The system MUST generate and propagate a trace token for each message to enable end-to-end tracing.

#### Scenario: Generate trace token for new message
**Given** a new message is received  
**When** the message is being processed  
**Then** a trace token MUST be generated  
**And** the trace token MUST be in the format `{messageId}{channelId}`  
**And** the trace token MUST be unique per message

#### Scenario: Include trace token in logs
**Given** a message is being processed  
**When** any log statement is written  
**Then** the log MUST include a `traceToken` field  
**And** the trace token MUST be consistent across all logs for that message

#### Scenario: Propagate trace token through Redis Stream
**Given** a message event is published to Redis Stream  
**When** the stream message is created  
**Then** the stream message payload MUST include the trace token  
**And** downstream services MUST be able to access the trace token

#### Scenario: Include trace token in notifications
**Given** a push notification is sent for a message  
**When** the notification is created  
**Then** the notification MUST include the trace token  
**And** the trace token MUST match the message's trace token

### Requirement: Sentry Dashboard for Service Monitoring
The system MUST provide a Sentry dashboard configuration for monitoring service health.

#### Scenario: Dashboard displays key metrics
**Given** the Sentry dashboard is configured  
**When** the dashboard is viewed  
**Then** it MUST display stream lag (time between sent and received)  
**And** it MUST display processing rate (messages/minute)  
**And** it MUST display error rate (errors/minute)  
**And** it MUST display message edit count per channel  
**And** it MUST display message delete count per channel  
**And** it MUST display media detection frequency (percentage)  
**And** it MUST display queue depth per channel

## Implementation Details

### Sentry Configuration
```typescript
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: config('NODE_ENV'),
  enabled: environment === 'production',
  
  integrations: [
    Sentry.consoleLoggingIntegration({
      levels: ['log', 'info', 'warn', 'error'],
    }),
  ],
  
  tracesSampleRate: 0.1,
  enableMetrics: true,
});

Sentry.setTag('service', config('APP_NAME'));
```

### Custom Metrics API
```typescript
// Counter
Sentry.metrics.increment('telegram.message.processed', {
  tags: { channel: channelCode }
});

// Gauge
Sentry.metrics.gauge('telegram.queue.depth', queueLength, {
  tags: { channel: channelCode }
});
```

### Trace Token Utility
```typescript
export function generateTraceToken(
  messageId: number,
  channelId: string
): string {
  return `${messageId}${channelId}`;
}
```

### Log Format with Trace Token
```typescript
this.logger.info(
  {
    channelCode,
    messageId,
    traceToken: generateTraceToken(messageId, channelId),
  },
  'Message processed'
);
```

## Metrics Specification

| Metric Name                  | Type    | Tags              | Description                                 |
| ---------------------------- | ------- | ----------------- | ------------------------------------------- |
| `telegram.message.processed` | Counter | `channel`         | Number of messages processed                |
| `telegram.stream.lag`        | Gauge   | `channel`         | Time between message sent and received (ms) |
| `telegram.processing.rate`   | Gauge   | `channel`         | Messages processed per minute               |
| `telegram.error`             | Counter | `type`, `channel` | Number of errors by type                    |
| `telegram.queue.depth`       | Gauge   | `channel`         | Current queue depth per channel             |
| `telegram.media.detected`    | Counter | `type`            | Number of messages with media               |
| `telegram.message.edited`    | Counter | `channel`         | Number of message edits                     |
| `telegram.message.deleted`   | Counter | `channel`         | Number of message deletions                 |

## Dashboard Widgets

1. **Stream Lag**: Line chart of `telegram.stream.lag` over time (shows latency)
2. **Processing Rate**: Line chart of `telegram.processing.rate` over time
3. **Error Rate**: Line chart of `telegram.error` over time
4. **Queue Depth**: Gauge showing current queue depth per channel
5. **Message Edits**: Bar chart of `telegram.message.edited` per channel
6. **Message Deletes**: Bar chart of `telegram.message.deleted` per channel
7. **Media Detection**: Pie chart of media types detected

## Trace Token Format

**Format**: `{messageId}{channelId}`

**Example**: `12345-1003409608482`

**Properties**:
- Unique per message
- Human-readable
- Easy to search in logs
- Consistent across services

## Error Handling

1. **Sentry Initialization Failure**: Log warning, continue without Sentry
2. **Metric Emission Failure**: Log warning, do not throw error
3. **Trace Token Generation Failure**: Use fallback format or UUID

## Testing Requirements

### Unit Tests
- Sentry initialization in production vs. development
- Metric emission (mocked)
- Trace token generation
- Trace token format validation

### Integration Tests
- Sentry captures errors in test environment
- Metrics are emitted (verify with mock)
- Trace tokens appear in logs

### Manual Testing
- Deploy to staging with Sentry enabled
- Verify metrics appear in Sentry
- Verify dashboard displays correctly
- Verify trace tokens in logs

## Performance Considerations

- Metric emission is async and non-blocking
- Trace token generation is O(1)
- Sentry sampling reduces overhead (10% of traces)
- No significant performance impact expected

## Security Considerations

- Sentry DSN is sensitive; store in environment variables
- Trace tokens do not contain sensitive information
- Logs may contain message content; ensure Sentry access is restricted
- Metrics do not expose PII
