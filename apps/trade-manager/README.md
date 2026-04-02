# Trade Manager

Service responsible for managing trading operations, job scheduling, and message processing flow.

## Message Translation Flow

This service handles the initial processing of new Telegram messages and coordinates with the Interpret Service for translation.

### Flow Description

1.  **New Message Event**: Receives `NEW_MESSAGE` event from `telegram-service` via Redis Stream (`telegram-events`).
2.  **Processing**:
    *   Checks if the message exists in the database.
    *   **Account Lookup**: Fetches active accounts associated with the channel to determine which Prompt Rules apply.
    *   **Multi-Request Generation**: For each distinct `promptId` found among the accounts:
        *   Creates a history entry with type `TRANSLATE_MESSAGE` (including `promptId` in notes).
        *   Publishes a `TRANSLATE_MESSAGE_REQUEST` to `interpret-events` stream with the specific `promptId`.
    *   Uses MongoDB transactions to ensure atomicity between database updates and stream publishing.
3.  **Translation**: The `interpret-service` picks up each request, translates the message using the specified prompt, and publishes a result.

### Configuration

*   `MESSAGE_HISTORY_TTL_SECONDS`: Time-to-live for message history processing (default: 10s).

## Distributed Tracing

Trade-manager implements Sentry distributed tracing for monitoring message processing flow.

### Trace Flow

```
[Incoming] NEW_MESSAGE with trace context
    ↓
NewMessageHandler.processWithTracing()
    ├─ fetch-message (db.query)
    ├─ fetch-active-accounts (db.query)
    ├─ publish-translate-request (queue.publish) → [Outgoing] TRANSLATE_MESSAGE_REQUEST
    └─ add-history-entry (db.mutation)


[Incoming] TRANSLATE_MESSAGE_RESULT with trace context
    ↓
TranslateResultHandler.processWithTracing()
    ├─ filter-valid-commands (skip non-commands and NONE)
    ├─ lookup-channel-code (cache.get) → TelegramChannelCacheService
    ├─ fetch-active-accounts (db.query) → AccountRepository
    ├─ For each account:
    │   ├─ transform-command → CommandTransformerService
    │   │   ├─ LONG/SHORT: Validate entry, SL/TP, apply configs
    │   │   ├─ MOVE_SL: Find orders, calculate breakeven SL
    │   │   ├─ SET_TP_SL: Find orders, validate TP/SL updates
    │   │   ├─ CLOSE_ALL/CANCEL/CLOSE_BAD_POSITION: Find orders
    │   │   └─ Return ExecuteOrderRequestPayload[] or null
    │   ├─ create-order (db.mutation) → OrderService (for LONG/SHORT only)
    │   └─ publish-execution-request (queue.publish) → [Outgoing] EXECUTE_ORDER_REQUEST
    └─ Emit processing duration metric
```

## Translation Result Handling Flow

This service processes translation results from `interpret-service` and transforms them into executable order requests.

### Flow Description

1. **Receive Translation Result**: Consumes `TRANSLATE_MESSAGE_RESULT` event from `interpret-service` via Redis Stream (`interpret-results`).
2. **Filter Commands**: Skips non-command messages (`isCommand = false`) and `NONE` commands.
3. **Channel Lookup**: Retrieves channel code using `TelegramChannelCacheService` (5-minute in-memory cache).
4. **Account Discovery**: Fetches all active accounts for the channel using `AccountRepository.findActiveByChannelCode()`.
5. **Command Transformation**: For each account and command:
   - **CommandTransformerService** validates and transforms commands based on type:
     - **LONG/SHORT**: Validates symbol, entry (required for limit orders), SL/TP prices, applies account/symbol configs
     - **MOVE_SL**: Finds related orders, calculates breakeven SL (entry ± delta)
     - **SET_TP_SL**: Finds related orders, validates TP/SL updates (one-way movement for SL)
     - **CLOSE_ALL**: Finds all active orders, filters by side if specified
     - **CANCEL**: Finds pending orders only, filters by side if specified
     - **CLOSE_BAD_POSITION**: Finds open orders, keeps best entry, closes others
   - Returns `ExecuteOrderRequestPayload[]` or `null` if validation fails
