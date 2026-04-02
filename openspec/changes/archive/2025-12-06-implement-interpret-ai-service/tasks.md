# Implementation Tasks

## Phase 1: DAL Layer (`libs/dal`)

### Task 1: Create PromptRule Model and Repository
- [x] 1.1 Create `libs/dal/src/models/prompt-rule.model.ts`
  - [x] Define `PromptRule` interface with fields: `promptId`, `name`, `description`, `classificationPrompt`, `extractionPrompt`, `createdAt`, `updatedAt`
  - [x] Add JSDoc comments for all fields
- [x] 1.2 Create `libs/dal/src/repositories/prompt-rule.repository.ts`
  - [x] Extend `BaseRepository<PromptRule>`
  - [x] Implement `findByPromptId(promptId: string): Promise<PromptRule | null>`
  - [x] Implement `findAll(): Promise<PromptRule[]>`
- [x] 1.3 Add `PROMPT_RULE` to `COLLECTIONS` enum in `libs/dal/src/infra/db.ts`
- [x] 1.4 Export new model and repository from `libs/dal/src/models/index.ts`
- [x] 1.5 Add integration tests for `PromptRuleRepository` in `libs/dal/test/repositories/prompt-rule.repository.spec.ts`
  - [x] Test `findByPromptId` with existing and non-existing IDs
  - [x] Test `findAll` with multiple prompts
  - [x] Test `create` and `update` operations

### Task 2: Update Account Model
- [x] 2.1 Add `promptId: string` field to `Account` interface in `libs/dal/src/models/account.model.ts`
- [x] 2.2 Add JSDoc comment explaining the relationship to `PromptRule`
- [x] 2.3 Update `AccountRepository` in `libs/dal/src/repositories/account.repository.ts`
  - [x] Add `findByPromptId(promptId: string): Promise<Account[]>` method
  - [x] Add `getDistinctPromptIdsByChannel(channelCode: string): Promise<string[]>` method
- [x] 2.4 Create migration script `libs/dal/src/models/account.migration.ts` to add index on `promptId`
- [x] 2.5 Update integration tests in `libs/dal/test/repositories/account.repository.spec.ts`
  - [x] Test `findByPromptId` method
  - [x] Test `getDistinctPromptIdsByChannel` method

### Task 3: Update TelegramMessageHistory
- [x] 3.1 Add optional `notes?: string` field to `TelegramMessageHistory` interface in `libs/dal/src/models/telegram-message.model.ts`
- [x] 3.2 Add JSDoc comment explaining the field is for audit purposes (e.g., AI responses)
- [x] 3.3 Update tests in `libs/dal/test/repositories/telegram-message.repository.spec.ts` to verify `notes` field is persisted

## Phase 2: Message Payloads (`libs/shared/utils`)

### Task 4: Update TRANSLATE_MESSAGE_REQUEST Payload
- [x] 4.1 Add `promptId: Type.String({ minLength: 1 })` to `TranslateMessageRequestPayloadSchema` in `libs/shared/utils/src/interfaces/messages/translate-message-request.ts`
- [x] 4.2 Add JSDoc comment for `promptId` field
- [x] 4.3 Update unit tests in `libs/shared/utils/test/unit/message-validator.spec.ts` to include `promptId` in test payloads

### Task 5: Update TRANSLATE_MESSAGE_RESULT Payload
- [x] 5.1 Add `promptId: Type.String({ minLength: 1 })` to `TranslateMessageResultPayloadSchema` in `libs/shared/utils/src/interfaces/messages/translate-message-result.ts`
- [x] 5.2 Add JSDoc comment for `promptId` field
- [x] 5.3 Update unit tests in `libs/shared/utils/test/unit/message-validator.spec.ts` to include `promptId` in test payloads

## Phase 3: AI Service Layer (`apps/interpret-service`)

### Task 6: Create AI Service Interface and Types
- [x] 6.1 Create `apps/interpret-service/src/services/ai/types.ts`
  - [x] Define `ClassificationResult` interface (isCommand, command, confidence, reason, raw_text)
  - [x] Define `ExtractionResult` interface (matching gemini-stress-test structure)
  - [x] Define `TranslationResult` interface (classification, extraction)
