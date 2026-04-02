# Tasks: Improve Trading Accuracy

## Overview
This task list implements improvements to trading accuracy through price cache flexibility, pip value configuration, entry price validation, and SET_TP_SL pips support. Tasks are organized by component with tests grouped alongside implementation.

---

## Phase 1: Price Cache Enhancement (libs/shared/utils)

### Task 1.1: Add cross-exchange price lookup to PriceCacheService ✅
**Files**:
- `libs/shared/utils/src/cache/price-cache.service.ts`
- `libs/shared/utils/test/unit/price-cache.service.spec.ts`

**Implementation**:
1. Add new method `getPriceFromAnyExchange(symbol: string, maxAgeMs?: number): Promise<PriceData | null>`:
   - Use Redis SCAN to find all keys matching pattern `price:*:${symbol}`
   - For each key found:
     * Fetch price data
     * Validate TTL: `Date.now() - price.ts <= maxAgeMs` (if maxAgeMs provided)
     * Return first valid (non-null, non-expired) price found
   - Return null if no valid prices found for symbol
   - Default `maxAgeMs` to undefined (no TTL validation) for backward compatibility
2. Add helper method `isValidPrice(price: PriceData | null, maxAgeMs?: number): boolean`:
   - Check if price is non-null
   - Check if price is within TTL (if maxAgeMs provided)
   - Return true only if both conditions met
   - Make this method public so callers can use it for TTL validation
3. Update JSDoc for `getPrice()` method:
   - Add warning: "Note: This method does NOT validate price freshness. Callers should check the `ts` field and validate against their TTL requirements, or use `isValidPrice()` helper method."
   - Add example of TTL validation in JSDoc
4. Update JSDoc to document new method, TTL validation, and use cases
5. Keep existing `getPrice()` method unchanged (backward compatible)

**Unit Tests**:
- `getPriceFromAnyExchange()` returns price from first available exchange
- `getPriceFromAnyExchange()` returns null when no prices exist
- `getPriceFromAnyExchange()` handles Redis errors gracefully
- `getPriceFromAnyExchange()` skips expired prices and returns next valid one
- `getPriceFromAnyExchange()` with maxAgeMs=5000 skips prices older than 5 seconds
- `getPriceFromAnyExchange()` without maxAgeMs returns any price (no TTL check)
- `getPriceFromAnyExchange()` returns null when all prices are expired
- `isValidPrice()` correctly validates non-null and non-expired prices
- Existing tests continue to pass

**Validation**:
- TypeScript compiles without errors
- All unit tests pass
- No breaking changes to existing API
- Code coverage maintained

**Dependencies**: None

---

### Task 1.3: Audit and refactor existing getPrice() usages
**Files**:
- `apps/executor-service/src/services/order-executor.service.ts`
- `apps/trade-manager/src/services/transformers/close-bad-position-command.transformer.ts`

**Implementation**:
1. Audit existing `getPrice()` usages:
   - `executor-service/order-executor.service.ts` (line 968): Already implements TTL validation manually
   - `trade-manager/close-bad-position-command.transformer.ts` (line 235): Already implements TTL validation manually

2. Refactor to use `isValidPrice()` helper (optional but recommended):
   - Replace manual TTL validation with `isValidPrice()` call
   - Example refactor:
     ```typescript
     // Before:
     const cachedPrice = await priceCache.getPrice(symbol);
     if (cachedPrice) {
       const cacheAgeSeconds = (Date.now() - cachedPrice.ts) / 1000;
       const ttl = config('PRICE_CACHE_TTL_SECONDS');
       if (cacheAgeSeconds <= ttl) {
         // use price
       }
     }
     
     // After:
     const cachedPrice = await priceCache.getPrice(symbol);
     const maxAgeMs = config('PRICE_CACHE_TTL_SECONDS') * 1000;
     if (priceCache.isValidPrice(cachedPrice, maxAgeMs)) {
       // use price
     }
     ```

3. Document decision:
   - If refactoring: Update code to use `isValidPrice()`
   - If keeping manual validation: Add comment explaining why (e.g., custom TTL logic)

