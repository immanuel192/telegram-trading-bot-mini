# Tasks: Translate Message Flow

## Infrastructure Setup

### Task 0.1: Configure MongoDB as Single-Node Replica Set
**Spec**: `transaction-utility`

MongoDB transactions require a replica set. Update Docker Compose to run MongoDB in replica set mode.

- [x] Open `docker-compose.yml`
- [x] Update the `mongo` service configuration:
  - Add `command: ["--replSet", "rs0", "--bind_ip_all"]`
  - Add healthcheck section to auto-initialize replica set:
    ```yaml
    healthcheck:
      test: echo "try { rs.status() } catch (err) { rs.initiate({_id:'rs0',members:[{_id:0,host:'mongo:27017'}]}) }" | mongosh -u root -p password --authenticationDatabase admin
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s
    ```
- [x] Save the file

**Validation**: MongoDB starts in replica set mode with auto-initialization

---

### Task 0.2: Update MongoDB Connection Strings
**Spec**: `transaction-utility`

Update all MongoDB connection strings to explicitly specify the replica set name.

- [x] Update `libs/shared/utils/src/config.ts`:
  - Change `MONGODB_URI` default from `'mongodb://localhost:27017/'` to `'mongodb://localhost:27017/?replicaSet=rs0&directConnection=true'`
- [x] Update `apps/telegram-service/src/config.ts`:
  - Change `MONGODB_URI` default to `'mongodb://localhost:27017/?replicaSet=rs0&directConnection=true'`
- [x] Update `apps/interpret-service/src/config.ts`:
  - Change `MONGODB_URI` default to `'mongodb://localhost:27017/?replicaSet=rs0&directConnection=true'`
- [x] Update `apps/trade-manager/src/config.ts`:
  - Change `MONGODB_URI` default to `'mongodb://localhost:27017/?replicaSet=rs0&directConnection=true'`
- [x] Update `.env.sample` files in all apps:
  - `apps/telegram-service/.env.sample`
  - `apps/interpret-service/.env.sample`
  - `apps/trade-manager/.env.sample`
  - Change `MONGODB_URI` to include `?replicaSet=rs0`
- [x] Update `README.md` example connection string to include `?replicaSet=rs0`

**Validation**: All connection strings include replica set parameter

---

### Task 0.3: Restart Local Development Environment
**Spec**: `transaction-utility`

Recreate Docker containers with the new MongoDB replica set configuration.

- [x] Stop and remove existing containers and volumes:
  ```bash
  docker compose down -v
  ```
- [x] Start containers with new configuration:
  ```bash
  docker compose up -d
  ```
- [x] Wait for MongoDB healthcheck to pass (check with `docker compose ps`)
- [x] Verify replica set is initialized:
  ```bash
  docker exec -it $(docker compose ps -q mongo) mongosh -u root -p password --authenticationDatabase admin --eval "rs.status()"
  ```
- [x] Confirm output shows `"ok": 1` and one member in the replica set

**Validation**: MongoDB replica set is running and initialized successfully

---

## libs/dal

### Task 1: Add Translation History Types to MessageHistoryTypeEnum
**Spec**: `telegram-message-model`

- [x] Open `libs/dal/src/models/telegram-message.model.ts`
- [x] Add `TRANSLATE_MESSAGE = 'translate-message'` to `MessageHistoryTypeEnum`
- [x] Add `TRANSLATE_RESULT = 'translate-result'` to `MessageHistoryTypeEnum`
- [x] Verify enum exports correctly

**Validation**: Enum includes 4 values (NEW_MESSAGE, EDIT_MESSAGE, TRANSLATE_MESSAGE, TRANSLATE_RESULT)

---

### Task 2: Create MongoDB Transaction Utility
**Spec**: `transaction-utility`

- [x] Create `libs/dal/src/infra/transaction.ts`
- [x] Import `ClientSession` from `mongodb`
- [x] Import `mongoDb` from `./db`
- [x] Implement `withMongoTransaction<T>` function:
  - Accept callback: `(session: ClientSession) => Promise<T>`
  - Create session via `mongoDb.client.startSession()`
  - Use `session.withTransaction()` to execute callback
  - Return operation result
  - Ensure session is ended in finally block
- [x] Export `withMongoTransaction` function
- [x] Add JSDoc comments explaining usage

**Validation**: Function compiles and exports correctly

---

### Task 3: Update DAL Index Exports
**Spec**: `transaction-utility`

- [x] Open `libs/dal/src/index.ts`
- [x] Add export: `export { withMongoTransaction } from './infra/transaction';`
- [x] Verify export is accessible from `@dal`

**Validation**: Transaction utility is exported from DAL package

---

### Task 4: Update TelegramMessageRepository for Transactions
**Spec**: `transaction-utility`

- [x] Open `libs/dal/src/repositories/telegram-message.repository.ts`
- [x] Update `addHistoryEntry` method signature to accept optional `ClientSession`:
  ```typescript
  async addHistoryEntry(
    channelId: string,
    messageId: number,
    historyEntry: TelegramMessageHistory,
    session?: ClientSession
  ): Promise<boolean>
  ```
- [x] Pass session to `updateOne` if provided: `updateOne(filter, update, { session })`
- [x] Maintain backward compatibility (session is optional)

**Validation**: Method accepts session parameter and uses it when provided

---

### Task 5: Write Unit Tests for Transaction Utility
**Spec**: `transaction-utility`

- [x] Create `libs/dal/test/unit/infra/transaction.spec.ts`
- [x] Test successful transaction execution
- [x] Test transaction rollback on error
- [x] Test session cleanup in all cases
- [x] Test return value propagation
- [x] Mock MongoDB session and client

**Validation**: All unit tests pass

---

## apps/trade-manager

