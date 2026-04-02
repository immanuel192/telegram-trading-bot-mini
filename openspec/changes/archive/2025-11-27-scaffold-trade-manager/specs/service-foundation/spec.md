## ADDED Requirements

### Requirement: Trade Manager Service Structure
The system SHALL provide a trade-manager service following the established n-tier architecture pattern.

#### Scenario: Service directory structure
- **WHEN** the trade-manager service is created
- **THEN** it SHALL include the following structure:
  - `src/config.ts`: Service-specific configuration
  - `src/logger.ts`: Service-specific logger instance
  - `src/sentry.ts`: Sentry error tracking initialization
  - `src/container.ts`: Dependency injection container
  - `src/main.ts`: Application entry point
  - `src/server.ts`: Server wiring and lifecycle management
  - `src/servers/`: Server implementations (HTTP)
  - `src/services/`: Business logic services
  - `src/events/`: Event handlers
  - `src/jobs/`: Job scheduling components
  - `src/errors/`: Custom error classes
  - `src/interfaces/`: Type definitions

#### Scenario: Configuration requirements
- **WHEN** configuring the trade-manager service
- **THEN** the config SHALL extend BaseConfig and include:
  - `PORT`: HTTP server port (default: 9003, to avoid conflicts with telegram-service:9001 and interpret-service:9002)
  - `REDIS_URL`: Redis connection URL
  - `REDIS_TOKEN`: Redis authentication token
  - `PUSHSAFER_API_KEY`: PushSafer API key for notifications
  - `SENTRY_DSN`: Sentry DSN for error tracking
  - `MONGODB_URI`: MongoDB connection string
  - `MONGODB_DBNAME`: MongoDB database name
  - All base configuration fields (APP_NAME, LOG_LEVEL, NODE_ENV)

#### Scenario: Service mirrors telegram-service pattern
- **WHEN** implementing the trade-manager structure
- **THEN** it SHALL follow the same patterns as telegram-service:
  - main.ts delegates to server.ts
  - server.ts handles wiring and lifecycle
  - container.ts manages dependency injection
  - Graceful shutdown on SIGTERM and SIGINT

### Requirement: Trade Manager HTTP Server
The trade-manager service SHALL provide an HTTP server for health checks and monitoring.

#### Scenario: Health check endpoint
- **WHEN** the HTTP server is running
- **THEN** it SHALL expose a GET /health endpoint
- **AND** the endpoint SHALL return 200 OK when service is healthy

#### Scenario: Server lifecycle
- **WHEN** starting the service
- **THEN** the HTTP server SHALL start after all dependencies are initialized
- **WHEN** stopping the service
- **THEN** the HTTP server SHALL stop gracefully before closing dependencies

### Requirement: Trade Manager Testing Infrastructure
The trade-manager service SHALL have comprehensive testing infrastructure.

#### Scenario: Test directory structure
- **WHEN** setting up tests
- **THEN** the test directory SHALL include:
  - `test/unit/`: Unit tests
  - `test/integration/`: Integration tests
  - `test/setup.ts`: Jest global setup
  - `test/utils/`: Test utilities

#### Scenario: Bootstrap integration test
- **WHEN** running integration tests
- **THEN** there SHALL be a test verifying:
  - The service starts successfully
  - All dependencies initialize correctly
  - The HTTP server responds to health checks
  - The service shuts down gracefully

#### Scenario: Test configuration
- **WHEN** running tests
- **THEN** tests SHALL use Docker Compose for dependencies (MongoDB, Redis)
- **AND** tests SHALL use shared test utilities from `libs/shared/test-utils`

### Requirement: Trade Manager Error Handling
The trade-manager service SHALL implement comprehensive error handling.

#### Scenario: Sentry integration
- **WHEN** an error occurs
- **THEN** it SHALL be captured by Sentry
- **AND** the error SHALL include relevant context (trace tokens, service name)

#### Scenario: Graceful degradation
- **WHEN** a dependency fails
- **THEN** the service SHALL log the error
- **AND** the service SHALL attempt graceful shutdown if critical
- **AND** the service SHALL continue operation if non-critical

### Requirement: Trade Manager Dependency Injection
The trade-manager service SHALL use a container pattern for dependency injection.

#### Scenario: Container registration
- **WHEN** creating the container
- **THEN** it SHALL register:
  - Logger instance
  - Repository instances (from DAL)
  - Service instances (AccountService, JobService)
  - Infrastructure instances (Redis Stream publisher/consumer)

#### Scenario: Service wiring
- **WHEN** wiring services
- **THEN** dependencies SHALL be injected via constructor
- **AND** services SHALL use interfaces rather than concrete classes where applicable