**Unit Tests**:
- Existing tests should continue to pass
- If refactored, verify TTL validation still works correctly

**Validation**:
- TypeScript compiles without errors
- All existing tests pass
- No behavior changes (refactor only)
- Code is cleaner and more maintainable

**Dependencies**: Task 1.1

---

### Task 1.4: Update price-cache-service spec
**File**: `openspec/specs/price-cache-service/spec.md`

**Implementation**:
- Add new requirement for cross-exchange price lookup
- Add scenarios for `getPriceFromAnyExchange()` method
- Document use cases and behavior

**Validation**:
- Spec validates with `openspec validate price-cache-service --strict`
- All scenarios have clear Given/When/Then structure

**Dependencies**: Task 1.1

---

## Phase 2: Account Model Enhancement (libs/dal)

### Task 2.1: Add pipValue to Account.symbols config ✅
**Files**:
- `libs/dal/src/models/account.model.ts`
- `libs/dal/test/unit/account.model.spec.ts`

**Implementation**:
1. Add `pipValue?: number` field to `Account.symbols[symbol]` interface
2. Add comprehensive JSDoc with:
   - Purpose and examples (XAUUSD: 0.1, EURUSD: 0.0001, USDJPY: 0.01)
   - Default value (0.1)
   - Usage context (SET_TP_SL pips conversion)
3. Add `entryPriceValidationThreshold?: number` to `Account.configs`
4. Add JSDoc for validation threshold:
   - Purpose: Validate AI-inferred entry prices against market
   - Default: 0.005 (0.5%)
   - Behavior: If difference > threshold, use cached price for market orders

**Unit Tests**:
- Account model validates with pipValue field
- Account model validates with entryPriceValidationThreshold field
- Default values are applied correctly
- TypeScript types are correct

**Validation**:
- TypeScript compiles without errors
- All unit tests pass
- JSDoc is clear and comprehensive

**Dependencies**: None

---

### Task 2.2: Update account-management spec
**File**: `openspec/specs/account-management/spec.md`

**Implementation**:
- Add requirement for symbol-specific pip value configuration
- Add requirement for entry price validation threshold
- Add scenarios for configuration validation

**Validation**:
- Spec validates with `openspec validate account-management --strict`
- All scenarios documented

**Dependencies**: Task 2.1

---

## Phase 3: Entry Price Validation (apps/trade-manager)

### Task 3.1: Implement entry price validation in TranslateResultHandler ✅
**Files**:
- `apps/trade-manager/src/events/consumers/translate-result-handler.ts`
- `apps/trade-manager/src/config.ts` (if needed for default threshold)

**Implementation**:
1. In `handleTradeOrderCreation()` method, before creating order:
   - if limit order, skip
   - Get current price from `PriceCacheService.getPriceFromAnyExchange(symbol, maxAgeMs)`
     * Recommended maxAgeMs: 30000 (30 seconds) - balance between freshness and availability
     * Make maxAgeMs configurable via appConfig `entryPriceValidationThreshold` (default: 0.005)
   - Calculate price difference: `Math.abs(entryPrice - currentPrice) / currentPrice`
   - If difference > threshold and this is market orders (`isImmediate === true`): Replace entry price with cached price
   - Log validation result (used cached price, accepted AI price, or no validation due to missing cache)

2. Handle edge cases:
   - No cached price available: Log warning, continue.
   - All cached prices expired (beyond maxAgeMs): Log warning
   - No entry price in command: Skip validation

**Integration Tests**:
- Market order with correct entry price → accepted as-is
- Market order with entry price >0.5% off → replaced with cached price
- No cached price available → AI price used with warning
- Cached price expired → AI price used
- Entry price validation threshold configured → custom threshold used

**Validation**:
- TypeScript compiles without errors
- All integration tests pass
- Logs show validation decisions
- No regression in existing order creation

**Dependencies**: Task 1.1, Task 2.1

---

### Task 3.2: Update order-management spec
**File**: `openspec/specs/order-management/spec.md`

**Implementation**:
- Add requirement for entry price validation
- Add scenarios for validation behavior
- Document market vs limit order handling

