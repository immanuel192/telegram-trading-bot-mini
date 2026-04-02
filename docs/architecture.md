# System Architecture

## Overview
The Telegram Auto-Trading Bot is a distributed, event-driven system that automatically executes trades based on signals from Telegram channels. The architecture follows a microservices pattern with clear separation of concerns and asynchronous communication via Redis Streams.

---

## High-Level Architecture

```mermaid
graph TB
    subgraph "External Systems"
        TG[Telegram Channels]
        OANDA[Oanda API]
        BITGET[Bitget API]
        GROQ[Groq AI]
    end
    
    subgraph "Core Services"
        TS[telegram-service]
        IS[interpret-service]
        TM[trade-manager]
        ES[executor-service]
    end
    
    subgraph "Infrastructure"
        MONGO[(MongoDB)]
        REDIS[(Redis)]
        SENTRY[Sentry]
    end
    
    TG -->|MTCute Client| TS
    TS -->|NEW_MESSAGE| REDIS
    REDIS -->|Consume| IS
    IS -->|Groq API| GROQ
    IS -->|TRANSLATE_RESULT| REDIS
    REDIS -->|Consume| TM
    TM -->|EXECUTE_ORDER| REDIS
    REDIS -->|Consume| ES
    ES -->|Place Orders| OANDA
    ES -->|Place Orders| BITGET
    
    TS -.->|Read/Write| MONGO
    IS -.->|Read/Write| MONGO
    TM -.->|Read/Write| MONGO
    ES -.->|Read/Write| MONGO
    
    TS -.->|Errors| SENTRY
    IS -.->|Errors| SENTRY
    TM -.->|Errors| SENTRY
    ES -.->|Errors| SENTRY
```

---

## Service Responsibilities

### 1. **telegram-service**
**Purpose**: Monitor Telegram channels and publish new messages to the event stream.

**Key Responsibilities**:
- Connect to Telegram using MTCute client
- Listen for new messages in configured channels
- Store raw messages in `telegram-messages` collection
- Publish `NEW_MESSAGE` events to Redis Stream

**Technology Stack**:
- MTCute (Telegram client)
- MongoDB (message storage)
- Redis Streams (event publishing)

---

### 2. **interpret-service**
**Purpose**: Translate human-language trading signals into structured commands using AI.

**Key Responsibilities**:
- Consume `NEW_MESSAGE` events from Redis Stream
- Load prompt rules from `prompt-rules` collection
- Send messages to Groq AI (llama-3.1-8b-instant) for interpretation
- Parse AI responses into structured trading commands
- Publish `TRANSLATE_MESSAGE_RESULT` events

**Technology Stack**:
- Groq AI API (primary)
- Google Gemini (alternative)
- In-memory prompt caching (30min TTL)

**Data Flow**:
```mermaid
sequenceDiagram
    participant RS as Redis Stream
    participant IS as interpret-service
    participant AI as Groq AI
    participant DB as MongoDB
    
    RS->>IS: NEW_MESSAGE event
    IS->>DB: Load prompt-rules
    IS->>AI: Send message + prompt
    AI-->>IS: Structured JSON response
    IS->>RS: TRANSLATE_MESSAGE_RESULT
```

---

### 3. **trade-manager**
**Purpose**: Business logic orchestration for order management and risk validation.

**Key Responsibilities**:
- Consume `TRANSLATE_MESSAGE_RESULT` events
- Validate commands against account configurations
- Handle message edits (close/recreate orders)
- Create order records in `orders` collection
- Calculate lot sizes based on risk percentage
- Publish `EXECUTE_ORDER_REQUEST` events

**Key Components**:
- **TranslateResultHandler**: Main event consumer
- **CommandTransformerService**: Transform AI commands to execution payloads
- **MessageEditHandlerService**: Detect and handle message edits
- **OrderService**: CRUD operations for orders

**Business Rules**:
- Respect `maxOpenPositions` per account
- Enforce `operationHours` (e.g., "Sun-Fri: 18:05 - 16:59")
- Apply `stopLossAdjustPricePercentage` buffer
- Link orders via `isLinkedWithPrevious` flag (DCA strategy)

