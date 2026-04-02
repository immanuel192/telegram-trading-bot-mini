# Message Payload Alignment

## Overview

Aligns `TRANSLATE_MESSAGE_RESULT` message payload structure with AI response schema for consistency.

## Scope

- Update `TranslateMessageResultPayload` schema in shared-utils
- Define and export `CommandEnum`
- Update interpret-service to publish aligned payload
- Update trade-manager to consume aligned payload
- Update validation rules and tests

## Key Changes

### Before (Old Structure)
```typescript
{
  promptId, traceToken, receivedAt, messageId, channelId,
  isCommand, meta: { confidence, ... }, commands[], note
}
```

### After (Aligned with AI Schema)
```typescript
{
  promptId, traceToken, receivedAt, messageId, channelId,
  isCommand, confidence, reason, command,
  extraction: { symbol, isImmediate, meta, entry, ... } | null
}
```

## Philosophy

1. **AI translates** message with context → structured response
2. **interpret-service publishes** AI response exactly as-is
3. **trade-manager translates** AI commands to internal actions

## Affected Components

- `libs/shared/utils/src/interfaces/messages/translate-message-result.ts`
- `libs/shared/utils/src/interfaces/messages/command-enum.ts`
- `apps/interpret-service/src/events/publishers/*` (wherever TRANSLATE_MESSAGE_RESULT is published)
- `apps/trade-manager/src/events/consumers/translate-result-handler.ts`

## Related Specs

- `ai-translation-service`: Source of AI response schema
- `message-events`: Message type definitions
- `stream-publisher`: Publishing mechanism
