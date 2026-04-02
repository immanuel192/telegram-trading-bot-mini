# Design: Executor Service Architecture

## System Overview

The `executor-service` is a new application in the `telegram-trading-bot-mini` monorepo that handles trade execution across multiple broker exchanges. It follows the event-driven architecture pattern established by existing services and integrates seamlessly with the Redis Stream messaging infrastructure.

## Architecture Principles

### Event-Driven Design
- **No HTTP in critical path**: All communication via Redis Streams
- **Async processing**: Non-blocking message consumption
- **Per-account streams**: Maintains strict ordering per trading account
- **Publisher-subscriber**: Decoupled services communicating via messages

### Service Responsibilities
```
trade-manager → Orchestrates trading workflow, publishes order requests
executor-service → Executes trades, manages broker connections
broker adapters → Abstract exchange-specific implementations
```

## Message Flow

### 1. Order Execution Flow (Hybrid Approach)

**Design Decision**: executor-service updates Order.history directly for immediate consistency, while still publishing events for observability.

```
┌─────────────────┐
│ trade-manager   │
│                 │
│ Consume:        │
│ TRANSLATE_      │
│ MESSAGE_RESULT  │
└────────┬────────┘
         │
         │ 1. Create Order records in DB
         │ 2. Publish EXECUTE_ORDER_REQUEST per order
         │
         ▼
     stream:trade:account:{accountId}
         │
         │ Per-account ordering guarantee
         │
         ▼
┌─────────────────┐
│executor-service │
│                 │
│ Consume:        │
│ EXECUTE_ORDER   │
│ _REQUEST        │
└────────┬────────┘
         │
         │ 3. Route to broker adapter
         │ 4. Execute via exchange API
         │ 5. Update Order.history directly (DB write)
         │ 6. Publish EXECUTE_ORDER_RESULT (observability)
         │
         ▼
     StreamTopic.ORDER_EXECUTION_RESULTS
         │
         ▼
┌─────────────────┐
│ trade-manager   │
│                 │
│ Consume:        │
│ EXECUTE_ORDER   │
│ _RESULT         │
│                 │
│ 7. Log/metrics  │
│    only         │
│    (no DB       │
│    update)      │
└─────────────────┘
```

**Rationale**:
- ✅ **Immediate consistency**: Order.history updated right after execution
- ✅ **No message loss**: Direct DB write, not dependent on event delivery
- ✅ **Observability**: Events still published for monitoring/alerting
- ✅ **Simpler trade-manager**: No DB updates, just logging
- ⚠️ **Acceptable coupling**: executor-service writes to Order.history (clear ownership boundary)

### 2. Live Price Feed Flow

```
┌─────────────────┐
│executor-service │
│                 │
│ Background job  │
│ (every 5s)      │
└────────┬────────┘
         │
         │ 1. Fetch prices from brokers
         │ 2. Cache locally
         │ 3. Publish updates
         │
         ▼
     StreamTopic.PRICE_UPDATES
         │
         ▼
┌─────────────────┐
│ trade-manager   │
│                 │
│ Consume:        │
│ LIVE_PRICE      │
│ _UPDATE         │
│                 │
│ Update context  │
└─────────────────┘
```

## Stream Topics

### Existing Topics (from project.md)
- `StreamTopic.MESSAGES` → Raw Telegram messages
- `StreamTopic.TRANSLATE_REQUESTS` → Translation requests to interpret-service
- `StreamTopic.TRANSLATE_RESULTS` → Translation results to trade-manager
- `StreamTopic.PRICE_REQUESTS` → (future) Price fetch requests

### New Topics for Executor Service

#### Per-Account Order Streams
**Pattern**: `stream:trade:account:{accountId}`

**Rationale**:
- Redis Streams lack Kafka-style partition grouping
- Separate stream per account ensures message ordering
- MVP constraint: Single executor instance, multiple account streams
- Each account's orders processed in sequence
- Different accounts processed in parallel

**Example**:
```
stream:trade:account:acc-binance-main
stream:trade:account:acc-oanda-demo
stream:trade:account:acc-xm-live
```

**Topic Enum**:
```typescript
// Will be dynamic based on accountId
// Helper function: StreamTopic.accountOrders(accountId: string)
```

#### Execution Results Stream
**Topic**: `StreamTopic.ORDER_EXECUTION_RESULTS`

**Purpose**: Executor-service publishes order execution outcomes back to trade-manager

**Message Type**: `MessageType.EXECUTE_ORDER_RESULT`

#### Price Updates Stream
**Topic**: `StreamTopic.PRICE_UPDATES`

**Purpose**: Executor-service publishes live price updates for symbols

**Message Type**: `MessageType.LIVE_PRICE_UPDATE`

## Message Contracts

### EXECUTE_ORDER_REQUEST

**Payload**:
```typescript
interface ExecuteOrderRequestPayload {
  // Correlation IDs
  messageId: number;          // Telegram message ID
  channelId: string;          // Telegram channel ID
  orderId: string;            // Our internal order ID (from Order model)
  accountId: string;          // Executor account ID
  traceToken: string;         // For distributed tracing
  
  // Order details
  symbol: string;             // Symbol from interpret-service
  type: OrderType;            // LONG | SHORT
  executionType: OrderExecutionType; // market | limit
  lotSize: number;            // Position size
  price: number;              // Entry price (market or limit)
  
  // Optional parameters
  leverage?: number;          // For futures/margin
  sl?: number;                // Stop loss price
  tp?: number;                // Take profit price
  
  // Timestamp
  timestamp: number;          // When order was created
}
```

**Publisher**: `trade-manager` (TranslateResultHandler)

**Consumer**: `executor-service` (OrderExecutionHandler)

### EXECUTE_ORDER_RESULT

**Payload**:
```typescript
interface ExecuteOrderResultPayload {
  // Correlation
  orderId: string;            // Our internal order ID
  accountId: string;
  traceToken: string;
  
  // Execution result
  success: boolean;
  executedAt?: number;        // Timestamp of execution
  exchangeOrderId?: string;   // Broker's order ID
  executedPrice?: number;     // Actual fill price
  executedLots?: number;      // Actual filled lots
  actualSymbol?: string;      // Resolved symbol at broker
  error?: string;             // Error message if failed
  errorCode?: string;         // Error code for programmatic handling
}
```

