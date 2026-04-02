# Design: Support Multiple AI Commands

## Overview

This document outlines the design decisions for supporting multiple commands in a single AI response, including the addition of an explicit `side` field and the transition from single-object to array-based response structure.

## Architecture

### Current Architecture

```
Message → AI Service → Single TranslationResult → Handler → Single Command Payload
```

**Current Response Structure**:
```typescript
{
  isCommand: true,
  command: 'LONG',
  confidence: 0.95,
  reason: 'Clear buy signal',
  extraction: {
    symbol: 'XAUUSD',
    isImmediate: false,
    entry: 2450,
    stopLoss: 2440,
    // side is implicit (LONG = buy, SHORT = sell)
  }
}
```

### New Architecture

```
Message → AI Service → TranslationResult[] → Handler → Commands Array Payload
```

**New Response Structure**:
```typescript
[
  {
    isCommand: true,
    command: 'CLOSE_ALL',
    confidence: 0.95,
    reason: 'Close all XAUUSD positions',
    extraction: {
      symbol: 'XAUUSD',
      side: 'buy',  // Explicit side
      isImmediate: true
    }
  },
  {
    isCommand: true,
    command: 'SHORT',
    confidence: 0.90,
    reason: 'Open short EURUSD',
    extraction: {
      symbol: 'EURUSD',
      side: 'sell',  // Explicit side
      isImmediate: false,
      entry: 1.0500,
      stopLoss: 1.0520
    }
  }
]
```

## Key Design Decisions

### 1. Array-Based Response (Not Discriminated Union)

**Decision**: Change `AIResponseSchema` from `Type.Union([...])` to `Type.Array(Type.Union([...]))`

**Rationale**:
- **Natural representation**: Multiple commands are naturally represented as an array
- **Extensibility**: Easy to add more commands without changing the schema structure
- **Backward compatible**: Single command becomes array with 1 item
- **Simpler logic**: Handlers can iterate over array instead of complex conditional logic

**Alternatives Considered**:
- **Nested discriminated union**: Would be complex and harder to extend
- **Separate multi-command type**: Would require duplication and complex type guards

### 2. Explicit `side` Field with `CommandSide` Enum

**Decision**: Add `side?: CommandSide` to `AIExtraction` interface using new `CommandSide` enum

**Rationale**:
- **Type safety**: Using enum instead of string literals prevents typos
- **Clarity**: Makes trading direction explicit, not inferred from command type
- **Consistency**: Matches `CommandEnum` pattern for all command-related types
- **Flexibility**: Allows commands like CLOSE_ALL to specify which side to close
- **Context preservation**: Multi-command messages can have different sides
- **Future-proofing**: Supports more complex scenarios (e.g., "close buy positions and open sell")

**CommandSide Enum**:
```typescript
export enum CommandSide {
  BUY = 'BUY',   // Open long position
  SELL = 'SELL', // Open short position
}
```

**Current Implicit Mapping**:
```typescript
// Before: Implicit (no side field)
LONG → buy (inferred)
SHORT → sell (inferred)
CLOSE_ALL → both? (ambiguous)
```

**New Explicit Mapping**:
```typescript
// After: Explicit with CommandSide enum
LONG → extraction.side = CommandSide.BUY
SHORT → extraction.side = CommandSide.SELL
CLOSE_ALL → extraction.side = CommandSide.BUY | CommandSide.SELL | undefined (context-dependent)
```


### 3. Breaking Change Strategy

**Decision**: Completely remove legacy fields from `TranslateMessageResultPayload` - clean break, no backward compatibility

**Rationale**:
- **Cleaner schema**: No field duplication, single source of truth
- **Simpler code**: No need to maintain backward compatibility logic
- **Better design**: Commands array is the only way to access command data
- **Easier to understand**: One clear pattern for all consumers
- **Future-proof**: Ready for multi-command scenarios from day one

**This is a BREAKING CHANGE**:
- ❌ Old consumers expecting `isCommand`, `command`, `confidence`, `reason`, `extraction` fields will break
- ✅ All consumers must migrate to use `commands` array
- ✅ All known consumers (interpret-service, trade-manager) have been updated

**New Payload Structure**:
```typescript
{
  // Metadata fields
  promptId: string,
  accountId: string,
  traceToken: string,
  receivedAt: number,
  messageId: string,
  channelId: string,
  
  // ONLY field for command data
  commands: Array<{
    isCommand: boolean,
    command: CommandEnum,
    confidence: number,
    reason: string,
    extraction?: {
      symbol?: string,
      side?: CommandSide,  // NEW: Explicit side field
      isImmediate?: boolean,
      // ... other extraction fields
    }
  }>  // Minimum 1 item
}
```

