# stream-publisher Specification

## Purpose
TBD - created by archiving change setup-service-publishers. Update Purpose after archive.
## Requirements
### Requirement: Service Publisher Infrastructure
Each service that needs to publish messages to Redis Streams SHALL initialize a `RedisStreamPublisher` instance in its dependency injection container.

#### Scenario: Trade-manager publisher initialization
- **WHEN** the trade-manager service starts
- **THEN** it SHALL create a `RedisStreamPublisher` instance
- **AND** configure it with `REDIS_URL` and `REDIS_TOKEN` from config
- **AND** make the publisher available through the container interface

#### Scenario: Interpret-service publisher availability
- **WHEN** the interpret-service container is created
- **THEN** the `streamPublisher` instance SHALL be accessible via the container
- **AND** it SHALL be properly configured with Redis credentials

#### Scenario: Publisher configuration
- **WHEN** initializing a `RedisStreamPublisher`
- **THEN** it SHALL use the service's configuration for:
  - `REDIS_URL`: Redis connection URL
  - `REDIS_TOKEN`: Redis authentication token

### Requirement: Container Interface Updates
Services with publishers SHALL expose the `streamPublisher` instance through their container interface.

#### Scenario: Trade-manager container interface
- **WHEN** accessing the trade-manager container
- **THEN** it SHALL provide a `streamPublisher` property of type `RedisStreamPublisher`
- **AND** the property SHALL be available alongside other service dependencies

#### Scenario: Interpret-service container interface
- **WHEN** accessing the interpret-service container
- **THEN** it SHALL provide a `streamPublisher` property of type `RedisStreamPublisher`
- **AND** the property SHALL match the telegram-service pattern

### Requirement: Publisher Testing
Each service with a publisher SHALL have tests verifying publisher initialization and connectivity.

#### Scenario: Unit test for publisher creation
- **WHEN** running unit tests for the container
- **THEN** tests SHALL verify that `streamPublisher` is created
- **AND** verify it is a `RedisStreamPublisher` instance
- **AND** verify it is included in the returned container

#### Scenario: Integration test for publisher connectivity
- **WHEN** running integration tests
- **THEN** tests SHALL verify the publisher can connect to Redis
- **AND** verify it can publish a test message
- **AND** verify proper cleanup after tests

### Requirement: Message Type Documentation
Services SHALL document which message types they are responsible for publishing.

#### Scenario: Trade-manager message types
- **WHEN** reviewing trade-manager publisher setup
- **THEN** documentation SHALL indicate it will publish:
  - `TRANSLATE_MESSAGE_REQUEST`: Requests to interpret-service for message translation
  - `SYMBOL_FETCH_LATEST_PRICE`: Requests to trade-executor for price fetching

#### Scenario: Interpret-service message types
- **WHEN** reviewing interpret-service publisher setup
- **THEN** documentation SHALL indicate it will publish:
  - `TRANSLATE_MESSAGE_RESULT`: Translation results back to trade-manager

### Requirement: Service Single Instance Constraint (MVP)
For the MVP version, both trade-manager and interpret-service SHALL run as single instances due to Redis Streams' lack of partition-based message grouping.

#### Scenario: Trade-manager container documentation
- **WHEN** reviewing `apps/trade-manager/src/container.ts`
- **THEN** it SHALL include explicit comments documenting:
  - Redis Streams lack Kafka-style partition grouping capabilities
  - Sequential message processing requires exactly one service instance
  - This is an MVP limitation to be addressed in future iterations

#### Scenario: Interpret-service container documentation
- **WHEN** reviewing `apps/interpret-service/src/container.ts`
- **THEN** it SHALL include explicit comments documenting:
  - Redis Streams lack Kafka-style partition grouping capabilities
  - Sequential message processing requires exactly one service instance
  - This is an MVP limitation to be addressed in future iterations

#### Scenario: Trade-manager PM2 configuration validation
- **WHEN** reviewing `infra/pm2/trade-manager.config.js`
- **THEN** it SHALL have `instances: 1` configured
- **AND** include a comment explaining the single-instance requirement
- **AND** specify `exec_mode: "fork"` (not cluster mode)

#### Scenario: Interpret-service PM2 configuration validation
- **WHEN** reviewing `infra/pm2/interpret-service.config.js`
- **THEN** it SHALL have `instances: 1` configured
- **AND** include a comment explaining the single-instance requirement
- **AND** specify `exec_mode: "fork"` (not cluster mode)

#### Scenario: Deployment constraint
- **WHEN** deploying trade-manager or interpret-service to production
- **THEN** exactly one instance of each service SHALL be running
- **AND** horizontal scaling SHALL NOT be enabled for these services
- **AND** this constraint SHALL be documented for operators

### Requirement: Interpret-Service Gemini Configuration
The interpret-service SHALL support Gemini-specific configuration for LLM integration.

#### Scenario: Gemini environment variables
- **WHEN** configuring interpret-service for Gemini
- **THEN** the following environment variables SHALL be supported:
  - `GEMINI_API_KEY`: API authentication key
  - `GEMINI_NAME`: Service name identifier
  - `GEMINI_PROJECT_NAME`: Full project name (format: `projects/{project-id}`)
  - `GEMINI_PROJECT_NUMBER`: Numeric project identifier

#### Scenario: Configuration interface
- **WHEN** accessing interpret-service config
- **THEN** the `InterpretServiceConfig` interface SHALL include Gemini-specific fields
- **AND** default values SHALL be provided for development
- **AND** all fields SHALL be typed appropriately

#### Scenario: Environment sample file
- **WHEN** setting up interpret-service for the first time
- **THEN** a `.env.sample` file SHALL exist at `apps/interpret-service/.env.sample`
- **AND** it SHALL include all required environment variables
- **AND** each variable SHALL have an example value
- **AND** comments SHALL explain each variable's purpose

#### Scenario: Configuration testing
- **WHEN** running unit tests for interpret-service config
- **THEN** tests SHALL verify all Gemini configuration keys are accessible
- **AND** tests SHALL verify default values are set correctly
- **AND** tests SHALL verify environment variable overrides work

