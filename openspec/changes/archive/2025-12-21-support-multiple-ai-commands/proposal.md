# Proposal: Support Multiple AI Commands

## Change ID
`support-multiple-ai-commands`

## Why

Trading messages in real-world scenarios often contain multiple commands that need to be executed together. The current single-command structure forces users to split these messages, losing important context and relationships between commands. This change enables the AI to detect and return multiple commands from a single message, improving user experience and maintaining semantic relationships between related trading actions.

## Problem Statement

The current AI response structure (`AIResponseSchema`) is designed to return a single command per message. However, real-world trading messages can contain multiple commands in one message. For example:

- "Close XAUUSD and open SHORT EURUSD at 1.0500"
- "Cancel all BTCUSDT orders and go LONG at 50000"
- "Set TP for XAUUSD at 2500 and move SL to entry for EURUSD"

### Current Behavior

```typescript
// Current: Single command response
{
  isCommand: true,
  command: 'LONG',
  confidence: 0.95,
  reason: 'Clear buy signal',
  extraction: { symbol: 'XAUUSD', ... }
}
```

**Limitations**:
- AI can only detect and extract ONE command per message
- Multi-command messages are either ignored or only partially processed
- Users must send separate messages for each command (poor UX)
- Loss of context when commands are related (e.g., "close X and open Y")

### Desired Behavior

```typescript
// New: Multiple commands response
[
  {
    isCommand: true,
    command: 'CLOSE_ALL',
    confidence: 0.95,
    reason: 'Close all XAUUSD positions',
    extraction: { symbol: 'XAUUSD', side: 'buy', ... }
  },
  {
    isCommand: true,
    command: 'SHORT',
    confidence: 0.90,
    reason: 'Open short EURUSD',
    extraction: { symbol: 'EURUSD', side: 'sell', entry: 1.0500, ... }
  }
]
```

**Benefits**:
- Support natural multi-command messages
- Maintain command relationships and context
- Better user experience (no need to split messages)
- More accurate AI interpretation with full context

## Proposed Solution

Update the AI response structure to support an array of commands while maintaining backward compatibility:

### 1. Schema Changes

**Add `side` field to extraction**:
- Add `side: 'buy' | 'sell'` to `AIExtraction` interface in `types.ts`
- Add `side` to `BaseExtractionSchema` in `ai-response.schema.ts`
- This makes the command side explicit (currently inferred from LONG/SHORT)

**Change response to array**:
- Update `AIResponseSchema` to be `Type.Array(Type.Union([...]))` instead of just `Type.Union([...])`
- Minimum 1 item (soft validation in logic, not schema)
- Each item in array is a complete command with its own classification and extraction

### 2. Interface Changes

**Update `IAIService.translateMessage`**:
```typescript
// Before
translateMessage(...): Promise<TranslationResult>

// After
translateMessage(...): Promise<TranslationResult[]>
```

**Update `TranslationResult` in types.ts**:
- Add `side?: 'buy' | 'sell'` to `AIExtraction` interface

### 3. Message Flow Changes

**Update `TranslateMessageResultPayload`**:
- Add new field `commands: TranslationResult[]` to support array of commands
- Keep existing fields (isCommand, command, confidence, reason, extraction) for backward compatibility during migration
- Soft validation: `commands` array must have at least 1 item

**Update `TranslateRequestHandler`**:
- Handle array response from `aiService.translateMessage()`
- Build result payload with `commands` array
- Update history recording to handle multiple commands

### 4. Test Updates

- Update all AI service tests to expect array responses
- Update translate-request-handler tests (unit + integration)
- Add test cases for multi-command scenarios
- Ensure single-command messages still work (array with 1 item)

### 5. Performance Optimization: Remove accountId

**Remove `accountId` from translation messages**:
- Remove `accountId` field from `TranslateMessageRequestPayload` schema
- Remove `accountId` field from `TranslateMessageResultPayload` schema
- Update `IAIService.translateMessage` to not require `accountId` parameter
- Change session cache key from `(channelId, accountId, promptId, promptHash)` to `(channelId, promptId, promptHash)`

