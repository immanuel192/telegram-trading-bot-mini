# Implementation Tasks

## 1. Trade-Manager Publisher Setup
- [x] 1.1 Add `RedisStreamPublisher` import to `apps/trade-manager/src/container.ts`
- [x] 1.2 Initialize `streamPublisher` instance in `createContainer` function
- [x] 1.3 Add `streamPublisher` to `Container` interface in `apps/trade-manager/src/interfaces/container.interface.ts`
- [x] 1.4 Export `streamPublisher` from container
- [x] 1.5 Update `apps/trade-manager/test/unit/container.spec.ts` to verify publisher initialization
- [x] 1.6 Add integration test for publisher connectivity in `apps/trade-manager/test/integration/publisher.spec.ts`

## 2. Interpret-Service Publisher Verification
- [x] 2.1 Verify `streamPublisher` is properly exported from container in `apps/interpret-service/src/container.ts`
- [x] 2.2 Update `apps/interpret-service/test/unit/container.spec.ts` to verify publisher initialization
- [x] 2.3 Add integration test for publisher connectivity in `apps/interpret-service/test/integration/publisher.spec.ts`

## 3. Service MVP Constraints (Single Instance)
- [x] 3.1 Add explicit comment in `apps/trade-manager/src/container.ts` about single-instance MVP limitation
  - Note: Redis Streams lack Kafka-style partition grouping
  - Requirement: Run exactly one instance to maintain message sequence
- [x] 3.2 Add explicit comment in `apps/interpret-service/src/container.ts` about single-instance MVP limitation
  - Note: Redis Streams lack Kafka-style partition grouping
  - Requirement: Run exactly one instance to maintain message sequence
- [x] 3.3 Verify PM2 configuration in `infra/pm2/trade-manager.config.js`
  - Confirm `instances: 1` is set
  - Add comment explaining the single-instance requirement
- [x] 3.4 Verify PM2 configuration in `infra/pm2/interpret-service.config.js`
  - Confirm `instances: 1` is set
  - Add comment explaining the single-instance requirement
- [x] 3.5 Document message types trade-manager will publish (comments only, no implementation)
  - `TRANSLATE_MESSAGE_REQUEST`: Requests to interpret-service
  - `SYMBOL_FETCH_LATEST_PRICE`: Requests to trade-executor

## 4. Interpret-Service Gemini Configuration
- [x] 4.1 Update `apps/interpret-service/src/config.ts` to add Gemini-specific environment variables
  - `GEMINI_API_KEY`: Gemini API authentication key
  - `GEMINI_NAME`: Gemini service name identifier
  - `GEMINI_PROJECT_NAME`: Full project name (format: `projects/{project-id}`)
  - `GEMINI_PROJECT_NUMBER`: Numeric project identifier
- [x] 4.2 Create `.env.sample` file for interpret-service at `apps/interpret-service/.env.sample`
  - Include all required environment variables with example values
  - Document each variable's purpose
- [x] 4.3 Update unit tests in `apps/interpret-service/test/unit/config.spec.ts` to verify new config keys
- [x] 4.4 Document message types interpret-service will publish (comments only, no implementation)
  - `TRANSLATE_MESSAGE_RESULT`: Translation results to trade-manager

## 5. Account Model Documentation
- [x] 5.1 Add comment to `accountId` field in `libs/dal/src/models/account.model.ts`
  - Document that `accountId` should match the executor-service accountId
  - Clarify this is for cross-service account identification