**Logging & Monitoring** (reports ALL commands):
```typescript
// Logs include ALL commands
logger.info({
  commandCount: 2,
  commands: [
    { command: CommandEnum.CLOSE_ALL, isCommand: true, confidence: 0.95 },
    { command: CommandEnum.SHORT, isCommand: true, confidence: 0.90 }
  ]
});

// Sentry spans include details for EACH command
span.setAttribute('commandCount', 2);
span.setAttribute('command.0.type', CommandEnum.CLOSE_ALL);
span.setAttribute('command.1.type', CommandEnum.SHORT);
```

### 4. Minimum Array Length Validation

**Decision**: Soft validation (in handler logic) instead of schema constraint

**Rationale**:
- **Better error messages**: Handler can provide context-specific error messages
- **Flexibility**: Schema remains simple and focused on structure
- **Error handling**: Handler can decide how to handle empty arrays (error vs default)

**Implementation**:
```typescript
// In TranslateRequestHandler
private buildResultPayload(translationResults: TranslationResult[], ...) {
  if (translationResults.length === 0) {
    throw new Error('AI service returned empty results array');
  }
  
  return {
    promptId,
    accountId,
    traceToken,
    receivedAt,
    messageId,
    channelId,
    commands: translationResults.map(r => ({
      isCommand: r.isCommand,
      command: r.command,
      confidence: r.confidence,
      reason: r.reason,
      extraction: r.extraction
    }))
  };
}

// Logging reports ALL commands
logger.info({
  commandCount: translationResults.length,
  commands: translationResults.map(r => ({
    command: r.command,
    isCommand: r.isCommand,
    confidence: r.confidence
  }))
});
```

### 5. Schema Organization

**Decision**: Keep `AIResponseSchema` as array of discriminated unions

**Structure**:
```typescript
// Base schemas (unchanged)
BaseResponseSchema
BaseExtractionSchema (+ side field)
TradeExtractionSchema
CloseExtractionSchema
// ...

// Command schemas (unchanged)
TradeCommandSchema
CloseCommandSchema
// ...

// Top-level schema (changed to array)
AIResponseSchema = Type.Array(
  Type.Union([
    TradeCommandSchema,
    CloseCommandSchema,
    // ...
  ])
)
```

**Rationale**:
- **Minimal changes**: Only top-level schema changes
- **Type safety preserved**: Discriminated unions still work within array
- **Clear structure**: Each command is independently valid

### 6. Remove accountId for Performance Optimization

**Decision**: Remove `accountId` from translation message flow and revert to per-promptId publishing

**Rationale**:
- **Performance**: Reduces message size and volume in Redis streams
- **Simplification**: accountId was added for order context, but orders are no longer used
- **Deduplication**: Multiple accounts with same promptId no longer generate duplicate messages
- **Model limitations**: AI models can't effectively use order context due to response time constraints

**Changes**:
1. **Schema level**: Remove `accountId` field from `TranslateMessageRequestPayload` and `TranslateMessageResultPayload`
2. **Interface level**: Remove `accountId` parameter from `IAIService.translateMessage()`
3. **Session caching**: Change cache key from `(channelId, accountId, promptId, promptHash)` to `(channelId, promptId, promptHash)`
4. **Publishing logic**: Group accounts by `promptId` and publish one request per unique promptId

**Gemini AI Preservation**:
- Keep Gemini AI code intact to avoid breaking changes
- Use placeholder `'default'` value for accountId in session manager
- Allows future reactivation if needed without code changes

**Before (Current Flow)**:
```
telegram-service → NEW_MESSAGE
  → trade-manager finds 3 accounts:
     - acc1 (promptId: "A", accountId: "123")
     - acc2 (promptId: "A", accountId: "456")
     - acc3 (promptId: "B", accountId: "789")
  → publishes 3 TRANSLATE_MESSAGE_REQUESTs (one per account)
  → interpret-service processes 3 messages
  → 3 AI calls with different accountIds
```

**After (Optimized Flow)**:
```
telegram-service → NEW_MESSAGE
  → trade-manager finds 3 accounts, groups by promptId:
     - promptId "A": [acc1, acc2]
     - promptId "B": [acc3]
  → publishes 2 TRANSLATE_MESSAGE_REQUESTs (one per unique promptId)
  → interpret-service processes 2 messages
  → 2 AI calls without accountId (uses 'default' for Gemini)
```

**Performance Impact**:
- **Message volume**: Reduced by ~50-70% in typical scenarios (multiple accounts per channel)
- **Message size**: Reduced by ~20 bytes per message (no accountId field)
- **Processing time**: Faster due to fewer messages to process
- **Redis memory**: Lower memory usage in streams

## Data Flow

### Single Command Flow