**Linked Orders (DCA Strategy)**:

For channels using Dollar Cost Averaging (DCA) strategies (e.g., Hang Moon), the system supports **automatic order linking**:

```mermaid
sequenceDiagram
    participant TG as Telegram
    participant TM as trade-manager
    participant ES as executor-service
    participant DB as MongoDB
    
    Note over TG: Message 1: "Gold buy now"
    TG->>TM: TRANSLATE_RESULT<br/>isLinkedWithPrevious: false
    TM->>DB: Create Order A<br/>linkedOrders: []
    
    Note over TG: Message 2: "💥GOLD Buy 4091-4089<br/>TP: 4094, SL: 4086"
    TG->>TM: TRANSLATE_RESULT<br/>isLinkedWithPrevious: true
    TM->>TM: findOrphanOrder()<br/>→ Found Order A
    TM->>DB: Create Order B<br/>linkedOrders: ["A"]
    TM->>DB: Update Order A<br/>linkedOrders: ["B"]
    TM->>ES: EXECUTE_ORDER_REQUEST
    ES->>ES: Place Order B with TP/SL
    ES->>ES: syncLinkedOrdersTpSl()<br/>→ Broadcast to Order A
```

**How It Works**:
1. **First Message** ("Gold buy now"): Creates **orphan order** (no TP/SL, `linkedOrders: []`)
2. **Second Message** ("💥GOLD Buy..."): AI sets `isLinkedWithPrevious: true`
3. **trade-manager**: Finds most recent orphan order for same account/channel
4. **Linking**: Creates circular relationship (`A.linkedOrders = ["B"]`, `B.linkedOrders = ["A"]`)
5. **TP/SL Sync**: executor-service broadcasts TP/SL from Order B to Order A

**Benefits**:
- ✅ Automatic DCA position management
- ✅ Unified TP/SL across related orders
- ✅ No manual intervention required
- ✅ Full audit trail in `Order.history`

**See**: [Linked Orders Documentation](./linked-orders.md) for detailed implementation

---

### 4. **executor-service**
**Purpose**: Execute trades on broker platforms and manage order lifecycle.

**Key Responsibilities**:
- Consume `EXECUTE_ORDER_REQUEST` events
- Route orders to appropriate broker adapters (Oanda, Bitget, etc.)
- Execute market/limit orders
- Set Take Profit (TP) and Stop Loss (SL)
- Update order status in database
- Run background jobs for price/balance caching

**Key Components**:
- **OrderExecutorService**: Main execution orchestrator
- **Broker Adapters**: Exchange-specific implementations
  - `OandaAdapter`: Forex/Gold trading
  - `BitgetAdapter`: Crypto futures
  - `MockAdapter`: Testing/simulation
- **Background Jobs**:
  - `FetchPriceJob`: Cache real-time prices (every 15-30s)
  - `FetchBalanceJob`: Cache account balances (every 5s)
  - `AutoUpdateOrderStatusJob`: Sync order statuses (every 30s)
  - `AutoSyncTpSlLinkedOrderJob`: Sync TP/SL across linked orders (every 1min)

**Broker Adapter Interface**:
```typescript
interface IBrokerAdapter {
  placeOrder(params: PlaceOrderParams): Promise<OrderResult>;
  cancelOrder(orderId: string): Promise<void>;
  getBalance(): Promise<BalanceSnapshot>;
  getPrice(symbol: string): Promise<PriceData>;
}
```

---

## Data Models & Relationships

```mermaid
erDiagram
    TELEGRAM_CHANNELS ||--o{ TELEGRAM_MESSAGES : "has many"
    TELEGRAM_CHANNELS ||--o{ ACCOUNTS : "has many"
    ACCOUNTS ||--o{ ORDERS : "has many"
    TELEGRAM_MESSAGES ||--o{ ORDERS : "triggers"
    PROMPT_RULES ||--o{ ACCOUNTS : "used by"
    
    TELEGRAM_CHANNELS {
        string channelCode PK
        string channelId
        string accessHash
        boolean isActive
    }
    
    TELEGRAM_MESSAGES {
        string channelId FK
        number messageId PK
        string message
        object quotedMessage
        date sentAt
        array history
    }
    
    ACCOUNTS {
        string accountId PK
        string telegramChannelCode FK
        string promptId FK
        object brokerConfig
        object configs
        boolean isActive
    }
    
    ORDERS {
        string orderId PK
        string accountId FK
        number messageId FK
        string symbol
        string side
        string status
        number lotSize
        array linkedOrders
        array history
    }
    
    PROMPT_RULES {
        string promptId PK
        string systemPrompt
    }
```

