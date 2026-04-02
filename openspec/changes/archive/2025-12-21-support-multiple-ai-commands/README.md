# Support Multiple AI Commands

## Summary

This change updates the AI response structure to support multiple trading commands in a single message response. The key changes are:

1. **Add explicit `side` field**: Trading direction ('buy' or 'sell') is now explicit in extraction data
2. **Array-based responses**: AI service returns `TranslationResult[]` instead of single `TranslationResult`
3. **Commands array in payload**: `TranslateMessageResultPayload` includes new `commands` field
4. **Backward compatibility**: Legacy flattened fields maintained for gradual migration

## Motivation

Real-world trading messages often contain multiple commands:
- "Close XAUUSD and open SHORT EURUSD at 1.0500"
- "Cancel all BTCUSDT orders and go LONG at 50000"
- "Set TP for XAUUSD at 2500 and move SL to entry for EURUSD"

The current single-command structure cannot handle these scenarios, forcing users to split messages or losing context.

## Changes

### Schema Changes
- Added `side?: 'buy' | 'sell'` to `AIExtraction` interface
- Changed `AIResponseSchema` from single object to array of objects
- Added `commands: TranslationResult[]` to `TranslateMessageResultPayload`

### Interface Changes
- Updated `IAIService.translateMessage` to return `Promise<TranslationResult[]>`

### Implementation Changes
- Updated all AI providers (Gemini, Groq) to return arrays
- Updated `TranslateRequestHandler` to handle array responses
- **Updated `TranslateResultHandler` in trade-manager to process commands array**
- **Added enhanced logging for multiple commands**
- **Added metrics for per-command and multi-command scenarios**
- Updated all tests to expect array responses

## Impact

### For interpret-service
- ✅ Returns array of commands in TRANSLATE_MESSAGE_RESULT
- ✅ Maintains backward compatibility with legacy fields
- ✅ All tests updated and passing

### For trade-manager
- ✅ **Processes `commands` array from translation results**
- ✅ **Enhanced logging for multi-command scenarios**
- ✅ **Metrics for per-command and multi-command tracking**
- ✅ **Fallback to legacy fields for backward compatibility**
- ✅ **All tests updated and passing**

### For AI Prompts (Future)
- 📋 Can be updated to detect multiple commands
- 📋 Infrastructure ready to support multi-command responses

## Files Changed

### Core Schema Files
- `apps/interpret-service/src/services/ai/schemas/ai-response.schema.ts`
- `apps/interpret-service/src/services/ai/types.ts`
- `apps/interpret-service/src/services/ai/ai-service.interface.ts`
- `libs/shared/utils/src/interfaces/messages/translate-message-result.ts`

### Implementation Files (interpret-service)
- `apps/interpret-service/src/services/ai/providers/gemini/gemini-ai.service.ts`
- `apps/interpret-service/src/services/ai/providers/groq/groq-ai.service.ts`
- `apps/interpret-service/src/events/consumers/translate-request-handler.ts`

### Implementation Files (trade-manager)
- **`apps/trade-manager/src/events/consumers/translate-result-handler.ts`**

### Test Files
- All unit and integration tests for AI services (interpret-service)
- All prompt tests (interpret-service)
- All handler tests (interpret-service)
- **All handler tests (trade-manager)**

## Migration Guide

### For Consumers (trade-manager)

**Current (still works)**:
```typescript
const { isCommand, command, extraction } = payload;
if (isCommand && command === 'LONG') {
  // Process single command
}
```

**New (recommended)**:
```typescript
const { commands } = payload;
for (const cmd of commands) {
  if (cmd.isCommand && cmd.command === 'LONG') {
    // Process each command
    // Access explicit side: cmd.extraction.side
  }
}
```

## Testing

All tests updated and passing:
- ✅ Unit tests for AI services
- ✅ Integration tests for AI services
- ✅ Unit tests for handlers
- ✅ Integration tests for handlers
- ✅ Prompt tests
- ✅ Schema validation tests

## Related Documents

- [Proposal](./proposal.md) - Detailed problem statement and solution
- [Design](./design.md) - Architectural decisions and data flow
- [Tasks](./tasks.md) - Implementation task breakdown
- [Spec Deltas](./specs/) - Specification changes

## Status

🟢 **Ready for Implementation** - All design and planning complete, validation passed