**Revert to per-promptId publishing**:
- Update `NewMessageHandler` in trade-manager to group accounts by `promptId`
- Publish one `TRANSLATE_MESSAGE_REQUEST` per unique `promptId` (not per account)
- Reduces message volume when multiple accounts share the same promptId

**Preserve Gemini AI code**:
- Keep Gemini AI service implementation intact
- Use placeholder `'default'` value for accountId in session caching
- Allows future reactivation without code changes

## Scope

### In Scope
- Add `side` field to `AIExtraction` and `BaseExtractionSchema`
- Change `AIResponseSchema` to array type
- Update `IAIService.translateMessage` to return `Promise<TranslationResult[]>`
- Update `TranslateMessageResultPayload` to include `commands` array
- Update `TranslateRequestHandler` to handle array responses
- **Update `TranslateResultHandler` in trade-manager to process commands array**
- **Add enhanced logging for multiple commands in trade-manager**
- **Add metrics for multiple commands in trade-manager**
- **Remove `accountId` from `TranslateMessageRequestPayload` and `TranslateMessageResultPayload`**
- **Update `IAIService` interface to remove `accountId` parameter**
- **Update `NewMessageHandler` to publish one request per unique promptId**
- **Preserve Gemini AI code with placeholder accountId**
- Update all related tests (unit + integration) for both interpret-service and trade-manager

### Out of Scope
- Changes to AI prompts (will be done separately)
- Removal of old flattened fields from `TranslateMessageResultPayload` (keep for backward compatibility)
- Trade execution logic changes (only logging and metrics for now)
- Complete removal of Gemini AI code (preserved for future use)

## Success Criteria

1. **Functional**:
   - AI service returns array of commands
   - Single-command messages return array with 1 item
   - Multi-command messages can return multiple items
   - All existing tests pass with updated expectations
   - **accountId removed from translation message payloads**
   - **One TRANSLATE_MESSAGE_REQUEST published per unique promptId**
   - **Message volume reduced when accounts share promptIds**

2. **Type Safety**:
   - TypeScript compilation succeeds
   - No type errors in affected files
   - Proper discriminated union types maintained

3. **Quality**:
   - All tests passing (unit + integration)
   - Code coverage maintained or improved
   - No linting errors

4. **Performance**:
   - **Reduced message size (no accountId field)**
   - **Reduced message volume (per-promptId instead of per-account)**
   - **Gemini AI session caching still works with placeholder**

## Migration Path

### Phase 1: Schema, Interface, and Consumer Updates (This Change)
- Update schemas and interfaces
- Update interpret-service to produce array format
- **Update trade-manager to consume `commands` array**
- **Add enhanced logging and metrics for multiple commands**
- Keep backward compatibility in message payload (legacy fields maintained)

### Phase 2: AI Prompt Updates (Future Change)
- Update AI prompts to detect multiple commands
- Train/test AI to return multiple commands per message
- Remove legacy fields from payload (breaking change)

## Risks and Mitigations

| Risk                        | Impact | Mitigation                                                      |
| --------------------------- | ------ | --------------------------------------------------------------- |
| Breaking existing consumers | High   | Keep old flattened fields in payload for backward compatibility |
| AI prompt complexity        | Medium | Phase 2 work, start with schema changes first                   |
| Test maintenance overhead   | Low    | Update tests systematically, one file at a time                 |
| Array validation complexity | Low    | Soft validation (min 1 item) in handler logic                   |

## Dependencies

- None (self-contained change in interpret-service and shared libs)

## Timeline Estimate

- Schema updates (arrays + side field): 1-2 hours
- Interface and handler updates (interpret-service): 2-3 hours
- Trade-manager handler updates (commands array): 2-3 hours
- **accountId removal (schemas + interfaces + handlers)**: 3-4 hours
- Test updates (all services): 4-5 hours
- **Total**: 12-17 hours

## Open Questions

None - requirements are clear from user request.