6. **Order Creation**: For LONG/SHORT commands only:
   - Creates order record in MongoDB via `OrderService.createOrder()`
   - Handles order linking if `isLinkedWithPrevious = true`
   - Uses MongoDB transactions for atomicity
7. **Publish Execution Requests**: Publishes `EXECUTE_ORDER_REQUEST` events to `executor-service` via Redis Stream (`order-execution-requests`).
8. **Metrics**: Emits processing duration metrics to Sentry.

### Command Validation Rules

**LONG/SHORT:**
- Symbol must exist and not be empty
- **Market orders** (`isImmediate = true`): Entry is optional (ignored if provided)
- **Limit orders** (`isImmediate = false`): Entry is required (from `entry` or `entryZone`)
- **StopLoss validation** (only when entry exists):
  - LONG: SL price must be < entry
  - SHORT: SL price must be > entry
  - Invalid SL is filtered out (logged, not rejected)
  - Pips-only SL (no price) is included without validation
- **TakeProfit validation** (only when entry exists):
  - LONG: TP price must be > entry
  - SHORT: TP price must be < entry
  - Invalid TPs are filtered out (logged, not rejected)
  - Pips-only TPs (no price) are included without validation

**MOVE_SL:**
- Finds orders by message context
- Calculates breakeven SL: `entry ± delta` (from symbol config)
- Skips orders without valid entry price

**SET_TP_SL:**
- Finds orders by message context
- **SL validation**: One-way movement only
  - LONG: new SL >= existing SL (can only move up)
  - SHORT: new SL <= existing SL (can only move down)
  - SL pips only allowed when order has no SL yet
- **TP validation**: Must be in profit direction
  - TP pips only allowed when order has no TP yet

**CLOSE_ALL/CANCEL/CLOSE_BAD_POSITION:**
- Symbol must exist
- Finds orders by message context
- Filters by side if specified in extraction

### Services

**TelegramChannelCacheService:**
- In-memory cache for channel code lookups
- TTL: 5 minutes
- Reduces database queries by ~90% for repeated lookups

**CommandTransformerService:**
- Transforms AI-detected commands into executable payloads
- Validates command-specific rules
- Applies account and symbol configurations
- Returns array of payloads (one per order for multi-order commands)

**OrderService:**
- Creates order records in MongoDB
- Handles order linking for DCA strategies
- Finds orders by message context for command execution

### Configuration

**Account-level configs:**
```typescript
{
  closeOppositePosition?: boolean; // Default true
}
```