### Key Collections

#### **telegram-channels**
Stores Telegram channel metadata.
- `channelCode`: Human-readable identifier
- `channelId`: Telegram's internal ID
- `accessHash`: Authentication token

#### **telegram-messages**
Raw messages from Telegram with processing history.
- `history[]`: Audit trail of AI interpretation and execution requests

#### **accounts**
Trading account configurations.
- `brokerConfig`: Exchange-specific settings (API keys, account IDs)
- `configs`: Risk management (max risk %, max positions, operation hours)
- `symbols`: Per-symbol overrides (e.g., entry zone delta)

#### **orders**
Order lifecycle tracking.
- `status`: `pending` → `open` → `closed`
- `linkedOrders[]`: References to related orders (DCA, TP/SL)
- `history[]`: Execution events (placed, filled, cancelled)

#### **prompt-rules**
AI system prompts for signal interpretation.
- `systemPrompt`: Full prompt text with examples and rules

---

## Design Pattern: Distributed Saga with Event Sourcing Audit Trail

The system implements a **Distributed Saga Pattern** with **Event Sourcing** for audit trails, enabling reliable multi-step order processing across distributed services.

### Pattern Overview

```mermaid
sequenceDiagram
    participant TM as trade-manager
    participant DB as MongoDB
    participant RS as Redis Stream
    participant ES as executor-service
    
    Note over TM,ES: Saga Step 1: Create Order
    TM->>DB: Create Order (PENDING)<br/>history: [INTEND]
    TM->>RS: EXECUTE_ORDER_REQUEST
    RS->>ES: Consume message
    ES->>DB: Update Order (OPEN)<br/>history: [INTEND, OPEN]
    
    Note over TM,ES: Saga Step 2: Move SL
    TM->>RS: EXECUTE_ORDER_REQUEST (MOVE_SL)
    RS->>ES: Consume message
    ES->>DB: Update Order<br/>history: [INTEND, OPEN, UPDATE]
    
    Note over TM,ES: Saga Step 3: Set TP
    TM->>RS: EXECUTE_ORDER_REQUEST (SET_TP_SL)
    RS->>ES: Consume message
    ES->>DB: Update Order<br/>history: [INTEND, OPEN, UPDATE, UPDATE]
```

### Key Characteristics

#### 1. **Correlation ID**
Each saga is identified by a composite key:
```typescript
correlationId = (messageId, channelId, accountId)
```

- **messageId**: Links all steps to the original Telegram message
- **channelId**: Identifies the signal source
- **accountId**: Identifies the trading account

This enables:
- ✅ Tracking related operations across services
- ✅ Distributed tracing via `traceToken`
- ✅ Audit trail reconstruction

#### 2. **Sequential Saga Steps**
Messages within the same correlation ID are processed **sequentially**:

```
Step 1: LONG XAUUSD @ 2000    → Create Order (PENDING)
Step 2: MOVE_SL to 2005        → Update Order (SL moved)
Step 3: SET_TP_SL, TP: 2020    → Update Order (TP set)
```

**Why Sequential**:
- Each step depends on the previous step's completion
- Out-of-order execution would cause invalid operations
- Ensures data consistency within a saga

#### 3. **Event Sourcing Audit Trail**
Every state change is recorded in `Order.history[]`:

```typescript
{
  status: OrderHistoryStatus.OPEN,
  service: 'executor-service',
  ts: new Date(),
  traceToken: 'abc-123',
  messageId: 12345,
  channelId: 'gold-signals',
  command: CommandEnum.LONG,
  info: { entryPrice: 2000, lotSize: 0.5 }
}
```

