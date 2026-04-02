# Tasks: Setup Event Infrastructure for Message Interpretation

## Overview
This document outlines the implementation tasks for setting up the event infrastructure needed for message interpretation. Tasks are ordered to minimize dependencies and enable incremental validation.

## Completion Status

**Completed**: All Tasks 1-21 (2025-11-30 to 2025-12-02)
- ✅ Task 1: Command Type Definitions
- ✅ Task 2: TRANSLATE_MESSAGE_REQUEST Message Type
- ✅ Task 3: TRANSLATE_MESSAGE_RESULT Message Type
- ✅ Task 4: SYMBOL_FETCH_LATEST_PRICE Message Type
- ✅ Task 5: Unit Tests for New Message Types (156 tests passing)
- ✅ Task 6: Account Model with Broker Specs
- ✅ Task 7: Integration Tests for Account Broker Specs (84 tests passing)
- ✅ Task 8: Update Interpret-Service Config
- ✅ Task 9: Create Logger File
- ✅ Task 10: Update Sentry Integration
- ✅ Task 11: Create Main Entry Point
- ✅ Task 12: Create Server Wiring
- ✅ Task 13: Create Container
- ✅ Task 14: Create Interfaces
- ✅ Task 15: Add TRANSLATE_REQUESTS Stream Topic
- ✅ Task 16: Create Stream Consumer Infrastructure & Bootstrap Tests (7 tests passing)
- ✅ Task 17: Create Test Setup
- ✅ Task 18: Add Placeholder Directories
- ✅ Task 19: Install Required Packages
- ✅ Task 20: Run Full Test Suite (295+ tests passing across all projects)
- ✅ Task 21: Update Stream Topic Enum

**Final Test Results**:
- shared-utils: 156 tests passing
- dal: 84 tests passing
- interpret-service: 7 tests passing
- trade-manager: 48 tests passing
- telegram-service: All tests passing

## Task List

### Task 1: Add Command Type Definitions to Shared Utils ✅ COMPLETED
**Objective**: Create reusable command enums and interfaces for trading commands

**Steps**:
1. Create `libs/shared/utils/src/interfaces/messages/command.types.ts`
2. Define `CommandAction` enum with values:
   - `LONG = 'long'`
   - `SHORT = 'short'`
   - `UPDATE = 'update'`
   - `CLOSE_PARTIAL = 'close_partial'`
   - `CLOSE_TP = 'close_tp'`
   - `CLOSE_SL = 'close_sl'`
   - `CANCEL = 'cancel'`
   - `CLOSE_ALL = 'close_all'`
3. Define `CommandType` enum with values:
   - `MARKET = 'market'`
   - `LIMIT = 'limit'`
4. Define `ICommand` interface with fields:
   - `action: CommandAction`
   - `type: CommandType`
   - `symbol: string`
   - `orderId?: string`
   - `lotSize?: number`
   - `price?: number`
5. Export all types from `libs/shared/utils/src/interfaces/messages/index.ts`

**Validation**:
- TypeScript compilation succeeds
- Types are importable from `@telegram-trading-bot-mini/shared/utils`

**Dependencies**: None

---

### Task 2: Add TRANSLATE_MESSAGE_REQUEST Message Type ✅ COMPLETED
**Objective**: Define the message type for requesting message translation

**Steps**:
1. Add `TRANSLATE_MESSAGE_REQUEST = 'TRANSLATE_MESSAGE_REQUEST'` to `MessageType` enum in `libs/shared/utils/src/interfaces/messages/message-type.ts`
2. Create `libs/shared/utils/src/interfaces/messages/translate-message-request.ts`
3. Define `Order` interface with fields:
   - `orderId: string`
   - `symbol: string`
   - `entryPrice: number`
   - `tp?: number`
   - `sl?: number`
   - `entryTime?: string` (ISO date time string)
   - `executed: boolean`
4. Define `TranslateMessageRequestPayloadSchema` using TypeBox:
   - `exp: Type.Integer({ minimum: 1 })` (expiry timestamp in ms)
   - `messageId: Type.String({ minLength: 1 })`
   - `channelId: Type.String({ minLength: 1 })`
   - `messageText: Type.String({ minLength: 1 })`
   - `prevMessage: Type.String()`
   - `quotedMessage: Type.Optional(Type.String())`
   - `quotedFirstMessage: Type.Optional(Type.String())`
   - `orders: Type.Array(OrderSchema)` (default empty array)
5. Define `TranslateMessageRequestPayload` type from schema
6. Update `MessageTypePayloadMap` interface to include mapping
7. Export from `libs/shared/utils/src/interfaces/messages/index.ts`

