# Implement AI Service for Message Translation

## Overview
This OpenSpec proposal implements a production-ready AI service layer in `interpret-service` to translate Telegram messages into structured trading commands using Google Gemini API. The implementation follows the proven two-stage pipeline (classification → extraction) from the `gemini-stress-test` application and adds support for multi-account prompt customization.

## Key Features
1. **AI Service Layer**: Unified interface with Gemini implementation
2. **Prompt Customization**: Per-account prompt rules stored in database
3. **Prompt Caching**: In-memory read-through cache with 30-minute TTL (**MVP**: single instance only)
4. **Multi-Request Flow**: One translation request per unique promptId per message
5. **Audit Trail**: AI responses stored in message history notes

## Architecture Changes

### New Components
- **PromptRule Model** (`libs/dal`): Stores classification and extraction prompts
- **PromptRuleRepository** (`libs/dal`): CRUD operations for prompt rules
- **IAIService Interface** (`apps/interpret-service`): Unified AI service interface
- **GeminiAIService** (`apps/interpret-service`): Gemini API implementation
- **PromptCacheService** (`apps/interpret-service`): In-memory prompt caching with `clearCache()` method

### Modified Components
- **Account Model**: Add `promptId` field with index
- **AccountRepository**: Add `findByPromptId()` and `getDistinctPromptIdsByChannel()` methods
- **TelegramMessageHistory**: Add optional `notes` field
- **TRANSLATE_MESSAGE_REQUEST**: Add `promptId` field
- **TRANSLATE_MESSAGE_RESULT**: Add `promptId` field
- **NewMessageHandler** (`trade-manager`): Send multiple requests per unique promptId
- **TranslateRequestHandler** (`interpret-service`): Implement AI translation logic

## Data Flow

### Before (Current State)
```
NEW_MESSAGE → trade-manager → [placeholder] → interpret-service (logs only)
```

### After (Proposed State)
```
NEW_MESSAGE → trade-manager
  ├─ Fetch active accounts for channel
  ├─ Get distinct promptIds
  └─ For each promptId:
      └─ Publish TRANSLATE_MESSAGE_REQUEST(promptId)
          └─ interpret-service
              ├─ Fetch prompt from in-memory cache/DB
              ├─ Call Gemini AI (classification → extraction)
              ├─ Add history with AI response notes
              └─ Publish TRANSLATE_MESSAGE_RESULT(promptId, commands)
```

## Configuration

### New Environment Variables
```bash
# Gemini AI Configuration
AI_GEMINI_API_KEY=your_gemini_api_key
AI_GEMINI_MODEL=gemini-2.5-flash-lite

# Prompt Cache Configuration
AI_PROMPT_CACHE_TTL_SECONDS=1800  # 30 minutes
```

## Database Schema Changes

### New Collection: prompt_rules
```typescript
{
  promptId: string;           // Unique identifier
  name: string;               // Human-readable name
  description?: string;       // Optional description
  classificationPrompt: string; // Stage A prompt
  extractionPrompt: string;   // Stage B prompt
  createdAt: Date;
  updatedAt: Date;
}
```

### Updated Collection: accounts
```typescript
{
  // ... existing fields ...
  promptId: string;  // NEW: Reference to prompt_rules
}
// NEW INDEX: promptId
```

### Updated Collection: telegram_messages
```typescript
{
  // ... existing fields ...
  history: [{
    // ... existing fields ...
    notes?: string;  // NEW: Optional audit notes (e.g., JSON-stringified AI response)
  }]
}
```

## Message Payload Changes

### TRANSLATE_MESSAGE_REQUEST
```typescript
{
  promptId: string;        // NEW
  exp: number;
  messageId: string;
  channelId: string;
  messageText: string;
  prevMessage: string;
  quotedMessage?: string;
  quotedFirstMessage?: string;
  orders: Order[];
}
```

### TRANSLATE_MESSAGE_RESULT
```typescript
{
  promptId: string;        // NEW
  messageId: string;
  channelId: string;
  isCommand: boolean;
  meta: {
    confidence: number;
    receivedAt: number;
    processedAt: number;
    duration: number;
  };
  commands?: ICommand[];
  note?: string;
}
```

## Testing Strategy

### Unit Tests
- AI service interface and types
- Gemini AI service (classification, extraction, data processing)
- Prompt cache service (cache hit/miss, TTL, invalidation)
- Message handlers (trade-manager and interpret-service)

### Integration Tests
- PromptRule repository CRUD operations
- Account repository with promptId queries
- Gemini AI service with real API (test key)
- Prompt cache with MongoDB (in-memory cache, no Redis needed)
- Full message flow from NEW_MESSAGE to TRANSLATE_MESSAGE_RESULT
- clearCache method for test cleanup

### End-to-End Tests
- Multi-account scenario with different promptIds
- Cache behavior across multiple requests
- History tracking with AI response notes

## Migration Path

1. **Phase 1**: DAL layer (models, repositories, tests)
2. **Phase 2**: Message payloads (add promptId fields)
3. **Phase 3**: AI service layer (interface, Gemini, caching)
4. **Phase 4**: interpret-service integration
5. **Phase 5**: trade-manager integration

All changes are additive - no breaking changes.

## Risks and Mitigations

| Risk                                     | Mitigation                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| Prompt cache staleness (30 min TTL)      | Document clearly, provide `clearCache()` method, service restart clears cache |
| Multiple requests increase Redis load    | Monitor metrics, most channels have 1-3 accounts                              |
| Gemini API rate limits                   | Implement exponential backoff, monitor usage                                  |
| Prompt injection attacks                 | Admin-controlled prompts, validate on creation                                |
| **MVP**: In-memory cache lost on restart | Acceptable for single instance, migrate to Redis when scaling                 |

## Validation

Run validation:
```bash
openspec validate implement-interpret-ai-service --strict
```

Status: ✅ **VALID**

## Next Steps

1. Review and approve this proposal
2. Implement tasks sequentially (see `tasks.md`)
3. Run full test suite
4. Deploy to staging for validation
5. Archive change after production deployment

## Related Files
- `proposal.md`: High-level overview and impact
- `design.md`: Architectural decisions and trade-offs
- `tasks.md`: Detailed implementation checklist
- `specs/*/spec.md`: Requirement deltas for each affected capability
