# Design: Fetch Realtime Price and Account Balance

## Architecture Overview

This change introduces a Redis-based caching layer for real-time price and balance data, bridging the gap between broker APIs and order execution logic.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        trade-manager (Background Jobs)               │
│                                                                       │
│  ┌────────────────────────┐         ┌─────────────────────────┐    │
│  │  FetchBalanceJob       │         │  FetchPriceJob          │    │
│  │  • Cron: */1 * * * *   │         │  • Cron: */15 * * * * * │    │
│  │  • Get all adapters    │         │  • Get all adapters     │    │
│  │  • Group by exchange   │         │  • Group by exchange    │    │
│  │  • Fetch balance       │         │  • Fetch prices         │    │
│  └────────┬───────────────┘         └────────┬────────────────┘    │
│           │                                   │                      │
│           │ write                             │ write                │
│           ▼                                   ▼                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Redis Cache Layer                         │   │
│  │                                                               │   │
│  │  Balance Keys:                    Price Keys:                │   │
│  │  balance:oanda:acc-123           price:oanda:XAUUSD         │   │
│  │  balance:oanda:acc-456           price:oanda:EURUSD         │   │
│  │                                                               │   │
│  │  Value: { balance, marginUsed,   Value: { bid, ask, ts }    │   │
│  │          marginAvailable,                                    │   │
│  │          equity, ts }                                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────┬───────────────────────────┬─┘
                                        │ read                      │ read
                                        ▼                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     executor-service (Order Execution)               │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  OrderExecutorService.handleOpenOrder()                     │    │
│  │                                                              │    │
│  │  1. Create BalanceCacheService(exchangeCode, redis)        │    │
│  │  2. balance = getBalance(accountId)                        │    │
│  │  3. Validate: ts < 30min ago? reject : use                 │    │
│  │  4. Pass balance to LotSizeCalculator                      │    │
│  │  5. If no entry price:                                      │    │
│  │     a. Create PriceCacheService(exchangeCode, redis)       │    │
│  │     b. price = getPrice(symbol)                            │    │
│  │     c. Validate: ts < 32s ago? use : skip                  │    │
│  │     d. Set entry = midPrice (prevents deferred SL)         │    │
│  │     e. Add INFO history entry                              │    │
│  │  6. Calculate SL with entry (from cache or original)       │    │
│  │  7. Execute order with SL                                   │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. PriceCacheService

**Location**: `libs/shared/utils/src/cache/price-cache.service.ts`

**Purpose**: Manage price caching in Redis with exchange-scoped keys.

**Interface**:
```typescript
export interface PriceData {
  bid: number;
  ask: number;
  ts: number; // Unix timestamp in milliseconds
}

export class PriceCacheService {
  constructor(
    private exchangeCode: string,
    private redis: Redis
  ) {}

  async getPrice(symbol: string): Promise<PriceData | null>
  async setPrice(symbol: string, bid: number, ask: number): Promise<void>
  
  private getCacheKey(symbol: string): string // Returns: price:${exchangeCode}:${symbol}
}
```

**Key Design Points**:
- Universal symbol format in keys (e.g., `XAUUSD`, not `XAU_USD`)
- Timestamp stored as Unix milliseconds for easy TTL validation
- Returns `null` if key doesn't exist (caller validates TTL)
- No automatic expiry - jobs continuously update

**Redis Operations**:
```
SET price:oanda:XAUUSD '{"bid":2650.5,"ask":2651.0,"ts":1736640000000}'
GET price:oanda:XAUUSD
```

### 2. BalanceCacheService

**Location**: `libs/shared/utils/src/cache/balance-cache.service.ts`

**Purpose**: Manage balance caching in Redis with exchange and account scoping.