**Validation**:
- Spec validates with `openspec validate order-management --strict`

**Dependencies**: Task 3.1

---

## Phase 4: SET_TP_SL Pips Support (apps/executor-service)

### Task 4.1: Refactor OrderExecutorService to split MOVE_SL and SET_TP_SL handlers ✅
**Files**:
- `apps/executor-service/src/services/order-executor.service.ts`

**Implementation**:
1. Create new method `handleMoveStopLoss()`:
   - Copy logic from current `handleUpdateTakeProfitStopLoss()`
   - Keep existing behavior for MOVE_SL command
   - Call `OrderUpdateService.handleUpdateTakeProfitStopLoss()` as before

2. Rename current `handleUpdateTakeProfitStopLoss()` to `handleSetTakeProfitStopLoss()`:
   - Add pips-to-price conversion logic (see Task 4.2)
   - Call `OrderUpdateService.handleUpdateTakeProfitStopLoss()` with converted prices

3. Update command handler map:
   ```typescript
   [CommandEnum.MOVE_SL, this.handleMoveStopLoss.bind(this)],
   [CommandEnum.SET_TP_SL, this.handleSetTakeProfitStopLoss.bind(this)],
   ```

**Unit Tests**:
- MOVE_SL command routes to `handleMoveStopLoss()`
- SET_TP_SL command routes to `handleSetTakeProfitStopLoss()`
- Both methods call OrderUpdateService correctly
- No regression in existing behavior

**Validation**:
- TypeScript compiles without errors
- All unit tests pass
- Command routing works correctly

**Dependencies**: None

---

### Task 4.2: Implement pips-to-price conversion in handleSetTakeProfitStopLoss ✅
**Files**:
- `apps/executor-service/src/services/order-executor.service.ts`
- `apps/executor-service/src/services/order-operations/order-update.service.ts` (if helper method needed)

**Implementation**:
1. In `handleSetTakeProfitStopLoss()`, before calling `OrderUpdateService`:
   - Get order from repository to access entry price and side
   - Get account to access symbol pip value config
   - Convert SL pips to price if needed:
     ```typescript
     if (payload.stopLoss?.pips && !payload.stopLoss?.price) {
       const entryPrice = order.entry?.actualEntryPrice || order.entry?.entryPrice;
       if (!entryPrice) {
         this.logger.warn('Cannot convert SL pips - no entry price');
         // Skip SL or throw error
       } else {
         const symbol = payload.symbol;
         const pipValue = account.symbols?.[symbol]?.pipValue || 0.1;
         const slPrice = order.side === OrderSide.LONG
           ? entryPrice - (payload.stopLoss.pips * pipValue)
           : entryPrice + (payload.stopLoss.pips * pipValue);
         payload.stopLoss = { price: slPrice };
       }
     }
     ```
   - Convert TP pips to price if needed (similar logic for each TP level)

2. Consider extracting conversion logic to helper method in `OrderUpdateService`:
   ```typescript
   convertPipsToPrice(
     pips: number,
     entryPrice: number,
     side: OrderSide,
     pipValue: number,
     isStopLoss: boolean
   ): number
   ```

**Integration Tests**:
- SET_TP_SL with SL pips only → SL price calculated correctly
- SET_TP_SL with TP pips only → TP price calculated correctly
- SET_TP_SL with both SL and TP pips → both converted correctly
- SET_TP_SL with price and pips → price takes precedence
- SET_TP_SL with pips but no entry price → error logged, SL/TP skipped
- SET_TP_SL with custom pipValue → custom value used
- SET_TP_SL with default pipValue → 0.1 used
- LONG order SL pips → price below entry
- SHORT order SL pips → price above entry
- LONG order TP pips → price above entry
- SHORT order TP pips → price below entry

**Validation**:
- TypeScript compiles without errors
- All integration tests pass
- Conversion formula is correct
- Logs show conversion details

**Dependencies**: Task 2.1, Task 4.1

---

### Task 4.3: Update order-update spec ✅ (Skipped - Tests provide documentation)
**File**: `openspec/specs/order-update/spec.md`