**Validation**:
- TypeScript compilation succeeds
- TypeBox schema validates correct payloads
- TypeBox schema rejects invalid payloads

**Dependencies**: Task 1 (for Order type structure)

---

### Task 3: Add TRANSLATE_MESSAGE_RESULT Message Type ✅ COMPLETED
**Objective**: Define the message type for translation results

**Steps**:
1. Add `TRANSLATE_MESSAGE_RESULT = 'TRANSLATE_MESSAGE_RESULT'` to `MessageType` enum
2. Create `libs/shared/utils/src/interfaces/messages/translate-message-result.ts`
3. Import `CommandAction`, `CommandType`, `ICommand` from `command.types.ts`
4. Define `TranslateMessageResultPayloadSchema` using TypeBox:
   - `messageId: Type.String({ minLength: 1 })`
   - `channelId: Type.String({ minLength: 1 })`
   - `isCommand: Type.Boolean()`
   - `meta: Type.Object({...})` with:
     - `confidence: Type.Number({ minimum: 0, maximum: 1 })`
     - `receivedAt: Type.Integer({ minimum: 1 })`
     - `processedAt: Type.Integer({ minimum: 1 })`
     - `duration: Type.Number({ minimum: 0 })`
   - `commands: Type.Optional(Type.Array(CommandSchema))`
   - `note: Type.Optional(Type.String())`
5. Define `CommandSchema` using TypeBox for `ICommand` interface
6. Define `TranslateMessageResultPayload` type from schema
7. Update `MessageTypePayloadMap` interface to include mapping
8. Export from `libs/shared/utils/src/interfaces/messages/index.ts`

**Validation**:
- TypeScript compilation succeeds
- TypeBox schema validates correct payloads with all command actions
- TypeBox schema validates confidence range (0-1)
- TypeBox schema rejects invalid payloads

**Dependencies**: Task 1 (for command types)

---

### Task 4: Add SYMBOL_FETCH_LATEST_PRICE Message Type ✅ COMPLETED
**Objective**: Define the message type for fetching latest symbol prices

**Steps**:
1. Add `SYMBOL_FETCH_LATEST_PRICE = 'SYMBOL_FETCH_LATEST_PRICE'` to `MessageType` enum
2. Create `libs/shared/utils/src/interfaces/messages/symbol-fetch-latest-price.ts`
3. Define `SymbolFetchLatestPricePayloadSchema` using TypeBox:
   - `symbol: Type.String({ minLength: 1 })`
   - `messageId: Type.String({ minLength: 1 })`
   - `channelId: Type.String({ minLength: 1 })`
4. Define `SymbolFetchLatestPricePayload` type from schema
5. Update `MessageTypePayloadMap` interface to include mapping
6. Export from `libs/shared/utils/src/interfaces/messages/index.ts`

**Validation**:
- TypeScript compilation succeeds
- TypeBox schema validates correct payloads
- TypeBox schema rejects invalid payloads

**Dependencies**: None

---

### Task 5: Add Unit Tests for New Message Types ✅ COMPLETED
**Objective**: Ensure all new message schemas are properly validated

**Steps**:
1. Create `libs/shared/utils/test/unit/translate-message-request.spec.ts`
   - Test valid payload validation
   - Test missing required fields
   - Test invalid field types
   - Test empty orders array
   - Test orders array with multiple orders
   - Test optional fields (quotedMessage, quotedFirstMessage)
2. Create `libs/shared/utils/test/unit/translate-message-result.spec.ts`
   - Test valid payload with commands
   - Test valid payload without commands (isCommand: false)
   - Test all CommandAction enum values
   - Test all CommandType enum values
   - Test confidence range validation (0-1)
   - Test missing required fields
   - Test invalid field types
3. Create `libs/shared/utils/test/unit/symbol-fetch-latest-price.spec.ts`
   - Test valid payload validation
   - Test missing required fields
   - Test invalid field types

**Validation**:
- Run `nx test shared-utils`
- All tests pass
- Coverage includes all new message types

**Dependencies**: Tasks 2, 3, 4

---

### Task 6: Update Account Model with Broker Specs ✅ COMPLETED
**Objective**: Add broker-specific specifications to Account model

**Steps**:
1. Open `libs/dal/src/models/account.model.ts`
2. Define `BrokerSpecs` interface with fields:
   - `lot_size: number` (units per 1 lot)
   - `min_lot: number` (minimum allowed volume)
   - `lot_step: number` (allowed increments)
   - `tick_size: number` (smallest price movement)
   - `tick_value: number` (USD value per tick per 1 lot)
   - `leverage: number`
   - `currency: string` (account currency)