**Interface**:
```typescript
export interface BalanceInfo {
  balance: number;        // Total account balance
  marginUsed: number;     // Margin currently in use
  marginAvailable: number; // Available margin for new positions
  equity: number;         // Account equity (balance + unrealized P&L)
  ts: number;             // Unix timestamp in milliseconds
}

export class BalanceCacheService {
  constructor(
    private exchangeCode: string,
    private redis: Redis
  ) {}

  async getBalance(accountId: string): Promise<BalanceInfo | null>
  async setBalance(accountId: string, info: Omit<BalanceInfo, 'ts'>): Promise<void>
  
  private getCacheKey(accountId: string): string // Returns: balance:${exchangeCode}:${accountId}
}
```

**Key Design Points**:
- Standardized balance structure across all brokers
- Maps from broker-specific `AccountInfo` to `BalanceInfo`
- Timestamp auto-added on `setBalance()`
- Returns `null` if key doesn't exist

**Redis Operations**:
```
SET balance:oanda:acc-123 '{"balance":10000,"marginUsed":2000,"marginAvailable":8000,"equity":10500,"ts":1736640000000}'
GET balance:oanda:acc-123
```

### 3. Adapter Enhancements

**Changes to `IBrokerAdapter`**:
```typescript
export interface IBrokerAdapter {
  // ... existing methods ...
  
  // NEW: Getters for cache key construction
  get exchangeCode(): string;
  get accountId(): string;
  
  // MODIFIED: Support multiple symbols
  fetchPrice(symbols: string[]): Promise<PriceTicker[]>;
}
```

**Implementation in `BaseBrokerAdapter`**:
```typescript
export abstract class BaseBrokerAdapter implements IBrokerAdapter {
  constructor(
    protected accountId: string,
    protected brokerConfig: BrokerConfig,
    protected logger: LoggerInstance
  ) {}
  
  get exchangeCode(): string {
    return this.brokerConfig.exchangeCode;
  }
  
  get accountId(): string {
    return this.accountId;
  }
  
  // Subclasses implement fetchPrice(symbols: string[])
}
```

**OandaAdapter Multi-Symbol Fetch**:
```typescript
async fetchPrice(symbols: string[]): Promise<PriceTicker[]> {
  const brokerSymbols = symbols.map(s => this.resolveSymbol(s));
  
  const result = await this.client.pricing.getAsync(this.oandaAccountId, {
    instruments: brokerSymbols,
    includeHomeConversions: false,
    includeUnitsAvailable: false,
  });
  
  return result.prices.map((price, index) => ({
    symbol: symbols[index], // Return universal symbol
    bid: parseFloat(price.closeoutBid.toString()),
    ask: parseFloat(price.closeoutAsk.toString()),
    timestamp: Date.now(),
  }));
}
```

### 4. Adapter Factory Enhancement

**Changes to `BrokerAdapterFactory`**:
```typescript
export class BrokerAdapterFactory {
  private adapters = new Map<string, IBrokerAdapter>();
  
  // ... existing methods ...
  
  // NEW: Return all cached adapters as array
  getAllAdapters(): IBrokerAdapter[] {
    return Array.from(this.adapters.values());
  }
}
```

**Usage in Background Jobs**:
```typescript
const adapters = container.brokerFactory.getAllAdapters();
// Returns: [OandaAdapter, OandaAdapter, MockAdapter, ...]
```

### 5. Background Jobs

#### FetchBalanceJob

**Location**: `apps/trade-manager/src/jobs/fetch-balance-job.ts`

**Cron**: `0 */1 * * * *` (every 1 minute)