**Publisher**: `executor-service` (BrokerAdapters)

**Consumer**: `trade-manager` (ExecutionResultHandler)

### LIVE_PRICE_UPDATE

**Payload**:
```typescript
interface LivePriceUpdatePayload {
  accountId: string;
  symbol: string;             // Symbol at broker
  bid: number;                // Current bid price
  ask: number;                // Current ask price
  timestamp: number;          // When price was fetched
}
```

**Publisher**: `executor-service` (PriceFeedJob)

**Consumer**: `trade-manager` (PriceUpdateHandler)

## Broker Abstraction Layer

### Base Contract (ExchangeServiceBase from tvbot)

All broker adapters implement the **same contract**, following the pattern from `trading-view-alert/src/services/exchanges/base.ts`. The contract includes:

#### Core Methods (Public API)
```typescript
interface IExchangeService {
  // Lifecycle
  init(): Promise<void>;
  ready(): boolean;
  name(): string;
  
  // Order Operations
  placeOrder(params: PlaceOrderOptions): Promise<Order>;
  placeTpSl(params: PlaceOrderSlTpOptions): Promise<PlaceOrderSlTpResult>;
  closeOrder(params: CloseOrderOptions): Promise<CloseOrderResult>;
  
  // Market Data
  fetchTicker(symbol: string, accountId?: string): Promise<Ticker>;
  leverageInfo(symbol: string): MarketLeverageSummary | null;
  calLeverage(symbol: string, tradeAmount: number): number;
  setLeverage(symbol: string, leverage: number):Promise<void>;
  getCurrentLeverage(symbol: string): number | undefined;
  
  // Symbol Management
  lookupSymbol(symbol: string): string | undefined;
  refreshSymbols(): Promise<void>;
}
```

#### Abstract Methods (For Derived Classes)
```typescript
abstract class ExchangeServiceBase {
  // Exchange-specific initialization
  protected abstract initialValidation(): Promise<void>;
  
  // Precision helpers
  protected abstract exchangeAmountToPrecision(symbol: string, amount: string | number): string;
  protected abstract exchangePriceToPrecision(symbol: string, price: string | number): string;
  
  // Low-level exchange operations
  protected abstract exchangeCreateOrder(params: ExchangeCreateOrderOptions): Promise<Order>;
  protected abstract exchangeCancelOrder(exchangeOrderId: string, symbol: string): Promise<void>;
  protected abstract exchangeFetchPositions(symbol: string): Promise<ExchangePosition[]>;
  protected abstract exchangeFetchOpenOrders(symbol: string): Promise<Order[]>;
  
  // Leverage/margin setup
  protected abstract setExchangeLeverage(symbol: string, leverage: number): Promise<void>;
  protected abstract prepareOrderLeverageAndMargin(symbol: string, leverage: number): Promise<void>;
}
```

### Adapter Hierarchy

The executor-service uses a two-tier adapter strategy to support multiple exchanges:

```typescript
ExchangeServiceBase (abstract base)
├── Public API: placeOrder(), placeTpSl(), closeOrder(), fetchTicker(), setLeverage()
├── Protected abstract methods: exchangeCreateOrder(), exchangeCancelOrder(), etc.
├── Common logic: Symbol lookup, leverage tracking, SL/TP validation, retry logic
│
├── CryptoExchangeAdapter (uses ccxt library)
│   ├── Uses: ccxt exchange instances
│   ├── Handles: Binance, Bybit, KuCoin, and any ccxt-supported exchange
│   ├── Reusable: Single implementation works for all ccxt exchanges
│   └── Example: BinanceFutureAdapter extends CryptoExchangeAdapter
│
└── APIExchangeAdapter (HTTP-based with auth tokens)
    ├── Uses: HTTP client with access token / refresh token pattern
    ├── Handles: Oanda, XM, Exness (exchanges with custom web APIs)
    ├── Each exchange implements: placeOrderRequest(), cancelOrderRequest(), etc.
    └── Examples:
        ├── OandaAdapter extends APIExchangeAdapter
        ├── XMAdapter extends APIExchangeAdapter (future)
        └── ExnessAdapter extends APIExchangeAdapter (future)
```

**Design Rationale**:
- All adapters implement the same contract (IExchangeService) for consistency
- Base class (ExchangeServiceBase) provides common logic ported from tvbot:
  - `placeOrder()` handles symbol lookup, leverage prep, delegates to `exchangeCreateOrder()`
  - `placeTpSl()` validates prices, places SL/TP orders, handles cancellation
  - `closeOrder()` checks positions, closes pending orders, delegates to exchange methods
- Two implementation strategies reduce code duplication:
  - CryptoExchangeAdapter: One implementation for all ccxt exchanges
  - APIExchangeAdapter: Shared HTTP/auth logic for custom API exchanges
- Factory pattern creates and caches adapters per account
- Error handling with exponential backoff retry
- Comprehensive integration tests per adapter type

### Broker Factory

**Purpose**: Create and cache broker adapter instances per account

**Pattern**:
```typescript
class BrokerAdapterFactory {
  private adapters: Map<string, IBrokerAdapter> = new Map();
  
  async getAdapter(account: Account): Promise<IBrokerAdapter> {
    const key = account.accountId;
    
    if (this.adapters.has(key)) {
      return this.adapters.get(key)!;
    }
    
    // Create adapter based on account.accountType and exchangeCode
    const adapter = await this.createAdapter(account);
    await adapter.init();
    
    this.adapters.set(key, adapter);
    return adapter;
  }
  
  private async createAdapter(account: Account): Promise<IBrokerAdapter> {
    // Factory logic based on account configuration
    switch (account.accountType) {
      case AccountType.API:
        return this.createApiAdapter(account);
      case AccountType.MT5:
        return this.createMt5Adapter(account);
      default:
        throw new Error(`Unknown account type: ${account.accountType}`);
    }
  }
}
```

## Executor Service Structure

Following the n-tier architecture pattern from memory-bank:

```
apps/executor-service/
├── src/
│   ├── config.ts              # Extends BaseConfig
│   ├── logger.ts              # Service logger
│   ├── sentry.ts              # Error capture
│   ├── main.ts                # Entry point
│   ├── server.ts              # Worker setup (no HTTP server)
│   ├── container.ts           # IoC container
│   │
│   ├── adapters/              # Broker implementations
│   │   ├── base.adapter.ts
│   │   ├── crypto/
│   │   │   ├── base-ccxt.adapter.ts
│   │   │   ├── binance-future.adapter.ts
│   │   │   └── interfaces.ts
│   │   ├── oanda/
│   │   │   ├── oanda.adapter.ts
│   │   │   ├── oanda-client.ts
│   │   │   └── interfaces.ts
│   │   └── factory.ts         # BrokerAdapterFactory
│   │
│   ├── events/                # Event handlers
│   │   ├── index.ts
│   │   └── consumers/
│   │       ├── order-execution-handler.ts
│   │       └── base-order-handler.ts
│   │
│   ├── services/              # Business logic
│   │   ├── order-executor.service.ts
│   │   └── price-feed.service.ts
│   │
│   └── jobs/                  # Background jobs
│       ├── index.ts
│       └── price-feed.job.ts
│
└── test/
    ├── unit/
    ├── integration/
    └── utils/
```

## Service Dependencies

### Container Setup

```typescript
// apps/executor-service/src/container.ts

export function createContainer(logger: LoggerInstance): Container {
  const streamPublisher = new RedisStreamPublisher({
    url: config('REDIS_URL'),
    token: config('REDIS_TOKEN'),
  });
  
  const brokerFactory = new BrokerAdapterFactory(logger);
  
  const orderExecutor = new OrderExecutorService(
    brokerFactory,
    streamPublisher,
    logger
  );
  
  const priceFeed = new PriceFeedService(
    brokerFactory,
    streamPublisher,
    accountRepository,
    logger
  );
  
  return {
    streamPublisher,
    brokerFactory,
    orderExecutor,
    priceFeed,
    accountRepository,
    logger,
    errorCapture: Sentry,
  };
}
```

### Server Setup (Worker)

```typescript
// apps/executor-service/src/server.ts

export async function startServer(container: Container): Promise<void> {
  const { logger, orderExecutor } = container;
  
  // Start consumers for all active accounts
  const accounts = await accountRepository.findActive();
  
  for (const account of accounts) {
    const streamTopic = `stream:trade:account:${account.accountId}`;
    const handler = new OrderExecutionHandler(
      account.accountId,
      orderExecutor,
      logger,
      container.errorCapture
    );
    
    // Create consumer for this account stream
    const consumer = new RedisStreamConsumer({
      url: config('REDIS_URL'),
      token: config('REDIS_TOKEN'),
      logger,
      errorCapture: container.errorCapture,
    });
    
    consumer.start(
      streamTopic,
      `executor-service-${account.accountId}`,
      `executor-1`,
      handler.handle.bind(handler)
    );
  }
  
  // Start price feed job
  startJobs(container);
  
  logger.info('Executor service started successfully');
}
```

## Error Handling

### Execution Errors

**Strategy**: Publish error result, let trade-manager decide next steps

```typescript
try {
  const result = await adapter.executeOrder(params);
  await publishResult({ success: true, ...result });
} catch (error) {
  await publishResult({
    success: false,
    orderId: params.orderId,
    error: error.message,
    errorCode: classifyError(error),
  });
  
  // Capture in Sentry but don't throw
  container.errorCapture.captureException(error);
}
```

### Broker Connection Errors

**Strategy**: Retry with exponential backoff, mark adapter as unhealthy

```typescript
class CryptoExchangeAdapter {
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        await sleep(Math.pow(2, i) * 1000);
      }
    }
    throw new Error('Max retries exceeded');
  }
}
```

## Configuration

### Executor Service Config

```typescript
// apps/executor-service/src/config.ts

export interface ExecutorConfig extends BaseConfig {
  REDIS_URL: string;
  REDIS_TOKEN?: string;
  
  // Price feed configuration
  PRICE_FEED_INTERVAL_MS: number;        // Default: 5000
  PRICE_FEED_BATCH_SIZE: number;         // Default: 10
  
  // Order execution configuration
  ORDER_EXECUTION_TIMEOUT_MS: number;    // Default: 30000
  ORDER_RETRY_MAX_ATTEMPTS: number;      // Default: 3
  
  // Broker configuration loaded from database (Account model)
}
```

### Symbol Mapping Strategy

**Problem**: Each exchange uses different symbol formats for the same asset:

| Asset    | interpret-service Output | Binance   | Oanda     | XM         | Exness    |
| -------- | ------------------------ | --------- | --------- | ---------- | --------- |
| Gold     | `XAUUSD`                 | `XAUUSDT` | `XAU_USD` | `GOLD`     | `XAUUSD`  |
| Bitcoin  | `BTCUSD`                 | `BTCUSDT` | `BTC_USD` | `BITCOIN`  | `BTCUSD`  |
| Ethereum | `ETHUSDT`                | `ETHUSDT` | `ETH_USD` | `ETHEREUM` | `ETHUSDT` |

**Solution (MVP - Hardcoded Mappings)**:

Each adapter class defines symbol mappings following tvbot's pattern:

```typescript
// apps/executor-service/src/adapters/oanda/oanda.adapter.ts
export class OandaAdapter extends APIExchangeAdapter {
  protected SymbolsMapping: Record<string, [string, string]> = {
    'XAUUSD': ['XAU_USD', 'XAU_USD'],   // [sandbox, live]
    'BTCUSD': ['BTC_USD', 'BTC_USD'],
    'ETHUSDT': ['ETH_USD', 'ETH_USD'],
    // ... more mappings
  };
}

// apps/executor-service/src/adapters/crypto/binance-future.adapter.ts
export class BinanceFutureAdapter extends CryptoExchangeAdapter {
  protected SymbolsMapping: Record<string, [string, string]> = {
    'XAUUSD': ['XAUUSDT', 'XAUUSDT'],
    'BTCUSD': ['BTCUSDT', 'BTCUSDT'],
    'ETHUSDT': ['ETHUSDT', 'ETHUSDT'],
    // ... more mappings
  };
}
```