**Symbol-level configs:**
```typescript
{
  forceStopLossByPercentage?: number;
  pickBestEntryFromZone?: boolean;
  pickBestEntryFromZoneDelta?: number;
}
```
```

### Service-Specific Spans

**NewMessageHandler:**
- `stream.consume.NEW_MESSAGE` - Main handler span
  - `fetch-message` - Fetch telegram message from DB
    - Attributes: `channelId`, `messageId`, `found`
  - `fetch-active-accounts` - Fetch active accounts for channel
    - Attributes: `channelCode`, `count`
  - `publish-translate-request` - Publish translation request (per account)
    - Attributes: `accountId`, `promptId`, `streamMessageId`
  - `add-history-entry` - Add translation history entry
    - Attributes: `channelId`, `messageId`, `accountId`

**TranslateResultHandler:**
- `stream.consume.TRANSLATE_MESSAGE_RESULT` - Main handler span
  - Attributes: `isCommand`, `command`, `confidence`, `traceToken`

### Debugging

**Find slow message processing:**
```
transaction:"stream.consume.NEW_MESSAGE" duration:>1s
```

**Track specific message:**
```
traceToken:"123456-1001234567890"
```

**Find account lookup issues:**
```
transaction:"fetch-active-accounts" count:0
```

### Dependencies

*   **MongoDB**: Stores message history and trading data. Requires Replica Set for transactions.
*   **Redis**: Used for stream processing and communication between services.

## Jobs

### Pending Order Cleanup Job

Automatically cleans up orders that remain in `PENDING` status beyond a configured timeout. This prevents orphaned orders from accumulating when the executor-service fails to process them.

#### Purpose

When orders are created in `PENDING` status, they should normally be picked up by the executor-service and transitioned to `OPEN` or `CANCELED`. However, if the executor-service is down or fails to process an order, it can remain stuck in `PENDING` status indefinitely. This job identifies and cleans up such stale orders.

#### Configuration

The job must be configured in the MongoDB `trade-manager-jobs` collection:

```json
{
  "jobId": "pending-order-cleanup-job",
  "name": "pending-order-cleanup-job",
  "isActive": true,
  "config": {
    "cronExpression": "*/1 * * * *",
    "timezone": "UTC"
  },
  "meta": {
    "timeoutMinutes": 1,
    "notificationAccountIds": []
  }
}
```

**Configuration Fields:**

- `jobId`: Must be `"pending-order-cleanup-job"` (matches the job class)
- `name`: Unique name for the job instance
- `isActive`: Set to `true` to enable the job
- `config.cronExpression`: Cron schedule (default: every minute)
- `config.timezone`: Timezone for cron execution (default: UTC)
- `meta.timeoutMinutes`: How long an order can remain PENDING before cleanup (default: 1 minute)
- `meta.notificationAccountIds`: Array of account IDs that should receive push notifications when their orders are cleaned up (default: empty array)

#### Behavior

**On each execution:**

1. Queries all orders with `status = PENDING`
2. Filters orders where `createdAt < (now - timeoutMinutes)`
3. For each stale order:
   - **On Success:**
     - Closes the order (sets `status = CLOSED`, `closedAt = now`)
     - Adds `CANCELED` history entry with:
       - `service: "pending-order-cleanup-job"`
       - `command: NONE`
       - `reason`: Timeout message
     - Sends push notification if account is whitelisted
   - **On Failure:**
     - Logs error and captures in Sentry
     - Adds `ERROR` history entry with:
       - `service: "pending-order-cleanup-job"`
       - `command: NONE`
       - `reason`: "Failed to clean up stale pending order"
       - `error`: Error message
     - Sends failure notification if account is whitelisted
     - Continues processing other orders

**Performance Note:**

The job uses in-memory filtering for `createdAt` (MVP approach). This is acceptable with the assumption of \<100 PENDING orders at any time. If PENDING orders exceed 100, consider adding a compound index `{status: 1, createdAt: 1}` for better performance.

#### Database Setup

To enable the job, insert the configuration document into MongoDB:

```bash
# Connect to MongoDB
mongosh "mongodb://localhost:27017/telegram-trading-bot"

# Insert job configuration
db.getCollection('trade-manager-jobs').insertOne({
  jobId: "pending-order-cleanup-job",
  name: "pending-order-cleanup-job",
  isActive: true,
  config: {
    cronExpression: "*/1 * * * *",
    timezone: "UTC"
  },
  meta: {
    timeoutMinutes: 1,
    notificationAccountIds: []
  },
  createdAt: new Date(),
  updatedAt: new Date()
});
```

**To enable notifications for specific accounts:**

```javascript
db.getCollection('trade-manager-jobs').updateOne(
  { jobId: "pending-order-cleanup-job" },
  { 
    $set: { 
      "meta.notificationAccountIds": ["account-id-1", "account-id-2"] 
    } 
  }
);
```

**To adjust timeout:**

```javascript
db.getCollection('trade-manager-jobs').updateOne(
  { jobId: "pending-order-cleanup-job" },
  { 
    $set: { 
      "meta.timeoutMinutes": 5  // 5 minutes
    } 
  }
);
```

#### Monitoring

**Check job status:**
```javascript
db.getCollection('trade-manager-jobs').findOne({ jobId: "pending-order-cleanup-job" });
```

**Find cleaned orders:**
```javascript
db.orders.find({
  "history.service": "pending-order-cleanup-job",
  "history.status": "canceled"
}).sort({ closedAt: -1 });
```

**Find cleanup failures:**
```javascript
db.orders.find({
  "history.service": "pending-order-cleanup-job",
  "history.status": "error"
}).sort({ "history.ts": -1 });
```
