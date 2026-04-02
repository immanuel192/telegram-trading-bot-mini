# Proposal: Improve Trading Accuracy

## Change ID
`improve-trading-accuracy`

## Why

The trading bot currently suffers from accuracy and reliability issues that lead to incorrect trade execution and financial losses:

1. **AI Misinterpretation Causes Losses**: The AI sometimes misinterprets abbreviated prices (e.g., "Sell vàng 36" interpreted as entry=36 instead of entry=4236), resulting in rejected orders or execution at completely wrong prices. Without validation, these errors go undetected until money is lost.

2. **Pips Support Missing**: Traders often specify stop loss and take profit in pips (e.g., "SL 80 pips"), which is more intuitive than absolute prices. Currently, the executor-service silently ignores pips in SET_TP_SL commands, leaving orders unprotected. This is a critical safety issue.

3. **Price Cache Too Rigid**: The price cache is exchange-specific, making it impossible to validate entry prices when the account's exchange hasn't cached prices recently. Since symbols like XAUUSD have similar prices across brokers, we should be able to use any available price for validation.

4. **No Symbol-Specific Configuration**: Different symbols have different pip values (XAUUSD: 0.1, EURUSD: 0.0001), but the system lacks configuration for this, making accurate pips-to-price conversion impossible.

5. **High Price Latency**: The current `fetch-price-job` runs every 20 seconds via cron, causing significant latency in price updates. This delay can result in:
   - Stale prices used for entry price validation
   - Delayed execution of price-dependent orders
   - Missed trading opportunities due to outdated market data
   - OANDA provides a streaming endpoint that delivers real-time price updates, which we should leverage

**Impact**: These issues cause:
- Incorrect trade execution (wrong entry prices)
- Unprotected positions (SL/TP not set when using pips)
- Missed trading opportunities (orders rejected due to validation failures)
- Financial losses from misinterpreted signals
- Delayed reactions to market movements (20s polling latency)

**Solution Value**: This change will:
- Prevent AI misinterpretation errors through validation
- Enable proper risk management with pips support
- Improve system resilience with flexible price lookups
- Provide accurate pips-to-price conversion with symbol-specific configuration
- Reduce price latency from 20s to near real-time (<1s) with streaming

## Problem Statement

The trading bot currently has several accuracy and reliability issues that can lead to incorrect trade execution:

1. **Price Cache Inflexibility**: The `PriceCacheService` is tightly coupled to specific exchanges, making it impossible to fetch valid prices from any available exchange when needed. This is problematic because:
   - Symbols like XAUUSD have similar prices across brokers (small differences)
   - When validating entry prices, any valid price is better than no price
   - Current key format `price:${exchangeCode}:${symbol}` prevents cross-exchange lookups

2. **Missing Pip Value Configuration**: The system lacks symbol-specific pip value configuration, which is critical for:
   - Converting pips to price in SET_TP_SL commands
   - Different symbols have different pip values (XAUUSD: 0.1, EURUSD: 0.0001)
   - Currently hardcoded or missing, leading to incorrect calculations

3. **No Entry Price Validation**: The trade-manager doesn't validate entry prices against current market prices, leading to:
   - AI misinterpretation of abbreviated prices (e.g., "36" interpreted as "3600" instead of "4236")
   - Limit orders with prices far from market being accepted
   - Market orders using incorrect inferred prices

4. **SET_TP_SL Doesn't Support Pips**: The executor-service ignores pips in SET_TP_SL commands:
   - Trade-manager passes pips through, but executor-service only processes price
   - No conversion from pips to price happens
   - Silently fails, leaving orders without proper SL/TP

### Current Behavior Examples

**Price Cache Issue**:
```typescript
// Can only get price from specific exchange
const priceCache = new PriceCacheService('oanda', redis);
const price = await priceCache.getPrice('XAUUSD'); // Only from OANDA
// Cannot get price from ANY exchange if OANDA cache is stale
```

**Entry Price Issue**:
```
AI Output: "Sell vàng 36"
Interpreted as: entry = 36 (WRONG!)
Should be: entry = 4236 (current price ~4236)
Result: Order rejected or executed at wrong price
```

**SET_TP_SL Pips Issue**:
```typescript
// Trade-manager sends:
{ stopLoss: { pips: 80 } }

// Executor-service ignores pips, only checks:
if (stopLoss?.price) { /* ... */ }

// Result: SL not set, order unprotected
```

## Proposed Solution

### 1. Flexible Price Cache Service