3. Add `brokerSpecs?: BrokerSpecs` to `Account` interface
4. Export `BrokerSpecs` interface
5. Update `libs/dal/src/models/index.ts` to export `BrokerSpecs`

**Validation**:
- TypeScript compilation succeeds
- `BrokerSpecs` type is importable from `@dal`

**Dependencies**: None

---

### Task 7: Add Integration Tests for Account Model with Broker Specs ✅ COMPLETED
**Objective**: Verify broker specs can be stored and retrieved

**Steps**:
1. Open `libs/dal/test/integration/account.repository.spec.ts`
2. Add test case: "should create account with broker specs"
   - Create account with full brokerSpecs object
   - Verify all fields are persisted
3. Add test case: "should update account broker specs"
   - Create account without brokerSpecs
   - Update to add brokerSpecs
   - Verify fields are updated
4. Add test case: "should retrieve account with broker specs"
   - Create account with brokerSpecs
   - Fetch by accountId
   - Verify brokerSpecs fields match
5. Add test case: "should handle account without broker specs"
   - Create account without brokerSpecs
   - Verify brokerSpecs is undefined

**Validation**:
- Run `nx test dal`
- All new tests pass
- Existing tests continue to pass

**Dependencies**: Task 6

---

### Task 8: Update Interpret-Service Config
**Objective**: Add Redis Stream configuration to interpret-service

**Steps**:
1. Open `apps/interpret-service/src/config.ts`
2. Import `StreamConsumerMode` from `@telegram-trading-bot-mini/shared/utils`
3. Add to `InterpretServiceConfig` interface:
   - `REDIS_URL: string`
   - `REDIS_TOKEN: string`
   - `STREAM_CONSUMER_MODE_REQUESTS: StreamConsumerMode`
   - `SENTRY_DSN: string`
4. Add to `defaultConfig`:
   - `REDIS_URL: 'http://localhost:8000'`
   - `REDIS_TOKEN: 'fake-token'`
   - `STREAM_CONSUMER_MODE_REQUESTS: StreamConsumerMode.NEW`
   - `SENTRY_DSN: '<development-sentry-dsn>'`
5. Update `MONGODB_URI` to match project standard: `'mongodb://localhost:27017/?replicaSet=rs0&directConnection=true'`
6. Update `MONGODB_DBNAME` to: `'telegram-trading-bot'` (same DB as other services)

**Validation**:
- TypeScript compilation succeeds
- Config can be imported and used

**Dependencies**: None

---

### Task 9: Create Interpret-Service Interfaces
**Objective**: Define service-specific interfaces for dependency injection

**Steps**:
1. Create `apps/interpret-service/src/interfaces/container.interface.ts`
   - Define `Container` interface with:
     - `logger: LoggerInstance`
     - `publisher: IStreamPublisher`
2. Create `apps/interpret-service/src/interfaces/consumer.interface.ts`
   - Define `ConsumerRegistry` interface with:
     - `[key: string]: IStreamConsumer`
3. Create `apps/interpret-service/src/interfaces/index.ts`
   - Export all interfaces

**Validation**:
- TypeScript compilation succeeds
- Interfaces are importable within interpret-service

**Dependencies**: None

---

### Task 10: Create Interpret-Service Container
**Objective**: Setup IoC container for service dependencies

**Steps**:
1. Create `apps/interpret-service/src/container.ts`
2. Import necessary types from shared-utils and interfaces
3. Define `createContainer` function that accepts `LoggerInstance`
4. Create and return container with:
   - `logger: LoggerInstance` (injected)
   - `publisher: IStreamPublisher` (created with Redis config)
5. Add JSDoc comments explaining purpose

**Validation**:
- TypeScript compilation succeeds
- Container can be created with logger
- Publisher is properly initialized

**Dependencies**: Task 9

---

### Task 11: Create Interpret-Service Event Infrastructure
**Objective**: Setup consumer and publisher registry

**Steps**:
1. Create `apps/interpret-service/src/events/index.ts`
2. Import necessary types and create functions:
   - `createConsumers(logger: LoggerInstance): Promise<ConsumerRegistry>`
   - `startConsumers(consumers: ConsumerRegistry, logger: LoggerInstance): void`
   - `stopConsumers(consumers: ConsumerRegistry, logger: LoggerInstance): Promise<void>`
3. In `createConsumers`:
   - Create `RedisStreamConsumer` instance for TRANSLATE_MESSAGE_REQUEST
   - Return registry with consumer