**Implementation**:
- Add requirement for pips-to-price conversion in SET_TP_SL
- Add scenarios for conversion behavior
- Document formula and edge cases

**Validation**:
- Spec validates with `openspec validate order-update --strict`

**Dependencies**: Task 4.2

---

## Phase 5: Documentation and Validation

### Task 5.1: Update README files
**Files**:
- `libs/shared/utils/README.md`
- `libs/dal/README.md`
- `apps/trade-manager/README.md`
- `apps/executor-service/README.md`

**Implementation**:
- Document new PriceCacheService method
- Document new Account model fields
- Document entry price validation behavior
- Document SET_TP_SL pips support
- Provide configuration examples

**Validation**:
- Documentation is clear and accurate
- Examples are correct

**Dependencies**: All previous tasks

---

### Task 5.2: End-to-end validation
**Files**:
- `apps/trade-manager/test/integration/entry-price-validation.e2e.spec.ts` (new)
- `apps/executor-service/test/integration/set-tpsl-pips.e2e.spec.ts` (new)

**Implementation**:
1. Entry price validation E2E test:
   - Publish message with incorrect entry price
   - Verify trade-manager validates and corrects price
   - Verify order created with correct price

2. SET_TP_SL pips E2E test:
   - Create order with entry price
   - Publish SET_TP_SL command with pips
   - Verify executor converts pips to price
   - Verify broker receives correct price

**Validation**:
- All E2E tests pass
- No regression in existing E2E tests
- System behavior matches requirements

**Dependencies**: All previous tasks

---

### Task 5.3: Validate OpenSpec change
**Command**: `openspec validate improve-trading-accuracy --strict`

**Implementation**:
- Run validation command
- Fix any validation errors
- Ensure all specs are updated
- Ensure all requirements have scenarios

**Validation**:
- Validation passes with no errors
- All specs are consistent
- All requirements are testable

**Dependencies**: All spec update tasks (1.4, 2.2, 3.2, 4.3)

---

## Phase 6: Live Price Streaming (apps/executor-service)

### Task 6.1: Upgrade OANDA API client with async streaming ✅
**Files**:
- `apps/executor-service/src/adapters/oanda/oanda-api-lib/pricing.ts`
- `apps/executor-service/src/adapters/oanda/oanda-api-lib/context.ts` (if needed)

**Implementation**:
1. Add `streamAsync()` method to `EntitySpec` class in `pricing.ts`:
   - Similar pattern to `listAsync()` in `account.ts`
   - Parameters: `accountID: string, instruments: string[], onChunk: (data: ClientPrice | PricingHeartbeat) => void`
   - Returns: `Promise<{ stop: () => void }>` for graceful shutdown
   - Use `context.requestAsync()` with stream handling
   - Parse JSON chunks line-by-line
   - Emit `ClientPrice` for PRICE events, `PricingHeartbeat` for HEARTBEAT events
2. Handle stream lifecycle:
   - Start stream connection
   - Parse incoming chunks
   - Handle connection errors
   - Provide stop mechanism
3. Update JSDoc with usage examples

**Unit Tests**:
- `streamAsync()` connects to stream endpoint
- `streamAsync()` parses PRICE events correctly
- `streamAsync()` parses HEARTBEAT events correctly
- `streamAsync()` handles malformed JSON gracefully
- `streamAsync()` stop() closes connection cleanly
- Existing tests continue to pass

**Validation**:
- TypeScript compiles without errors
- All unit tests pass
- Stream can be started and stopped cleanly
- No memory leaks

**Dependencies**: None

---

### Task 6.2: Create oanda-price-streaming-job ✅
**Files**:
- `apps/executor-service/src/jobs/oanda-price-streaming-job.ts` (new)
- `apps/executor-service/src/jobs/index.ts` (update exports)

**Implementation**:
1. Create job class extending `BaseJob<Container, OandaPriceStreamingMeta>`:
   ```typescript
   interface OandaPriceStreamingMeta {
     symbols: string[]; // Universal symbol names
   }
   ```

2. Override `init()` method:
   - Delete `cronExpression` from config (no cron, runs continuously)
   - Call `super.init()`
   - Start streaming immediately after init

