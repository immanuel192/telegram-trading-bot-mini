# Proposal: Setup Prompt Testing in Interpret-Service

## Overview

Establish a dedicated testing infrastructure for AI prompt engineering and validation in `interpret-service`. This includes creating a separate test suite for prompt testing, updating the message payload structure to align with AI response schema, and setting up CI automation for prompt validation.

## Context

The `interpret-service` uses Gemini AI to translate Telegram messages into structured trading commands. The quality of these translations depends heavily on prompt engineering. Currently:

- Prompts are stored in `apps/interpret-service/prompts/futu-color/prompt.txt`
- AI response schema is defined in `gemini-response-schema.ts`
- `TRANSLATE_MESSAGE_RESULT` payload structure doesn't match the AI schema
- No dedicated testing infrastructure for prompt validation
- No way to iterate on prompts with systematic testing

## Problem Statement

We need to:

1. **Create dedicated prompt testing infrastructure** separate from regular tests
2. **Align message payload structure** with AI response schema for consistency
3. **Enable systematic prompt iteration** with test-driven development
4. **Automate prompt validation** in CI pipeline
5. **Maintain clear separation** between prompt testing (requires AI API) and regular tests

## Proposed Solution

### 1. Prompt Testing Infrastructure

Create a dedicated test suite under `apps/interpret-service/test/prompts/` that:

- Uses real AI service (requires `AI_GEMINI_API_KEY`)
- Loads prompts from database or mocks `PromptCacheService`
- Tests prompt effectiveness with real-world scenarios
- Implements rate limiting to avoid API throttling
- Provides context builder utility and uses Jest's `expect.objectContaining()` for assertions

### 2. Test Configuration Updates

Update `jest.config.ts` to:

- Exclude `test/prompts/**` from default test runs
- Create separate `test:prompt` task for prompt-specific tests
- Maintain existing test coverage for regular tests

### 3. Message Payload Alignment

Update `TRANSLATE_MESSAGE_RESULT` to match AI response schema:

**Current Structure:**
```typescript
{
  promptId, traceToken, receivedAt, messageId, channelId,
  isCommand, meta, commands[], note
}
```

**Proposed Structure (aligned with AI schema):**
```typescript
{
  // Preserved fields
  promptId, traceToken, receivedAt, messageId, channelId,
  
  // AI response fields (from gemini-response-schema.ts)
  isCommand: boolean,
  confidence: number,
  reason: string,
  command: CommandEnum,
  extraction: {
    symbol: string,
    isImmediate: boolean,
    meta: { reduceLotSize?, adjustEntry? },
    entry: number | null,
    entryZone: number[] | null,
    stopLoss: number | null,
    takeProfits: Array<{price?: number, pips?: number}>,
    closeIds: string[] | null,
    validationError: string | null
  } | null
}
```

**Philosophy:**
1. AI translates message with context → structured response
2. `interpret-service` publishes AI response exactly as-is
3. `trade-manager` translates AI commands to internal actions

### 4. GitHub Actions Workflow

Create manual workflow `.github/workflows/prompt-testing.yml` to:

- Run on manual trigger (`workflow_dispatch`)
- Require `AI_GEMINI_API_KEY` secret
- Execute `nx test:prompt interpret-service`
- Report results

## Architecture

### Directory Structure

```
apps/interpret-service/
├── test/
│   ├── prompts/                    # NEW: Prompt testing suite
│   │   ├── utils/
│   │   │   ├── context-builder.ts  # Helper to build test context
│   │   │   └── assertions.ts       # Optional assertion helpers (uses expect.objectContaining)
│   │   └── futu-color/
│   │       └── prompt.spec.ts      # Prompt test cases
│   ├── integration/                # Existing integration tests
│   ├── unit/                       # Existing unit tests
│   └── setup.ts
├── prompts/
│   └── futu-color/
│       └── prompt.txt              # Existing prompt
└── jest.config.ts                  # Updated config
```

### Test Flow

```
beforeAll:
  1. Load prompt into DB (or mock PromptCacheService)
  2. Initialize IAIService instance
  3. Populate channel/context data

Test case:
  1. Build context (message, prevMessage, orders, etc.)
  2. Call AI service
  3. Validate response structure
  4. Assert expected command/extraction

afterEach:
  - Sleep 250ms (rate limiting)
```

## Implementation Scope

### In Scope

1. **Prompt Test Infrastructure**
   - Create `test/prompts/` directory structure
   - Setup context builder utility
   - Use Jest's `expect.objectContaining()` for response validation
   - Implement one sample test case
   - Add rate limiting between tests

2. **Test Configuration**
   - Update `jest.config.ts` to exclude prompts folder
   - Add `test:prompt` task to `project.json`
   - Document test execution

3. **Message Payload Update**
   - Update `TranslateMessageResultPayload` schema
   - Update validation rules
   - Update `translate-result-handler.ts` in trade-manager

4. **CI Automation**
   - Create GitHub Actions workflow for prompt testing
   - Configure secrets for `AI_GEMINI_API_KEY`

### Out of Scope

- Additional test cases (user will add)
- Prompt optimization
- Performance benchmarking
- Historical message replay

## Benefits

1. **Systematic Prompt Engineering**: Test-driven approach to prompt iteration
2. **Consistency**: Message payload matches AI schema exactly
3. **Separation of Concerns**: Prompt tests isolated from regular tests
4. **CI Integration**: Automated validation of prompt changes
5. **Developer Experience**: Clear utilities for testing prompts

## Risks and Mitigations

| Risk                  | Mitigation                                                    |
| --------------------- | ------------------------------------------------------------- |
| **API rate limiting** | Implement 250ms sleep between tests; manual workflow only     |
| **API costs**         | Manual trigger only; developers control when to run           |
| **Test flakiness**    | Use deterministic test data; validate schema not exact values |
| **Breaking changes**  | Update both schema and consumers atomically                   |

## Success Criteria

1. ✅ Prompt tests run independently from regular tests
2. ✅ `test:prompt` task executes successfully with API key
3. ✅ GitHub Actions workflow runs on manual trigger
4. ✅ `TRANSLATE_MESSAGE_RESULT` matches AI response schema
5. ✅ `trade-manager` consumes updated payload structure
6. ✅ One sample test case demonstrates the pattern

## Future Extensions

1. **Historical Message Replay**: Test prompts against real message history
2. **Prompt Versioning**: Track prompt changes and test results
3. **Performance Metrics**: Measure AI response time and accuracy
4. **Multi-Prompt Testing**: Test different prompts for different channels
