# executor-service-foundation Specification

## Purpose
TBD - created by archiving change build-executor-service. Update Purpose after archive.
## Requirements
### Requirement: Executor Service Application Structure
The system SHALL provide an executor-service application following the n-tier architecture pattern.

#### Scenario: Service directory structure
- **WHEN** the executor-service is scaffolded
- **THEN** it SHALL follow the standard app structure:
  - `src/config.ts` - Service configuration extending BaseConfig
  - `src/logger.ts` - Service logger instance
  - `src/sentry.ts` - Error capture setup
  - `src/main.ts` - Entry point
  - `src/server.ts` - Worker setup (no HTTP server)
  - `src/container.ts` - IoC container for dependency injection
  - `src/adapters/` - Broker adapter implementations
  - `src/events/` - Event consumers and handlers
  - `src/services/` - Business logic services
  - `src/jobs/` - Background jobs
  - `test/unit/` - Unit tests
  - `test/integration/` - Integration tests

#### Scenario: Build and deployment
- **WHEN** building the executor-service
- **THEN** `nx build executor-service` SHALL succeed
- **AND** the build output SHALL be executable via Node.js
- **AND** PM2 configuration SHALL be provided in `infra/pm2/executor-service.config.js`

### Requirement: Executor Service Configuration
The executor-service SHALL define typed configuration extending BaseConfig from shared utils.

#### Scenario: Configuration schema
- **WHEN** executor-service loads configuration
- **THEN** it SHALL include the following fields:
  - `REDIS_URL`: string (Redis connection URL, native Redis)
  - `PRICE_FEED_INTERVAL_MS`: number (Default: 5000)
  - `PRICE_FEED_BATCH_SIZE`: number (Default: 10)" - `ORDER_EXECUTION_TIMEOUT_MS`: number (Default: 30000)
  - `ORDER_RETRY_MAX_ATTEMPTS`: number (Default: 3)
- **AND** all fields SHALL have sensible defaults
- **AND** configuration SHALL use `createConfig` helper from shared utils

#### Scenario: Environment variable sample
- **WHEN** setting up executor-service
- **THEN** a `.env.sample` file SHALL be provided in the app root
- **AND** it SHALL document all configuration options

### Requirement: Stream Message Types for Executor Service
The system SHALL define new message types for executor-service communication.

#### Scenario: EXECUTE_ORDER_REQUEST message type
- **WHEN** defining order execution requests
- **THEN** `MessageType.EXECUTE_ORDER_REQUEST` SHALL be added to the enum
- **AND** the payload SHALL include:
  - `messageId`: number (Telegram message ID)
  - `channelId`: string (Telegram channel ID)
  - `orderId`: string (Internal order ID from Order model)
  - `accountId`: string (Executor account ID)
  - `traceToken`: string (For distributed tracing)
  - `symbol`: string (Symbol from interpret-service)
  - `type`: OrderType (LONG | SHORT)
  - `executionType`: OrderExecutionType (market | limit)
  - `lotSize`: number (Position size)
  - `price`: number (Entry price)
  - `leverage?`: number (Optional leverage)
  - `sl?`: number (Optional stop loss)
  - `tp?`: number (Optional take profit)
  - `timestamp`: number (Creation timestamp)
- **AND** type inference SHALL work: `StreamMessage<MessageType.EXECUTE_ORDER_REQUEST>` resolves correctly

