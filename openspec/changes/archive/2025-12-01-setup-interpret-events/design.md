# Design: Setup Event Infrastructure for Message Interpretation

## Architecture Overview

This change establishes the event-driven communication layer between trade-manager, interpret-service, and future trade-executor services. The design follows the existing Redis Streams pull-based messaging pattern established in the project.

## Message Flow

```
┌─────────────────┐
│ trade-manager   │
│                 │
│ 1. Receives     │
│    NEW_MESSAGE  │
│                 │
│ 2. Publishes    │
│    TRANSLATE_   │
│    MESSAGE_     │
│    REQUEST      │
└────────┬────────┘
         │
         │ Redis Stream: stream:interpret:requests
         │
         ▼
┌─────────────────┐
│ interpret-      │
│ service         │
│                 │
│ 3. Consumes     │
│    request      │
│                 │
│ 4. Calls LLM    │
│                 │
│ 5. Publishes    │
│    TRANSLATE_   │
│    MESSAGE_     │
│    RESULT       │
└────────┬────────┘
         │
         │ Redis Stream: stream:interpret:results
         │
         ▼
┌─────────────────┐
│ trade-manager   │
│                 │
│ 6. Consumes     │
│    result       │
│                 │
│ 7. Processes    │
│    commands     │
└─────────────────┘
```

## Component Design

### 1. Message Type Definitions (libs/shared/utils)

**Location**: `libs/shared/utils/src/interfaces/messages/`

**New Files**:
- `translate-message-request.ts`: Request payload schema and type
- `translate-message-result.ts`: Result payload schema and type
- `symbol-fetch-latest-price.ts`: Price fetch payload schema and type
- `command.types.ts`: Command enums and interfaces

**Updates**:
- `message-type.ts`: Add three new enum values
- `index.ts`: Export new types

**Design Decisions**:
- Use TypeBox for runtime validation (consistent with existing patterns)
- Separate files for each message type (maintainability)
- Enums for command actions and types (type safety)
- Confidence score as number 0-1 (standard ML convention)
- Duration in milliseconds (consistent with existing timing fields)

### 2. Account Model Enhancement (libs/dal)

**Location**: `libs/dal/src/models/account.model.ts`

**Changes**:
```typescript
export interface BrokerSpecs {
  lot_size: number;      // Contract size
  min_lot: number;       // Minimum volume
  lot_step: number;      // Volume increment
  tick_size: number;     // Price increment
  tick_value: number;    // USD per tick per lot
  leverage: number;      // Account leverage
  currency: string;      // Account currency
}

export interface Account extends Document {
  // ... existing fields ...
  brokerSpecs?: BrokerSpecs;
}
```

**Design Decisions**:
- Optional field (not all accounts need broker specs initially)
- Nested object (keeps related data together)
- Snake_case for field names (matches broker API conventions)
- All numeric fields (enables calculations)
- Currency as string (flexible for any currency code)

### 3. Interpret-Service Infrastructure

**Location**: `apps/interpret-service/src/`

**Structure**:
```
apps/interpret-service/
├── src/
│   ├── config.ts              # Extended with Redis config
│   ├── logger.ts              # Service logger
│   ├── sentry.ts              # Error tracking
│   ├── main.ts                # Entry point
│   ├── server.ts              # Service wiring (no HTTP)
│   ├── container.ts           # IoC container
│   ├── events/
│   │   ├── index.ts           # Consumer/publisher registry
│   │   └── handlers/
│   │       └── .gitkeep       # Placeholder for future handlers
│   ├── services/
│   │   └── .gitkeep           # Placeholder for future services
│   └── interfaces/
│       ├── container.interface.ts
│       └── consumer.interface.ts
├── test/
│   ├── integration/
│   │   └── bootstrap.spec.ts  # Service startup test
│   └── setup.ts               # Jest setup
└── jest.config.ts
```

**Config Extensions**:
```typescript
export interface InterpretServiceConfig extends BaseConfig {
  PORT: number;                              // Existing
  LLM_API_KEY: string;                       // Existing
  LLM_MODEL: string;                         // Existing
  LLM_PROVIDER: string;                      // Existing
  REDIS_URL: string;                         // NEW
  REDIS_TOKEN: string;                       // NEW
  STREAM_CONSUMER_MODE_REQUESTS: StreamConsumerMode; // NEW
  SENTRY_DSN: string;                        // NEW
}
```

**Server.ts Pattern** (No HTTP Server):
```typescript
export interface ServerContext {
  container: Container;
  consumers: ConsumerRegistry;
  publisher: IStreamPublisher;
}

export async function startServer(): Promise<ServerContext> {
  // 1. Initialize Sentry
  // 2. Connect to Database
  // 3. Create container
  // 4. Create stream publisher
  // 5. Create and start stream consumers
  return { container, consumers, publisher };
}

export async function stopServer(context: ServerContext): Promise<void> {
  // 1. Stop stream consumers
  // 2. Close stream publisher
  // 3. Close database connection
}
```

**Design Decisions**:
- No HTTP server (purely event-driven service)
- No job scheduling (no periodic tasks needed)
- Mirror trade-manager structure (consistency)
- Separate consumer per message type (single responsibility)
- Publisher shared across handlers (resource efficiency)

## Stream Topic Design

### New Topics

1. **stream:interpret:requests**
   - Purpose: Trade-manager publishes translation requests
   - Consumer: interpret-service
   - Consumer Group: `interpret-service-requests`
   - Message Type: `TRANSLATE_MESSAGE_REQUEST`