**Flow**:
```typescript
async onTick() {
  const adapters = this.container.brokerFactory.getAllAdapters();
  
  for (const adapter of adapters) {
    try {
      // 1. Fetch balance from broker
      const accountInfo = await adapter.getAccountInfo();
      
      // 2. Transform to BalanceInfo
      const balanceInfo: Omit<BalanceInfo, 'ts'> = {
        balance: accountInfo.balance,
        marginUsed: accountInfo.margin,
        marginAvailable: accountInfo.freeMargin,
        equity: accountInfo.equity,
      };
      
      // 3. Persist to Redis
      const balanceCache = new BalanceCacheService(
        adapter.exchangeCode,
        this.redis
      );
      await balanceCache.setBalance(adapter.accountId, balanceInfo);
      
      this.logger.info({ 
        exchangeCode: adapter.exchangeCode, 
        accountId: adapter.accountId 
      }, 'Balance cached successfully');
      
    } catch (error) {
      this.logger.error({ adapter: adapter.getName(), error }, 'Failed to fetch balance');
      Sentry.captureException(error);
      // Continue to next adapter
    }
  }
}
```

#### FetchPriceJob

**Location**: `apps/trade-manager/src/jobs/fetch-price-job.ts`

**Cron**: `*/15 * * * * *` (every 15 seconds, configurable)

**Meta Configuration**:
```typescript
interface FetchPriceJobMeta {
  symbols: string[]; // e.g., ['XAUUSD', 'EURUSD']
}
```

**Flow**:
```typescript
async onTick() {
  const adapters = this.container.brokerFactory.getAllAdapters();
  const symbols = this.jobConfig.meta.symbols || [];
  
  // Group adapters by exchangeCode (one fetch per exchange)
  const adaptersByExchange = new Map<string, IBrokerAdapter>();
  for (const adapter of adapters) {
    if (!adaptersByExchange.has(adapter.exchangeCode)) {
      adaptersByExchange.set(adapter.exchangeCode, adapter);
    }
  }
  
  // Fetch prices per exchange
  for (const [exchangeCode, adapter] of adaptersByExchange) {
    try {
      // 1. Fetch prices for all symbols
      const prices = await adapter.fetchPrice(symbols);
      
      // 2. Persist to Redis
      const priceCache = new PriceCacheService(exchangeCode, this.redis);
      for (const price of prices) {
        await priceCache.setPrice(price.symbol, price.bid, price.ask);
      }
      
      this.logger.info({ 
        exchangeCode, 
        symbolCount: prices.length 
      }, 'Prices cached successfully');
      
    } catch (error) {
      this.logger.error({ exchangeCode, error }, 'Failed to fetch prices');
      Sentry.captureException(error);
      // Continue to next exchange
    }
  }
}
```

### 6. Order Execution Integration

#### Balance Integration

**Location**: `apps/executor-service/src/services/order-executor.service.ts`

**Changes in `handleOpenOrder()`**:
```typescript
private async handleOpenOrder(
  adapter: IBrokerAdapter,
  payload: ExecuteOrderRequestPayload,
  account: Account
): Promise<void> {
  // ... existing code ...
  
  // NEW: Fetch balance cache
  const balanceCache = new BalanceCacheService(
    adapter.exchangeCode,
    this.redis
  );
  const cachedBalance = await balanceCache.getBalance(adapter.accountId);
  
  // Validate TTL
  let balanceToUse = account.balance; // Fallback to DB
  if (cachedBalance) {
    const ageMs = Date.now() - cachedBalance.ts;
    const maxAgeMs = this.config('BALANCE_CACHE_TTL_SECONDS') * 1000;
    
    if (ageMs < maxAgeMs) {
      balanceToUse = cachedBalance.balance;
      this.logger.debug({ 
        accountId: adapter.accountId, 
        balance: balanceToUse, 
        ageMs 
      }, 'Using cached balance');
    } else {
      this.logger.warn({ 
        accountId: adapter.accountId, 
        ageMs, 
        maxAgeMs 
      }, 'Balance cache expired, using DB value');
    }
  }
  
  // Pass to lot size calculator
  const adjustedLotSize = this.lotSizeCalculator.calculateLotSize({
    lotSize: lotSize || 0,
    symbol,
    account: { ...account, balance: balanceToUse }, // Override balance
    entry,
    stopLoss: adjustedStopLoss,
    leverage: resolvedLeverage,
    meta,
  });
  
  // ... rest of existing code ...
}
```