**Benefits**:
- ✅ Full audit trail for compliance
- ✅ Can reconstruct order lifecycle
- ✅ Debug failures by replaying events
- ✅ Service attribution (who did what)

#### 4. **Compensating Actions**
When a Telegram message is edited, the system triggers compensating actions:

```mermaid
graph LR
    A[Message Edit Detected] --> B{Edit Action}
    B -->|CLOSE_AND_RECREATE| C[Close existing orders]
    B -->|CANCEL_AND_RECREATE| D[Cancel pending orders]
    B -->|UPDATE_TP_SL| E[Update TP/SL only]
    
    C --> F[Create new orders<br/>with updated params]
    D --> F
    E --> G[history: MESSAGE_EDITED]
    F --> G
```

**Compensating Transaction Flow**:
1. Detect message edit
2. Determine edit action (close/cancel/update)
3. Execute compensating action
4. Record in `history[]` with `status: MESSAGE_EDITED`
5. Proceed with new saga if needed

#### 5. **Eventual Consistency**
The system uses **eventual consistency** across services:

- **Immediate Consistency**: Within MongoDB transactions (order creation + history)
- **Eventual Consistency**: Across services via Redis Streams
- **Convergence Time**: Typically < 1 second (depends on consumer lag)

**Trade-offs**:
- ✅ **Pros**: High availability, fault tolerance, horizontal scalability
- ⚠️ **Cons**: Temporary inconsistency between services

### Idempotency Considerations

**Current State**: Partially idempotent

| Scenario                | Idempotent? | Reason                                                 |
| ----------------------- | ----------- | ------------------------------------------------------ |
| Replay same `orderId`   | ✅ Yes       | Unique constraint on `orderId`                         |
| Replay same `messageId` | ⚠️ No        | Would create duplicate orders                          |
| Retry failed step       | ✅ Yes       | Sequential processing prevents duplicates within group |
| Concurrent requests     | ⚠️ Depends   | MongoDB transactions provide atomicity per service     |

**Future Enhancement**: Add deduplication check on `(messageId, channelId, accountId)` to achieve full idempotency.

### Failure Handling

**Saga Failure Scenarios**:

1. **Step Fails (Transient Error)**:
   - Retry with exponential backoff (max 3 retries)
   - If retries exhausted → Send to DLQ
   - Subsequent steps blocked until resolution

2. **Step Fails (Permanent Error)**:
   - ACK message to prevent infinite loop
   - Record in `history[]` with `status: ERROR`
   - ⚠️ **Current Gap**: No DLQ implementation (data loss risk)

3. **Message Expired (TTL)**:
   - ACK and skip message
   - Record in logs for monitoring
   - No saga execution

**Recommended**: Implement Dead Letter Queue (DLQ) for failed sagas to enable manual recovery.

---

## Event Flow

### Complete Message-to-Trade Flow

```mermaid
sequenceDiagram
    participant TG as Telegram
    participant TS as telegram-service
    participant RS as Redis Stream
    participant IS as interpret-service
    participant TM as trade-manager
    participant ES as executor-service
    participant BR as Broker

    TG->>TS: New message
    TS->>RS: Publish NEW_MESSAGE
    RS->>IS: Consume event
    IS->>IS: AI interpretation
    IS->>RS: Publish TRANSLATE_RESULT
    RS->>TM: Consume event
    TM->>TM: Validate & create order
    TM->>RS: Publish EXECUTE_ORDER_REQUEST
    RS->>ES: Consume event
    ES->>ES: Load cached price/balance
    ES->>BR: Place market order
    BR-->>ES: Order filled
    ES->>ES: Update order status
    ES->>BR: Set TP/SL
```

### Event Types

| Event Type                 | Topic                      | Producer          | Consumer          |
| -------------------------- | -------------------------- | ----------------- | ----------------- |
| `NEW_MESSAGE`              | `telegram-messages`        | telegram-service  | interpret-service |
| `TRANSLATE_MESSAGE_RESULT` | `translate-results`        | interpret-service | trade-manager     |
| `EXECUTE_ORDER_REQUEST`    | `order-execution-requests` | trade-manager     | executor-service  |