**Flow**:
1. interpret-service translates Telegram message "Gold" → standard symbol `"XAUUSD"`
2. Order stored with standard symbol: `{ symbol: "XAUUSD" }`
3. executor-service receives order request with `symbol: "XAUUSD"`
4. `ExchangeServiceBase.placeOrder()` calls `this.lookupSymbol("XAUUSD")`
5. Returns exchange-specific format based on adapter:
   - Oanda: `"XAU_USD"`
   - Binance: `"XAUUSDT"`
6. Exchange API called with translated symbol

```typescript
// From ExchangeServiceBase (ported from tvbot)
public lookupSymbol(symbol: string): string | undefined {
  const mapping = this.SymbolsMapping[symbol];
  if (!mapping) return undefined;
  return this.isSandbox ? mapping[0] : mapping[1];
}

async placeOrder(params: PlaceOrderOptions): Promise<Order> {
  const exchangeSymbol = this.lookupSymbol(params.symbol);
  if (!exchangeSymbol) {
    throw new Error(`Symbol ${params.symbol} not supported by ${this.name()}`);
  }
  // ... continue with exchangeSymbol
}
```

**MVP Constraints**:
- ✅ Hardcoded mappings in adapter class code
- ❌ Adding new symbol requires code change + deployment
- ❌ Cannot customize mappings per account

**Future Enhancement (Post-MVP)**:

Store symbol mappings in a separate collection (NOT in Account):

```typescript
// libs/dal/src/models/symbol-mapping.model.ts
export interface SymbolMapping extends Document {
  /**
   * Exchange code this mapping applies to
   */
  exchangeCode: 'binanceusdm' | 'oanda' | 'xm' | 'exness';
  
  /**
   * Standard symbol from interpret-service
   */
  standardSymbol: string;
  
  /**
   * Exchange-specific symbol format
   */
  exchangeSymbol: string;
  
  /**
   * Whether this is for sandbox or live
   */
  environment: 'sandbox' | 'live';
  
  /**
   * Optional: custom mapping for specific account
   * If null, applies to all accounts of this exchange
   */
  accountId?: string;
}

// Example documents:
// { exchangeCode: 'oanda', standardSymbol: 'XAUUSD', exchangeSymbol: 'XAU_USD', environment: 'live' }
// { exchangeCode: 'binanceusdm', standardSymbol: 'XAUUSD', exchangeSymbol: 'XAUUSDT', environment: 'live' }
```

**Rationale for Separate Collection**:
- ✅ Symbol mappings are exchange-specific, not account-specific
- ✅ Avoid bloating Account documents with redundant data
- ✅ Easy to manage via admin UI
- ✅ Can override per account if needed (via `accountId` field)

**Future Adapter Initialization**:
```typescript
constructor(account: Account, ...) {
  // Load mappings from DB at startup
  const mappings = await symbolMappingRepository.find({
    exchangeCode: this.exchangeCode,
    $or: [
      { accountId: null },               // Global for this exchange
      { accountId: account.accountId }   // Account-specific override
    ]
  });
  
  this.SymbolsMapping = this.buildMappingsFromDb(mappings);
  // Fall back to hardcoded defaults if DB empty
}
```

---

### Multi-Account Configuration

**Scenario**: Multiple system accounts pointing to same or different exchange sub-accounts.

#### Use Cases

**Case 1: Multiple system accounts → Different exchange sub-accounts (same credentials)**

Example: You and your wife share same Telegram signals but trade on different XM/Oanda accounts:

```typescript
// Account 1 (You)
{
  accountId: 'acc-01',
  telegramChannelCode: 'gold-signals',
  brokerConfig: {
    exchangeCode: 'xm',
    apiKey: 'XM_SHARED_API_KEY',      // Same credentials
    apiSecret: 'XM_SHARED_SECRET',
    exchangeAccountId: 'XM001',        // Your XM account
    serverUrl: 'https://xm.com',
  }
}

// Account 2 (Wife)
{
  accountId: 'acc-02',
  telegramChannelCode: 'gold-signals',  // Same Telegram channel
  brokerConfig: {
    exchangeCode: 'xm',
    apiKey: 'XM_SHARED_API_KEY',      // Same credentials
    apiSecret: 'XM_SHARED_SECRET',
    exchangeAccountId: 'XM002',        // Wife's XM account
    serverUrl: 'https://xm.com',
  }
}
```

**Flow**:
1. Telegram message arrives → sent to both accounts (matched by channel)
2. trade-manager publishes 2 orders:
   - `stream:trade:account:acc-01` → XM account XM001
   - `stream:trade:account:acc-02` → XM account XM002
3. executor-service creates separate adapter instances:
   - Adapter for `acc-01` → calls XM API with `exchangeAccountId: XM001`
   - Adapter for `acc-02` → calls XM API with `exchangeAccountId: XM002`
4. Both orders execute independently on their respective XM accounts

**Case 2: Single system account → Single exchange account**

Simplest case:

```typescript
{
  accountId: 'acc-binance-main',
  telegramChannelCode: 'crypto-signals',
  brokerConfig: {
    exchangeCode: 'binanceusdm',
    apiKey: 'BINANCE_API_KEY',
    apiSecret: 'BINANCE_SECRET',
    exchangeAccountId: null,           // Binance doesn't need sub-account ID
    isSandbox: false,
  }
}
```

#### BrokerConfig Structure (Updated)