#### Price Integration

**Location**: `apps/executor-service/src/services/order-executor.service.ts`

**Simplified Approach**: Instead of handling price cache in the deferred SL section, fetch live price BEFORE the `shouldDeferStopLoss` check. If live price is available, set `entry`, which naturally prevents deferred SL.

**Changes in `handleOpenOrder()` at line ~231**:
```typescript
private async handleOpenOrder(
  adapter: IBrokerAdapter,
  payload: ExecuteOrderRequestPayload,
  account: Account
): Promise<void> {
  const {
    orderId,
    symbol,
    command,
    lotSize,
    isImmediate,
    entry,  // May be undefined for market orders
    stopLoss,
    takeProfits,
    leverage,
    meta,
    traceToken,
  } = payload;

  // ... existing code (market hours check, close opposite positions, select TP) ...

  // NEW: Fetch live price if no entry provided (market order without entry)
  let entryToUse = entry;
  let usedCachedPrice = false;
  
  if (!entry) {
    const priceCache = new PriceCacheService(
      adapter.exchangeCode,
      this.redis
    );
    const cachedPrice = await priceCache.getPrice(symbol);
    
    if (cachedPrice) {
      const ageMs = Date.now() - cachedPrice.ts;
      const maxAgeMs = this.config('PRICE_CACHE_TTL_SECONDS') * 1000;
      
      if (ageMs < maxAgeMs) {
        // Use mid price as entry
        entryToUse = (cachedPrice.bid + cachedPrice.ask) / 2;
        usedCachedPrice = true;
        
        this.logger.info({
          orderId,
          symbol,
          cachedPrice: entryToUse,
          ageMs,
        }, 'Using cached live price as entry for market order');
      } else {
        this.logger.warn({
          orderId,
          symbol,
          ageMs,
          maxAgeMs,
        }, 'Cached price too old, proceeding without entry');
      }
    } else {
      this.logger.debug({
        orderId,
        symbol,
      }, 'No cached price available, proceeding without entry');
    }
  }

  // EXISTING: Determine if we should defer stop loss calculation
  // Now with entryToUse potentially set from cache, this naturally prevents deferral
  const shouldDeferStopLoss = !entryToUse;

  // Calculate/adjust stop loss only if we have an entry price
  let adjustedStopLoss: { price?: number; pips?: number } | undefined;
  let shouldSyncTpSl = true;
  let brokerAdjustmentApplied: BrokerAdjustmentInfo | undefined;

  if (!shouldDeferStopLoss) {
    const slCalcResult = this.stopLossCalculator.calculateStopLoss({
      stopLoss,
      entry: entryToUse,  // Use entryToUse (may be from cache)
      command,
      symbol,
      account,
      meta,
    });

    adjustedStopLoss = slCalcResult.result;
    shouldSyncTpSl =
      slCalcResult.useForceStopLoss === false &&
      slCalcResult.result?.price > 0;
    brokerAdjustmentApplied = slCalcResult.brokerAdjustmentApplied;
  }

  // ... rest of existing code (resolve leverage, calculate lot size, open order) ...

  // Open the order
  const result = await this.orderOpenService.executeOpenOrder(
    adapter,
    {
      orderId,
      symbol,
      side: command === CommandEnum.LONG ? CommandSide.BUY : CommandSide.SELL,
      lotSize: adjustedLotSize,
      isImmediate: isImmediate ?? true,
      entry: entryToUse,  // Pass entryToUse (may be from cache)
      stopLoss: shouldDeferStopLoss ? undefined : adjustedStopLoss,
      takeProfits: selectedTakeProfit,
      leverage,
      meta,
      traceToken,
    },
    command
  );

  // Update database with order results
  await this.orderOpenService.updateOrderAfterOpen(
    orderId,
    result,
    payload,
    command,
    adjustedLotSize,
    shouldDeferStopLoss ? undefined : adjustedStopLoss,
    selectedTakeProfit,
    brokerAdjustmentApplied
  );

  // NEW: Add history entry if we used cached price
  if (usedCachedPrice) {
    await this.orderRepository.updateOne(
      { orderId } as any,
      {
        $push: {
          history: {
            _id: new ObjectId(),
            status: OrderHistoryStatus.INFO,
            service: ServiceName.EXECUTOR_SERVICE,
            ts: new Date(),
            traceToken,
            messageId: payload.messageId,
            channelId: payload.channelId,
            command,
            info: {
              message: 'Used cached live price as entry for market order',
              cachedPrice: entryToUse,
              symbol,
            },
          },
        },
      } as any
    );
  }

  // For orders without entry: calculate and set SL after execution using executed price
  // This section now only handles the case where we had no entry AND no cached price
  if (shouldDeferStopLoss && result.executedPrice) {
    const slCalcResult = this.stopLossCalculator.calculateStopLoss({
      stopLoss,
      entry: result.executedPrice, // Use executed price as entry
      command,
      symbol,
      account,
      meta,
    });

    if (slCalcResult.result?.price) {
      this.logger.info(
        {
          orderId,
          symbol,
          command,
          executedPrice: result.executedPrice,
          calculatedSL: slCalcResult.result.price,
          wasForced: !stopLoss,
          brokerAdjusted: !!slCalcResult.brokerAdjustmentApplied,
        },
        'Queueing deferred stop loss update via job'
      );

      // Trigger background job to set the SL on exchange
      await this.triggerAutoSyncJob({
        accountId: payload.accountId,
        targetOrderId: orderId,
        sl: slCalcResult.result,
        sourceOrderId: orderId,
      });
    }
    shouldSyncTpSl =
      slCalcResult.useForceStopLoss === false &&
      slCalcResult.result?.price > 0;
  }

  // ... rest of existing code (publish result, sync linked orders) ...
}
```