---

## Redis Stream Consumer Architecture

### Consumer Group Strategy

Each service uses **Redis Stream Consumer Groups** with PULL semantics for reliable message processing:

```mermaid
graph TB
    subgraph "Redis Stream: order-execution-requests"
        S1[Message 1<br/>channelId: gold<br/>accountId: acc1]
        S2[Message 2<br/>channelId: gold<br/>accountId: acc2]
        S3[Message 3<br/>channelId: gold<br/>accountId: acc1]
        S4[Message 4<br/>channelId: silver<br/>accountId: acc3]
    end
    
    subgraph "Consumer Group: executor-service"
        C1[Consumer Instance 1<br/>hostname: pod-1]
        C2[Consumer Instance 2<br/>hostname: pod-2]
    end
    
    S1 -.->|XREADGROUP| C1
    S2 -.->|XREADGROUP| C2
    S3 -.->|XREADGROUP| C1
    S4 -.->|XREADGROUP| C2
    
    C1 -->|ACK after success| S1
    C1 -->|ACK after success| S3
    C2 -->|ACK after success| S2
    C2 -->|ACK after success| S4
```

**Key Design Decisions**:

1. **Consumer Naming** (MVP: Single Instance):
   ```typescript
   // Current MVP implementation
   const getConsumerGroupName = () => config('APP_NAME'); // "executor-service"
   const getConsumerName = () => config('APP_NAME');      // "executor-service"
   
   // Future: Multiple instances (requires fix)
   const getConsumerName = () => process.env.HOSTNAME;    // "pod-1", "pod-2", etc.
   ```

2. **PULL Model Benefits**:
   - Services fetch messages at their own pace
   - No connection saturation from forced delivery
   - Natural backpressure via TTL expiration

3. **Message TTL**:
   - All messages have `exp` (expiration timestamp)
   - Expired messages are ACKed and skipped
   - Prevents unbounded queue growth

### Message Grouping Strategy

**Purpose**: Enable parallel processing while maintaining order within related messages.

```mermaid
graph LR
    subgraph "Fetch Batch (20 messages)"
        M1[Msg 1: gold:acc1]
        M2[Msg 2: gold:acc2]
        M3[Msg 3: gold:acc1]
        M4[Msg 4: silver:acc3]
        M5[Msg 5: gold:acc2]
        M6[Msg 6: gold:acc1]
    end
    
    subgraph "Group by channelId:accountId"
        G1["Group: gold:acc1<br/>[Msg 1, Msg 3, Msg 6]"]
        G2["Group: gold:acc2<br/>[Msg 2, Msg 5]"]
        G3["Group: silver:acc3<br/>[Msg 4]"]
    end
    
    subgraph "Concurrent Processing (max 10 groups)"
        P1[Process Group 1<br/>SEQUENTIALLY]
        P2[Process Group 2<br/>SEQUENTIALLY]
        P3[Process Group 3<br/>SEQUENTIALLY]
    end
    
    M1 & M3 & M6 --> G1
    M2 & M5 --> G2
    M4 --> G3
    
    G1 --> P1
    G2 --> P2
    G3 --> P3
```

**Grouping Logic**:
```typescript
// Extract grouping key from message payload
const channelId = message.payload.channelId;
const accountId = message.payload.accountId; // Optional
const groupKey = accountId 
  ? `${channelId}:${accountId}`  // Group by channel + account
  : channelId;                    // Group by channel only
```

**Why Different Grouping Per Message Type**:

| Message Type               | Grouping Key          | Reason                                                        |
| -------------------------- | --------------------- | ------------------------------------------------------------- |
| `NEW_MESSAGE`              | `channelId` only      | One message per channel (no account context yet)              |
| `TRANSLATE_MESSAGE_RESULT` | `channelId` only      | **Cost optimization**: One AI call shared across all accounts |
| `EXECUTE_ORDER_REQUEST`    | `channelId:accountId` | **Parallel execution**: Each account processes independently  |

### Sequential Processing Within Groups

**Critical Requirement**: Messages within the same group MUST be processed sequentially to maintain order.