```typescript
// libs/dal/src/models/account.model.ts

export interface Account extends Document {
  _id?: ObjectId;
  
  /**
   * Our internal accountId for system management
   * This is the key for stream routing: stream:trade:account:{accountId}
   */
  accountId: string;
  
  /**
   * Telegram channel this account subscribes to
   */
  telegramChannelCode: string;
  
  /**
   * Whether account is active
   */
  isActive: boolean;
  
  /**
   * Broker connection configuration
   * Contains all credentials and settings to connect to the exchange
   */
  brokerConfig: BrokerConfig;
  
  // ... other fields (promptId, accountType, etc.)
}

export interface BrokerConfig {
  /**
   * Exchange type/platform
   */
  exchangeCode: 'binanceusdm' | 'oanda' | 'xm' | 'exness';
  
  /**
   * Authentication pattern 1: API Key + Secret (Binance, Bybit, etc.)
   * - apiKey: Public API key
   * - apiSecret: Secret for HMAC signing
   * - No token refresh needed
   */
  apiKey?: string;
  apiSecret?: string;
  
  /**
   * Authentication pattern 2: Access Token + Refresh Token (XM, Exness web terminals)
   * - accessToken: Short-lived token (15-60 min)
   * - refreshToken: Long-lived token to get new accessToken
   * - Requires refresh logic before expiry
   */
  accessToken?: string;
  refreshToken?: string;
  
  /**
   * Token expiry timestamp (for access token pattern)
   * Unix timestamp in milliseconds
   */
  tokenExpiresAt?: number;
  
  /**
   * Exchange sub-account identifier
   * - Oanda: Account ID like "001-004-1234567-001"
   * - XM: Account number like "XM001", "XM002"
   * - Exness: Account number
   * - Binance: null (uses API key's default account)
   */
  exchangeAccountId?: string;
  
  /**
   * Sandbox/demo mode
   */
  isSandbox?: boolean;
  
  /**
   * API server URL (for non-standard endpoints)
   * - XM: Custom MT5 web terminal URL
   * - Exness: Custom MT5 web terminal URL  
   * - Oanda: null (use standard https://api-fxpractice.oanda.com or api-fxtrade.oanda.com)
   * - Binance: null (use ccxt defaults)
   */
  serverUrl?: string;
  
  /**
   * Login credentials for initial authentication (XM/Exness)
   * Used to obtain access/refresh tokens if not provided
   */
  username?: string;
  password?: string;
  
  /**
   * Login ID for MT5-based platforms (XM, Exness)
   * May be different from exchangeAccountId in some cases
   */
  loginId?: string;
}
```

---

### Token Refresh Strategy (Handling Race Conditions)

**Problem**: Multiple accounts sharing same credentials could cause race conditions during token refresh:

```typescript
// Both accounts use same XM credentials
acc-01: { apiKey: 'XM_SHARED', refreshToken: 'refresh_abc', exchangeAccountId: 'XM001' }
acc-02: { apiKey: 'XM_SHARED', refreshToken: 'refresh_abc', exchangeAccountId: 'XM002' }

// Both adapters detect token expiry at same time
// Both try to refresh → race condition
```

**Solution: Centralized Token Manager with Locking**

Create a `TokenManager` service that handles token refresh with mutex locking:

```typescript
// apps/executor-service/src/services/token-manager.service.ts

export class TokenManager {
  private refreshLocks = new Map<string, Promise<TokenRefreshResult>>();
  private tokens = new Map<string, CachedToken>();
  
  constructor(
    private accountRepository: AccountRepository,
    private logger: LoggerInstance
  ) {}
  
  /**
   * Get valid access token, refreshing if needed
   * Uses credential hash as lock key to prevent race conditions
   */
  async getAccessToken(account: Account): Promise<string> {
    const { brokerConfig } = account;
    
    // Create unique key based on credentials (not accountId)
    // Multiple accounts with same credentials share same lock
    const credentialKey = this.getCredentialKey(brokerConfig);
    
    // Check if we have cached valid token
    const cached = this.tokens.get(credentialKey);
    if (cached && cached.expiresAt > Date.now() + 60000) { // 1 min buffer
      return cached.accessToken;
    }
    
    // Check if refresh is already in progress
    if (this.refreshLocks.has(credentialKey)) {
      this.logger.info({ credentialKey }, 'Token refresh already in progress, waiting...');
      const result = await this.refreshLocks.get(credentialKey)!;
      return result.accessToken;
    }
    
    // Start refresh with lock
    const refreshPromise = this.performTokenRefresh(account, credentialKey);
    this.refreshLocks.set(credentialKey, refreshPromise);
    
    try {
      const result = await refreshPromise;
      
      // Cache the new token
      this.tokens.set(credentialKey, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: result.expiresAt,
      });
      
      // Persist to database for all accounts using these credentials
      await this.updateAccountTokens(credentialKey, result);
      
      return result.accessToken;
    } finally {
      // Release lock
      this.refreshLocks.delete(credentialKey);
    }
  }
  
  private async performTokenRefresh(
    account: Account,
    credentialKey: string
  ): Promise<TokenRefreshResult> {
    const { brokerConfig } = account;
    
    this.logger.info({ credentialKey, accountId: account.accountId }, 'Refreshing access token');
    
    // Call exchange API to refresh token
    const response = await fetch(`${brokerConfig.serverUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken: brokerConfig.refreshToken,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || brokerConfig.refreshToken, // Some APIs return new refresh token
      expiresAt: Date.now() + (data.expiresIn * 1000), // Convert seconds to ms
    };
  }
  
  private getCredentialKey(config: BrokerConfig): string {
    // Create hash of credentials (not accountId)
    // Accounts with same credentials get same key
    const keyData = `${config.exchangeCode}:${config.username}:${config.serverUrl}`;
    return createHash('sha256').update(keyData).digest('hex').substring(0, 16);
  }
  
  private async updateAccountTokens(
    credentialKey: string,
    result: TokenRefreshResult
  ): Promise<void> {
    // Find all accounts using these credentials
    const accounts = await this.accountRepository.find({
      'brokerConfig.refreshToken': result.refreshToken,
    });
    
    // Update all of them in database
    await Promise.all(
      accounts.map(account =>
        this.accountRepository.updateOne(
          { accountId: account.accountId },
          {
            $set: {
              'brokerConfig.accessToken': result.accessToken,
              'brokerConfig.refreshToken': result.refreshToken,
              'brokerConfig.tokenExpiresAt': result.expiresAt,
            },
          }
        )
      )
    );
    
    this.logger.info(
      { credentialKey, accountCount: accounts.length },
      'Persisted refreshed tokens to database for all accounts'
    );
  }
  
  /**
   * Load tokens from database on startup
   * Critical: Ensures tokens survive service restarts
   */
  async loadTokensFromDatabase(): Promise<void> {
    this.logger.info('Loading tokens from database on startup');
    
    const accounts = await this.accountRepository.find({
      'brokerConfig.accessToken': { $exists: true },
    });
    
    for (const account of accounts) {
      const { brokerConfig } = account;
      const credentialKey = this.getCredentialKey(brokerConfig);
      
      // Only cache if not expired
      if (brokerConfig.tokenExpiresAt && brokerConfig.tokenExpiresAt > Date.now()) {
        this.tokens.set(credentialKey, {
          accessToken: brokerConfig.accessToken!,
          refreshToken: brokerConfig.refreshToken!,
          expiresAt: brokerConfig.tokenExpiresAt,
        });
        
        this.logger.info(
          { 
            credentialKey, 
            accountId: account.accountId,
            expiresIn: Math.floor((brokerConfig.tokenExpiresAt - Date.now()) / 1000) + 's'
          },
          'Loaded valid token from database'
        );
      } else {
        this.logger.warn(
          { credentialKey, accountId: account.accountId },
          'Token in database is expired, will refresh on first use'
        );
      }
    }
    
    this.logger.info({ tokenCount: this.tokens.size }, 'Token loading complete');
  }
}