**Key Changes**:
1. **Early Price Fetch**: Fetch cached price BEFORE `shouldDeferStopLoss` check (line ~231)
2. **Set Entry**: If cached price is fresh, set `entryToUse = midPrice`
3. **Natural Flow**: The existing `shouldDeferStopLoss = !entryToUse` logic now works correctly
4. **History Tracking**: Add `OrderHistoryStatus.INFO` entry when cached price is used
5. **Simplified Logic**: No need for complex fallback in deferred SL section
6. **Deferred SL**: Only triggers when both cached price AND executed price are unavailable

**Benefits**:
- ✅ Simpler logic flow
- ✅ Reuses existing SL calculation path
- ✅ Clear audit trail via order history
- ✅ No duplication of SL calculation code
- ✅ Entry price is available for all downstream logic


## Configuration

### executor-service/config.ts

```typescript
export interface ExecutorServiceConfig extends BaseConfig {
  // ... existing config ...
  
  // NEW: Cache TTL configurations
  BALANCE_CACHE_TTL_SECONDS: number;
  PRICE_CACHE_TTL_SECONDS: number;
}

const defaultConfig: Record<keyof ExecutorServiceConfig, any> = {
  // ... existing defaults ...
  
  BALANCE_CACHE_TTL_SECONDS: 1800, // 30 minutes
  PRICE_CACHE_TTL_SECONDS: 32,     // 32 seconds (2 update cycles)
};
```

## Data Flow Examples

### Example 1: Balance Cache Flow