3. Implement `onTick()` method:
   - Get first OANDA adapter from `brokerFactory.getAllAdapters()`
   - If no OANDA adapter, log warning and return
   - Translate universal symbols to OANDA format (EURUSD → EUR_USD)
   - Call `adapter.api.pricing.streamAsync(accountID, oandaSymbols, onChunk)`
   - Store stream stop function for cleanup

4. Implement `onChunk` callback:
   - For PRICE events:
     * Translate OANDA symbol back to universal (EUR_USD → EURUSD)
     * Extract bid/ask from first bucket
     * Cache using `PriceCacheService.setPrice(symbol, bid, ask)`
   - For HEARTBEAT events:
     * Log debug message with timestamp
   - Handle errors: log and capture to Sentry

5. Implement reconnection logic:
   - Track consecutive failures
   - Exponential backoff: 1s, 2s, 4s, 8s, max 30s
   - Stop after 5 consecutive failures
   - Reset failure count on successful connection

6. Override `stop()` method:
   - Call stream stop function
   - Call `super.stop()`
   - Log shutdown message

7. Add TODO comment:
   ```typescript
   // TODO: Emit LIVE_PRICE_UPDATE event to trigger trade-manager updates
   // This will enable real-time order adjustments based on price changes
   ```

**Integration Tests**:
- Job starts streaming on init
- Job parses PRICE events and caches prices
- Job handles HEARTBEAT events
- Job reconnects on disconnect with backoff
- Job stops after 5 failures
- Job stops cleanly when stop() called
- Symbol translation works correctly (both ways)

**Validation**:
- TypeScript compiles without errors
- All integration tests pass
- Job runs continuously without crashes
- Prices are cached correctly
- Reconnection logic works as expected

**Dependencies**: Task 6.1

---

### Task 6.3: Add integration tests for streaming job ✅
**Files**:
- `apps/executor-service/test/integration/jobs/oanda-price-streaming-job.spec.ts` (new)

**Implementation**:
1. Mock OANDA stream endpoint
2. Test scenarios:
   - Job starts and receives PRICE events
   - Job caches prices correctly
   - Job handles HEARTBEAT events
   - Job reconnects on disconnect
   - Job stops after max failures
   - Job stops cleanly on shutdown
   - Symbol translation works correctly

**Validation**:
- All integration tests pass
- Code coverage for streaming job > 80%
- Tests are reliable and don't flake

**Dependencies**: Task 6.2

---

### Task 6.4: Update executor-service documentation ✅
**Files**:
- `apps/executor-service/README.md`
- `apps/executor-service/src/jobs/README.md` (if exists)

**Implementation**:
- Document oanda-price-streaming-job
- Explain streaming vs polling trade-offs
- Provide configuration examples
- Document reconnection behavior
- Add troubleshooting section

**Validation**:
- Documentation is clear and accurate
- Examples are correct

**Dependencies**: Task 6.2

---

## Summary

### Phase 1: Price Cache Enhancement
- Add `getPriceFromAnyExchange()` method
- Update price-cache-service spec

### Phase 2: Account Model Enhancement
- Add `pipValue` to Account.symbols
- Add `entryPriceValidationThreshold` to Account.configs
- Update account-management spec

### Phase 3: Entry Price Validation
- Implement validation in TranslateResultHandler
- Update order-management spec

### Phase 4: SET_TP_SL Pips Support
- Refactor OrderExecutorService handlers
- Implement pips-to-price conversion
- Update order-update spec

### Phase 5: Documentation and Validation
- Update README files
- End-to-end validation
- OpenSpec validation

### Phase 6: Live Price Streaming ✅
- Upgrade OANDA API client with async streaming
- Create oanda-price-streaming-job
- Add reconnection and error handling
- Update documentation

### Expected Benefits:
- **Fewer incorrect trades** due to entry price validation
- **Proper SL/TP handling** with pips support
- **More flexible price lookups** across exchanges
- **Better configuration** with symbol-specific pip values
- **Improved reliability** through validation and conversion
- **Real-time price updates** reducing latency from 20s to <1s