interface CachedToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface TokenRefreshResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}
```

---

### Token Lifecycle (Complete Flow)

**Critical: Tokens MUST survive service restarts**

```
┌─────────────────────────────────────────────────────────────┐
│ 1. SERVICE STARTUP                                          │
├─────────────────────────────────────────────────────────────┤
│ TokenManager.loadTokensFromDatabase()                      │
│ ├─ Read all Account.brokerConfig.accessToken from DB       │
│ ├─ Load into in-memory cache (Map<credentialKey, token>)   │
│ └─ Skip expired tokens (will refresh on first use)         │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. ORDER EXECUTION (Runtime)                                │
├─────────────────────────────────────────────────────────────┤
│ Adapter calls: tokenManager.getAccessToken(account)        │
│ ├─ Check in-memory cache                                   │
│ ├─ If valid (not expired): return cached token ✅          │
│ └─ If expired or missing: proceed to refresh ↓             │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. TOKEN REFRESH (When Needed)                              │
├─────────────────────────────────────────────────────────────┤
│ TokenManager.performTokenRefresh()                         │
│ ├─ Check if refresh already in progress (race protection)  │
│ ├─ Call exchange API: POST /auth/refresh                   │
│ ├─ Get new accessToken + refreshToken + expiresAt          │
│ ├─ Update in-memory cache                                  │
│ └─ Persist to database ↓                                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. DATABASE PERSISTENCE (Critical!)                         │
├─────────────────────────────────────────────────────────────┤
│ TokenManager.updateAccountTokens()                         │
│ ├─ Find ALL accounts with same credentials                 │
│ ├─ Update Account.brokerConfig for each:                   │
│ │  ├─ accessToken = new token                              │
│ │  ├─ refreshToken = new refresh token (if provided)       │
│ │  └─ tokenExpiresAt = new expiry timestamp                │
│ └─ Commit to MongoDB                                       │
│                                                             │
│ 🔑 This ensures tokens survive service restarts!           │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. NEXT RESTART                                             │
├─────────────────────────────────────────────────────────────┤
│ Service restarts → Step 1 (loadTokensFromDatabase)         │
│ ├─ Tokens loaded from DB into memory                       │
│ └─ No manual intervention needed ✅                        │
└─────────────────────────────────────────────────────────────┘
```

**Why This Matters**:
- ✅ **No manual token refresh needed**: Automatic refresh before expiry
- ✅ **Survives restarts**: Tokens loaded from DB on startup
- ✅ **Shared credentials handled**: All accounts updated together
- ✅ **Race-free**: Mutex locking prevents duplicate refreshes
- ✅ **Fail-safe**: If token expired during downtime, refreshes on first use

**Example Timeline**:
```
Day 1, 10:00 AM: Service starts, loads token (expires at 11:00 AM)
Day 1, 10:55 AM: Order arrives, token still valid, uses cached token
Day 1, 11:05 AM: Order arrives, token expired, auto-refreshes
                 New token expires at 12:05 PM
                 Persisted to DB for acc-01 and acc-02
Day 1, 11:30 AM: Service crashes and restarts
Day 1, 11:31 AM: Service loads token from DB (expires 12:05 PM) ✅
Day 1, 11:45 AM: Order arrives, uses loaded token (still valid)
```

---

### Server Startup Integration

Update server startup to load tokens:

```typescript
// apps/executor-service/src/server.ts

export async function startServer(container: Container): Promise<void> {
  const { logger, tokenManager } = container;
  
  logger.info('Starting executor-service...');
  
  // CRITICAL: Load tokens from database before starting consumers
  await tokenManager.loadTokensFromDatabase();
  
  // Start consumers for all active accounts
  await startConsumers(container);
  
  // Start price feed job
  startJobs(container);
  
  logger.info('Executor-service started successfully');
}
```

**Container Setup**:

```typescript
// apps/executor-service/src/container.ts

export function createContainer(logger: LoggerInstance): Container {
  const streamPublisher = new RedisStreamPublisher({
    url: config('REDIS_URL'),
    token: config('REDIS_TOKEN'),
  });
  
  const tokenManager = new TokenManager(
    accountRepository,
    logger
  );
  
  const brokerFactory = new BrokerAdapterFactory(
    tokenManager,  // Inject TokenManager
    logger
  );
  
  // ... rest of container
  
  return {
    streamPublisher,
    tokenManager,  // Add to container
    brokerFactory,
    // ...
  };
}
```

**Usage in Adapter**:

```typescript
export class XMAdapter extends APIExchangeAdapter {
  constructor(
    account: Account,
    private tokenManager: TokenManager,
    logger: LoggerInstance
  ) {
    super(account, logger);
  }
  
