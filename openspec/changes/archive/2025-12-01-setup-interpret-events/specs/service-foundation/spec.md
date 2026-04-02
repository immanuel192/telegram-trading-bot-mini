# service-foundation Specification Delta

## ADDED Requirements

### Requirement: Interpret-Service Infrastructure
The interpret-service SHALL have complete infrastructure for event-driven message processing without HTTP server or job scheduling.

#### Scenario: Service configuration
- **WHEN** configuring interpret-service
- **THEN** the config SHALL include:
  - `APP_NAME: 'interpret-service'`
  - `LOG_LEVEL`: Configurable log level
  - `NODE_ENV`: Environment (development/production)
  - `MONGODB_URI`: Database connection string
  - `MONGODB_DBNAME: 'telegram-trading-bot'` (shared database)
  - `PORT: 9002` (for future health checks)
  - `LLM_API_KEY`: LLM provider API key
  - `LLM_MODEL`: LLM model identifier
  - `LLM_PROVIDER`: LLM provider name
  - `REDIS_URL`: Redis connection URL
  - `REDIS_TOKEN`: Redis authentication token
  - `STREAM_CONSUMER_MODE_REQUESTS`: Consumer mode for requests stream
  - `SENTRY_DSN`: Sentry error tracking DSN

#### Scenario: Service logger
- **WHEN** logging in interpret-service
- **THEN** the logger SHALL:
  - Use service name 'interpret-service'
  - Include trace tokens in log context
  - Follow shared logger patterns
  - Support all log levels (debug, info, warn, error)

#### Scenario: Service container
- **WHEN** creating service container
- **THEN** it SHALL include:
  - `logger: LoggerInstance` (injected)
  - `publisher: IStreamPublisher` (Redis Stream publisher)
- **AND** it SHALL NOT include:
  - HTTP server instance
  - Job manager or job service

#### Scenario: Stream consumer setup
- **WHEN** setting up stream consumers
- **THEN** the service SHALL:
  - Create consumer for TRANSLATE_MESSAGE_REQUEST
  - Use consumer group: `interpret-service-requests`
  - Use consumer name: `${APP_NAME}-${process.pid}`
  - Configure consumer mode from environment
  - Register placeholder handler (acknowledge only)

#### Scenario: Stream publisher setup
- **WHEN** setting up stream publisher
- **THEN** the service SHALL:
  - Create RedisStreamPublisher instance
  - Configure with REDIS_URL and REDIS_TOKEN
  - Share publisher across all handlers
  - Use for publishing TRANSLATE_MESSAGE_RESULT

### Requirement: Service Lifecycle Management
The interpret-service SHALL support graceful startup and shutdown.

#### Scenario: Service startup sequence
- **WHEN** starting interpret-service
- **THEN** the sequence SHALL be:
  1. Initialize Sentry for error tracking
  2. Connect to MongoDB database
  3. Create service container with logger
  4. Create stream publisher
  5. Create and start stream consumers
  6. Log successful startup

#### Scenario: Service shutdown sequence
- **WHEN** stopping interpret-service
- **THEN** the sequence SHALL be:
  1. Stop all stream consumers (stop accepting new messages)
  2. Wait for in-flight messages to complete
  3. Close stream publisher connection
  4. Close database connection
  5. Log successful shutdown
  6. Exit process with code 0

#### Scenario: Graceful shutdown signals
- **WHEN** receiving SIGTERM or SIGINT
- **THEN** the service SHALL:
  - Trigger shutdown sequence
  - Wait for all resources to clean up
  - Exit gracefully without errors
  - Not leave hanging connections

#### Scenario: Startup failure handling
- **WHEN** startup fails at any step
- **THEN** the service SHALL:
  - Log the error with full context
  - Capture error in Sentry
  - Exit process with code 1
  - Not leave partial initialization

### Requirement: Error Tracking Integration
The interpret-service SHALL integrate with Sentry for error tracking and monitoring.

#### Scenario: Sentry initialization
- **WHEN** initializing Sentry
- **THEN** it SHALL:
  - Use SENTRY_DSN from configuration
  - Set service name as 'interpret-service'
  - Set environment from NODE_ENV
  - Enable tracing for performance monitoring
  - Scrub sensitive data (API keys, tokens)

#### Scenario: Error capture
- **WHEN** an error occurs in the service
- **THEN** Sentry SHALL:
  - Capture the error with full stack trace
  - Include service context (name, version)
  - Include message context (messageId, channelId)
  - Include trace token for correlation
  - Not expose sensitive data

### Requirement: Database Connection Management
The interpret-service SHALL share database connection with other services.

#### Scenario: Database configuration
- **WHEN** connecting to database
- **THEN** the service SHALL:
  - Use shared database name: 'telegram-trading-bot'
  - Use connection string from MONGODB_URI
  - Share connection pool with other services (same DB)
  - Initialize DAL layer properly