4. In `startConsumers`:
   - Start each consumer with placeholder handler (just logs and acknowledges)
   - Use consumer group: `interpret-service-requests`
   - Use consumer name: `${config('APP_NAME')}-${process.pid}`
5. In `stopConsumers`:
   - Stop all consumers
   - Close all consumers
   - Log completion
6. Create `apps/interpret-service/src/events/handlers/.gitkeep` (placeholder for future handlers)

**Validation**:
- TypeScript compilation succeeds
- Functions can be imported and called
- No runtime errors during consumer creation

**Dependencies**: Tasks 8, 10

---

### Task 12: Create Interpret-Service Server Wiring
**Objective**: Wire up service lifecycle without HTTP server

**Steps**:
1. Create `apps/interpret-service/src/server.ts`
2. Define `ServerContext` interface with:
   - `container: Container`
   - `consumers: ConsumerRegistry`
3. Implement `startServer(): Promise<ServerContext>`:
   - Initialize Sentry
   - Connect to Database
   - Create container with logger
   - Create and start stream consumers
   - Return context
4. Implement `stopServer(context: ServerContext): Promise<void>`:
   - Stop stream consumers
   - Close stream publisher
   - Close database connection
   - Log each step
5. Add comprehensive JSDoc comments

**Validation**:
- TypeScript compilation succeeds
- Server can start and stop without errors
- All resources are properly cleaned up

**Dependencies**: Tasks 10, 11

---

### Task 13: Update Interpret-Service Main Entry Point
**Objective**: Update main.ts to use new server wiring

**Steps**:
1. Open `apps/interpret-service/src/main.ts`
2. Replace placeholder code with proper server lifecycle:
   - Import `startServer` and `stopServer` from `./server`
   - Create `main()` async function
   - Call `startServer()` and store context
   - Setup graceful shutdown handlers (SIGTERM, SIGINT)
   - In shutdown: call `stopServer(context)` then `process.exit(0)`
   - Catch errors and exit with code 1
3. Call `main()` at bottom of file

**Validation**:
- TypeScript compilation succeeds
- Service can start with `nx serve interpret-service`
- Service logs startup messages
- Service responds to SIGTERM/SIGINT gracefully

**Dependencies**: Task 12

---

### Task 14: Create Interpret-Service Logger
**Objective**: Setup service-specific logger instance

**Steps**:
1. Create `apps/interpret-service/src/logger.ts`
2. Import `createLogger` from shared-utils
3. Import `config` from `./config`
4. Export logger instance: `export const logger = createLogger('interpret-service', config);`
5. Add JSDoc comment explaining purpose

**Validation**:
- TypeScript compilation succeeds
- Logger can be imported and used
- Logs include service name

**Dependencies**: Task 8

---

### Task 15: Update Interpret-Service Sentry Integration
**Objective**: Ensure Sentry is properly configured for error tracking

**Steps**:
1. Open `apps/interpret-service/src/sentry.ts`
2. Verify it follows the same pattern as `apps/trade-manager/src/sentry.ts`
3. Update if needed to include:
   - Import config and get SENTRY_DSN
   - Initialize with proper service name
   - Set environment from NODE_ENV
   - Enable tracing
4. Export `initSentry()` function

**Validation**:
- TypeScript compilation succeeds
- Sentry initializes without errors
- Test error capture works (manual test)

**Dependencies**: Task 8

---

### Task 16: Create Interpret-Service Bootstrap Integration Test
**Objective**: Verify service can start and stop cleanly

**Steps**:
1. Create `apps/interpret-service/test/integration/bootstrap.spec.ts`
2. Create test suite: "Interpret Service Bootstrap"
3. Add test case: "should start and stop server successfully"
   - Call `startServer()`
   - Verify context is returned
   - Verify logger exists
   - Verify consumers exist
   - Call `stopServer(context)`
   - Verify no errors thrown
4. Add test case: "should connect to database"
   - Start server
   - Verify database connection (query a collection)
   - Stop server
5. Add test case: "should create stream consumers"
   - Start server
   - Verify consumers registry is not empty
   - Stop server

**Validation**:
- Run `nx test interpret-service`
- All tests pass
- No hanging connections or processes

**Dependencies**: Tasks 12, 13, 14

---

### Task 17: Create Interpret-Service Test Setup
**Objective**: Configure Jest for integration tests

**Steps**:
1. Create `apps/interpret-service/test/setup.ts`
2. Follow pattern from `apps/trade-manager/test/setup.ts`:
   - Set test timeout
   - Setup global test utilities
   - Configure test database connection
3. Update `apps/interpret-service/jest.config.ts` if needed:
   - Point to setup file
   - Configure test environment
   - Set coverage thresholds