**Add cross-exchange price lookup capability**:
- Keep existing exchange-specific behavior (backward compatible)
- Add new method `getPriceFromAnyExchange(symbol)` that scans all exchange keys
- Alternative: Add optional parameter `getPrice(symbol, fromAnyExchange = false)`

**Key Format Consideration**:
- Current: `price:${exchangeCode}:${symbol}`
- Proposed: Keep current format (no breaking change)
- Use Redis SCAN to find any valid price for a symbol

### 2. Symbol Pip Value Configuration

**Add `pipValue` to Account.symbols config**:
```typescript
symbols?: {
  [symbol: string]: {
    // ... existing fields
    /**
     * Pip value for this symbol
     * Examples:
     * - XAUUSD (Gold): 0.1 (1 pip = $0.10)
     * - EURUSD (Forex): 0.0001 (1 pip = 0.0001)
     * - USDJPY (Forex): 0.01 (1 pip = 0.01)
     * @default 0.1
     */
    pipValue?: number;
  };
};
```

### 3. Entry Price Validation in Trade-Manager

**Add validation in `handleTradeOrderCreation`**:
1. Fetch current price from cache (any exchange)
2. Compare with AI-inferred entry price
3. If difference > threshold (configurable, default 0.5%):
   - For market orders: Use cached price instead
   - For limit orders: Log warning but proceed
4. Add account config for threshold: `entryPriceValidationThreshold`

### 4. SET_TP_SL Pips Support in Executor-Service

**Refactor order update flow**:
1. Split `handleUpdateTakeProfitStopLoss` into two methods:
   - `handleMoveStopLoss` (for MOVE_SL command)
   - `handleSetTakeProfitStopLoss` (for SET_TP_SL command)
2. In `handleSetTakeProfitStopLoss`, add pips-to-price conversion:
   - Check if pips provided and no price
   - Get entry price from order
   - Get pipValue from account.symbols config
   - Convert: `price = entry ± (pips × pipValue)`
3. Pass converted price to existing logic

**Conversion Formula**:
```typescript
// For Stop Loss:
if (order.side === OrderSide.LONG) {
  slPrice = entryPrice - (pips * pipValue);
} else { // SHORT
  slPrice = entryPrice + (pips * pipValue);
}

// For Take Profit:
if (order.side === OrderSide.LONG) {
  tpPrice = entryPrice + (pips * pipValue);
} else { // SHORT
  tpPrice = entryPrice - (pips * pipValue);
}
```

### 5. Live Price Streaming for OANDA

**Replace polling with real-time streaming**:
1. Create `oanda-price-streaming-job` in executor-service
2. Upgrade OANDA API client to support async streaming:
   - Add `streamAsync()` method to `pricing.ts` (similar to `listAsync()` in `account.ts`)
   - Handle stream chunks asynchronously
3. Job implementation:
   - No cron expression (runs continuously once started)
   - Reads symbols from `meta.symbols` field in job config
   - Uses first OANDA adapter from factory (prices same across accounts)
   - Parses stream chunks: `PRICE` events → cache, `HEARTBEAT` → log
   - Translates OANDA symbols (EUR_USD) to universal format (EURUSD)
   - Implements reconnection logic with exponential backoff
   - Graceful shutdown in `stop()` method
4. Future enhancement (TODO placeholder):
   - Emit `LIVE_PRICE_UPDATE` event to trigger trade-manager updates

**Stream Response Format**:
```json
// PRICE event
{"type":"PRICE","instrument":"EUR_USD","time":"2016-09-20T15:05:47.960449532Z","bids":[{"price":"1.11690"}],"asks":[{"price":"1.11704"}],"closeoutBid":"1.11686","closeoutAsk":"1.11708","status":"tradeable"}

// HEARTBEAT event
{"type":"HEARTBEAT","time":"2016-09-20T15:05:50.163791738Z"}
```

**Error Handling**:
- Auto-reconnect on disconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- Stop after 5 consecutive failures
- Log all errors and capture to Sentry
- Graceful shutdown when job is stopped

## Scope

### In Scope
1. **Price Cache Enhancement**:
   - Add `getPriceFromAnyExchange` method to `PriceCacheService`
   - Update tests for cross-exchange lookup
   - Update JSDoc documentation

2. **Account Model Update**:
   - Add `pipValue` field to `Account.symbols` interface
   - Add comprehensive JSDoc with examples
   - Update account model tests

