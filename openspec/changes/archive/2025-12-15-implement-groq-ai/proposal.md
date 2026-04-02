# Proposal: Implement Groq AI Integration

## Why

Improve AI response times and reduce costs by integrating Groq AI as an alternative provider. Current Gemini AI implementation has slower response times (~500-800ms) compared to Groq (~350ms), and higher costs ($15-20/month vs $9/month for 1,000 messages/day).

## What Changes

### groq-ai-integration [ADDED]

Complete Groq AI integration with unified TypeBox schema architecture:
- Provider pattern for clean separation of Gemini and Groq implementations
- Unified TypeBox schema as single source of truth for AI responses
- Auto-generated provider-specific schemas (Gemini ResponseSchema, Groq JSON Schema)
- Comprehensive test coverage (193 tests, 76 schema-specific)
- Stress test application validating Groq performance
- Configuration support for provider selection via environment variables

## Problem Statement

The current AI service implementation uses Gemini AI (Google's `@google/generative-ai` package), but performance is not meeting expectations even with Gemini 2.5 Flash Lite. We need to integrate Groq AI as an alternative provider to improve response times while maintaining backward compatibility.

### Current Issues
1. **Tight Coupling**: The codebase has tight coupling with Gemini-specific session management
2. **Performance**: Gemini AI response times are slower than desired for real-time trading signal processing
3. **Provider Lock-in**: No abstraction layer exists to support multiple AI providers

## Proposed Solution

Integrate Groq AI (`groq-sdk` package) as the primary AI provider while refactoring the codebase to:
1. Group Gemini-specific session management code into a dedicated provider folder
2. Implement Groq AI as a simpler, stateless provider (no session caching needed)
3. Maintain the existing `IAIService` interface for backward compatibility

### Key Technical Differences

#### Groq vs Gemini Session Management
- **Gemini**: Uses native `ChatSession` API with session caching to avoid re-parsing system prompts
  - Sessions cached per (channelId, accountId, promptId, promptHash)
  - Isolation instruction prepended to prevent context bleeding
  - Sessions expire at 8 AM Sydney or after 100 messages
- **Groq**: Stateless API - send system prompt + user message on each request
  - **No session caching needed** - Groq is fast enough without it
  - **No history needed** - Each request is independent
  - **No isolation instruction needed** - No session reuse means no context bleeding
  - System prompt sent fresh on every request via `role: 'system'`

#### JSON Schema Support
- **Gemini**: Uses `responseSchema` with `SchemaType` enum in `generationConfig`
- **Groq**: Uses `response_format` with `json_schema` type containing standard JSON Schema
- **Implication**: Each provider has its own schema file in its folder

### Architecture Changes

```
apps/interpret-service/src/services/
├── ai/
│   ├── ai-service.interface.ts          # Unchanged - public API
│   ├── types.ts                          # Unchanged - shared types
│   └── providers/                        # NEW - provider implementations
│       ├── gemini/                       # Gemini-specific (session-based)
│       │   ├── gemini-ai.service.ts
│       │   ├── gemini-session-manager.ts
│       │   ├── gemini-managed-session.ts
│       │   └── gemini-response-schema.ts
│       └── groq/                         # Groq-specific (stateless)
│           ├── groq-ai.service.ts
│           └── groq-response-schema.ts
├── chat-session-manager.service.ts       # MOVE to providers/gemini/
├── managed-chat-session.ts               # MOVE to providers/gemini/
└── prompt-cache.service.ts               # Keep - shared across providers
```

### Groq Implementation Strategy

**Phase 0: Validate First!** - Build stress test app before integration:

1. **Stress Test App** (`testing/groq-stress-test/`):
   - Interactive CLI for API key and model selection
   - Test cases from `futu-color/prompt.txt`
   - Gradual throughput ramp-up (1 msg/sec → increasing)
   - Random delays and test selection
   - Real-time performance metrics
   - **Decision Gate**: Only proceed if Groq performs well!

2. **Model Pooling** (handle rate limits):
   - Pool of Groq models: `deepseek-r1-distill-llama-70b`, `llama-3.3-70b-versatile`
   - Round-robin selection to distribute load
   - Rate limit tracking per model
   - Automatic fallback to next model on rate limit
   - Statistics tracking (requests, errors, response times per model)

3. **Stateless Requests**: Each `translateMessage()` call is independent
4. **System Prompt**: Fetch from `PromptCacheService` and send on every request
5. **Message Format**: 
   ```typescript
   messages: [
     { role: 'system', content: systemPrompt },
     { role: 'user', content: contextualizedMessage }
   ]
   ```
6. **No History**: Don't maintain conversation history (not needed for our use case)
7. **No Expiration Logic**: No sessions to expire

### Configuration

Add new environment variables:
- `AI_PROVIDER`: `'gemini' | 'groq'` (default: `'groq'`)
- `AI_GROQ_API_KEY`: Groq API key
- `AI_GROQ_MODELS`: Comma-separated list of models (default: `'deepseek-r1-distill-llama-70b,llama-3.3-70b-versatile'`)

Keep existing Gemini config for backward compatibility.

## Scope

### In Scope
- Refactor Gemini code into `providers/gemini/` folder (session management stays Gemini-specific)
- Implement Groq AI service as a stateless provider (no session management)
- Convert Gemini response schema to JSON Schema format for Groq
- Update container to support provider selection via config
- Maintain `IAIService` interface unchanged
- Update all tests to work with both providers

### Out of Scope
- Generic session abstraction (session management is Gemini-specific)
- Session caching for Groq (not needed - Groq is fast enough)
- Removing Gemini support (keep for fallback)
- Multi-provider load balancing
- Provider-specific prompt optimization
- Streaming responses
- Function calling / tool use

## Dependencies

### New Package
- `groq-sdk`: Official Groq TypeScript SDK

### Affected Components
- `apps/interpret-service/src/services/ai/*`
- `apps/interpret-service/src/services/chat-session-manager.service.ts`
- `apps/interpret-service/src/services/managed-chat-session.ts`
- `apps/interpret-service/src/container.ts`
- All AI-related tests

## Risks & Mitigations

### Risk: Groq API Rate Limits
- **Mitigation**: Keep Gemini as fallback option via config

### Risk: Different Response Quality
- **Mitigation**: Use existing prompt test suite to validate Groq responses

### Risk: Increased API Calls (No Session Caching)
- **Impact**: Groq will send system prompt on every request (vs Gemini's session reuse)
- **Mitigation**: Groq's speed should compensate for lack of caching; monitor costs

### Risk: Breaking Changes During Refactor
- **Mitigation**: Keep `IAIService` interface unchanged, comprehensive test coverage

## Success Criteria

1. ✅ Groq AI successfully translates messages with same accuracy as Gemini
2. ✅ Response time improves compared to Gemini baseline (despite sending system prompt each time)
3. ✅ All existing tests pass with Groq provider
4. ✅ Can switch between Gemini and Groq via config without code changes
5. ✅ No breaking changes to `IAIService` interface
6. ✅ Gemini session caching continues to work as before

## Open Questions

1. **Groq Model Selection**: Which Groq model provides best balance of speed and accuracy for trading signal extraction?
   - Options: `mixtral-8x7b-32768`, `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`
   
2. **Error Handling**: Should we implement automatic fallback to Gemini on Groq errors, or fail fast?
