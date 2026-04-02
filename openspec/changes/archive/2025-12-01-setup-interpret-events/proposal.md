# Proposal: Setup Event Infrastructure for Message Interpretation

## Why

The current system lacks the event infrastructure needed for the interpret-service to communicate with trade-manager. Specifically:
- No message type for requesting message translation from trade-manager to interpret-service
- No message type for interpret-service to return translation results
- No message type for tell trade-executor to fetch latest symbol prices
- Account model lacks broker-specific specifications needed for position sizing
- interpret-service exists but has no infrastructure (no server, no consumers, no publishers)

This change establishes the foundational event contracts and service infrastructure required for the interpret-service to function as the LLM-powered translation layer between raw Telegram messages and structured trading commands.

## What Changes

### 1. New Message Type: TRANSLATE_MESSAGE_REQUEST
- Add `TRANSLATE_MESSAGE_REQUEST` to `MessageType` enum in shared-utils
- Create `TranslateMessageRequestPayload` interface with:
  - Message metadata (messageId, channelId, messageText)
  - Context information (prevMessage, quotedMessage, quotedFirstMessage)
  - Current orders for context-aware interpretation
  - Expiry time (default 10s) for message freshness
- Add TypeBox schema validation for the payload
- Add comprehensive unit tests for validation

### 2. New Message Type: TRANSLATE_MESSAGE_RESULT
- Add `TRANSLATE_MESSAGE_RESULT` to `MessageType` enum in shared-utils
- Create `TranslateMessageResultPayload` interface with:
  - Message identification (messageId, channelId)
  - Command detection flag (isCommand)
  - Metadata (confidence, timing, duration)
  - Array of structured commands (ICommand[])
  - Optional AI reasoning note
- Define `CommandAction` enum (LONG, SHORT, UPDATE, CLOSE_PARTIAL, CLOSE_TP, CLOSE_SL, CANCEL, CLOSE_ALL)
- Define `CommandType` enum (MARKET, LIMIT)
- Define `ICommand` interface with action, type, symbol, lotSize, price, orderId
- Add TypeBox schema validation for the payload
- Add comprehensive unit tests for validation

### 3. New Message Type: SYMBOL_FETCH_LATEST_PRICE
- Add `SYMBOL_FETCH_LATEST_PRICE` to `MessageType` enum in shared-utils
- Create `SymbolFetchLatestPricePayload` interface with:
  - symbol: string
  - messageId: string
  - channelId: string
- Add TypeBox schema validation for the payload
- Add comprehensive unit tests for validation

### 4. Account Model Enhancement
- Add `brokerSpecs` optional field to Account model with:
  - lot_size: units per 1 lot (contract size)
  - min_lot: minimum allowed volume
  - lot_step: allowed increments (0.01, 0.1, 1, etc.)
  - tick_size: smallest price movement
  - tick_value: USD value per tick per 1 lot
  - leverage: account leverage
  - currency: account currency (USD, EUR, AUD)
- Update AccountRepository to handle the new field
- Add integration tests for brokerSpecs CRUD operations

### 5. Interpret-Service Infrastructure Scaffolding
- Create full service structure mirroring trade-manager:
  - config.ts: Add Redis Stream configuration (REDIS_URL, REDIS_TOKEN, STREAM_CONSUMER_MODE)
  - logger.ts: Service-specific logger
  - sentry.ts: Error tracking integration
  - main.ts: Entry point with graceful shutdown
  - server.ts: Service wiring (no HTTP server, only stream consumers/publishers)
  - container.ts: IoC container for service dependencies
- Setup stream consumer infrastructure:
  - events/index.ts: Consumer registry and lifecycle management
  - events/handlers/: Message handler directory structure
- Setup stream publisher infrastructure for publishing results
- No job scheduling (interpret-service is purely event-driven)
- Add bootstrap integration test to verify service startup

## Impact

### New Capabilities
- Trade-manager can request message interpretation from interpret-service
- Interpret-service can return structured trading commands with confidence scores
- Services can trigger to fetch latest symbol prices for validation (and not waiting for response)
- Account model supports broker-specific trading constraints
- Interpret-service has complete infrastructure for event-driven operation

### Dependencies
- Requires existing Redis Streams infrastructure
- Depends on shared-utils for message types and validation
- Uses DAL for Account model persistence
- Requires LLM API configuration (already in interpret-service config)

### Migration
- No breaking changes to existing services
- Account model change is additive (optional field)
- New message types are additions to existing enum
- Existing telegram-service and trade-manager continue operating independently

### Testing
- All new message types will have TypeBox validation and unit tests
- Account model changes will have integration tests
- Interpret-service bootstrap will have integration test
- Message validation tests will cover all new schemas

## Risks

- **Message Schema Complexity**: The command structure is complex with multiple enums and optional fields. Mitigation: Comprehensive validation with TypeBox, extensive unit tests.
- **Context Window Size**: Passing current orders in every request could grow large. Mitigation: Document expected limits, consider pagination in future if needed.
- **Service Coordination**: Three-way communication (trade-manager → interpret-service → trade-executor) adds complexity. Mitigation: Clear message contracts, comprehensive logging with trace tokens.
- **Broker Specs Variance**: Different brokers have different specifications. Mitigation: Make all brokerSpecs fields required when present, document expected values.

## Open Questions

1. Should TRANSLATE_MESSAGE_REQUEST include account information for broker-specific interpretation?
   - **Decision Needed**: Depends on whether LLM needs to know lot sizing constraints upfront
2. Should we add a timeout/retry mechanism for TRANSLATE_MESSAGE_REQUEST?
   - **Decision Needed**: Consider adding retry count and timeout configuration
3. Should SYMBOL_FETCH_LATEST_PRICE return the price or publish to a separate stream?
   - **Decision Needed**: Define the response pattern (synchronous vs. async event)
4. Should interpret-service have an HTTP server for health checks?
   - **Decision Needed**: Consistent with other services, probably yes for monitoring