**Validation**:
- Jest configuration is valid
- Tests can run with proper setup
- Test utilities are available

**Dependencies**: None

---

### Task 18: Add Services and Jobs Placeholder Directories
**Objective**: Create directory structure for future development

**Steps**:
1. Create `apps/interpret-service/src/services/.gitkeep`
2. Create `apps/interpret-service/test/unit/.gitkeep`
3. Ensure directory structure mirrors trade-manager for consistency

**Validation**:
- Directories exist
- Git tracks the structure

**Dependencies**: None

---

### Task 19: Install Required Packages
**Objective**: Ensure all dependencies are installed at latest versions

**Steps**:
1. Check if any new packages are needed for interpret-service
2. Run `npm install` at root to ensure all dependencies are up to date
3. Verify `@sinclair/typebox` is available (for TypeBox schemas)
4. Verify `@upstash/redis` is available (for Redis Streams)

**Validation**:
- `npm install` completes without errors
- All packages are at latest compatible versions
- TypeScript compilation succeeds across all projects

**Dependencies**: None

---

### Task 20: Run Full Test Suite
**Objective**: Verify all changes work together

**Steps**:
1. Run `nx test shared-utils` - verify message type tests pass
2. Run `nx test dal` - verify account model tests pass
3. Run `nx test interpret-service` - verify bootstrap tests pass
4. Run `nx run-many --target=test --all` - verify no regressions
5. Fix any failing tests

**Validation**:
- All test suites pass
- No TypeScript compilation errors
- No lint errors

**Dependencies**: All previous tasks

---

### Task 21: Update Stream Topic Enum (Future Preparation)
**Objective**: Add new stream topics to StreamTopic enum for future use

**Steps**:
1. Open `libs/shared/utils/src/stream/stream-interfaces.ts`
2. Add to `StreamTopic` enum:
   - `INTERPRET_REQUESTS = 'interpret-requests'`
   - `INTERPRET_RESULTS = 'interpret-results'`
   - `PRICE_REQUESTS = 'price-requests'`
3. Add JSDoc comments explaining each topic's purpose

**Validation**:
- TypeScript compilation succeeds
- New topics are available for use
- Existing code continues to work

**Dependencies**: None

---

## Task Dependencies Graph

```
Task 1 (Command Types)
  ├─→ Task 2 (TRANSLATE_MESSAGE_REQUEST)
  │     └─→ Task 5 (Unit Tests)
  └─→ Task 3 (TRANSLATE_MESSAGE_RESULT)
        └─→ Task 5 (Unit Tests)

Task 4 (SYMBOL_FETCH_LATEST_PRICE)
  └─→ Task 5 (Unit Tests)

Task 6 (Account Model)
  └─→ Task 7 (Account Integration Tests)

Task 8 (Config)
  ├─→ Task 11 (Event Infrastructure)
  ├─→ Task 14 (Logger)
  └─→ Task 15 (Sentry)

Task 9 (Interfaces)
  └─→ Task 10 (Container)
        └─→ Task 11 (Event Infrastructure)
              └─→ Task 12 (Server Wiring)
                    ├─→ Task 13 (Main Entry)
                    └─→ Task 16 (Bootstrap Test)

Task 17 (Test Setup) → Task 16 (Bootstrap Test)

Task 18 (Placeholder Dirs) - Independent

Task 19 (Install Packages) - Independent

Task 20 (Full Test Suite) - Depends on ALL

Task 21 (Stream Topics) - Independent
```

## Validation Checklist

After completing all tasks, verify:

- [x] All TypeScript compilation succeeds (`nx run-many --target=build --all`)
- [x] All tests pass (`nx run-many --target=test --all`)
- [x] No lint errors (`nx run-many --target=lint --all`)
- [x] Message schemas validate correctly (unit tests)
- [x] Account model handles brokerSpecs (integration tests)
- [x] Interpret-service starts and stops cleanly (integration test)
- [x] Stream consumers are created successfully
- [x] Database connections are properly managed
- [x] Sentry integration works
- [x] Logger outputs correctly
- [x] No hanging processes after shutdown
- [x] Git status is clean (no untracked files except .env.local)

## Notes

- **No actual message processing**: This change only sets up infrastructure. Actual LLM integration and message handling will be in a future change.
- **No HTTP server**: interpret-service is purely event-driven, no REST API needed.
- **No jobs**: Unlike trade-manager, interpret-service has no periodic tasks.
- **Shared database**: All services use the same MongoDB database (MVP simplification).
- **Test isolation**: Integration tests should clean up after themselves (delete test data).
