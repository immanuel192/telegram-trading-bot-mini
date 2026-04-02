# 🎯 UPDATED: Groq AI Integration with Stress Test & Model Pooling

## ✅ Status: READY FOR REVIEW (UPDATED)

The proposal has been **updated** with two critical additions based on your feedback:

1. **Phase 0: Stress Test App** - Validate Groq performance BEFORE integration
2. **Model Pooling** - Handle rate limits intelligently

---

## 🚨 CRITICAL: Phase 0 - Stress Test First!

### Why This is Essential

**"There is no point to keep doing but it perform bad"** - Exactly right!

Before refactoring anything, we need to **prove Groq works well** for our use case.

### Stress Test App (`testing/groq-stress-test/`)

**Interactive CLI Application**:
```bash
$ cd testing/groq-stress-test
$ npm start

🔑 Enter your Groq API key: ****
📊 Select model:
  1. llama-3.3-70b-versatile
  2. llama-3.1-8b-instant
  3. deepseek-r1-distill-llama-70b
  4. mixtral-8x7b-32768

Starting stress test...
[████████████████████] 45 msgs | Avg: 234ms | Success: 44 | Errors: 1 | Rate Limits: 0
```

**Features**:
- ✅ Interactive API key input
- ✅ Model selection menu (1-4)
- ✅ Test cases from `futu-color/prompt.txt` + generated variations
- ✅ Gradual throughput ramp-up (1 msg/sec → increasing)
- ✅ Random delays between messages (100-500ms)
- ✅ Random test selection
- ✅ Real-time performance metrics:
  - Response duration per message
  - Average response duration (rolling window)
  - Success/error counts
  - Rate limit hits
  - Throughput (msgs/sec)
- ✅ Ctrl+C for graceful shutdown with final stats

**Test Cases**:
- LONG commands with entry zones
- SHORT commands with immediate execution
- CLOSE/CLOSE_ALL commands
- Non-command messages (noise)
- Vietnamese messages
- Edge cases

**Decision Gate**:
- ✅ **If Groq performs well**: Proceed with integration
- ❌ **If Groq performs poorly**: STOP and discuss alternatives

---

## 🔄 Model Pooling Strategy

### The Problem

1. **Groq has rate limits** - Can't rely on single model
2. **No session caching** - Every request sends system prompt
3. **Need reliability** - Can't fail on rate limit

### The Solution: Model Pool

**Pool Configuration**:
```typescript
AI_GROQ_MODELS=deepseek-r1-distill-llama-70b,llama-3.3-70b-versatile
```

**How It Works**:

1. **Round-Robin Selection**: Distribute requests evenly across models
2. **Rate Limit Tracking**: Monitor rate limit hits per model
3. **Automatic Fallback**: If model hits rate limit, try next model
4. **Max 3 Retries**: Try up to 3 different models
5. **Statistics**: Track usage, errors, response times per model

**Model Pool Manager**:
```typescript
interface ModelPool {
  getNextModel(): string;                              // Round-robin selection
  recordSuccess(model: string, responseTime: number): void;  // Track success
  recordError(model: string, error: Error): void;      // Track errors
  recordRateLimit(model: string): void;                // Track rate limits
  getStats(): ModelPoolStats;                          // Get statistics
}
```

**Request Flow with Pooling**:
```
1. Get next model from pool (round-robin)
   ↓
2. Send request to Groq with selected model
   ↓
3a. Success → Record success + response time
3b. Rate Limit (429) → Record rate limit, try next model (max 3 retries)
3c. Other Error → Record error, return fallback response
```

**Benefits**:
- ✅ **Reduced Rate Limits**: Load distributed across models
- ✅ **Higher Reliability**: Automatic fallback
- ✅ **Better Monitoring**: Per-model statistics
- ✅ **Configurable**: Easy to add/remove models

---

## 📊 Updated Task Summary

**Total Tasks**: 18 (up from 14)
**Estimated Effort**: 3-4 days

### Phase Breakdown

**Phase 0: Stress Test** (2 tasks) - **DO THIS FIRST!**
- Task 0.1: Create stress test app
- Task 0.2: Run tests and document results

**Phase 1: Gemini Refactor** (4 tasks)
- Move Gemini code to `providers/gemini/`
- Update imports and tests

**Phase 2: Groq + Model Pool** (5 tasks)
- Add Groq SDK
- Create response schema
- **Implement model pool manager** 🆕
- **Implement Groq service with pooling** 🆕
- Integration tests

**Phase 3: Configuration** (3 tasks)
- Add provider config + model pool config
- Implement factory with pooling
- Provider switching tests

**Phase 4: Validation** (2 tasks)
- Run prompt tests with Groq
- Groq-specific validation

**Phase 5: Documentation** (3 tasks)
- Update README (include stress test + pooling docs)
- Update .env.sample
- Final integration tests

---

## 🏗️ Updated Architecture

```
apps/interpret-service/src/services/ai/providers/
├── gemini/                       # Session-based (unchanged)
│   ├── gemini-ai.service.ts
│   ├── gemini-session-manager.ts
│   ├── gemini-managed-session.ts
│   └── gemini-response-schema.ts
└── groq/                         # Stateless + Pooled
    ├── groq-ai.service.ts        # Uses model pool
    ├── model-pool.ts             # 🆕 Model pool manager
    └── groq-response-schema.ts

testing/
└── groq-stress-test/             # 🆕 Stress test app
    ├── src/
    │   ├── index.ts              # Main CLI
    │   ├── test-cases.ts         # Test message samples
    │   ├── groq-client.ts        # Groq API wrapper
    │   └── stats-tracker.ts      # Performance metrics
    ├── package.json
    └── README.md
```

