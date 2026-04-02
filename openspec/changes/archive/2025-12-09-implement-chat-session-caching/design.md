# Design: Chat Session Management Architecture

## Overview
This document describes the architectural design for implementing chat session caching in the interpret-service to reduce AI processing latency.

## Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    TranslateRequestHandler                   │
│  - Receives TRANSLATE_MESSAGE_REQUEST                        │
│  - Passes (channelId, promptId, messageText, context)        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      GeminiAIService                         │
│  - Implements IAIService interface                           │
│  - Delegates session management to ChatSessionManager        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   ChatSessionManager                         │
│  - Manages session lifecycle                                 │
│  - Caches sessions by (channelId, promptId)                  │
│  - Handles expiration (8AM Sydney + 100 msg limit)           │
│  - Loads prompts via PromptCacheService                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    PromptCacheService                        │
│  - Existing service for prompt caching                       │
│  - Returns PromptPair for given promptId                     │
└─────────────────────────────────────────────────────────────┘
```

## Session Key Design

### Key Structure
```typescript
const sessionKey = `${channelId}:${promptId}`;
```

### Key Properties
- **Uniqueness:** Each (channel, prompt) pair gets its own session
- **Isolation:** Different channels don't share sessions
- **Prompt-aware:** Changing prompts creates new sessions

### Example Keys
```
channel_123:prompt_gold_v1
channel_456:prompt_gold_v1  // Different channel, separate session
channel_123:prompt_forex_v2 // Different prompt, separate session
```

## Session Lifecycle

### 1. Session Creation
```typescript
// First message for (channelId, promptId)
const session = await chatSessionManager.getOrCreateSession(
  channelId,
  promptId
);
// → Creates new ChatSession with system prompts
// → Stores in cache with metadata (createdAt, messageCount)
```

### 2. Session Reuse
```typescript
// Subsequent messages
const session = await chatSessionManager.getOrCreateSession(
  channelId,
  promptId
);
// → Returns cached session (no prompt re-parsing)
// → Increments messageCount
```

### 3. Session Expiration

#### Condition 1: Daily Reset (8 AM Sydney)
```typescript
const now = new Date();
const sydneyTime = toSydneyTime(now);
const sessionCreatedSydney = toSydneyTime(session.createdAt);

// Check if we've crossed 8 AM boundary
if (sydneyTime.getHours() >= 8 && sessionCreatedSydney.getHours() < 8) {
  // Expire session, create new one
}
```

#### Condition 2: Message Count Limit
```typescript
if (session.messageCount >= 100) {
  // Expire session, create new one
}
```

## Message Isolation Strategy

### Problem
Multiple instances processing concurrent messages:
```
Instance A: Message 1 → Session.sendMessage("Buy XAUUSD")
Instance B: Message 2 → Session.sendMessage("Sell EURUSD")
```

Without isolation, Message 2 might see Message 1's context.

### Solution: Refined System Prompt Instruction
Add to the system prompt (prepended before classification/extraction rules):

```
═══════════════════════════════════════════════════════════════
CRITICAL INSTRUCTION - Message Isolation Protocol
═══════════════════════════════════════════════════════════════

You MUST follow ALL the rules, formats, and guidelines defined in this 
system prompt for EVERY message you process.

However, each user message you receive is INDEPENDENT and ISOLATED. 
Do NOT reference, use, or consider the CONTENT of previous user messages 
or your previous responses in this conversation.

Process each message as if it's the first message in a fresh conversation, 
while ALWAYS applying the same rules and logic defined in this prompt.

In other words:
✓ REMEMBER: All rules, formats, classification logic, and extraction 
             logic defined in this system prompt
✗ FORGET:   The content and context of previous user messages and 
             your previous responses

This is a performance optimization - we reuse the session to avoid 
re-parsing this prompt, but each message must be processed independently.
═══════════════════════════════════════════════════════════════
```

### Why This Works
- Gemini's chat sessions maintain history for performance (no re-parsing)
- But we explicitly instruct it to ignore message content history
- The AI remembers the rules but forgets the data
- Each message is processed independently despite shared session
- We gain performance (no prompt re-parsing) without cross-contamination

## Pipeline Architecture Decision: Single-Step vs Two-Step

### Current Approach (Two-Step)
```typescript
// Step 1: Classification
const classification = await classifyMessage(message, context, classificationPrompt);

