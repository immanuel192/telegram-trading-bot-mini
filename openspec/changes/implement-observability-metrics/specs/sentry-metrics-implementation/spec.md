# sentry-metrics-implementation Specification

## Purpose
Implements the missing Sentry custom metrics across all services to enable comprehensive monitoring of system health and performance as specified in the observability-monitoring requirements.

## ADDED Requirements
### Requirement: Telegram Service Metrics Implementation
The telegram-service MUST emit all specified custom metrics to Sentry for monitoring message processing and system health.

#### Scenario: Message processing counter implementation
**Given** a message is successfully processed and saved to the database  
**When** the save operation completes  
**Then** `Sentry.metrics.increment('telegram.message.processed')` MUST be called  
**And** the metric MUST include a tag for `channel` with the channel code  
**And** the metric MUST include a tag for `traceToken` with the message trace token

#### Scenario: Stream lag gauge implementation
**Given** a message is received from Telegram with `sentAt` timestamp  
**When** message processing begins  
**Then** the time difference between `sentAt` and current time MUST be calculated  
**And** `Sentry.metrics.gauge('telegram.stream.lag', lagMs)` MUST be called  
**And** the metric MUST include tags for `channel` and `traceToken`

#### Scenario: Queue depth gauge implementation
**Given** a message is added to or removed from a channel queue  
**When** the queue operation completes  
**Then** the current queue length MUST be retrieved using `queue.length()`  
**And** `Sentry.metrics.gauge('telegram.queue.depth', queueLength)` MUST be called  
**And** the metric MUST include tags for `channel` and `traceToken`

#### Scenario: Error rate counter implementation
**Given** an error occurs during message processing  
**When** the error is caught and logged  
**Then** `Sentry.metrics.increment('telegram.error')` MUST be called  
**And** the metric MUST include tags for `type` (error type), `channel`, and `traceToken`

#### Scenario: Media detection counter implementation
**Given** a message contains media attachments  
**When** the media is processed  
**Then** `Sentry.metrics.increment('telegram.media.detected')` MUST be called  
**And** the metric MUST include tags for `type` (media type), `channel`, and `traceToken`

#### Scenario: Message edit counter implementation
**Given** a message edit event is processed and saved  
**When** the database update completes  
**Then** `Sentry.metrics.increment('telegram.message.edited')` MUST be called  
**And** the metric MUST include tags for `channel` and `traceToken`

#### Scenario: Message delete counter implementation
**Given** a message deletion event is processed and saved  
**When** the database update completes  
**Then** `Sentry.metrics.increment('telegram.message.deleted')` MUST be called  
**And** the metric MUST include tags for `channel` and `traceToken`

#### Scenario: Processing rate gauge implementation
**Given** messages are being processed over time  
**When** a processing rate calculation is triggered (every minute)  
**Then** the messages processed per minute MUST be calculated  
**And** `Sentry.metrics.gauge('telegram.processing.rate', rate)` MUST be called  
**And** the metric MUST include a tag for `channel`

### Requirement: Interpret Service Metrics Implementation
The interpret-service MUST include placeholder metrics for future signal interpretation and LLM performance monitoring.

#### Scenario: Placeholder metrics setup
**Given** the interpret-service is processing messages  
**When** placeholder metrics are implemented  
**Then** placeholder metric calls MUST be added for future signal processing  
**And** placeholder metric calls MUST be added for future LLM performance  
**And** placeholder metric calls MUST include proper tag structure  
**And** placeholder metrics MUST be no-ops until actual implementation is complete

### Requirement: Trade Manager Metrics Implementation
The trade-manager MUST emit custom metrics to Sentry for monitoring trade execution and risk management.

#### Scenario: Trade execution counter implementation
**Given** a trade is successfully executed  
**When** the trade confirmation is received  
**Then** `Sentry.metrics.increment('trade.executed')` MUST be called  
**And** the metric MUST include tags for `account`, `symbol`, `side`, and `traceToken`

#### Scenario: Risk management event counter implementation
**Given** a risk management rule is triggered  
**When** the risk event is processed  
**Then** `Sentry.metrics.increment('trade.risk.event')` MUST be called  
**And** the metric MUST include tags for `rule`, `account`, and `traceToken`

#### Scenario: Trade error counter implementation
**Given** an error occurs during trade execution  
**When** the error is caught and logged  
**Then** `Sentry.metrics.increment('trade.error')` MUST be called  
**And** the metric MUST include tags for `type`, `account`, and `traceToken`

### Requirement: Metrics Environment Configuration
Metrics emission MUST be properly configured based on the environment.

#### Scenario: Production metrics enabled
**Given** the application is running in production environment  
**When** the application starts  
**Then** Sentry metrics MUST be enabled  
**And** all metric emission calls MUST be functional

#### Scenario: Development metrics disabled
**Given** the application is running in development environment  
**When** the application starts  
**Then** Sentry metrics MUST be disabled  
**And** metric emission calls MUST be no-ops

#### Scenario: Metrics error handling
**Given** a metric emission call fails  
**When** the error occurs  
**Then** the error MUST be caught and logged locally  
**And** the application MUST continue normal operation  
**And** no exception MUST be thrown from metric calls
