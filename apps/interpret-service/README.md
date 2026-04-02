# Interpret Service

AI-powered message translation service for trading signals.

## Overview

The interpret-service consumes `TRANSLATE_MESSAGE_REQUEST` events from Redis Stream, translates Telegram messages into structured trading commands using Gemini AI, and publishes `TRANSLATE_MESSAGE_RESULT` events.

## Prompt Testing

### Overview

Prompt tests validate AI prompt effectiveness with real-world scenarios. These tests use the actual Gemini AI API and are separated from regular tests.

### Running Locally

**Prerequisites:**
- Valid `AI_GEMINI_API_KEY` environment variable

**Run prompt tests:**
```bash
# Set API key
export AI_GEMINI_API_KEY="your-api-key-here"

# Run prompt tests
npx nx test:prompt interpret-service
```

**Run regular tests (excludes prompt tests):**
```bash
npx nx test interpret-service
```

### Adding New Test Cases

1. Create test file in `test/prompts/<prompt-name>/`
2. Use the context builder utility:

```typescript
import { buildTestContext } from '../utils/context-builder';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';

describe('My Prompt Test', () => {
  // Skip if no API key
  const skipTests = !process.env.AI_GEMINI_API_KEY;
  if (skipTests) {
    it.skip('Skipping - AI_GEMINI_API_KEY not set', () => {});
    return;
  }

  afterEach(async () => {
    // Rate limiting: 250ms between tests
    await new Promise((resolve) => setTimeout(resolve, 250));
  });

  it('should classify LONG command', async () => {
    const messageText = 'LONG XAUUSD 2650 SL 2640 TP 2670';
    const context = buildTestContext(messageText);

    const result = await aiService.translateMessage(
      messageText,
      context,
      channelId,
      promptId
    );

    // Validate using expect.objectContaining
    expect(result.classification).toEqual(
      expect.objectContaining({
        isCommand: true,
        command: CommandEnum.LONG,
        confidence: expect.any(Number),
        reason: expect.any(String),
      })
    );

    expect(result.extraction).toEqual(
      expect.objectContaining({
        symbol: 'XAUUSD',
        entry: 2650,
        stopLoss: 2640,
      })
    );
  });
});
```

### GitHub Actions Workflow

Prompt tests can be triggered manually from GitHub Actions:

1. Go to **Actions** tab
2. Select **Prompt Testing** workflow
3. Click **Run workflow**
4. View results in workflow run

**Requirements:**
- `AI_GEMINI_API_KEY` must be set as a repository secret

### Best Practices

1. **Rate Limiting**: Always include 250ms delay in `afterEach` hook
2. **API Key Check**: Skip tests if `AI_GEMINI_API_KEY` is not set
3. **Flexible Assertions**: Use `expect.objectContaining()` for partial matching
4. **Test Organization**: Group tests by prompt type in subdirectories
5. **Context Building**: Use helper functions from `context-builder.ts`

### Test Structure

```
test/
├── prompts/                    # Prompt tests (excluded from default runs)
│   ├── utils/
│   │   └── context-builder.ts  # Context building helpers
│   └── futu-color/
│       └── prompt.spec.ts      # Prompt test cases
├── integration/                # Regular integration tests
└── unit/                       # Regular unit tests
```

### Configuration

**jest.config.ts** - Excludes prompt tests from default runs:
```typescript
testPathIgnorePatterns: ['/node_modules/', '/test/prompts/']
```

**jest.config.prompt.ts** - Runs only prompt tests:
```typescript
testMatch: ['<rootDir>/test/prompts/**/*.spec.ts']
```

## Architecture

### Message Flow

```
TRANSLATE_MESSAGE_REQUEST (Redis Stream)
  ↓
interpret-service (AI translation)
  ↓
TRANSLATE_MESSAGE_RESULT (Redis Stream)
  ↓
trade-manager (command execution)
```

### AI Response Schema

The service publishes AI responses directly without transformation:

```typescript
{
  // Metadata
  promptId: string;
  traceToken: string;
  receivedAt: number;
  messageId: string;
  channelId: string;

  // AI Response (published as-is)
  isCommand: boolean;
  confidence: number;  // 0-1
  reason: string;
  command: CommandEnum;  // LONG, SHORT, MOVE_SL, etc.
  extraction: {
    symbol: string;
    isImmediate: boolean;
    meta: { reduceLotSize?, adjustEntry? };
    entry: number | null;
    entryZone: number[] | null;
    stopLoss: number | null;
    takeProfits: Array<{ price?, pips? }>;
    closeIds: string[] | null;
    validationError: string | null;
  } | null;
}
```

## Development

### Running the Service

```bash
# Development mode
npx nx dev interpret-service

# Build
npx nx build interpret-service

# Run tests
npx nx test interpret-service

# Run prompt tests
npx nx test:prompt interpret-service
```

## Distributed Tracing

Interpret-service implements Sentry distributed tracing for monitoring AI translation performance.

### Trace Flow

```
[Incoming] TRANSLATE_MESSAGE_REQUEST with trace context
    ↓
TranslateRequestHandler.processWithTracing()
    ├─ fetch-orders (db.query)
    ├─ ai-translate (ai.inference)
    ├─ publish-result (queue.publish) → [Outgoing] TRANSLATE_MESSAGE_RESULT
    └─ add-history-entry (db.mutation)
```

### Service-Specific Spans

**TranslateRequestHandler:**
- `stream.consume.TRANSLATE_MESSAGE_REQUEST` - Main handler span
  - `fetch-orders` - Fetch orders for AI context
    - Attributes: `accountId`, `ordersCount`
  - `ai-translate` - AI inference for message translation
    - Attributes: `promptId`, `channelId`, `accountId`, `provider` (gemini/groq)
    - Result attributes: `isCommand`, `confidence`
  - `publish-result` - Publish translation result
    - Attributes: `streamMessageId`, `command`, `isCommand`
  - `add-history-entry` - Add translation history entry
    - Attributes: `channelId`, `messageId`, `historyType`

### Debugging

**Find slow AI translations:**
```
transaction:"ai-translate" duration:>5s
```

**Track AI confidence issues:**
```
transaction:"ai-translate" confidence:<0.5
```

**Find specific account translations:**
```
accountId:"account-123" transaction:"stream.consume.TRANSLATE_MESSAGE_REQUEST"
```

**Monitor AI provider performance:**
```
provider:"gemini" transaction:"ai-translate"
```

### Environment Variables

- `AI_GEMINI_API_KEY` - Required for AI translation and prompt tests
- `MONGODB_URI` - MongoDB connection string
- `REDIS_URL` - Redis connection string
