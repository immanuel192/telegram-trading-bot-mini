# observability-monitoring Specification

## Purpose
TBD - created by archiving change refine-telegram-service-infrastructure. Update Purpose after archive.
## Requirements
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

