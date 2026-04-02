# Proposal: Implement Chat Session Caching

## Change ID
`implement-chat-session-caching`

## Problem Statement
Current AI processing takes approximately **2.5 seconds per signal** (2 API calls: classification + extraction). Analysis shows that the AI repeatedly parses the same system prompts for every message, causing unnecessary overhead.

**Current Flow:**
- Message A arrives → New API call with full prompt → Parse prompt → Process → 1.2s
- Message B arrives → New API call with full prompt → Parse prompt → Process → 1.2s
- Total: ~2.5s for both stages

**Root Cause:**
The `GeminiAIService` creates a new conversation context for every single message, forcing Gemini to re-parse system prompts repeatedly.

## Proposed Solution
Implement **chat session caching** keyed by `(channelId, promptId)` to maintain conversation context across messages. This allows Gemini to:
1. Parse system prompts **once per session** instead of per message
2. Reuse the conversation context for subsequent messages
3. Reduce API latency significantly

**New Flow:**
- First message → Create session → Parse prompt → Process → 1.2s
- Subsequent messages → Reuse session → Process directly → ~0.3-0.5s
- Expected improvement: **60-80% reduction** in processing time for subsequent messages

## Key Design Decisions

### 1. Session Key: `(channelId, promptId)`
- **Why:** Messages from the same channel using the same prompt should share context
- **Isolation:** Different channels or prompts get separate sessions
- **Multi-instance safe:** Each instance maintains its own session cache (MVP: single instance)

### 2. Session Expiration Strategy
Sessions expire in two scenarios:

#### a) Daily Reset at 8 AM Sydney Time
- **Why:** Gold trading typically has overnight gaps
- **Implementation:** Check session creation time vs current time on each request (no cron needed)
- **Logic:** If current time is past 8 AM and session was created before 8 AM, expire it

#### b) Message Count Limit (100 messages)
- **Why:** Prevent context bloat and memory issues
- **Implementation:** Track message count per session, reset when limit reached

### 3. Message Isolation Within Sessions
**Critical requirement:** Multiple instances may process messages concurrently using the same session.

**Problem:**
- Instance A processes Message 1 → adds to session history
- Instance B processes Message 2 → should NOT see Message 1 in context

**Solution:**
Add refined instruction in system prompt that clarifies what to remember vs forget:
```
CRITICAL INSTRUCTION - Message Isolation Protocol:
You MUST follow ALL the rules, formats, and guidelines defined in this system prompt 
for EVERY message you process.

However, each user message you receive is INDEPENDENT and ISOLATED. Do NOT reference, 
use, or consider the CONTENT of previous user messages or your previous responses.

In other words:
✓ REMEMBER: All rules, formats, classification logic, and extraction logic
✗ FORGET: The content and context of previous user messages and responses
```

### 4. Single-Step Pipeline (Optimization)
**Decision:** Combine classification and extraction into a single API call instead of two separate calls.

**Rationale:**
- **50% cost reduction** - One API call instead of two
- **60% faster** - Even first messages are faster (~1.2s vs ~2.5s)
- **Simpler architecture** - One session per (channelId, promptId) instead of two
- **Gemini handles conditional logic** - AI can classify and conditionally extract in one prompt

**Implementation:**
- Combine classification and extraction prompts into single system prompt
- AI internally classifies first, then extracts only if it's a command
- Single session key: `${channelId}:${promptId}` (no stage parameter needed)
- Response format includes both classification and extraction (extraction is null for non-commands)

### 5. Architecture Changes

#### ChatSessionManager Service
New service to manage chat session lifecycle:
- Cache sessions by `(channelId, promptId)` key (no stage needed with single-step)
- Handle session creation, retrieval, and expiration
- Thread-safe session access (for future multi-instance support)

#### Updated GeminiAIService
- Remove direct `model.generateContent()` calls
- Remove separate `classifyMessage()` and `extractSignal()` methods
- Use single `ChatSessionManager.getOrCreateSession()` call
- Send messages via `session.sendMessage()` with combined prompt

#### Updated IAIService Interface
- Remove `prompts: PromptPair` parameter from `translateMessage()`
- Add `channelId: string` and `promptId: string` parameters
- Prompts are now loaded internally by ChatSessionManager

## Scope

### In Scope
- Implement `ChatSessionManager` service with session caching
- Update `GeminiAIService` to use chat sessions
- Update `IAIService` interface to accept `channelId` and `promptId`
- Update `TranslateRequestHandler` to pass `channelId` and `promptId` instead of prompts
- Add session expiration logic (8 AM Sydney time + 100 message limit)
- Add message isolation instructions to system prompts
- Comprehensive integration tests for session lifecycle
- Update existing tests to work with new interface

### Out of Scope
- Redis-based session caching (MVP uses in-memory, single instance)
- Background cron jobs for session cleanup (lazy expiration is sufficient)
- Session sharing across multiple instances (future enhancement)
- Metrics/monitoring for session hit rates (can be added later)

## Success Criteria
1. **Performance:** AI processing time reduced from ~2.5s to ~1.2s for first message, <0.5s for subsequent messages
2. **Cost:** 50% reduction in API calls (1 call instead of 2 per message)
3. **Correctness:** All existing tests pass with updated interface
4. **Isolation:** Messages processed concurrently do not interfere with each other
5. **Reliability:** Sessions expire correctly at 8 AM Sydney time and after 100 messages
6. **Validation:** `openspec validate implement-chat-session-caching --strict` passes

## Dependencies
- Existing `PromptCacheService` for loading prompts
- Existing `GeminiAIService` structure
- `@google/generative-ai` SDK's `ChatSession` API
- `date-fns-tz` for Sydney timezone handling

## Risks & Mitigations

### Risk 1: Session state corruption with concurrent access
**Mitigation:** 
- Add session locking mechanism in ChatSessionManager
- Document single-instance constraint for MVP
- Plan Redis-based sessions for multi-instance deployment

### Risk 2: Memory bloat from long-running sessions
**Mitigation:**
- Enforce 100-message limit per session
- Daily reset at 8 AM Sydney time
- Monitor session cache size in logs

### Risk 3: Prompt changes not reflected in active sessions
**Mitigation:**
- Include prompt hash in session key (future enhancement)
- For MVP, sessions expire naturally via daily reset and message limit
- Prompt updates will take effect after session expiration

### Risk 4: Single-step prompt may be harder to optimize
**Mitigation:**
- Start with well-structured combined prompt
- Use clear STEP 1 / STEP 2 structure in prompt
- Monitor classification accuracy and extraction quality separately
- Can revert to two-step if quality degrades (unlikely)

## Timeline Estimate
- **Phase 1:** ChatSessionManager + core session logic - 3 hours
- **Phase 2:** Single-step prompt design + GeminiAIService refactor - 4 hours  
- **Phase 3:** Interface updates + handler changes - 2 hours
- **Phase 4:** Testing + validation - 4 hours
- **Total:** ~13 hours of development + testing

**Note:** Single-step approach actually reduces implementation time (simpler architecture, fewer sessions to manage).