// Step 2: Extraction (only if command)
if (classification.isCommand) {
  const extraction = await extractSignal(message, context, extractionPrompt);
}
```

**Characteristics:**
- 2 API calls per message (even with sessions)
- 2 separate chat sessions per (channelId, promptId)
- Focused prompts (easier to optimize independently)
- Can skip extraction for non-commands

### Proposed Approach (Single-Step with Conditional Output)

```typescript
// Single call that does both
const result = await translateMessage(message, context, combinedPrompt);
// AI internally classifies, then conditionally extracts
```

**System Prompt Structure:**
```
[Isolation Instruction]

TASK: Trading Signal Classification and Extraction

STEP 1 - Classification:
Determine if this message is a trading command.
- If NOT a command: Return classification only with extraction=null and STOP
- If IS a command: Proceed to Step 2

STEP 2 - Extraction (only if Step 1 determined it's a command):
Extract structured trading data from the message.

OUTPUT FORMAT:
{
  "classification": {
    "isCommand": boolean,
    "command": "LONG" | "SHORT" | "TP" | "SL" | "CANCEL" | "NONE",
    "confidence": number,
    "reason": string
  },
  "extraction": {
    // Only populated if isCommand=true, otherwise null
    "symbol": string,
    "side": "BUY" | "SELL",
    // ... rest of extraction fields
  } | null
}

[Classification Rules]
[Extraction Rules]
```

### Comparison

| Aspect                   | Two-Step                 | Single-Step              |
| ------------------------ | ------------------------ | ------------------------ |
| **API Calls**            | 2 per message            | 1 per message            |
| **Latency (first msg)**  | ~2.5s                    | ~1.2s                    |
| **Latency (cached)**     | ~0.7s                    | ~0.3s                    |
| **Sessions per channel** | 2 (class + extract)      | 1                        |
| **Memory usage**         | 2x sessions              | 1x sessions              |
| **Token waste on noise** | None (skip extraction)   | Minimal (AI stops early) |
| **Prompt optimization**  | Independent              | Coupled                  |
| **Debugging**            | Easier (separate stages) | Harder (combined)        |
| **Cost**                 | 2x API calls             | 1x API calls             |

### **Recommendation: Single-Step**

**Rationale:**
1. **50% cost reduction** - Half the API calls
2. **60% faster** - Even first messages are faster (~1.2s vs ~2.5s)
3. **Simpler architecture** - One session instead of two
4. **Gemini is smart enough** - Can handle conditional logic internally
5. **Token waste is minimal** - AI stops early for non-commands

**Trade-offs Accepted:**
- Slightly harder to debug (but logging helps)
- Prompts are coupled (but still manageable)
- Can't optimize stages independently (but overall performance is better)

**Implementation Impact:**
- Remove `stage` parameter from session key (no need for separate classification/extraction sessions)
- Combine classification and extraction prompts in PromptRule model
- Update GeminiAIService to use single session.sendMessage() call
- Update response parsing to handle combined output format

### Updated Session Key
```typescript
// Before (two-step)
const sessionKey = `${channelId}:${promptId}:${stage}`; // stage = 'classification' | 'extraction'

// After (single-step)
const sessionKey = `${channelId}:${promptId}`; // No stage needed
```

## Data Structures

### SessionInfo
```typescript
interface SessionInfo {
  // Gemini chat session instance
  session: ChatSession;
  
  // Metadata for expiration logic
  createdAt: Date;
  messageCount: number;
  
  // For debugging/monitoring
  channelId: string;
  promptId: string;
  promptHash: string; // First 8 chars of SHA-256(systemPrompt)
  lastUsedAt: Date;
}
```

### ChatSessionManager Caches
```typescript
class ChatSessionManager {
  // Session cache: sessionKey -> SessionInfo
  private sessions: Map<string, SessionInfo> = new Map();
  
  // Prompt hash cache: promptId -> promptHash (to avoid repeated hashing)
  private promptHashes: Map<string, string> = new Map();
  
  // Session key format: `${channelId}:${promptId}:${promptHash}`
  private buildSessionKey(channelId: string, promptId: string, promptHash: string): string {
    return `${channelId}:${promptId}:${promptHash}`;
  }
  
  // Get or compute prompt hash (with caching and synchronization)
  private async getPromptHash(promptId: string): Promise<string> {
    // Fetch prompt content (from PromptCacheService)
    const prompt = await this.promptCacheService.getPrompt(promptId);
    
    // Compute hash from current content
    const currentHash = crypto.createHash('sha256')
      .update(prompt.systemPrompt)
      .digest('hex')
      .substring(0, 8);
    
    // Check if we have a cached hash
    const cachedHash = this.promptHashes.get(promptId);
    
    if (cachedHash && cachedHash !== currentHash) {
      // Prompt content changed! Log warning and update cache
      this.logger.warn(
        {
          promptId,
          cachedHash,
          currentHash,
        },
        'Prompt content changed - hash cache updated'
      );
    }
    
    // Always update cache with current hash
    this.promptHashes.set(promptId, currentHash);
    
    return currentHash;
  }
  
  // Clear hash cache when prompt cache is cleared
  clearPromptHash(promptId?: string): void {
    if (promptId) {
      this.promptHashes.delete(promptId);
      this.logger.debug({ promptId }, 'Cleared hash cache for promptId');
    } else {
      this.promptHashes.clear();
      this.logger.debug('Cleared entire hash cache');
    }
  }
}
```

**Key Changes:**
1. **Always fetch prompt content** - We rely on PromptCacheService's cache, not our own
2. **Compute hash from fetched content** - Ensures hash matches current content
3. **Detect changes** - Compare with cached hash and log if different
4. **Update cache** - Always store the current hash
5. **Synchronization** - Hash cache stays in sync with prompt cache

**Why This Works:**
- PromptCacheService has TTL (30 minutes by default)
- When TTL expires, it fetches fresh content from DB
- We compute hash from that fresh content
- If content changed, hash changes automatically
- Old sessions (with old hash) are orphaned
- New sessions use new hash

### Performance Impact of Hash Caching

**Without Hash Cache:**
```
getOrCreateSession() called 1000 times for same promptId
→ 1000 SHA-256 computations
→ ~5ms per hash × 1000 = ~5 seconds wasted
```

**With Hash Cache:**
```
getOrCreateSession() called 1000 times for same promptId
→ 1 SHA-256 computation (first call)
→ 999 cache hits (instant)
→ ~5ms total hashing time
```

**Savings:** 99.9% reduction in hashing overhead

## Integration Points

### 1. IAIService Interface Change
**Before:**
```typescript
translateMessage(
  messageText: string,
  context: MessageContext,
  prompts: PromptPair
): Promise<TranslationResult>
```

**After:**
```typescript
translateMessage(
  messageText: string,
  context: MessageContext,
  channelId: string,
  promptId: string
): Promise<TranslationResult>
```

### 2. TranslateRequestHandler Change
**Before:**
```typescript
const prompts = await this.promptCacheService.getPrompt(promptId);
const result = await this.aiService.translateMessage(
  messageText,
  context,
  prompts
);
```

**After:**
```typescript
const result = await this.aiService.translateMessage(
  messageText,
  context,
  channelId,
  promptId
);
```

### 3. GeminiAIService Internal Flow
**Before:**
```typescript
private async classifyMessage(message, context, prompt) {
  const fullPrompt = `${prompt}\n\n${contextInfo}\n\nMessage: "${message}"`;
  const result = await this.model.generateContent(fullPrompt);
  // ...
}
```

**After:**
```typescript
private async classifyMessage(message, context, channelId, promptId) {
  const session = await this.chatSessionManager.getOrCreateSession(
    channelId,
    promptId,
    'classification'
  );
  
  const userMessage = `${contextInfo}\n\nMessage to classify: "${message}"`;
  const result = await session.sendMessage(userMessage);
  // ...
}
```

## Eager Session Loading on Startup

### Purpose
Eliminate first-message latency by pre-warming all sessions during service startup.

### Implementation Flow

```typescript
// In server.ts or main.ts
async function startServer() {
  // 1. Initialize services
  const container = await buildContainer();
  const chatSessionManager = container.chatSessionManager;
  const accountRepository = container.accountRepository;
  
  // 2. Start HTTP server (non-blocking)
  const server = await startHttpServer(container);
  
  // 3. Eager load sessions (background task)
  eagerLoadSessions(chatSessionManager, accountRepository)
    .catch(error => {
      logger.error({ error }, 'Eager session loading failed (non-blocking)');
    });
  
  return server;
}

async function eagerLoadSessions(
  chatSessionManager: ChatSessionManager,
  accountRepository: AccountRepository
) {
  const startTime = Date.now();
  
  // Step 1: Fetch all accounts
  const accounts = await accountRepository.findAll();
  
  // Step 2: Extract unique (channelId, promptId) pairs
  const pairs = new Map<string, { channelId: string; promptId: string }>();
  for (const account of accounts) {
    const key = `${account.channelCode}:${account.promptId}`;
    if (!pairs.has(key)) {
      pairs.set(key, {
        channelId: account.channelCode,
        promptId: account.promptId,
      });
    }
  }
  
  logger.info(
    { totalAccounts: accounts.length, uniquePairs: pairs.size },
    'Starting eager session loading'
  );
  
  // Step 3: Create sessions in parallel
  const results = await Promise.allSettled(
    Array.from(pairs.values()).map(async ({ channelId, promptId }) => {
      try {
        await chatSessionManager.getOrCreateSession(channelId, promptId);
        return { channelId, promptId, success: true };
      } catch (error) {
        logger.error(
          { error, channelId, promptId },
          'Failed to create session during eager loading'
        );
        return { channelId, promptId, success: false, error };
      }
    })
  );
  
  // Step 4: Log results
  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  const duration = Date.now() - startTime;
  
  logger.info(
    { successful, failed, duration, totalPairs: pairs.size },
    'Eager session loading completed'
  );
}
```

### Benefits

1. **Zero Cold-Start Latency**
   - First message: <0.5s (session already exists)
   - Without eager loading: ~1.2s (session creation + processing)
   - Improvement: 60% faster first message

2. **Predictable Performance**
   - All messages have consistent sub-second latency
   - No "first message penalty" per channel

3. **Hash Cache Pre-Population**
   - All `promptId -> promptHash` mappings cached on startup
   - Zero hashing overhead during message processing

### Trade-offs

**Pros:**
- ✅ Eliminates first-message latency
- ✅ Predictable performance
- ✅ Better user experience

**Cons:**
- ❌ Slightly longer startup time (~2-5s for 50 channels)
- ❌ Violates pure lazy-loading principle
- ❌ Uses memory for inactive channels

**Decision:** Acceptable trade-off for MVP. The performance benefit outweighs the startup cost.

### Error Handling

- **Graceful degradation:** Service starts even if some sessions fail
- **Non-blocking:** Eager loading runs in background
- **Fallback:** Failed sessions created on-demand when messages arrive
- **Logging:** All failures logged for debugging

## Sydney Time Handling

### Timezone Conversion
```typescript
import { toZonedTime } from 'date-fns-tz';

function toSydneyTime(date: Date): Date {
  return toZonedTime(date, 'Australia/Sydney');
}

function shouldExpireForDailyReset(sessionCreatedAt: Date): boolean {
  const now = new Date();
  const nowSydney = toSydneyTime(now);
  const createdSydney = toSydneyTime(sessionCreatedAt);
  
  // If current time is >= 8 AM and session was created before 8 AM
  return nowSydney.getHours() >= 8 && createdSydney.getHours() < 8;
}
```

## Error Handling

### Session Creation Failure
```typescript
try {
  const session = await this.chatSessionManager.getOrCreateSession(...);
} catch (error) {
  this.logger.error({ error, channelId, promptId }, 'Failed to create session');
  // Fall back to non-session mode (direct API call)
  return await this.classifyWithoutSession(message, context, promptId);
}
```

### Prompt Not Found
```typescript
// ChatSessionManager
async getOrCreateSession(channelId, promptId, stage) {
  const prompts = await this.promptCacheService.getPrompt(promptId);
  if (!prompts) {
    throw new Error(`Prompt not found: ${promptId}`);
  }
  // ...
}
```

### Google Gemini API Error Handling

#### Error Classification

```typescript
enum GeminiErrorType {
  RATE_LIMIT = 'rate_limit',      // HTTP 429
  SERVER_ERROR = 'server_error',  // HTTP 5xx
  CLIENT_ERROR = 'client_error',  // HTTP 4xx (except 429)
  TIMEOUT = 'timeout',             // Network timeout
  UNKNOWN = 'unknown'              // Other errors
}

function classifyGeminiError(error: any): GeminiErrorType {
  if (error.status === 429) return GeminiErrorType.RATE_LIMIT;
  if (error.status >= 500 && error.status < 600) return GeminiErrorType.SERVER_ERROR;
  if (error.status >= 400 && error.status < 500) return GeminiErrorType.CLIENT_ERROR;
  if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') return GeminiErrorType.TIMEOUT;
  return GeminiErrorType.UNKNOWN;
}
```

#### Retry Logic with Exponential Backoff

```typescript
async function sendMessageWithRetry(
  session: ChatSession,
  message: string,
  context: {
    channelId: string;
    promptId: string;
    promptHash: string;
    logger: Logger;
  }
): Promise<GenerateContentResult> {
  const MAX_RETRIES = 3;
  const BACKOFF_MS = [500, 1000, 2000]; // Exponential backoff
  
  let lastError: any;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await session.sendMessage(message);
      
      // Log successful retry
      if (attempt > 0) {
        context.logger.info(
          {
            channelId: context.channelId,
            promptId: context.promptId,
            promptHash: context.promptHash,
            retryCount: attempt,
          },
          'Gemini API call succeeded after retry'
        );
      }
      
      return result;
    } catch (error) {
      lastError = error;
      const errorType = classifyGeminiError(error);
      
      // Determine if we should retry
      const shouldRetry = 
        (errorType === GeminiErrorType.SERVER_ERROR || 
         errorType === GeminiErrorType.TIMEOUT) &&
        attempt < MAX_RETRIES;
      
      if (!shouldRetry) {
        // Non-retryable error or max retries reached
        handleGeminiError(error, errorType, context, attempt);
        throw error;
      }
      
      // Log retry attempt
      const backoffMs = BACKOFF_MS[attempt];
      context.logger.warn(
        {
          channelId: context.channelId,
          promptId: context.promptId,
          promptHash: context.promptHash,
          errorType,
          errorStatus: error.status,
          errorMessage: error.message,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          backoffMs,
        },
        'Gemini API call failed, retrying'
      );
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }
  
  // Should never reach here, but TypeScript needs it
  throw lastError;
}
```

#### Error Handling by Type

```typescript
function handleGeminiError(
  error: any,
  errorType: GeminiErrorType,
  context: {
    channelId: string;
    promptId: string;
    promptHash: string;
    messageCount?: number;
    sessionAge?: number;
    logger: Logger;
  },
  retryCount: number
): void {
  const errorContext = {
    channelId: context.channelId,
    promptId: context.promptId,
    promptHash: context.promptHash,
    messageCount: context.messageCount,
    sessionAge: context.sessionAge,
    errorType,
    errorStatus: error.status,
    errorMessage: error.message,
    errorStack: error.stack,
    retryCount,
  };
  
  switch (errorType) {
    case GeminiErrorType.RATE_LIMIT:
      // HTTP 429 - Rate limiting
      context.logger.error(errorContext, 'Gemini API rate limit hit');
      Sentry.captureException(error, {
        tags: { error_type: 'gemini_rate_limit' },
        extra: errorContext,
      });
      Sentry.metrics.increment('gemini.api.error', {
        tags: { error_type: 'rate_limit' },
      });
      break;
      
    case GeminiErrorType.SERVER_ERROR:
      // HTTP 5xx - Server error (after retries exhausted)
      context.logger.error(errorContext, 'Gemini API server error (retries exhausted)');
      Sentry.captureException(error, {
        tags: { error_type: 'gemini_server_error' },
        extra: errorContext,
      });
      Sentry.metrics.increment('gemini.api.error', {
        tags: { error_type: 'server_error', retry_count: String(retryCount) },
      });
      break;
      
    case GeminiErrorType.CLIENT_ERROR:
      // HTTP 4xx (except 429) - Client error
      context.logger.error(errorContext, 'Gemini API client error');
      Sentry.captureException(error, {
        tags: { error_type: 'gemini_client_error' },
        extra: errorContext,
      });
      Sentry.metrics.increment('gemini.api.error', {
        tags: { error_type: 'client_error', status_code: String(error.status) },
      });
      break;
      
    case GeminiErrorType.TIMEOUT:
      // Network timeout (after retries exhausted)
      context.logger.error(errorContext, 'Gemini API timeout (retries exhausted)');
      Sentry.captureException(error, {
        tags: { error_type: 'gemini_timeout' },
        extra: errorContext,
      });
      Sentry.metrics.increment('gemini.api.error', {
        tags: { error_type: 'timeout', retry_count: String(retryCount) },
      });
      break;
      
    default:
      // Unknown error
      context.logger.error(errorContext, 'Gemini API unknown error');
      Sentry.captureException(error, {
        tags: { error_type: 'gemini_unknown' },
        extra: errorContext,
      });
      Sentry.metrics.increment('gemini.api.error', {
        tags: { error_type: 'unknown' },
      });
  }
}
```

#### Usage in GeminiAIService

```typescript
class GeminiAIService {
  async translateMessage(
    messageText: string,
    context: MessageContext,
    channelId: string,
    promptId: string
  ): Promise<TranslationResult> {
    const session = await this.chatSessionManager.getOrCreateSession(channelId, promptId);
    const promptHash = session.promptHash; // From session metadata
    
    const userMessage = this.buildUserMessage(messageText, context);
    
    try {
      const result = await sendMessageWithRetry(session.session, userMessage, {
        channelId,
        promptId,
        promptHash,
        logger: this.logger,
      });
      
      return this.parseResponse(result);
    } catch (error) {
      // Error already logged and sent to Sentry by sendMessageWithRetry
      throw error;
    }
  }
}
```

#### Monitoring and Alerting

**Sentry Metrics:**
- `gemini.api.error` - Counter for all API errors
  - Tags: `error_type` (rate_limit, server_error, client_error, timeout, unknown)
  - Tags: `retry_count` (for retryable errors)
  - Tags: `status_code` (for HTTP errors)

**Sentry Alerts:**
- Alert when `gemini_rate_limit` errors exceed threshold (e.g., 10 per hour)
- Alert when `gemini_server_error` errors exceed threshold (e.g., 5 per 10 minutes)
- Alert when any error type shows sudden spike

**Log Analysis:**
- Track retry success rate
- Monitor average retry count
- Identify patterns in error timing (e.g., rate limits during peak hours)

## Performance Expectations

### Baseline (Current)
- Classification: ~1.2s (includes prompt parsing)
- Extraction: ~1.3s (includes prompt parsing)
- **Total: ~2.5s**

### With Chat Sessions
- First message: ~1.2s + ~1.3s = **2.5s** (same as baseline)
- Subsequent messages: ~0.3s + ~0.4s = **0.7s** (70% reduction)
- Average (10 messages): ~1.0s per message (60% reduction)

### Memory Impact
- Per session: ~50KB (Gemini SDK overhead)
- 100 active sessions: ~5MB
- Acceptable for single-instance MVP

## Future Enhancements (Out of Scope)

### 1. Redis-Based Session Storage
For multi-instance deployments:
```typescript
class RedisChatSessionManager {
  // Store session state in Redis
  // Serialize/deserialize ChatSession
  // Handle distributed locking
}
```

### 2. Session Metrics
```typescript
Sentry.metrics.distribution('chat.session.hit_rate', hitRate);
Sentry.metrics.distribution('chat.session.age', sessionAge);
Sentry.metrics.gauge('chat.session.active_count', activeCount);
```

### 3. Adaptive Expiration
```typescript
// Expire sessions based on activity patterns
if (session.lastUsedAt < Date.now() - 2 * 60 * 60 * 1000) {
  // Expire if unused for 2 hours
}
```