```
1. FetchBalanceJob (trade-manager)
   ├─ Get adapters: [OandaAdapter(acc-123), OandaAdapter(acc-456)]
   ├─ For acc-123:
   │  ├─ adapter.getAccountInfo() → { balance: 10000, equity: 10500, ... }
   │  ├─ Transform to BalanceInfo
   │  └─ Redis SET balance:oanda:acc-123 '{"balance":10000,...,"ts":1736640000000}'
   └─ For acc-456: (same process)

2. OrderExecutorService (executor-service)
   ├─ handleOpenOrder(adapter, payload, account)
   ├─ balanceCache.getBalance('acc-123')
   ├─ Redis GET balance:oanda:acc-123 → BalanceInfo
   ├─ Validate: (now - ts) < 30min? ✓
   ├─ Use cached balance in lot size calculation
   └─ Execute order with precise lot size
```

### Example 2: Price Cache Flow

```
1. FetchPriceJob (trade-manager)
   ├─ Get adapters, group by exchange: { oanda: [adapter1, adapter2] }
   ├─ For oanda exchange:
   │  ├─ adapter.fetchPrice(['XAUUSD', 'EURUSD'])
   │  ├─ Returns: [{ symbol: 'XAUUSD', bid: 2650.5, ask: 2651.0 }, ...]
   │  ├─ Redis SET price:oanda:XAUUSD '{"bid":2650.5,"ask":2651.0,"ts":...}'
   │  └─ Redis SET price:oanda:EURUSD '{"bid":1.0950,"ask":1.0951,"ts":...}'
   └─ Repeat every 15 seconds

2. OrderExecutorService (executor-service)
   ├─ Execute market order → result.executedPrice = undefined
   ├─ priceCache.getPrice('XAUUSD')
   ├─ Redis GET price:oanda:XAUUSD → { bid: 2650.5, ask: 2651.0, ts: ... }
   ├─ Validate: (now - ts) < 32s? ✓
   ├─ Use midPrice = 2650.75 for deferred SL calculation
   └─ Trigger job to set SL on exchange
```

## Error Handling

### Cache Miss
```typescript
const cachedBalance = await balanceCache.getBalance(accountId);
if (!cachedBalance) {
  this.logger.warn({ accountId }, 'Balance cache miss, using DB value');
  // Fallback to account.balance from DB
}
```

### Cache Expired
```typescript
if (ageMs >= maxAgeMs) {
  this.logger.warn({ accountId, ageMs, maxAgeMs }, 'Cache expired');
  // Fallback to DB or skip operation
}
```

### Redis Connection Failure
```typescript
try {
  await balanceCache.setBalance(accountId, balanceInfo);
} catch (error) {
  this.logger.error({ error }, 'Redis write failed');
  Sentry.captureException(error);
  // Continue - cache update failure is non-fatal
}
```

### Adapter Failure in Background Job
```typescript
for (const adapter of adapters) {
  try {
    // Fetch and cache
  } catch (error) {
    this.logger.error({ adapter: adapter.getName(), error }, 'Adapter failed');
    Sentry.captureException(error);
    // Continue to next adapter - don't let one failure stop all updates
  }
}
```

## Performance Considerations

1. **Redis Connection Pooling**: Reuse single Redis instance across services
2. **Batch Operations**: Fetch multiple symbols in one adapter call
3. **Grouping by Exchange**: Avoid redundant fetches for same exchange
4. **Async Operations**: All Redis operations are async, non-blocking
5. **TTL Validation**: Client-side validation avoids Redis TTL complexity

## Security Considerations

1. **Redis Access**: Ensure Redis is not publicly accessible
2. **Data Sensitivity**: Balance and price data is not highly sensitive but should be protected
3. **Error Messages**: Don't expose Redis connection details in logs

## Monitoring and Observability

1. **Metrics to Track**:
   - Cache hit/miss rate
   - Cache age distribution
   - Job execution duration
   - Adapter failure rate

2. **Logs to Monitor**:
   - Cache expiry warnings
   - Redis connection errors
   - Adapter fetch failures
   - TTL validation failures

3. **Sentry Events**:
   - Redis connection failures
   - Adapter exceptions in background jobs
   - Unexpected cache data format