```mermaid
sequenceDiagram
    participant G as Group: gold:acc1
    participant H as Handler
    participant DB as MongoDB
    participant BR as Broker
    
    Note over G: Message 1: LONG XAUUSD @ 2000
    G->>H: Process Message 1
    H->>DB: Create order
    H->>BR: Place market order
    BR-->>H: Order filled
    H->>G: ✅ ACK Message 1
    
    Note over G: Message 2: MOVE_SL to 2005
    G->>H: Process Message 2
    H->>DB: Find order (created in Msg 1)
    H->>BR: Update SL
    BR-->>H: SL updated
    H->>G: ✅ ACK Message 2
    
    Note over G: Message 3: SET_TP_SL, TP: 2020
    G->>H: Process Message 3
    H->>DB: Find order
    H->>BR: Set TP
    BR-->>H: TP set
    H->>G: ✅ ACK Message 3
```

**What Happens on Failure**:
```mermaid
sequenceDiagram
    participant G as Group: gold:acc1
    participant H as Handler
    participant DB as MongoDB
    
    Note over G: Message 1: LONG XAUUSD @ 2000
    G->>H: Process Message 1
    H->>DB: Create order
    DB-->>H: ❌ Timeout error
    H->>H: Retry (attempt 2/3)
    H->>DB: Create order
    DB-->>H: ❌ Timeout error
    H->>H: Retry (attempt 3/3)
    H->>DB: Create order
    DB-->>H: ❌ Timeout error
    
    Note over H: Max retries exceeded<br/>⚠️ TODO: Send to DLQ
    H->>G: ACK Message 1 (prevents infinite loop)
    
    Note over G: Message 2: MOVE_SL<br/>❌ BLOCKED (Message 1 failed)
    Note over G: Message 3: SET_TP_SL<br/>❌ BLOCKED (Message 1 failed)
    
    Note right of G: On next fetch:<br/>- Message 1 is gone (ACKed)<br/>- Messages 2 & 3 processed<br/>- But order doesn't exist!<br/>⚠️ INCONSISTENT STATE
```

**Why Sequential Processing is Required**:
- Message 2 (MOVE_SL) depends on Message 1 (LONG) creating the order
- Message 3 (SET_TP_SL) depends on the order existing
- Processing out of order would cause invalid operations
- **Blocking on failure is intentional** to prevent inconsistent state

---

## AI Cost Optimization Strategy

### Single AI Translation Per Message

**Design Goal**: Minimize AI API costs while maintaining accuracy.

```mermaid
graph TB
    subgraph "Telegram Channel: gold-signals"
        TM["New Message:<br/>LONG XAUUSD @ 2000<br/>SL: 1990, TP: 2020"]
    end
    
    subgraph "Accounts Subscribed to Channel"
        A1[Account 1<br/>Oanda]
        A2[Account 2<br/>Bitget]
        A3[Account 3<br/>Oanda]
    end
    
    subgraph "interpret-service"
        AI["Groq AI<br/>llama-3.1-8b-instant"]
        TR["Translation Result:<br/>{<br/>  command: LONG,<br/>  symbol: XAUUSD,<br/>  entry: 2000,<br/>  sl: 1990,<br/>  tp: 2020<br/>}"]
    end
    
    subgraph "trade-manager"
        H[TranslateResultHandler]
        P1[Process Account 1]
        P2[Process Account 2]
        P3[Process Account 3]
    end
    
    TM -->|1 message| AI
    AI -->|1 AI call| TR
    TR -->|1 TRANSLATE_RESULT| H
    
    H -->|Promise.all| P1
    H -->|Promise.all| P2
    H -->|Promise.all| P3
    
    P1 -->|EXECUTE_ORDER_REQUEST| E1[executor-service<br/>Account 1]
    P2 -->|EXECUTE_ORDER_REQUEST| E2[executor-service<br/>Account 2]
    P3 -->|EXECUTE_ORDER_REQUEST| E3[executor-service<br/>Account 3]
```

**Cost Comparison**:

| Approach                  | AI Calls | Cost (@ $0.10/1K tokens) | Latency     |
| ------------------------- | -------- | ------------------------ | ----------- |
| **Current (Shared)**      | 1 call   | $0.10                    | ~500ms      |
| Alternative (Per-Account) | 3 calls  | $0.30                    | ~1500ms     |
| **Savings**               | **-67%** | **-$0.20**               | **-1000ms** |

**Why This Works**:
- AI translation is **context-neutral** (no account-specific logic)
- Same signal applies to all accounts
- Account-specific logic (lot size, risk %) happens in `trade-manager`

**Trade-off**:
- ✅ **Pros**: Lower cost, faster processing, simpler architecture
- ⚠️ **Cons**: Cannot customize AI interpretation per account (acceptable for MVP)

### In-Memory Parallelism in trade-manager

**Current Implementation**:
```typescript
// apps/trade-manager/src/events/consumers/translate-result-handler.ts:151-154
const results = await Promise.all(
  activeAccounts.map((account) =>
    this.processAccountCommands(account, validCommands, context)
  )
);
```

**Flow**:
```mermaid
sequenceDiagram
    participant RS as Redis Stream
    participant TM as trade-manager
    participant DB as MongoDB
    participant RS2 as Redis Stream
    
    RS->>TM: 1 TRANSLATE_MESSAGE_RESULT<br/>(channelId: gold-signals)
    
    TM->>DB: Find active accounts<br/>for channel
    DB-->>TM: [Account 1, Account 2, Account 3]
    
    par Process Account 1
        TM->>DB: Create order (txn)
        TM->>RS2: Publish EXECUTE_ORDER_REQUEST
    and Process Account 2
        TM->>DB: Create order (txn)
        TM->>RS2: Publish EXECUTE_ORDER_REQUEST
    and Process Account 3
        TM->>DB: Create order (txn)
        TM->>RS2: Publish EXECUTE_ORDER_REQUEST
    end
    
    TM->>RS: ACK message
```

**Concurrency Control** (for 100+ accounts):
```typescript
import pLimit from 'p-limit';

// Limit concurrent MongoDB transactions
const limit = pLimit(50); // Max 50 concurrent operations

const results = await Promise.all(
  activeAccounts.map((account) =>
    limit(() => this.processAccountCommands(account, validCommands, context))
  )
);
```

---

## Performance Optimizations

### 1. **Redis Caching Layer**
**Problem**: Broker APIs are slow (200-500ms latency).  
**Solution**: Background jobs pre-fetch prices and balances into Redis.

**Cache Keys**:
- `price:{exchangeCode}:{symbol}` → `{ bid, ask, ts }`
- `balance:{exchangeCode}:{accountId}` → `{ balance, equity, margin, ts }`

**TTL Validation**:
- Price: Must be < 32s old
- Balance: Must be < 1800s old
- If stale, executor falls back to deferred SL calculation

### 2. **Lazy TP/SL Calculation**
For market orders without cached prices:
1. Place order immediately (no SL/TP)
2. Wait for broker to return fill price
3. Calculate and set SL/TP in second API call

### 3. **Batch Processing**
- `FetchPriceJob` groups symbols by exchange to minimize API calls
- `AutoUpdateOrderStatusJob` processes up to 50 orders per cycle

### 4. **Linked Order Synchronization**
When a new order with TP/SL is created:
- `AutoSyncTpSlLinkedOrderJob` broadcasts TP/SL to all linked orders
- Prevents manual syncing across DCA positions

---

## Error Handling & Observability

### Sentry Integration
All services capture exceptions with context:
```typescript
Sentry.captureException(error, {
  messageId,
  accountId,
  orderId,
  command,
  traceToken
});
```

### Audit Trail
Every critical action is logged in `history[]` arrays:
- **Telegram Messages**: AI interpretation, execution requests
- **Orders**: Placement, fills, cancellations, TP/SL updates

### Distributed Tracing
- `traceToken`: UUID propagated through all events
- `_sentryTrace` & `_sentryBaggage`: Sentry distributed tracing headers

---

## Deployment Architecture

