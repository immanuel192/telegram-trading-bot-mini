# Design: Groq AI Integration Architecture

## Overview

This design document details the architectural approach for integrating Groq AI as a stateless provider while maintaining Gemini's session-based approach and ensuring backward compatibility.

## Architecture Principles

1. **Provider Isolation**: Each provider's implementation details stay in its own folder
2. **No Forced Abstraction**: Session management is Gemini-specific, not abstracted
3. **Zero Breaking Changes**: Existing `IAIService` interface remains unchanged
4. **Shared Infrastructure**: Prompt caching and common utilities shared across providers
5. **Code Readability**: Keep schemas in provider folders for clarity

## Component Design

### 1. Provider Folder Structure

```
apps/interpret-service/src/services/
├── ai/
│   ├── ai-service.interface.ts          # ✅ Unchanged - public API
│   ├── types.ts                          # ✅ Unchanged - shared types
│   └── providers/
│       ├── gemini/                       # Gemini-specific (session-based)
│       │   ├── gemini-ai.service.ts
│       │   ├── gemini-session-manager.ts
│       │   ├── gemini-managed-session.ts
│       │   └── gemini-response-schema.ts
│       └── groq/                         # Groq-specific (stateless)
│           ├── groq-ai.service.ts
│           └── groq-response-schema.ts
├── prompt-cache.service.ts               # ✅ Shared across providers
└── container.ts                          # 🔧 Updated for provider factory
```

**Note**: No generic session abstraction - session management is Gemini-specific.

### 2. Groq Provider Implementation

#### Stateless Design

**Key Insight**: Groq doesn't need session caching because:
- Groq's LPU architecture is optimized for fast inference
- Each request is independent - no context bleeding concerns
- No isolation instruction needed
- Simpler implementation, easier to maintain

#### `providers/groq/groq-ai.service.ts`

```typescript
/**
 * Groq AI Service - Stateless implementation
 * No session management needed - sends system prompt on every request
 */
export class GroqAIService implements IAIService {
  constructor(
    private readonly groqClient: Groq,
    private readonly promptCacheService: PromptCacheService,
    private readonly modelName: string,
    private readonly logger: Logger
  ) {}
  
  async translateMessage(
    messageText: string,
    context: MessageContext,
    channelId: string,
    accountId: string,
    promptId: string,
    traceToken?: string
  ): Promise<TranslationResult> {
    // Fetch system prompt from cache
    const promptData = await this.promptCacheService.getPrompt(promptId);
    if (!promptData) {
      throw new Error(`Prompt not found: ${promptId}`);
    }
    
    // Build context-aware user message (same format as Gemini)
    const contextJson = JSON.stringify(context, null, 2);
    const userMessage = `Context: ${contextJson}\n\nMessage to translate: "${messageText}"`;
    
    // Send request to Groq (stateless - no session)
    const completion = await this.groqClient.chat.completions.create({
      model: this.modelName,
      messages: [
        {
          role: 'system',
          content: promptData.systemPrompt  // No isolation instruction needed
        },
        {
          role: 'user',
          content: userMessage
        }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'translation_result',
          schema: GROQ_RESPONSE_SCHEMA
        }
      },
      temperature: 0
    });
    
    // Parse JSON response
    const responseText = completion.choices[0]?.message?.content || '';
    const result: TranslationResult = JSON.parse(responseText);
    
    return result;
  }
}
```

**Key Points**:
- No session manager dependency
- Fetches prompt on every request (cached by `PromptCacheService`)
- Sends system prompt + user message directly
- No history, no isolation instruction, no expiration logic
- Simpler error handling (no session state to manage)

### 3. Gemini Provider (Refactored)

#### Keep Existing Session Logic

Gemini's session management stays exactly as is, just moved to `providers/gemini/`:

```
providers/gemini/
├── gemini-ai.service.ts           # Current GeminiAIService
├── gemini-session-manager.ts      # Current ChatSessionManager
├── gemini-managed-session.ts      # Current ManagedChatSession
└── gemini-response-schema.ts      # Current COMBINED_AI_RESPONSE_SCHEMA
```

**No changes to Gemini logic** - just file moves and import updates.

### 4. Schema Design

#### Keep Schemas in Provider Folders

Each provider has its own schema file for code readability:

**`providers/gemini/gemini-response-schema.ts`**:
```typescript
import { SchemaType, ResponseSchema } from '@google/generative-ai';

export const GEMINI_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    isCommand: { type: SchemaType.BOOLEAN, ... },
    // ... rest of Gemini schema
  }
};
```

**`providers/groq/groq-response-schema.ts`**:
```typescript
/**
 * JSON Schema for Groq structured output
 * Manually converted from Gemini schema for clarity
 */
export const GROQ_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    isCommand: { type: 'boolean', description: '...' },
    confidence: { type: 'number', description: '...' },
    reason: { type: 'string', description: '...' },
    command: {
      type: 'string',
      enum: ['LONG', 'SHORT', 'MOVE_SL', 'SET_TP_SL', 'CLOSE_BAD_POSITION', 'CLOSE', 'CLOSE_ALL', 'CANCEL', 'NONE']
    },
    extraction: {
      type: 'object',
      nullable: true,
      properties: {
        symbol: { type: 'string' },
        isImmediate: { type: 'boolean' },
        // ... rest of extraction schema
      },
      required: ['symbol', 'isImmediate']
    }
  },
  required: ['isCommand', 'command', 'confidence', 'reason', 'extraction']
};
```

**Rationale**: 
- Manual conversion for code readability
- Each schema is self-contained in its provider folder
- No shared schema abstraction (YAGNI - we only have 2 providers)

### 5. Provider Factory Pattern

#### `container.ts` Changes

```typescript
function createAIService(
  provider: 'gemini' | 'groq',
  promptCacheService: PromptCacheService,
  logger: LoggerInstance
): IAIService {
  if (provider === 'groq') {
    // Groq: Simple stateless service
    const groqClient = new Groq({ apiKey: config('AI_GROQ_API_KEY') });
    return new GroqAIService(
      groqClient,
      promptCacheService,
      config('AI_GROQ_MODEL'),
      logger
    );
  } else {
    // Gemini: Session-based service
    const genAI = new GoogleGenerativeAI(config('AI_GEMINI_API_KEY'));
    const sessionManager = new GeminiSessionManager(
      promptCacheService,
      genAI,
      config('AI_GEMINI_MODEL'),
      logger
    );
    return new GeminiAIService(sessionManager, logger);
  }
}

export function createContainer(logger: LoggerInstance): Container {
  // ... other services ...
  
  const aiService = createAIService(
    config('AI_PROVIDER'),
    promptCacheService,
    logger
  );
  
  // ... rest of container ...
}
```

## Data Flow

### Groq Translation Flow (Simplified)

```
1. GroqAIService.translateMessage()
   ↓
2. PromptCacheService.getPrompt() → fetch system prompt + hash
   ↓
3. Build context-aware user message
   ↓
4. groqClient.chat.completions.create()
   - messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }]
   - response_format: { type: 'json_schema', json_schema: { ... } }
   ↓
5. Parse JSON response
   ↓
6. Return TranslationResult
```

**No session management** - much simpler than Gemini flow!

### Gemini Translation Flow (Unchanged)

```
1. GeminiAIService.translateMessage()
   ↓
2. GeminiSessionManager.getOrCreateSession()
   ↓ (cache miss)
3. PromptCacheService.getPrompt() → fetch system prompt + hash
   ↓
4. Create ChatSession with system instruction + isolation instruction
   ↓
5. Return GeminiManagedSession
   ↓
6. GeminiManagedSession.sendMessage()
   ↓
7. session.sendMessage() → Gemini API (history managed by SDK)
   ↓
8. Increment message count, check limits
   ↓
9. Return response
   ↓
10. GeminiAIService parses JSON response
   ↓
11. Return TranslationResult
```

## Performance Considerations

### Groq: No Session Caching

**Trade-off**: Send system prompt on every request vs Gemini's session reuse

**Analysis**:
- **System prompt size**: ~2-5 KB
- **Groq's advantage**: LPU architecture optimized for fast token processing
- **Expected**: Groq's raw speed compensates for lack of caching
- **Monitoring**: Track response times to validate assumption

**If Groq is slower than expected**: 
- Option 1: Accept trade-off (simplicity > speed)
- Option 2: Implement session caching for Groq (future enhancement)

### Gemini: Session Caching Preserved