- [x] 6.2 Create `apps/interpret-service/src/services/ai/ai-service.interface.ts`
  - [x] Define `IAIService` interface with `translateMessage(messageText: string, context: MessageContext, prompts: PromptPair): Promise<TranslationResult>` method
  - [x] Define `MessageContext` interface (prevMessage, quotedMessage, quotedFirstMessage, orders)
  - [x] Define `PromptPair` interface (classificationPrompt, extractionPrompt)

### Task 7: Implement Gemini AI Service
- [x] 7.1 Install `@google/generative-ai` package: `npm install @google/generative-ai --workspace=interpret-service`
- [x] 7.2 Create `apps/interpret-service/src/services/ai/gemini-ai.service.ts`
  - [x] Implement `IAIService` interface
  - [x] Implement `classifyMessage(message: string, prompt: string): Promise<ClassificationResult>` private method
  - [x] Implement `extractSignal(message: string, command: string, prompt: string): Promise<ExtractionResult>` private method
  - [x] Implement helper methods for data processing (processNumericField, processEntryZone, processTakeProfits) from gemini-stress-test
  - [x] Add error handling and logging
- [x] 7.3 Add unit tests in `apps/interpret-service/test/unit/services/ai/gemini-ai.service.spec.ts`
  - [x] Test classification with valid command messages
  - [x] Test classification with noise messages
  - [x] Test extraction with LONG/SHORT commands
  - [x] Test error handling for invalid AI responses
- [x] 7.4 Add integration tests in `apps/interpret-service/test/integration/gemini-ai.service.spec.ts`
  - [x] Test full two-stage pipeline with real Gemini API (use test API key)
  - [x] Test with Vietnamese and English messages
  - [x] Test with various command types

### Task 8: Implement Prompt Caching Service
- [x] 8.1 Create `apps/interpret-service/src/services/prompt-cache.service.ts`
  - [x] Implement `getPrompt(promptId: string): Promise<PromptPair>` with in-memory read-through cache
  - [x] Implement `clearCache(promptId?: string): void` for cache invalidation (all if no promptId provided)
  - [x] Use in-memory Map with TTL tracking (default 30 minutes)
  - [x] Add logging for cache hits/misses
  - [x] **MVP Note**: In-memory cache is acceptable for single instance deployment
- [x] 8.2 Add unit tests in `apps/interpret-service/test/unit/services/prompt-cache.service.spec.ts`
  - [x] Test cache hit scenario
  - [x] Test cache miss and database fetch
  - [x] Test cache invalidation (single promptId)
  - [x] Test cache invalidation (all prompts)
  - [x] Test TTL expiration
  - [x] Test clearCache method for testing purposes
- [x] 8.3 Add integration tests in `apps/interpret-service/test/integration/prompt-cache.service.spec.ts`
  - [x] Test with real MongoDB
  - [x] Test concurrent requests for same promptId
  - [x] Test cache behavior across multiple promptIds
  - [x] Test clearCache in test cleanup

### Task 9: Update interpret-service Configuration
- [x] 9.1 Update `apps/interpret-service/src/config.ts`
  - [x] Add `AI_GEMINI_API_KEY: string` (replace existing `GEMINI_API_KEY`)
  - [x] Add `AI_GEMINI_MODEL: string` (default: 'gemini-2.5-flash-lite')
  - [x] Add `AI_PROMPT_CACHE_TTL_SECONDS: number` (default: 1800 = 30 minutes)
  - [x] Remove old LLM_* and GEMINI_* fields (consolidate to AI_GEMINI_*)
  - [x] **Note**: No Redis config needed for prompt cache (using in-memory for MVP)
- [x] 9.2 Update `apps/interpret-service/.env.sample` with new AI configuration variables
- [x] 9.3 Update tests to use new config fields

### Task 10: Wire Up AI Service in Container
- [x] 10.1 Update `apps/interpret-service/src/container.ts`
  - [x] Add `promptRuleRepository` from DAL
  - [x] Create `PromptCacheService` instance
  - [x] Create `GeminiAIService` instance
  - [x] Add to `Container` interface in `apps/interpret-service/src/interfaces/container.interface.ts`