### Development
```bash
# Local MongoDB with replica set
docker-compose up -d mongo redis

# Run services
pm2 start dist/apps/telegram-service/main.js
pm2 start dist/apps/interpret-service/main.js
pm2 start dist/apps/trade-manager/main.js
pm2 start dist/apps/executor-service/main.js
```

### Production Considerations
- **MongoDB**: Use Atlas with replica sets for transactions
- **Redis**: Use Upstash for managed Redis Streams
- **Scaling**: Each service can scale horizontally
  - **Fix consumer naming**: Use `process.env.HOSTNAME` instead of `APP_NAME`
  - Use consumer groups for parallel processing
  - Shard streams by `channelId` for high-volume channels (post-MVP)
- **Monitoring**: Sentry + New Relic for APM
- **Dead Letter Queue**: Implement DLQ for failed messages (critical for production)

### MVP Deployment (Single Instance)

**Current State**: One instance per service

```mermaid
graph TB
    subgraph "Server / PM2"
        TS[telegram-service<br/>Instance 1]
        IS[interpret-service<br/>Instance 1]
        TM[trade-manager<br/>Instance 1]
        ES[executor-service<br/>Instance 1]
    end
    
    subgraph "Redis Streams"
        R1[messages]
        R2[translate-results]
        R3[order-execution-requests]
    end
    
    TS -->|Publish| R1
    R1 -->|Consumer: interpret-service| IS
    IS -->|Publish| R2
    R2 -->|Consumer: trade-manager| TM
    TM -->|Publish| R3
    R3 -->|Consumer: executor-service| ES
```

**Limitations**:
- ❌ No horizontal scaling (consumer name = APP_NAME)
- ❌ Single point of failure
- ✅ Simple deployment
- ✅ Sufficient for MVP (< 100 channels)

### Future: Horizontal Scaling

```mermaid
graph TB
    subgraph "Kubernetes Cluster"
        subgraph "executor-service Deployment"
            ES1[Pod 1<br/>hostname: exec-pod-1]
            ES2[Pod 2<br/>hostname: exec-pod-2]
            ES3[Pod 3<br/>hostname: exec-pod-3]
        end
    end
    
    subgraph "Redis Stream: order-execution-requests"
        subgraph "Consumer Group: executor-service"
            CG[Messages distributed across consumers]
        end
    end
    
    CG -.->|XREADGROUP| ES1
    CG -.->|XREADGROUP| ES2
    CG -.->|XREADGROUP| ES3
    
    ES1 & ES2 & ES3 -->|ACK| CG
```

**Required Changes**:
```typescript
// Change consumer naming to support multiple instances
const getConsumerName = () => {
  return process.env.HOSTNAME ||        // K8s pod name
         process.env.CONTAINER_ID ||    // Docker container ID
         `${config('APP_NAME')}-${process.pid}`; // Fallback
};
```

---

## Technology Stack Summary

| Layer               | Technology                  |
| ------------------- | --------------------------- |
| **Language**        | TypeScript (Node.js 18+)    |
| **Monorepo**        | Nx                          |
| **Database**        | MongoDB (with replica sets) |
| **Messaging**       | Redis Streams (Upstash)     |
| **AI**              | Groq (llama-3.1-8b-instant) |
| **Telegram**        | MTCute                      |
| **Brokers**         | Oanda, Bitget               |
| **Observability**   | Sentry, New Relic           |
| **Notifications**   | Pushsafer                   |
| **Process Manager** | PM2                         |

---

## Security Considerations

1. **API Keys**: Stored in MongoDB `brokerConfig`, never in code
2. **Telegram Session**: Encrypted session string in `.env`
3. **Redis**: Use TLS for Upstash connections
4. **MongoDB**: Enable authentication and use connection strings with credentials
5. **Sentry**: Scrub sensitive data (API keys, balances) from error reports

---

## Future Enhancements

1. **Multi-Exchange Support**: Add more broker adapters (XM, Exness, Binance)
2. **Advanced Risk Management**: Portfolio-level risk limits
3. **Backtesting**: Replay historical messages for strategy validation
4. **Web Dashboard**: Real-time monitoring UI
5. **Webhooks**: External integrations (Discord, Slack)
