## Context

The system currently processes telegram messages through a pipeline:
1. `telegram-service` receives messages and publishes to Redis stream
2. `trade-manager`'s `NewMessageHandler` processes NEW_MESSAGE events (raw message text only)
3. Messages are sent to `interpret-service` for AI translation
4. `TranslateResultHandler` processes translation results - **this is when we first have the symbol** from `command.extraction.symbol`
5. `TranslateResultHandler.validateEntryPrice()` already fetches live prices using `PriceCacheService` for entry price validation

**Key Insight:** We cannot fetch live price at NEW_MESSAGE time because we don't have the symbol yet. The symbol is extracted by the AI in interpret-service and returned in TRANSLATE_MESSAGE_RESULT.

Currently, `PriceCacheService` is only instantiated locally in `TranslateResultHandler.validateEntryPrice()` (line 586). We need to:
1. Refactor to make PriceCacheService container-managed and injectable
2. Extract the live price fetching logic from `validateEntryPrice()` (which includes threshold validation we don't need for audit)
3. Capture raw live price when processing translation results and store it in TelegramMessage

**Constraints:**
- Must maintain backward compatibility (livePrice is optional)
- Must use atomic MongoDB operations ($push, $set)
- Must not impact message processing performance
- Must follow n-tier architecture (DAL for models, services for business logic)
- Store one livePrice per message (first symbol encountered)

## Goals / Non-Goals

**Goals:**
- Add `livePrice` field to TelegramMessage model for human audit
- Refactor PriceCacheService to be container-managed and injectable
- Extract live price fetching logic from `validateEntryPrice()` into reusable helper method
- Capture raw live price (without threshold validation) in TranslateResultHandler when symbol is available
- Store one livePrice per message (first symbol encountered) using atomic MongoDB update
- Maintain existing `validateEntryPrice()` behavior for entry price validation

**Non-Goals:**
- Automated signal quality scoring (future enhancement)
- Real-time price alerts or notifications
- Historical price analysis or trending
- Changes to price streaming infrastructure
- Storing multiple prices per message (one price per message is sufficient for audit)

## Decisions

### Decision 1: Store livePrice at message level, not history level

**Rationale:** 
- The live price represents the market state when the message was first processed
- Storing at message level makes it easier to query and audit
- History entries track processing events, not market data
- Simpler schema and queries

**Alternative considered:** Store in history entry notes
- Rejected: Would require parsing history array to extract price data
- Rejected: Less discoverable for audit queries

### Decision 2: Capture live price in TranslateResultHandler, not NewMessageHandler

**Rationale:** 
- At NEW_MESSAGE time, we only have raw message text - no symbol information
- The symbol is extracted by AI in interpret-service and returned in `command.extraction.symbol`
- TranslateResultHandler is the first point where we have validated symbol information
- Timing is still accurate for audit (TRANSLATE_RESULT happens 1-2 seconds after NEW_MESSAGE)
- We already have price fetching infrastructure in `validateEntryPrice()`

**Alternative considered:** Extract symbol from raw message text in NewMessageHandler
- Rejected: Unreliable pattern matching, could extract wrong symbols
- Rejected: Duplicates AI's symbol extraction logic
- Rejected: Symbol might not match exchange's symbol format (e.g., "XAU/USD" vs "XAUUSD")

### Decision 3: Extract live price fetching into separate helper method

**Rationale:**
- `validateEntryPrice()` mixes two concerns: fetching price + validating threshold
- For audit, we need raw live price without threshold validation logic
- Extracting into `fetchLivePrice()` helper makes code more reusable and testable
- Keeps `validateEntryPrice()` focused on its validation purpose

**Implementation:**
```typescript
// New helper method
private async fetchLivePrice(symbol: string): Promise<number | null> {
  const priceCache = new PriceCacheService('', this.redis);
  const maxAgeMs = 30000; // 30 seconds
  const cachedPrice = await priceCache.getPriceFromAnyExchange(symbol, maxAgeMs);
  
  if (!cachedPrice) return null;
  return (cachedPrice.bid + cachedPrice.ask) / 2; // mid-price
}

// validateEntryPrice() calls fetchLivePrice() then does threshold validation
```

**Alternative considered:** Keep logic in validateEntryPrice() and call it for audit
- Rejected: Would apply unwanted threshold validation and potentially replace AI price
- Rejected: Confusing to call "validate" when we just want to fetch

### Decision 4: Register PriceCacheService instances per exchange in container

**Rationale:**
- Follows dependency injection pattern used throughout trade-manager
- Makes services testable (can inject mocks)
- Centralizes service instantiation
- Allows TranslateResultHandler to receive services via constructor (future use)

**Implementation:**
```typescript
// container.ts
const oandaPriceCacheService = new PriceCacheService('oanda', redis);
const mockPriceCacheService = new PriceCacheService('mock', redis);

// Container interface
interface Container {
  // ... existing
  priceCacheServices: {
    oanda: PriceCacheService;
    mock: PriceCacheService;
  };
}
```

**Alternative considered:** Keep local instantiation in handlers
- Rejected: Harder to test, violates DI pattern
- Rejected: Duplicates instantiation logic across handlers

### Decision 5: Store one livePrice per message (first symbol encountered)

**Rationale:**
- Most telegram signals contain a single symbol
- Storing one price keeps the model simple and queries fast
- First symbol is typically the primary trading pair in multi-symbol messages
- Sufficient for audit purposes (measuring signal timing accuracy)

**Implementation approach:**
- In `TranslateResultHandler.processCommand()`, after processing first command with a symbol
- Check if message already has livePrice (skip if already set)
- Fetch live price using `fetchLivePrice(command.extraction.symbol)`
- Update TelegramMessage document with atomic $set operation
- Log if price fetch fails but continue processing

## Risks / Trade-offs

**Risk:** Price cache might be empty for new symbols
→ **Mitigation:** Use graceful fallback (null livePrice), log warning for monitoring

**Risk:** Additional Redis query adds latency to message processing
→ **Mitigation:** getPriceFromAnyExchange uses SCAN which is non-blocking; price lookups are fast (< 10ms typically); only happens once per message

**Risk:** Timing gap between message receipt and translation (1-2 seconds)
→ **Accepted:** This is the earliest point we have validated symbol; 1-2 second delay is acceptable for audit purposes

**Trade-off:** Storing prices increases document size
→ **Accepted:** Single number field is negligible; audit value outweighs storage cost

**Trade-off:** Refactoring PriceCacheService registration touches multiple files
→ **Accepted:** Improves architecture and testability; one-time cost for long-term benefit
