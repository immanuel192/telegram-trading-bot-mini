## Overview

The executor-service implements a flexible symbol mapping system that allows you to:
1. Use universal symbol names throughout the system (e.g., `XAUUSD`, `BTCUSDT`)
2. Automatically transform them to broker-specific formats (e.g., how real brokers often require `XAU_USD` or `BTC-USDT`)
3. Support a **Reference Simulator (Mock Adapter)** for educational and research purposes.

## Universal Symbol Format

We use a standardized symbol format across the entire system:

- **Gold**: `XAUUSD`
- **Crypto**: `{BASE}USDT` (e.g., `BTCUSDT`, `ETHUSDT`)
- **Forex**: `{BASE}{QUOTE}` (e.g., `EURUSD`, `GBPJPY`)

## Broker-Specific Formats

Different brokers use different symbol naming conventions:

| Broker    | Format            | Example                          |
| --------- | ----------------- | -------------------------------- |
| Simulator | Same as universal | `XAUUSD`, `BTCUSDT`              |
| Reference | `{BASE}_{QUOTE}`  | `XAU_USD`, `BTC_USDT`, `EUR_USD` |

## How It Works

### 1. Automatic Transformation

Each adapter implements a `transformSymbol()` method that converts universal symbols to broker-specific format:

```typescript
// Simulator (MockAdapter)
protected transformSymbol(universalSymbol: string): string {
  // No transformation - keeps it simple for researchers
  return universalSymbol;
}
```

### 2. Symbol Resolution

When you call adapter methods with a universal symbol, the adapter automatically resolves it:

```typescript
// You call with universal symbol
await adapter.openOrder({
  symbol: 'XAUUSD',  // Universal format
  // ... other params
});

// Adapter internally transforms to broker format if needed
const brokerSymbol = this.resolveSymbol('XAUUSD');  // Returns 'XAUUSD' for Simulator
```

### 3. Caching

Symbol transformations are cached for performance:

```typescript
// First call: transforms and caches
adapter.resolveSymbol('XAUUSD');  // Transforms to XAU_USD, caches result

// Second call: uses cache
adapter.resolveSymbol('XAUUSD');  // Returns cached XAU_USD instantly
```

## Configuration

### Basic Configuration (No Overrides)

For most cases, automatic transformation is sufficient:

```typescript
{
  "accountId": "simulator-account-001",
  "brokerConfig": {
    "exchangeCode": "mock",
    "apiKey": "simulation-only",
    "unitsPerLot": 100000
  }
}
```

### Advanced Configuration (With Overrides)

For special cases where you need to override the automatic transformation:

```typescript
{
  "accountId": "oanda-prod-001",
  "brokerConfig": {
    "exchangeCode": "oanda",
    "apiKey": "your-api-key",
    "accountId": "your-oanda-account-id",
    "isSandbox": false,
    "unitsPerLot": 100000,
    
    // Symbol mapping overrides
    "symbolMapping": {
      "XAUUSD": ["XAU_USD", "XAU_USD"],           // [sandbox, production]
      "BTCUSDT": ["BTC_USDT_TEST", "BTC_USDT"],   // Different symbols per environment
      "CUSTOM": ["CUSTOM_SBX", "CUSTOM_PROD"]     // Custom symbol mapping
    }
  }
}
```

### Override Priority

Symbol resolution follows this priority order:

1. **Cache** - If symbol was previously resolved, use cached value
2. **Config Override** - If symbol is in `symbolMapping`, use the override
3. **Transformation** - Use adapter's `transformSymbol()` method

## Examples

## Educational Note

This system is provided for **educational and research purposes only**. The use of a Simulator allows you to study how a professional trading architecture handles symbol normalization, caching, and multi-broker support without needing real exchange credentials.

## Related Files

- **Symbol Transformation Logic**: `apps/executor-service/src/adapters/base.adapter.ts`
- **Mock Simulator**: `apps/executor-service/src/adapters/mock/mock.adapter.ts`
- **Config Interface**: `libs/dal/src/models/account.model.ts`
- **Tests**: `apps/executor-service/test/unit/adapters/base.adapter.spec.ts`