---

## ⚙️ Updated Configuration

```bash
# Provider selection
AI_PROVIDER=groq  # 'gemini' | 'groq'

# Groq configuration with model pooling
AI_GROQ_API_KEY=gsk_xxx
AI_GROQ_MODELS=deepseek-r1-distill-llama-70b,llama-3.3-70b-versatile  # 🆕 Model pool

# Gemini configuration (preserved)
AI_GEMINI_API_KEY=xxx
AI_GEMINI_MODEL=gemini-2.5-flash-lite

# Shared configuration
AI_PROMPT_CACHE_TTL_SECONDS=1800
```

---

## 🎯 Critical Decision Flow

```
START
  ↓
Phase 0: Build Stress Test App
  ↓
Run Stress Test with Different Models
  ↓
Analyze Results
  ↓
┌─────────────────────────┐
│ Is Groq Fast Enough?    │
│ Are Rate Limits OK?     │
│ Is Accuracy Good?       │
└─────────────────────────┘
  ↓              ↓
 YES            NO
  ↓              ↓
Proceed    STOP & Discuss
  ↓         Alternatives
Phase 1-5
  ↓
DONE
```

**Decision Criteria**:
- ✅ Average response time < 500ms (faster than Gemini)
- ✅ Rate limits manageable with model pooling
- ✅ Accuracy matches Gemini (validated with test cases)
- ✅ Cost acceptable

---

## 💡 Example: Groq Service with Model Pooling

```typescript
export class GroqAIService implements IAIService {
  constructor(
    private readonly groqClient: Groq,
    private readonly modelPool: ModelPool,  // 🆕 Model pool
    private readonly promptCacheService: PromptCacheService,
    private readonly logger: Logger
  ) {}
  
  async translateMessage(...): Promise<TranslationResult> {
    const prompt = await this.promptCacheService.getPrompt(promptId);
    
    // Try up to 3 models if rate limited
    for (let attempt = 0; attempt < 3; attempt++) {
      const model = this.modelPool.getNextModel();  // 🆕 Round-robin
      
      try {
        const startTime = Date.now();
        
        const response = await this.groqClient.chat.completions.create({
          model,  // 🆕 Use pooled model
          messages: [
            { role: 'system', content: prompt.systemPrompt },
            { role: 'user', content: userMessage }
          ],
          response_format: { type: 'json_schema', ... }
        });
        
        const responseTime = Date.now() - startTime;
        this.modelPool.recordSuccess(model, responseTime);  // 🆕 Track success
        
        return JSON.parse(response.choices[0].message.content);
        
      } catch (error) {
        if (error.status === 429) {  // Rate limit
          this.modelPool.recordRateLimit(model);  // 🆕 Track rate limit
          this.logger.warn({ model, attempt }, 'Rate limit hit, trying next model');
          continue;  // Try next model
        }
        
        this.modelPool.recordError(model, error);  // 🆕 Track error
        throw error;
      }
    }
    
    // All models rate limited - return fallback
    return { isCommand: false, command: 'NONE', ... };
  }
}
```

---

## ✅ Validation

```bash
✅ openspec validate implement-groq-ai --strict
   Change 'implement-groq-ai' is valid
```

---

## 📂 Updated Files

All in `/openspec/changes/implement-groq-ai/`:
- ✅ `proposal.md` - Added Phase 0 + model pooling
- ✅ `design.md` - (needs update with pooling details)
- ✅ `tasks.md` - **18 tasks** with stress test + pooling
- ✅ `specs/groq-ai-integration/spec.md` - Groq requirements
- ✅ `SUMMARY.md` - This file

---

## 🎯 Next Steps

1. **Review Phase 0** - Stress test app requirements
2. **Review Model Pooling** - Strategy and implementation
3. **Approve or Request Changes**
4. **Start with Task 0.1** - Build stress test app
5. **Run Stress Test** - Validate Groq performance
6. **Decision Point** - Proceed or pivot based on results

---

## 🔑 Key Takeaways

### What's New
1. **Phase 0: Stress Test App** - Validate before building
2. **Model Pooling** - Handle rate limits intelligently
3. **Decision Gate** - Don't waste time if Groq is slow

### What Stayed the Same
- ✅ No breaking changes to `IAIService`
- ✅ Gemini stays as fallback
- ✅ Stateless Groq design
- ✅ Provider factory pattern

### Why This is Better
- ✅ **Risk Mitigation**: Test first, build later
- ✅ **Reliability**: Model pooling handles rate limits
- ✅ **Monitoring**: Per-model statistics
- ✅ **Flexibility**: Easy to add/remove models

---

**Ready for your approval!** 🚀

The updated proposal addresses:
1. ✅ Performance validation (stress test)
2. ✅ Rate limit handling (model pooling)
3. ✅ Risk mitigation (decision gate)
4. ✅ Monitoring (statistics tracking)

Let me know if you'd like any adjustments!