- [x] 10.2 Update integration tests to verify container wiring

### Task 11: Update TranslateRequestHandler
- [x] 11.1 Update `apps/interpret-service/src/events/consumers/translate-request-handler.ts`
  - [x] Inject `IAIService`, `PromptCacheService`, `IStreamPublisher`, `TelegramMessageRepository`
  - [x] Implement message validation (check expiry)
  - [x] Fetch prompt using `PromptCacheService`
  - [x] Call `aiService.translateMessage()` with message context and prompts
  - [x] Publish `TRANSLATE_MESSAGE_RESULT` with structured commands
  - [x] Add history entry with AI response in `notes` field (JSON stringified)
  - [x] Handle errors and add error history entries
- [x] 11.2 Update `apps/interpret-service/src/events/index.ts` to pass new dependencies to handler
- [x] 11.3 Add unit tests in `apps/interpret-service/test/unit/events/consumers/translate-request-handler.spec.ts`
  - [x] Test successful translation flow
  - [x] Test expired message handling
  - [x] Test prompt not found scenario
  - [x] Test AI service error handling
  - [x] Test history entry creation with notes
- [x] 11.4 Add integration tests in `apps/interpret-service/test/integration/events/consumers/translate-request-handler.spec.ts`
  - [x] Test full flow from Redis Stream consumption to result publication
  - [x] Test with real AI service (mocked Gemini API)
  - [x] Verify history entries are created correctly
  - [x] Verify cache behavior

## Phase 4: trade-manager Updates (`apps/trade-manager`)

### Task 12: Update NewMessageHandler to Send Multiple Requests
- [x] 12.1 Update `apps/trade-manager/src/events/consumers/new-message-handler.ts`
  - [x] Inject `AccountRepository` in constructor
  - [x] Fetch active accounts for the channel using `accountRepository.findByChannelCode(channelCode)`
  - [x] Get distinct promptIds from accounts
  - [x] For each unique promptId, build and publish `TRANSLATE_MESSAGE_REQUEST` with promptId
  - [x] Add history entry for each request sent
  - [x] Use transaction to ensure atomicity
- [x] 12.2 Update `apps/trade-manager/src/container.ts` to inject `accountRepository` into handler
- [x] 12.3 Add unit tests in `apps/trade-manager/test/unit/events/consumers/new-message-handler.spec.ts`
  - [x] Test single promptId scenario (1 request sent)
  - [x] Test multiple promptIds scenario (N requests sent)
  - [x] Test no active accounts scenario (no requests sent)
  - [x] Test history entries created for each request
- [x] 12.4 Update integration tests in `apps/trade-manager/test/integration/translate-message-flow.spec.ts`
  - [x] Test with multiple accounts sharing same promptId (1 request)
  - [x] Test with multiple accounts with different promptIds (N requests)
  - [x] Verify all requests published to Redis Stream
  - [x] Verify history entries

## Phase 5: Documentation and Validation

### Task 13: Update Documentation
- [x] 13.1 Update `apps/interpret-service/README.md` with AI service architecture
- [x] 13.2 Update `apps/trade-manager/README.md` with multi-request flow
- [x] 13.3 Add example prompt rules to documentation
- [x] 13.4 Document cache invalidation strategy

### Task 14: End-to-End Testing
=> User marked as not doing
- [x] 14.1 Create end-to-end test script in `testing/e2e/ai-translation-flow.spec.ts`
  - [x] Create test prompt rules in database
  - [x] Create test accounts with different promptIds
  - [x] Send NEW_MESSAGE event
  - [x] Verify multiple TRANSLATE_MESSAGE_REQUEST events published
  - [x] Verify TRANSLATE_MESSAGE_RESULT events published
  - [x] Verify history entries with notes
- [x] 14.2 Run full test suite and ensure all tests pass

### Task 15: OpenSpec Validation
- [x] 15.1 Run `openspec validate implement-interpret-ai-service --strict`
- [x] 15.2 Fix any validation errors
- [x] 15.3 Ensure all spec deltas are complete with scenarios
