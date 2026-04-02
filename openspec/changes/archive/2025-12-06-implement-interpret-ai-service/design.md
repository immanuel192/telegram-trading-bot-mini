# Design: AI Service for Message Translation

## Context
The interpret-service needs to translate unstructured Telegram messages into structured trading commands. The gemini-stress-test application has proven a two-stage pipeline (classification → extraction) works effectively. We need to productionize this approach while supporting multi-account scenarios where each account can have custom prompt rules.

**Constraints:**
- Must support multiple AI providers in the future (currently Gemini only)
- Must handle high-throughput message processing
- Must support account-specific prompt customization
- Must maintain audit trail of AI decisions

**Stakeholders:**
- interpret-service: Consumes translation requests, produces results
- trade-manager: Publishes translation requests, consumes results
- Accounts: Each account can have custom prompt rules

## Goals / Non-Goals

**Goals:**
- Implement production-ready AI translation service
- Support multi-account prompt customization
- Enable prompt caching for performance
- Maintain comprehensive audit trail
- Follow established architectural patterns

**Non-Goals:**
- Support for AI providers other than Gemini (future work)
- Real-time prompt updates (30-minute cache TTL is acceptable)
- Prompt versioning or A/B testing (future work)
- Multi-language prompt support beyond Vietnamese/English (future work)

## Decisions

### Decision 1: Unified AI Service Interface
**What:** Create an `IAIService` interface with a single `translateMessage()` method that encapsulates the two-stage pipeline.

**Why:** 
- Enables future AI provider implementations
- Simplifies testing with mock implementations
- Encapsulates complexity of two-stage processing

**Alternatives considered:**
- Expose classification and extraction as separate methods → Rejected: Increases complexity for consumers
- Hard-code Gemini implementation → Rejected: Not extensible

### Decision 2: PromptRule Model Structure
**What:** Store prompts as two separate text fields: `classificationPrompt` and `extractionPrompt`.

**Why:**
- Matches the two-stage pipeline architecture
- Allows independent customization of each stage
- Simple to understand and maintain

**Alternatives considered:**
- Single combined prompt → Rejected: Doesn't match two-stage architecture
- JSON structure with templates → Rejected: Over-engineered for MVP

### Decision 3: Prompt Caching Strategy
**What:** Implement in-memory read-through cache with 30-minute TTL.

**Why:**
- Prompts change infrequently
- Reduces database load
- 30 minutes balances freshness vs performance
- **MVP CONSTRAINT**: Single instance deployment makes in-memory cache acceptable

**Alternatives considered:**
- No caching → Rejected: Unnecessary database load
- Redis cache → Rejected: Over-engineered for MVP with single instance
- Longer TTL (hours) → Rejected: Too stale for prompt updates

**MVP Note:** This uses in-memory caching because interpret-service runs as a single instance (Redis Stream limitation). When scaling to multiple instances, migrate to Redis-based caching.

### Decision 4: Multiple TRANSLATE_MESSAGE_REQUEST per NEW_MESSAGE
**What:** trade-manager sends one request per unique promptId for each NEW_MESSAGE.

**Why:**
- Enables parallel processing of different interpretations
- Supports A/B testing scenarios in the future
- Maintains clear audit trail per account

**Alternatives considered:**
- Single request with multiple promptIds → Rejected: Complicates response handling
- Sequential processing → Rejected: Slower, no benefit

### Decision 5: AI Response in History Notes
**What:** JSON stringify the full AI response and store in `TelegramMessageHistory.notes` field.

**Why:**
- Provides complete audit trail
- Enables debugging and analysis
- Minimal schema changes

**Alternatives considered:**
- Separate AI response table → Rejected: Over-engineered for MVP
- Store in meta field → Rejected: Meta is for parsed results, not raw AI responses

### Decision 6: Configuration Naming Convention
**What:** Use `AI_GEMINI_*` prefix for Gemini-specific config, `AI_*` for general AI config.

**Why:**
- Clear separation between provider-specific and general config
- Enables future multi-provider support
- Follows existing naming patterns

**Alternatives considered:**
- `GEMINI_*` only → Rejected: Doesn't indicate AI service context
- `LLM_*` prefix → Rejected: Less specific than AI

## Risks / Trade-offs

### Risk 1: Prompt Cache Staleness
**Risk:** 30-minute in-memory cache means prompt updates take up to 30 minutes to propagate.

**Mitigation:** 
- Document cache TTL clearly
- Provide `clearCache()` method for manual invalidation during testing and development
- 30 minutes is acceptable for MVP
- **MVP Note**: Service restart clears cache immediately (single instance deployment)

### Risk 2: Multiple Requests per Message
**Risk:** Sending N requests per message (where N = unique promptIds) increases Redis Stream load.

**Mitigation:**
- Most channels will have 1-3 accounts with same promptId
- Redis Streams handle this load easily
- Monitor stream metrics

### Risk 3: AI API Rate Limits
**Risk:** Gemini API has rate limits that could block processing.

**Mitigation:**
- Implement exponential backoff
- Monitor API usage
- Consider request queuing if needed

### Risk 4: Prompt Injection Attacks
**Risk:** Malicious prompt content could manipulate AI behavior.

**Mitigation:**
- Prompts are admin-controlled, not user-input
- Validate prompt content on creation
- Monitor AI responses for anomalies

## Migration Plan

### Phase 1: DAL Layer (No Breaking Changes)
1. Create `PromptRule` model and repository
2. Add `promptId` to `Account` model with index
3. Add `notes` to `TelegramMessageHistory`
4. Add integration tests for new repositories

### Phase 2: Message Payloads (Additive Changes)
1. Add `promptId` to `TRANSLATE_MESSAGE_REQUEST` payload
2. Add `promptId` to `TRANSLATE_MESSAGE_RESULT` payload
3. Update message validators
4. Update tests

### Phase 3: AI Service Layer
1. Implement `IAIService` interface
2. Implement `GeminiAIService` with two-stage pipeline
3. Implement prompt caching service
4. Add unit and integration tests

### Phase 4: interpret-service Integration
1. Update config with AI_GEMINI_* variables
2. Wire up AI service in container
3. Update `TranslateRequestHandler` to use AI service
4. Add history tracking with notes
5. Publish `TRANSLATE_MESSAGE_RESULT`
6. Add integration tests

### Phase 5: trade-manager Integration
1. Update `NewMessageHandler` to fetch accounts
2. Send multiple `TRANSLATE_MESSAGE_REQUEST` per unique promptId
3. Update tests

### Rollback Plan
- All changes are additive, no breaking changes
- Can disable AI processing by reverting interpret-service deployment
- Existing message flow continues to work

## Open Questions
1. **Q:** Should we support prompt templates with variables (e.g., `{{channelName}}`)?
   **A:** Not for MVP, can add later if needed

2. **Q:** Should we validate prompt content on creation?
   **A:** Yes, basic validation (non-empty, max length), but no AI-specific validation for MVP

3. **Q:** How to handle AI service failures?
   **A:** Log error, capture in Sentry, add error to history, do not publish TRANSLATE_MESSAGE_RESULT