- Session caching continues to work as before
- 8 AM Sydney reset + 100 message limit
- Isolation instruction prevents context bleeding
- No changes to existing logic

## Testing Strategy

### Unit Tests

**Groq**:
- `groq-ai.service.spec.ts`: Test message translation with mocked Groq client
- `groq-response-schema.spec.ts`: Validate schema structure

**Gemini** (after refactor):
- Update import paths in existing tests
- All tests should pass without logic changes

### Integration Tests

**Groq**:
- `groq-ai.service.spec.ts`: Full translation flow with real Groq API
- Validate JSON response parsing
- Test error handling

**Gemini**:
- Existing integration tests should pass after refactor

**Provider Switching**:
- `provider-switching.spec.ts`: Test both providers via config

## Configuration

### Environment Variables

```bash
# Provider selection
AI_PROVIDER=groq  # 'gemini' | 'groq' (default: 'groq')

# Groq configuration
AI_GROQ_API_KEY=gsk_xxx
AI_GROQ_MODEL=mixtral-8x7b-32768  # default model

# Gemini configuration (preserved)
AI_GEMINI_API_KEY=xxx
AI_GEMINI_MODEL=gemini-2.5-flash-lite

# Shared configuration
AI_PROMPT_CACHE_TTL_SECONDS=1800
```

## Migration Path

### Phase 1: Refactor Gemini (No Behavior Change)
1. Create `providers/gemini/` folder
2. Move Gemini files (session manager, managed session, service, schema)
3. Update imports
4. All tests pass - no functional changes

### Phase 2: Implement Groq
1. Create `providers/groq/` folder
2. Implement `GroqAIService` (stateless)
3. Create `GROQ_RESPONSE_SCHEMA`
4. Add Groq tests
5. Keep provider disabled (config defaults to Gemini)

### Phase 3: Enable Groq
1. Update config to default to Groq
2. Run full test suite
3. Monitor production metrics
4. Keep Gemini as fallback option

## Comparison: Gemini vs Groq

| Aspect                    | Gemini                         | Groq               |
| ------------------------- | ------------------------------ | ------------------ |
| **Session Management**    | ✅ Yes (ChatSession API)        | ❌ No (stateless)   |
| **Caching**               | ✅ Session caching              | ❌ No caching       |
| **Isolation Instruction** | ✅ Required                     | ❌ Not needed       |
| **History Management**    | ✅ SDK handles it               | ❌ N/A              |
| **Expiration Logic**      | ✅ 8 AM + 100 msg               | ❌ N/A              |
| **Complexity**            | Higher (session state)         | Lower (stateless)  |
| **Speed**                 | Moderate (cached)              | Fast (LPU)         |
| **System Prompt**         | Sent once per session          | Sent every request |
| **Dependencies**          | SessionManager, ManagedSession | Just Groq client   |

## Error Handling

### Groq Errors

```typescript
try {
  const completion = await this.groqClient.chat.completions.create({ ... });
  // ... parse response
} catch (error) {
  this.logger.error({ error, traceToken }, 'Groq API error');
  
  // Return safe fallback
  return {
    isCommand: false,
    command: 'NONE',
    confidence: 0,
    reason: `Groq error: ${error.message}`,
    extraction: null
  };
}
```

**No session state to clean up** - simpler error handling than Gemini.

## Memory Considerations

### Groq: No Session State

- **Memory usage**: Minimal (no session storage)
- **Garbage collection**: Easier (no long-lived session objects)
- **Scalability**: Better (stateless design)

### Gemini: Session State Preserved

- **Memory usage**: ~100-300 KB per session (existing)
- **10 active sessions**: ~1-3 MB (acceptable for MVP)
- **No changes** to existing memory profile

## Summary

### Simplified Design Benefits

1. **Less Code**: No session abstraction, no Groq session manager
2. **Easier to Understand**: Groq is straightforward stateless service
3. **Easier to Test**: No session state to mock/manage
4. **Easier to Maintain**: Fewer moving parts
5. **Better Separation**: Session logic stays where it belongs (Gemini)

### Trade-offs Accepted

1. **System Prompt Sent Every Request**: Groq's speed should compensate
2. **No Shared Abstraction**: Acceptable - only 2 providers, different enough
3. **Manual Schema Conversion**: Better for code readability

This design follows the principle: **Make it work, make it right, make it fast** - in that order.