  private async getAuthHeaders(): Promise<Record<string, string>> {
    // TokenManager handles refresh + race conditions
    const accessToken = await this.tokenManager.getAccessToken(this.account);
    
    return {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  }
  
  async placeOrderRequest(params): Promise<Order> {
    const headers = await this.getAuthHeaders();
    
    const response = await fetch(`${this.serverUrl}/api/trade/open`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        account: this.exchangeAccountId,
        symbol: params.symbol,
        lots: params.lots,
      }),
    });
    
    // Handle 401 → token might have expired between check and use
    if (response.status === 401) {
      // Force refresh and retry once
      this.tokenManager.invalidateToken(this.account);
      const newHeaders = await this.getAuthHeaders();
      // ... retry request
    }
    
    // ... process response
  }
}
```

**Key Benefits**:
1. ✅ **Single refresh per credential set**: Multiple accounts wait for same refresh
2. ✅ **No race conditions**: Mutex lock via Promise in Map
3. ✅ **Cached tokens**: Avoid unnecessary refreshes
4. ✅ **Database persistence**: All accounts updated with new tokens
5. ✅ **Automatic retry**: Handles edge case where token expires between check and use

**MVP Simplification**:
For MVP, if token refresh is too complex:
- Require manual token refresh (admin updates tokens in DB)
- Log warning when token expires
- Fail gracefully with clear error message
- Implement TokenManager in post-MVP enhancement

---

### Updated Validation in Factory

```typescript
private validateBrokerConfig(account: Account): void {
  const { brokerConfig } = account;
  
  if (!brokerConfig) {
    throw new Error(`Account ${account.accountId} missing brokerConfig`);
  }
  
  switch (brokerConfig.exchangeCode) {
    case 'oanda':
      if (!brokerConfig.apiKey) {
        throw new Error(`Oanda account ${account.accountId} requires apiKey (bearer token)`);
      }
      if (!brokerConfig.exchangeAccountId) {
        throw new Error(`Oanda account ${account.accountId} requires exchangeAccountId`);
      }
      break;
      
    case 'xm':
    case 'exness':
      // Check for either API key pattern OR access token pattern
      const hasApiKeyAuth = brokerConfig.apiKey && brokerConfig.apiSecret;
      const hasTokenAuth = brokerConfig.accessToken && brokerConfig.refreshToken;
      
      if (!hasApiKeyAuth && !hasTokenAuth) {
        throw new Error(
          `${brokerConfig.exchangeCode} account ${account.accountId} requires either ` +
          `(apiKey + apiSecret) OR (accessToken + refreshToken)`
        );
      }
      
      if (!brokerConfig.exchangeAccountId || !brokerConfig.serverUrl) {
        throw new Error(
          `${brokerConfig.exchangeCode} account ${account.accountId} requires ` +
          `exchangeAccountId and serverUrl`
        );
      }
      break;
      
    case 'binanceusdm':
      if (!brokerConfig.apiKey || !brokerConfig.apiSecret) {
        throw new Error(`Binance account ${account.accountId} requires apiKey and apiSecret`);
      }
      break;
  }
}
```

#### Adapter Handling of exchangeAccountId

**Oanda Example** (already implemented in tvbot):
```typescript
export class OandaAdapter extends APIExchangeAdapter {
  private accountId: string;
  
  constructor(account: Account, ...) {
    super(...);
    
    // Extract from brokerConfig
    this.accountId = account.brokerConfig.exchangeAccountId!;
    
    if (!this.accountId) {
      throw new Error('Oanda requires exchangeAccountId in brokerConfig');
    }
  }
  
  async fetchTicker(symbol: string): Promise<Ticker> {
    // Use accountId in API path
    const url = `${this.baseUrl}/v3/accounts/${this.accountId}/pricing?instruments=${symbol}`;
    // ... fetch and return
  }
  
  async placeOrderRequest(params): Promise<Order> {
    const url = `${this.baseUrl}/v3/accounts/${this.accountId}/orders`;
    // ... POST order
  }
}
```

**XM/Exness Example** (future):
```typescript
export class XMAdapter extends APIExchangeAdapter {
  private accountNumber: string;
  
  constructor(account: Account, ...) {
    super(...);
    
    this.accountNumber = account.brokerConfig.exchangeAccountId!;
    this.serverUrl = account.brokerConfig.serverUrl!;
    
    if (!this.accountNumber || !this.serverUrl) {
      throw new Error('XM requires exchangeAccountId and serverUrl');
    }
  }
  
  async placeOrderRequest(params): Promise<Order> {
    // Use accountNumber in request body
    const body = {
      account: this.accountNumber,
      symbol: params.symbol,
      lots: params.lots,
      // ...
    };
    
    const response = await fetch(`${this.serverUrl}/api/trade/open`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(body),
    });
    // ...
  }
}
```

**Binance Example** (doesn't use exchangeAccountId):
```typescript
export class BinanceFutureAdapter extends CryptoExchangeAdapter {
  constructor(account: Account, ...) {
    super(...);
    
    // Binance uses API key to determine account
    // exchangeAccountId not needed
    this.exchange = new ccxt.binanceusdm({
      apiKey: account.brokerConfig.apiKey,
      secret: account.brokerConfig.apiSecret,
      options: { defaultType: 'future' },
    });
  }
}
```

#### Key Points

1. **`accountId` (system) vs `exchangeAccountId` (broker)**:
   - `accountId`: Our internal ID for stream routing, container keys
   - `exchangeAccountId`: Broker's sub-account identifier (Oanda, XM, Exness)

2. **Adapter factory caching**:
   - Cache key: `account.accountId` (system ID)
   - Each system account gets its own adapter instance
   - Even if they share `apiKey`, they route to different `exchangeAccountId`

3. **Stream isolation**:
   - Each account has its own stream: `stream:trade:account:{accountId}`
   - Orders for `acc-01` never mix with orders for `acc-02`
   - Ensures proper order sequencing per account

4. **Credential sharing**:
   - Multiple accounts CAN share same `apiKey` + `apiSecret`
   - But MUST have different `exchangeAccountId` if pointing to different sub-accounts
   - Adapter uses `exchangeAccountId` in API calls to target correct sub-account

5. **Validation**:
   - Factory should validate required fields per `exchangeCode`:
     - Oanda REQUIRES: `apiKey`, `exchangeAccountId`
     - XM/Exness REQUIRES: `apiKey`, `apiSecret`, `exchangeAccountId`, `serverUrl`
     - Binance REQUIRES: `apiKey`, `apiSecret`

---

### Account Configuration (DAL Model Updates)

**Updated Account Model**:

```typescript
// libs/dal/src/models/account.model.ts

export interface Account extends Document {
  _id?: ObjectId;
  accountId: string;
  description?: string;
  isActive: boolean;
  telegramChannelCode: string;
  accountType: AccountType;
  promptId: string;
  brokerSpecs?: BrokerSpecs;
  