3. **Entry Price Validation**:
   - Add validation logic in `TranslateResultHandler.handleTradeOrderCreation`
   - Add `entryPriceValidationThreshold` to `Account.configs`
   - Add integration tests for validation scenarios

4. **SET_TP_SL Pips Support**:
   - Refactor `OrderExecutorService` to split MOVE_SL and SET_TP_SL handlers
   - Add pips-to-price conversion logic
   - Update `OrderUpdateService` if needed
   - Add integration tests for pips conversion

5. **Live Price Streaming**:
   - Upgrade OANDA API client (`pricing.ts`) with async `streamAsync()` method
   - Create `oanda-price-streaming-job` in executor-service
   - Implement stream parsing and price caching
   - Add reconnection logic with exponential backoff
   - Implement graceful shutdown
   - Add integration tests for streaming job
   - Add TODO placeholder for future `LIVE_PRICE_UPDATE` event

### Out of Scope
- Automatic pip value detection from broker APIs
- Historical price validation
- Advanced price anomaly detection
- Migration of existing orders
- UI for configuring these settings

## Success Criteria

1. **Functional**:
   - Price cache can fetch from any exchange when requested
   - Entry price validation catches and corrects misinterpreted prices
   - SET_TP_SL correctly converts pips to price
   - Live price streaming delivers real-time updates (<1s latency)
   - All existing functionality continues to work

2. **Quality**:
   - All new code has unit tests
   - Integration tests cover key scenarios
   - No regression in existing tests
   - Code coverage maintained or improved

3. **Performance**:
   - Price cache cross-exchange lookup adds minimal latency (<50ms)
   - Entry price validation doesn't slow down order processing
   - No impact on executor-service throughput
   - Price streaming reduces latency from 20s to <1s

## Migration Path

### Phase 1: Foundation (libs/shared, libs/dal)
- Update `PriceCacheService` with cross-exchange lookup
- Update `Account` model with `pipValue` and validation config
- Add tests

### Phase 2: Trade-Manager Enhancement
- Implement entry price validation
- Add configuration support
- Add integration tests

### Phase 3: Executor-Service Enhancement
- Refactor order update handlers
- Implement pips-to-price conversion
- Add integration tests

### Phase 4: Live Price Streaming (apps/executor-service)
- Upgrade OANDA API client with async streaming
- Implement oanda-price-streaming-job
- Add reconnection and error handling
- Add integration tests

### Phase 5: Validation
- End-to-end testing with real scenarios
- Monitor metrics for improvements
- Document new configurations

## Risks and Mitigations

| Risk                                   | Impact | Mitigation                                                                   |
| -------------------------------------- | ------ | ---------------------------------------------------------------------------- |
| Breaking existing price cache users    | High   | Add new method, keep existing behavior unchanged                             |
| Incorrect pip value defaults           | Medium | Use conservative default (0.1), require explicit config for critical symbols |
| Entry price validation false positives | Medium | Make threshold configurable, log warnings before rejecting                   |
| Pips conversion errors                 | High   | Comprehensive tests, validate against known examples                         |
| Performance degradation                | Low    | Optimize Redis SCAN, add caching, monitor metrics                            |
| Stream disconnections                  | Medium | Auto-reconnect with exponential backoff, stop after 5 failures               |
| Stream parsing errors                  | Medium | Robust error handling, log and skip malformed chunks                         |

## Dependencies

- Redis (existing)
- MongoDB (existing)
- No new external dependencies

## Timeline Estimate

- Price cache enhancement: 2-3 hours
- Account model updates: 1-2 hours
- Entry price validation: 4-5 hours
- SET_TP_SL pips support: 5-6 hours
- Live price streaming: 6-8 hours
- Tests: 6-8 hours
- Documentation: 2-3 hours
- **Total**: 27-36 hours

## Open Questions

1. **Price Cache Key Format**: Should we change the key format to `price:${symbol}:${exchangeCode}` for easier scanning? Or keep current format and use SCAN?
   - **Recommendation**: Keep current format, use SCAN to avoid breaking changes

2. **Entry Price Validation Threshold**: What should be the default threshold?
   - **Recommendation**: 0.5% (0.005) - catches major errors without false positives

3. **Pip Value Default**: What should be the default pip value?
   - **Recommendation**: 0.1 (works for XAUUSD, most common symbol)

4. **MOVE_SL vs SET_TP_SL**: Should MOVE_SL also support pips?
   - **Recommendation**: No, MOVE_SL is for relative movements (to entry, break-even), not pips