#### Scenario: Database connection lifecycle
- **WHEN** managing database connection
- **THEN** the service SHALL:
  - Connect during startup
  - Reuse connection for all operations
  - Close connection during shutdown
  - Handle connection errors gracefully

### Requirement: Service Directory Structure
The interpret-service SHALL follow consistent directory structure with other services.

#### Scenario: Source directory structure
- **WHEN** organizing source code
- **THEN** the structure SHALL include:
  - `src/config.ts`: Service configuration
  - `src/logger.ts`: Service logger instance
  - `src/sentry.ts`: Sentry initialization
  - `src/main.ts`: Entry point
  - `src/server.ts`: Service wiring and lifecycle
  - `src/container.ts`: IoC container
  - `src/events/`: Event handlers and consumer setup
  - `src/events/handlers/`: Message handler implementations
  - `src/services/`: Business logic services
  - `src/interfaces/`: TypeScript interfaces

#### Scenario: Test directory structure
- **WHEN** organizing tests
- **THEN** the structure SHALL include:
  - `test/integration/`: Integration tests
  - `test/unit/`: Unit tests
  - `test/setup.ts`: Jest global setup
  - `test/utils/`: Test utilities (if needed)

### Requirement: No HTTP Server
The interpret-service SHALL NOT include an HTTP server in initial implementation.

#### Scenario: Event-driven only
- **WHEN** implementing interpret-service
- **THEN** it SHALL:
  - NOT create Fastify or Express server
  - NOT expose HTTP endpoints
  - NOT listen on PORT (reserved for future)
  - Only consume and publish to Redis Streams

#### Scenario: Future HTTP server
- **WHEN** adding HTTP server in future
- **THEN** it SHALL:
  - Use PORT from configuration (9002)
  - Provide health check endpoint
  - Provide metrics endpoint
  - Not affect stream processing

### Requirement: No Job Scheduling
The interpret-service SHALL NOT include job scheduling infrastructure.

#### Scenario: No periodic tasks
- **WHEN** implementing interpret-service
- **THEN** it SHALL:
  - NOT create job manager
  - NOT create job service
  - NOT define any job classes
  - Only process messages on-demand

#### Scenario: Event-driven processing
- **WHEN** processing messages
- **THEN** the service SHALL:
  - Only process when messages arrive in stream
  - Not run any background jobs
  - Not have scheduled tasks
  - Be purely reactive

## Testing Requirements

### Requirement: Service Bootstrap Testing
The interpret-service SHALL have integration tests for service lifecycle.

#### Scenario: Bootstrap test
- **WHEN** testing service startup
- **THEN** the test SHALL:
  - Call startServer()
  - Verify context is returned
  - Verify logger exists
  - Verify consumers exist
  - Verify publisher exists
  - Call stopServer()
  - Verify no errors thrown

#### Scenario: Database connection test
- **WHEN** testing database integration
- **THEN** the test SHALL:
  - Start server
  - Verify database connection works
  - Query a collection (e.g., accounts)
  - Stop server
  - Verify connection closed

#### Scenario: Stream consumer test
- **WHEN** testing stream consumers
- **THEN** the test SHALL:
  - Start server
  - Verify consumers registry is not empty
  - Verify consumer for TRANSLATE_MESSAGE_REQUEST exists
  - Stop server
  - Verify consumers stopped

#### Scenario: Graceful shutdown test
- **WHEN** testing shutdown
- **THEN** the test SHALL:
  - Start server
  - Trigger shutdown
  - Verify all resources cleaned up
  - Verify no hanging connections
  - Verify process can exit cleanly

## Configuration Requirements

### Requirement: Environment Variable Support
The interpret-service SHALL support configuration via environment variables.

#### Scenario: Development defaults
- **WHEN** running in development
- **THEN** default config SHALL provide:
  - Local MongoDB connection
  - Local Redis connection (Upstash emulator)
  - Fake tokens for local development
  - Debug log level
  - Development Sentry DSN

#### Scenario: Production overrides
- **WHEN** running in production
- **THEN** environment variables SHALL override:
  - MONGODB_URI: Production database
  - REDIS_URL: Production Redis (Upstash)
  - REDIS_TOKEN: Production token
  - LLM_API_KEY: Production API key
  - SENTRY_DSN: Production Sentry
  - LOG_LEVEL: Production log level (info/warn)

#### Scenario: Required vs optional config
- **WHEN** validating configuration
- **THEN** required fields SHALL include:
  - MONGODB_URI
  - MONGODB_DBNAME
  - REDIS_URL
  - LLM_API_KEY
- **AND** optional fields SHALL include:
  - REDIS_TOKEN (not needed for local Redis)
  - SENTRY_DSN (can be empty for local dev)

## Cross-References

- **Related to**: `message-events` (consumes TRANSLATE_MESSAGE_REQUEST, publishes TRANSLATE_MESSAGE_RESULT)
- **Related to**: `stream-consumer` (uses existing Redis Stream patterns)
- **Mirrors**: `trade-manager` service structure (consistency)
- **Depends on**: Existing DAL layer and shared utilities