#### Scenario: EXECUTE_ORDER_RESULT message type
- **WHEN** defining order execution results
- **THEN** `MessageType.EXECUTE_ORDER_RESULT` SHALL be added to the enum
- **AND** the payload SHALL include:
  - `orderId`: string
  - `accountId`: string
  - `traceToken`: string
  - `success`: boolean
  - `executedAt?`: number (Timestamp of execution)
  - `exchangeOrderId?`: string (Broker's order ID)
  - `executedPrice?`: number (Actual fill price)
  - `executedLots?`: number (Actual filled lots)
  - `actualSymbol?`: string (Resolved symbol at broker)
  - `error?`: string (Error message if failed)
  - `errorCode?`: string (Error code for programmatic handling)

#### Scenario: LIVE_PRICE_UPDATE message type
- **WHEN** defining live price updates
- **THEN** `MessageType.LIVE_PRICE_UPDATE` SHALL be added to the enum
- **AND** the payload SHALL include:
  - `accountId`: string
  - `symbol`: string (Symbol at broker)
  - `bid`: number (Current bid price)
  - `ask`: number (Current ask price)
  - `timestamp`: number (Fetch timestamp)

### Requirement: Stream Topics for Executor Service
The system SHALL define new stream topics for executor-service messaging.

#### Scenario: Order execution results topic
- **WHEN** executor-service publishes execution results
- **THEN** it SHALL use `StreamTopic.ORDER_EXECUTION_RESULTS = 'order-execution-results'`
- **AND** the topic SHALL be consumed by trade-manager

#### Scenario: Price updates topic
- **WHEN** executor-service publishes live prices
- **THEN** it SHALL use `StreamTopic.PRICE_UPDATES = 'price-updates'`
- **AND** the topic SHALL be consumed by trade-manager

#### Scenario: Per-account order streams
- **WHEN** trade-manager publishes order execution requests
- **THEN** it SHALL use per-account stream pattern: `stream:trade:account:{accountId}`
- **AND** executor-service SHALL consume from these dynamic streams
- **AND** each account's messages SHALL be processed in sequence
- **AND** different accounts SHALL be processed in parallel
- **AND** this pattern SHALL maintain ordering guarantees per account (MVP constraint: Redis Streams lack partition grouping)

### Requirement: Account Model Extension for Broker Configuration
The Account model SHALL store broker connection configuration for executor-service.

#### Scenario: BrokerConfig interface
- **WHEN** defining broker configuration
- **THEN** a `BrokerConfig` interface SHALL be created with fields:
  - `exchangeCode`: 'binanceusdm' | 'oanda' | 'xm' | 'exness'
  - `apiKey`: string
  - `apiSecret?`: string (Optional, for exchanges requiring it)
  - `isSandbox?`: boolean (For testing)
  - `oandaAccountId?`: string (Oanda-specific)
  - `serverUrl?`: string (For MT5/web terminal brokers)
  - `loginId?`: string (For MT5/web terminal brokers)

#### Scenario: Account model extension
- **WHEN** the Account model is extended
- **THEN** it SHALL include an optional `brokerConfig?: BrokerConfig` field
- **AND** JSDoc SHALL explain this field stores encrypted broker credentials for executor-service
- **AND** the `BrokerConfig` interface SHALL be exported from `@dal`

### Requirement: Executor Service Dependencies
The executor-service SHALL declare and use appropriate dependencies.

#### Scenario: Required dependencies
- **WHEN** executor-service is implemented
- **THEN** it SHALL depend on:
  - `@telegram-trading-bot-mini/dal` - For Account and Order repositories
  - `@telegram-trading-bot-mini/shared/utils` - For Redis Stream, logging, config
  - `ccxt` - For crypto exchange integrations
  - `@sentry/node` - For error capture
- **AND** all shared dependencies SHALL use workspace references

#### Scenario: IoC container
- **WHEN** executor-service initializes
- **THEN** a `createContainer` function SHALL wire up:
  - `logger`: LoggerInstance
  - `streamPublisher`: RedisStreamPublisher
  - `errorCapture`: IErrorCapture (Sentry or NoOp based on SENTRY_DSN)
  - `accountRepository`: AccountRepository
  - `brokerFactory`: BrokerAdapterFactory
  - `orderExecutor`: OrderExecutorService
  - `priceFeed`: PriceFeedService
- **AND** container SHALL be used for dependency injection throughout the service

### Requirement: Executor Service Observability
The executor-service SHALL implement observability following the observability-monitoring spec.

#### Scenario: Structured logging
- **WHEN** executor-service logs events
- **THEN** it SHALL use the shared logger from `@telegram-trading-bot-mini/shared/utils`
- **AND** logs SHALL include `traceToken` for distributed tracing
- **AND** logs SHALL be structured with relevant context (accountId, orderId, symbol)

#### Scenario: Error capture
- **WHEN** executor-service encounters errors
- **THEN** it SHALL capture exceptions using Sentry (if SENTRY_DSN configured)
- **AND** critical errors SHALL include full context (order details, broker state)
- **AND** errors SHALL be captured but not thrown for execution failures (publish error result instead)

#### Scenario: Custom metrics
- **WHEN** executor-service processes orders
- **THEN** it SHALL emit Sentry metrics:
  - `executor.order.submitted` (increment)
  - `executor.order.success` (increment)
  - `executor.order.failed` (increment with errorCode tag)
  - `executor.order.latency` (timing in ms)
  - `executor.price.fetched` (increment)
  - `executor.price.fetch_latency` (timing in ms)
  - `executor.broker.healthy` (gauge)
  - `executor.broker.unhealthy` (gauge)

### Requirement: MVP Deployment Constraints
The executor-service deployment SHALL follow MVP constraints for single-instance operation.

#### Scenario: Single instance requirement
- **WHEN** deploying executor-service in MVP
- **THEN** it SHALL run as exactly one instance
- **AND** PM2 SHALL be configured with `instances: 1, exec_mode: 'fork'`
- **AND** this constraint SHALL be documented as necessary because:
  - Per-account streams don't require multiple consumer instances yet
  - Broker adapter state (connection pooling) is simpler with single instance
  - Future scaling will use consumer groups per account

#### Scenario: Graceful shutdown
- **WHEN** executor-service receives SIGTERM or SIGINT
- **THEN** it SHALL:
  - Stop consuming new messages
  - Close all broker adapters
  - Close Redis Stream publisher
  - Exit cleanly with code 0
- **AND** in-flight orders SHALL complete before shutdown (or timeout after 30s)