2. **stream:interpret:results**
   - Purpose: Interpret-service publishes translation results
   - Consumer: trade-manager
   - Consumer Group: `trade-manager-interpret-results`
   - Message Type: `TRANSLATE_MESSAGE_RESULT`

3. **stream:executor:price-requests** (Future)
   - Purpose: Services request latest symbol prices
   - Consumer: trade-executor (not in this change)
   - Message Type: `SYMBOL_FETCH_LATEST_PRICE`

**Design Decisions**:
- Separate streams for requests and results (clear direction)
- Topic naming: `stream:<service>:<purpose>` (consistent pattern)
- Consumer groups named after service and topic (traceability)
- Price requests in separate stream (different consumer)

## Data Flow Details

### TRANSLATE_MESSAGE_REQUEST Flow

1. **trade-manager** receives `NEW_MESSAGE` from Redis Stream
2. **trade-manager** fetches current orders for the account/channel
3. **trade-manager** constructs `TRANSLATE_MESSAGE_REQUEST` with:
   - Message content and metadata
   - Context (previous/quoted messages)
   - Current orders array
   - Expiry time (current time + 10s)
4. **trade-manager** publishes to `stream:interpret:requests`
5. **interpret-service** consumes message
6. **interpret-service** checks expiry, logs warning if expired
7. **interpret-service** processes or skips based on expiry

### TRANSLATE_MESSAGE_RESULT Flow

1. **interpret-service** calls LLM with message and context
2. **interpret-service** parses LLM response into structured commands
3. **interpret-service** constructs `TRANSLATE_MESSAGE_RESULT` with:
   - isCommand flag
   - Confidence score
   - Timing metadata
   - Commands array (if applicable)
   - AI reasoning note
4. **interpret-service** publishes to `stream:interpret:results`
5. **trade-manager** consumes result
6. **trade-manager** validates commands against account rules
7. **trade-manager** executes or rejects based on validation

## Error Handling

### Message Expiry
- Check `exp` field on consumption
- Log warning with trace token if expired
- Skip processing, acknowledge message
- Capture metric for monitoring

### Validation Failures
- TypeBox validation on message consumption
- Log error with full message payload
- Capture in Sentry with context
- Acknowledge message (don't retry invalid schema)

### LLM Failures
- Retry with exponential backoff (existing pattern)
- Capture in Sentry after max retries
- Publish result with `isCommand: false` and error note
- Don't block stream consumption

### Stream Connection Failures
- Handled by existing RedisStreamConsumer retry logic
- Log errors with service context
- Capture in Sentry
- Graceful degradation (service continues after reconnect)

## Testing Strategy

### Unit Tests
- Message schema validation (all new message types)
- Enum value validation
- TypeBox schema correctness
- Command interface validation

### Integration Tests
- Account model CRUD with brokerSpecs
- interpret-service bootstrap and shutdown
- Stream publisher creation and connection
- Stream consumer creation and connection

### Future Integration Tests (Not in this change)
- End-to-end message flow (request → result)
- Message expiry handling
- Invalid message handling
- LLM integration

## Performance Considerations

### Message Size
- `TRANSLATE_MESSAGE_REQUEST` can be large (orders array)
- Estimated max size: ~10KB for 100 orders
- Redis Stream limit: 512MB per entry (no concern)
- Consider pagination if orders exceed 1000

### Processing Time
- LLM calls typically 1-5 seconds
- Expiry time of 10s provides buffer
- Consider increasing for complex messages
- Monitor duration metrics

### Throughput
- Expected: 10-100 messages/minute (low volume)
- Redis Streams handle 100K+ messages/second
- LLM API rate limits are the bottleneck
- No scaling concerns for MVP

## Security Considerations

### Message Content
- Messages may contain sensitive trading information
- No PII or credentials in messages
- Trace tokens for correlation (not sensitive)
- Redis connection secured with TLS (Upstash)

### LLM API
- API key stored in environment variables
- Not logged or exposed in errors
- Sentry configured to scrub sensitive data
- Rate limiting handled by provider

## Migration Path

### Phase 1 (This Change)
- Add message types and validation
- Update Account model
- Scaffold interpret-service infrastructure
- No actual message processing

### Phase 2 (Future)
- Implement LLM integration in interpret-service
- Add request handler in trade-manager
- Add result handler in trade-manager
- End-to-end testing

### Phase 3 (Future)
- Add symbol price fetching
- Implement trade-executor service
- Add command execution logic
- Production deployment

## Alternatives Considered

### Alternative 1: Synchronous HTTP API
- **Rejected**: Doesn't fit event-driven architecture
- **Rejected**: Adds coupling between services
- **Rejected**: Requires HTTP server in interpret-service
- **Rejected**: Harder to scale and monitor

### Alternative 2: Single Bidirectional Stream
- **Rejected**: Harder to reason about message flow
- **Rejected**: Consumer groups would be complex
- **Rejected**: Less clear separation of concerns

### Alternative 3: Include Broker Specs in Request
- **Rejected**: Duplicates data in every request
- **Rejected**: Account model is source of truth
- **Rejected**: Harder to update specs

### Alternative 4: Separate Service for Price Fetching
- **Accepted**: Price fetching is separate concern
- **Accepted**: Different consumer (trade-executor)
- **Accepted**: Allows independent scaling
