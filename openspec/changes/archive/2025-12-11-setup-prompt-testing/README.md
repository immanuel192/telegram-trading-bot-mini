# Setup Prompt Testing

## Overview

This change establishes dedicated testing infrastructure for AI prompt engineering and validation in `interpret-service`, and aligns the `TRANSLATE_MESSAGE_RESULT` message payload structure with the AI response schema.

## Motivation

The quality of AI-powered message translation depends heavily on prompt engineering. Currently:
- No systematic way to test and iterate on prompts
- Message payload structure doesn't match AI response schema
- No CI automation for prompt validation

This change addresses these gaps by:
1. Creating dedicated prompt testing infrastructure
2. Aligning message payload with AI schema for consistency
3. Enabling test-driven prompt development

## Capabilities

### 1. Prompt Testing Infrastructure
- Dedicated test suite under `test/prompts/` (excluded from regular tests)
- Test utilities for context building and response validation
- Rate limiting to avoid API throttling
- Sample test template for LONG command
- GitHub Actions workflow for manual CI execution

**Spec**: [`specs/prompt-testing/spec.md`](./specs/prompt-testing/spec.md)

### 2. Message Payload Alignment
- Update `TRANSLATE_MESSAGE_RESULT` to match AI response schema
- Define `CommandEnum` matching AI command types
- Update interpret-service to publish aligned payload
- Update trade-manager to consume aligned payload

**Spec**: [`specs/message-payload-alignment/spec.md`](./specs/message-payload-alignment/spec.md)

## Impact

### Services Affected
- **interpret-service**: New prompt test suite, updated message publishing
- **trade-manager**: Updated message consumption
- **shared-utils**: Updated message schema and validation

### Breaking Changes
- `TRANSLATE_MESSAGE_RESULT` payload structure changes
- Old `commands[]` array replaced with `command` enum + `extraction` object
- Old `meta.confidence` moved to top-level `confidence`

### Migration Path
Both services updated atomically in this change - no migration needed.

## Dependencies

- Requires `AI_GEMINI_API_KEY` for prompt tests
- No new external dependencies

## Testing Strategy

- **Prompt Tests**: Integration tests with real AI service (manual CI trigger)
- **Unit Tests**: Updated for new payload structure
- **Integration Tests**: Updated for new payload structure in both services

## Success Criteria

1. ✅ Prompt tests run independently from regular tests
2. ✅ `nx test:prompt interpret-service` executes with API key
3. ✅ GitHub Actions workflow runs on manual trigger
4. ✅ `TRANSLATE_MESSAGE_RESULT` matches AI response schema
5. ✅ All existing tests pass with updated payload structure

## Future Work

- Add more prompt test cases for different command types
- Implement historical message replay for prompt validation
- Add prompt versioning and performance metrics