```
1. User message: "LONG XAUUSD at 2450"
   ↓
2. AI Service: translateMessage()
   ↓
3. AI Response: [{ isCommand: true, command: 'LONG', extraction: {...} }]
   ↓
4. Handler: buildResultPayload()
   ↓
5. Payload: {
     isCommand: true,
     command: 'LONG',
     commands: [{ isCommand: true, command: 'LONG', ... }]
   }
   ↓
6. Publish to stream
```

### Multi-Command Flow (Future)

```
1. User message: "Close XAUUSD and SHORT EURUSD at 1.0500"
   ↓
2. AI Service: translateMessage()
   ↓
3. AI Response: [
     { isCommand: true, command: 'CLOSE_ALL', extraction: { symbol: 'XAUUSD', side: 'buy' } },
     { isCommand: true, command: 'SHORT', extraction: { symbol: 'EURUSD', side: 'sell', entry: 1.0500 } }
   ]
   ↓
4. Handler: buildResultPayload()
   ↓
5. Payload: {
     // Legacy fields from first command
     isCommand: true,
     command: 'CLOSE_ALL',
     extraction: { symbol: 'XAUUSD', side: 'buy' },
     
     // New array field with all commands
     commands: [
       { isCommand: true, command: 'CLOSE_ALL', ... },
       { isCommand: true, command: 'SHORT', ... }
     ]
   }
   ↓
6. Publish to stream
```

## Type Safety

### TypeScript Discriminated Unions

The array structure preserves TypeScript's discriminated union type safety:

```typescript
// Type narrowing still works within array
translationResults.forEach(result => {
  if (result.command === 'LONG' || result.command === 'SHORT') {
    // TypeScript knows extraction has entry, stopLoss, etc.
    console.log(result.extraction.stopLoss);
  }
  
  if (result.command === 'CLOSE_ALL') {
    // TypeScript knows extraction only has symbol, isImmediate, side
    console.log(result.extraction.symbol);
  }
});
```

### Schema Validation

TypeBox schema validation ensures:
- Each command in array is valid
- Discriminated union constraints are enforced
- Required fields are present
- Optional fields have correct types

## Migration Strategy

### ✅ Phase 1: Infrastructure & Breaking Change (COMPLETE)
- ✅ Update schemas to support array and `side` field
- ✅ Add `CommandSide` enum for explicit side values
- ✅ Update AI service interface to return `TranslationResult[]`
- ✅ Update handlers to build `commands` array
- ✅ **Remove legacy fields** from `TranslateMessageResultPayload`
- ✅ Update all consumers (interpret-service, trade-manager) to use `commands` array
- ✅ Use `CommandEnum` values in all schemas for type safety

### Phase 2: Prompt Updates (Future)
- Update AI prompts to detect multiple commands
- Train/test AI to return multiple commands
- Validate multi-command scenarios
- Update prompt tests for multi-command cases

## Testing Strategy

### Unit Tests
- ✅ Schema validation with array inputs
- ✅ Handler logic with single and multiple commands
- ✅ Empty array error handling
- ✅ **No legacy fields**: Tests verify only `commands` array exists
- ✅ **Logging verification**: All commands are logged
- ✅ **Metrics verification**: commandCount and per-command attributes
- ✅ **CommandEnum usage**: All tests use enum values, not string literals

### Integration Tests
- ✅ End-to-end flow with single command
- ✅ Verify published message structure (only `commands` array)
- ✅ Verify history entry includes all commands
- ✅ **Observability verification**: Logs and traces show all commands

### Prompt Tests
- Update existing tests to expect array
- Add future tests for multi-command scenarios

## Performance Considerations

### Memory Impact
- **Minimal**: Most messages will have 1 command (array with 1 item)
- **Acceptable**: Multi-command messages are rare, array overhead is negligible

### Processing Impact
- **No change**: Handler still processes one message at a time
- **Future optimization**: Could batch-process commands from same message

## Error Handling

### Empty Array
```typescript
if (translationResults.length === 0) {
  throw new Error('AI service returned empty results array');
}
```

### Invalid Command in Array
- TypeBox validation will catch invalid commands
- Each command is validated independently
- One invalid command doesn't affect others

### Breaking Change Impact
- **No backward compatibility**: Legacy fields completely removed
- **All consumers must migrate**: Update to use `commands` array
- **Known consumers updated**: interpret-service and trade-manager already migrated
- **Clean schema**: Only `commands` array for command data
- **Complete observability**: Logs/traces/metrics report ALL commands

## Open Questions

None - design is clear and approved.

## References

- User request: Update AI response structure to support multiple commands
- Related files:
  - `apps/interpret-service/src/services/ai/schemas/ai-response.schema.ts`
  - `apps/interpret-service/src/services/ai/types.ts`
  - `apps/interpret-service/src/services/ai/ai-service.interface.ts`
  - `libs/shared/utils/src/interfaces/messages/translate-message-result.ts`
  - `apps/interpret-service/src/events/consumers/translate-request-handler.ts`