### Task 6: Add MESSAGE_HISTORY_TTL_SECONDS to TradeManagerConfig
**Spec**: `message-translation-flow`

- [x] Open `apps/trade-manager/src/config.ts`
- [x] Add `MESSAGE_HISTORY_TTL_SECONDS: number;` to `TradeManagerConfig` interface
- [x] Add default value to `defaultConfig`: `MESSAGE_HISTORY_TTL_SECONDS: 10` (10 seconds)
- [x] Add comment: `// Message history TTL in seconds (matches telegram-service pattern)`
- [x] Verify config type exports correctly

**Validation**: TradeManagerConfig includes TTL setting with default value of 10

---

### Task 7: Update Trade Manager Container
**Spec**: `message-translation-flow`

- [x] Open `apps/trade-manager/src/container.ts`
- [x] Import `telegramMessageRepository` from `@dal`
- [x] Add `telegramMessageRepository` to `Container` interface in `interfaces/container.interface.ts`
- [x] Add `telegramMessageRepository` to container object
- [x] Verify container exports repository

**Validation**: Repository is available in container

---

### Task 8: Implement NewMessageHandler Processing Logic
**Spec**: `message-translation-flow`

- [x] Open `apps/trade-manager/src/events/consumers/new-message-handler.ts`
- [x] Add constructor to accept dependencies:
  - `telegramMessageRepository: TelegramMessageRepository`
  - `streamPublisher: IStreamPublisher`
  - `logger: LoggerInstance`
- [x] Import required types:
  - `MessageHistoryTypeEnum` from `@dal`
  - `StreamTopic`, `MessageType` from `@telegram-trading-bot-mini/shared/utils`
  - `withMongoTransaction` from `@dal`
- [x] Implement `handle` method:
  1. Extract `channelId`, `messageId` from payload
  2. Fetch message from database using repository
  3. If message not found: log error, capture in Sentry, return
  4. Call `withMongoTransaction` with async callback:
     a. Create history entry with type `TRANSLATE_MESSAGE`
     b. Add history entry to database (pass session)
     c. Build `TRANSLATE_MESSAGE_REQUEST` payload
     d. Publish event to `StreamTopic.TRANSLATE_REQUESTS`
     e. Update history entry with stream message ID (if needed)
  5. Log success

**Validation**: Handler processes messages and publishes translation requests

---

### Task 9: Update Event Consumer Initialization
**Spec**: `message-translation-flow`

- [x] Open `apps/trade-manager/src/events/index.ts`
- [x] Update `startConsumers` function to accept `container: Container`
- [x] Pass dependencies to `NewMessageHandler` constructor:
  ```typescript
  const newMessageHandler = new NewMessageHandler(
    container.telegramMessageRepository,
    container.streamPublisher,
    logger
  );
  ```
- [x] Update `server.ts` to pass container to `startConsumers`

**Validation**: Handler receives all required dependencies

---

### Task 10: Write Integration Test for Message Translation Flow
**Spec**: `message-translation-flow`

- [x] Create `apps/trade-manager/test/integration/translate-message-flow.spec.ts`
- [x] Setup: Start MongoDB, Redis, create test message
- [x] Test: Publish NEW_MESSAGE event
- [x] Verify: History entry created with TRANSLATE_MESSAGE type
- [x] Verify: TRANSLATE_MESSAGE_REQUEST published to Redis Stream
- [x] Verify: Transaction atomicity (rollback on publish failure)
- [x] Cleanup: Delete test data, close connections

**Validation**: Integration test passes

---

### Task 11: Write Unit Tests for NewMessageHandler
**Spec**: `message-translation-flow`

- [x] Create `apps/trade-manager/test/unit/events/consumers/new-message-handler.spec.ts`
- [x] Mock dependencies (repository, publisher, logger)
- [x] Test successful message processing
- [x] Test message not found scenario
- [x] Test transaction rollback on error
- [x] Test payload construction
- [x] Test history entry structure

**Validation**: All unit tests pass

---

## Validation & Documentation

### Task 12: Run All Tests
- [x] Run `nx test dal` - verify DAL tests pass
- [x] Run `nx test shared-utils` - verify shared utils tests pass
- [x] Run `nx test trade-manager` - verify trade-manager tests pass
- [x] Fix any failing tests

**Validation**: All test suites pass

---

### Task 13: Validate OpenSpec
- [x] Run `openspec validate translate-message-flow --strict`
- [x] Fix any validation errors
- [x] Ensure all requirements have scenarios
- [x] Ensure all scenarios are testable

**Validation**: OpenSpec validation passes with no errors

---

### Task 14: Update Documentation
- [x] Add comment in `telegram-message.model.ts` explaining new history types
- [x] Add usage example in `transaction.ts` JSDoc
- [x] Update `apps/trade-manager/README.md` to document translation flow
- [x] Verify all code has appropriate comments

**Validation**: Documentation is clear and complete

---

## Summary

**Total Tasks**: 17
**Estimated Effort**: 5-7 hours

**Task Groups**:
- **Infrastructure Setup** (Tasks 0.1-0.3): MongoDB replica set and connection strings
- **libs/dal** (Tasks 1-5): Message history types and transaction utility
- **apps/trade-manager** (Tasks 6-11): Configuration and message processing implementation
- **Validation** (Tasks 12-14): Testing and documentation

**Dependencies**:
- Tasks 0.1-0.3 must complete before running any tests or services
- Tasks 1-5 must complete before Task 6
- Tasks 6-7 must complete before Tasks 8-9
- Tasks 8-9 must complete before Tasks 10-11
- Tasks 1-11 must complete before Tasks 12-14

**Parallelizable Work**:
- Tasks 1-2 can run in parallel
- Tasks 10-11 can run in parallel
