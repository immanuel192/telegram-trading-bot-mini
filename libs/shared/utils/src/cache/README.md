# Cache Services

This directory contains services for high-frequency caching of trading data using Redis. These services are designed to bridge the gap between slow, persistent storage (MongoDB) and the low-latency requirements of order execution.

## Services

### 1. PriceCacheService
Caches real-time price data (bid/ask) for symbols per exchange.

**Key Format**: `price:{exchangeCode}:{symbol}`  
**Data Structure (`PriceData`)**:
```typescript
{
  bid: number;    // Best bid price
  ask: number;    // Best ask price
  ts: number;     // Timestamp of last update (ms)
}
```

### 2. BalanceCacheService
Caches real-time account financial information.

**Key Format**: `balance:{exchangeCode}:{accountId}`  
**Data Structure (`BalanceInfo`)**:
```typescript
{
  balance: number;           // Total account balance
  equity: number;            // Net asset value (balance + unrealized P&L)
  marginUsed: number;        // Currently utilized margin
  marginAvailable: number;   // Remaining margin for new positions
  ts: number;                // Timestamp of last update (ms)
}
```

## Usage Patterns

### Setting Data (Background Jobs)
Background jobs (e.g., `FetchPriceJob`, `FetchBalanceJob`) fetch data from brokers and update the cache.

```typescript
const priceCache = new PriceCacheService('OANDA', redis);
await priceCache.setPrice('XAUUSD', 2050.5, 2050.7);
```

### Consuming Data (Order Execution)
The `OrderExecutorService` consumes this data for lot size and risk calculations.

```typescript
const priceCache = new PriceCacheService(exchangeCode, redis);
const price = await priceCache.getPrice(symbol);

// TTL Validation Pattern
if (price && (Date.now() - price.ts) < PRICE_CACHE_TTL * 1000) {
  const midPrice = (price.bid + price.ask) / 2;
  // Use midPrice as market entry fallback
}
```

## TTL Validation
Unlike standard Redis TTL, we use a "Soft TTL" approach by storing a `ts` timestamp inside the cached object. This allows consumers to decide how "fresh" the data must be for their specific use case.

- **Price Cache TTL**: Recommended ~30 seconds (2x refresh interval of 15s).
- **Balance Cache TTL**: Recommended ~30 minutes.

## Error Handling
These services should be treated as non-blocking enhancements. If Redis is unavailable or the cache is empty, the system should gracefully fall back to:
1. Provided values (e.g., signal entry price).
2. Default configurations (e.g., `defaultLotSize`).
3. Deferred calculation (e.g., calculate SL after order execution using executed price).