  /**
   * Broker connection configuration
   * REQUIRED for executor-service to function
   * Contains credentials and exchange-specific settings
   */
  brokerConfig: BrokerConfig;
}

export interface BrokerConfig {
  exchangeCode: 'binanceusdm' | 'oanda' | 'xm' | 'exness';
  apiKey: string;
  apiSecret?: string;
  isSandbox?: boolean;
  
  /**
   * Exchange-specific sub-account identifier
   * - Required for: Oanda, XM, Exness
   * - Not used for: Binance (API key determines account)
   */
  exchangeAccountId?: string;
  
  // MT5/Web terminal specific
  serverUrl?: string;
  loginId?: string;
}
```

**Validation in Factory**:
```typescript
private validateBrokerConfig(account: Account): void {
  const { brokerConfig } = account;
  
  if (!brokerConfig) {
    throw new Error(`Account ${account.accountId} missing brokerConfig`);
  }
  
  switch (brokerConfig.exchangeCode) {
    case 'oanda':
      if (!brokerConfig.exchangeAccountId) {
        throw new Error(`Oanda account ${account.accountId} requires exchangeAccountId`);
      }
      break;
      
    case 'xm':
    case 'exness':
      if (!brokerConfig.exchangeAccountId || !brokerConfig.serverUrl) {
        throw new Error(`${brokerConfig.exchangeCode} account ${account.accountId} requires exchangeAccountId and serverUrl`);
      }
      break;
      
    case 'binanceusdm':
      if (!brokerConfig.apiSecret) {
        throw new Error(`Binance account ${account.accountId} requires apiSecret`);
      }
      break;
  }
}

## Testing Strategy

### Unit Tests
- Broker adapter logic (mocked exchange APIs)
- Message payload validation
- Error classification
- Retry logic

### Integration Tests
- End-to-end order flow (sandbox exchanges)
- Redis Stream messaging
- Price feed publishing
- Multi-account scenarios

### Test Structure

```
test/
├── unit/
│   ├── adapters/
│   │   ├── crypto/
│   │   │   └── binance-future.adapter.spec.ts
│   │   └── oanda/
│   │       └── oanda.adapter.spec.ts
│   ├── services/
│   │   ├── order-executor.service.spec.ts
│   │   └── price-feed.service.spec.ts
│   └── events/
│       └── order-execution-handler.spec.ts
│
└── integration/
    ├── order-flow.spec.ts
    ├── price-feed.spec.ts
    └── multi-account.spec.ts
```

## Observability

### Metrics

**Custom Sentry Metrics** (following observability-monitoring spec):

```typescript
// Order execution metrics
metrics.increment('executor.order.submitted', { accountId, symbol });
metrics.increment('executor.order.success', { accountId, symbol });
metrics.increment('executor.order.failed', { accountId, symbol, errorCode });
metrics.timing('executor.order.latency', duration, { accountId, broker });

// Price feed metrics
metrics.increment('executor.price.fetched', { accountId, symbol });
metrics.timing('executor.price.fetch_latency', duration, { broker });

// Broker health metrics
metrics.gauge('executor.broker.healthy', 1, { accountId, broker });
metrics.gauge('executor.broker.unhealthy', 0, { accountId, broker });
```

### Trace Tokens

**Propagation**: Received in `EXECUTE_ORDER_REQUEST`, included in all logs and published results

```typescript
logger.info({ traceToken, orderId, accountId }, 'Executing order');
```

## Deployment

### PM2 Configuration

```javascript
// infra/pm2/executor-service.config.js

module.exports = {
  apps: [{
    name: 'executor-service',
    script: './dist/apps/executor-service/main.js',
    instances: 1,  // MVP: single instance
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      DOTENV: '.env.local',
    },
  }],
};
```

### MVP Constraint

**Single Instance**: Executor-service MUST run as a single instance in MVP due to:
- Per-account stream consumption (no need for multiple instances yet)
- Broker adapter state (connection pooling)
- Simplified error handling

**Future Scaling**: Can run multiple instances with:
- Consumer group assignment per account
- Shared adapter pool via Redis cache
- Load balancing across accounts

## Migration from tvbot

### Phase 1: Binance Future (ccxt)

**Source**: `trading-view-alert/src/services/exchanges/crypto/binance.future.ts`

**Adaptation**:
- Port ccxt setup and configuration
- Adapt order placement logic
- Extract leverage/margin management
- Remove TradingView-specific code

**Estimated Effort**: 1 week

### Phase 2: Oanda

**Source**: `trading-view-alert/src/services/exchanges/oanda/index.ts`

**Adaptation**:
- Port Oanda client HTTP methods
- Adapt order lifecycle (create, modify SL/TP, close)
- Extract symbol mapping logic
- Port precision/rounding helpers

**Estimated Effort**: 1 week

### Phase 3: XM/Exness (Future)

**Source**: Reverse-engineered API clients (to be built)

**Approach**:
- Implement `WebTerminalAdapter` based on API research
- Create HTTP client for web terminal endpoints
- Handle session management and authentication
- Implement order submission and tracking

**Estimated Effort**: 2-3 weeks (dependent on reverse engineering completion)

## Success Metrics

### Performance
- Order execution latency <100ms (vs 500-2000ms HTTP)
- Price feed update frequency: 5s
- Message processing throughput: >100 orders/sec/account

### Reliability
- Order submission success rate >99%
- Broker adapter uptime >99.9%
- Zero message loss (Redis Stream guarantees)

### Maintainability
- Test coverage >95%
- All files <250 lines (AI-friendly)
- Zero cross-repo dependencies
- Documentation completeness >90%

## Open Questions

1. **Account credential management**: How to securely store/rotate broker API keys?
   - **Answer**: Store encrypted in MongoDB, hot-reload on update (future enhancement)

2. **Price feed storage**: Should we persist price history?
   - **Answer**: No for MVP; publish to stream only; trade-manager caches if needed

3. **Order history tracking**: Should executor maintain order state?
   - **Answer**: No; executor is stateless; trade-manager owns order state via Order model

4. **Multi-instance scaling**: When to scale to multiple instances?
   - **Answer**: When single instance CPU >70% or latency >500ms; likely months away

