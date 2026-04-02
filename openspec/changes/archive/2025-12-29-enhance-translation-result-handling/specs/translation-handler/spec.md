# translation-handler Spec Delta

## ADDED Requirements

### Requirement: Translation Result Handler
The system SHALL provide a TranslateResultHandler to process TRANSLATE_MESSAGE_RESULT events and delegate order execution to executor-service.

#### Scenario: Handler initialization
- **WHEN** the TranslateResultHandler is initialized
- **THEN** it SHALL be injected with:
  - Logger instance
  - Error capture service
  - TelegramChannelCacheService
  - AccountRepository
  - CommandTransformerService
  - Stream publisher for EXECUTE_ORDER_REQUEST

#### Scenario: Non-command message filtering
- **WHEN** processing a TRANSLATE_MESSAGE_RESULT event
- **THEN** the handler SHALL skip messages where:
  - Any command has `isCommand = false`, OR
  - Any command has `command = NONE`
- **AND** it SHALL log the skip action
- **AND** it SHALL NOT publish any EXECUTE_ORDER_REQUEST events

#### Scenario: Channel code lookup
- **WHEN** processing a valid command message
- **THEN** the handler SHALL:
  - Extract `channelId` from the payload
  - Lookup `channelCode` using TelegramChannelCacheService
  - Use cached value if available (TTL: 5 minutes)
  - Query MongoDB if cache miss
  - Store result in cache for future lookups

#### Scenario: Active account discovery
- **WHEN** channel code is resolved
- **THEN** the handler SHALL:
  - Query AccountRepository using `findActiveByChannelCode(channelCode)`
  - Retrieve all accounts where `isActive = true` and `telegramChannelCode = channelCode`
  - Skip processing if no active accounts found
  - Log the number of active accounts found

#### Scenario: Command transformation per account
- **WHEN** active accounts are found
- **THEN** for each account and each command in the message:
  - Extract account configurations (`configs`, `symbols`)
  - Use CommandTransformerService to transform command to EXECUTE_ORDER_REQUEST
  - Apply account-level configurations (e.g., `closeOppositePosition`)
  - Apply symbol-specific configurations (e.g., `forceStopLossByPercentage`)
  - Generate proper `stopLoss` and `takeProfits` structures
  - Preserve `messageId`, `channelId`, `traceToken` from original message

#### Scenario: Order execution request publishing
- **WHEN** commands are transformed
- **THEN** the handler SHALL:
  - Publish EXECUTE_ORDER_REQUEST event to executor-service stream
  - Use per-account stream routing (e.g., `stream:trade:account:{accountId}`)
  - Include all required fields in the payload
  - Log each published event with trace token
  - Emit metrics for published events

#### Scenario: Error handling
- **WHEN** errors occur during processing
- **THEN** the handler SHALL:
  - Catch and log errors with full context (messageId, channelId, traceToken)
  - Capture errors in error capture service (Sentry)
  - Re-throw errors to trigger stream retry mechanism
  - NOT publish partial results (all-or-nothing per message)

### Requirement: Telegram Channel Cache Service
The system SHALL provide a TelegramChannelCacheService for efficient channel code lookups with in-memory caching.

#### Scenario: Cache service initialization
- **WHEN** the TelegramChannelCacheService is initialized
- **THEN** it SHALL be injected with:
  - TelegramChannelRepository
  - Logger instance
- **AND** it SHALL initialize an in-memory cache using Map<string, CacheEntry>
- **AND** CacheEntry SHALL contain: `{ channelCode: string, timestamp: number }`

#### Scenario: In-memory cache pattern
- **WHEN** looking up a channel code by channelId
- **THEN** the service SHALL:
  1. Check in-memory cache for the channelId
  2. If found and not expired (TTL: 5 minutes), return cached value
  3. If not found or expired, query MongoDB using TelegramChannelRepository
  4. Store result in memory cache with current timestamp
  5. Return the channel code or null if not found

#### Scenario: Cache expiration
- **WHEN** checking cache entries
- **THEN** the service SHALL:
  - Calculate age as (current time - cached timestamp)
  - Consider entry expired if age > 300000 ms (5 minutes)
  - Query MongoDB for expired entries
  - Update cache with fresh data

#### Scenario: Cache invalidation
- **WHEN** a channel is updated or deleted
- **THEN** the service SHALL provide an `invalidate(channelId)` method
- **AND** it SHALL remove the cached entry from memory
- **AND** subsequent lookups SHALL fetch fresh data from MongoDB

#### Scenario: Cache clearing
- **WHEN** clearing all cache entries
- **THEN** the service SHALL provide a `clear()` method
- **AND** it SHALL remove all entries from the in-memory cache
- **AND** subsequent lookups SHALL query MongoDB

### Requirement: Command Transformer Service
The system SHALL provide a CommandTransformerService to transform AI commands into executor-service order requests.

#### Scenario: Transformer initialization
- **WHEN** the CommandTransformerService is initialized
- **THEN** it SHALL be injected with:
  - Logger instance
  - Configuration service (for defaults)

#### Scenario: Command to order request transformation
- **WHEN** transforming a command
- **THEN** the service SHALL:
  - Accept command extraction data
  - Accept message metadata (messageId, channelId, traceToken)
  - Accept account metadata (accountId)
  - Accept optional account configurations
  - Accept optional symbol configurations
  - Return a valid ExecuteOrderRequestPayload

#### Scenario: Command type mapping
- **WHEN** transforming commands
- **THEN** the service SHALL map:
  - LONG command → `command: CommandEnum.LONG`
  - SHORT command → `command: CommandEnum.SHORT`
  - MOVE_SL command → `command: CommandEnum.MOVE_SL`
  - SET_TP_SL command → `command: CommandEnum.SET_TP_SL`
  - CLOSE command → `command: CommandEnum.CLOSE`
  - CLOSE_ALL command → `command: CommandEnum.CLOSE_ALL`
  - CANCEL command → `command: CommandEnum.CANCEL`

#### Scenario: Stop loss transformation
- **WHEN** command includes stop loss data
- **THEN** the service SHALL:
  - Extract `stopLoss.price` or `stopLoss.pips` from command
  - Apply `forceStopLossByPercentage` from symbol config if present
  - Create `stopLoss` object with appropriate fields
  - Preserve both price and pips if available for executor flexibility

#### Scenario: Take profit transformation
- **WHEN** command includes take profit data
- **THEN** the service SHALL:
  - Extract all take profit levels from `takeProfits` array
  - Transform each TP to object with `price` or `pips`
  - Preserve order of TP levels
  - Support multiple TP levels (TP1, TP2, TP3, etc.)

#### Scenario: Immediate execution determination
- **WHEN** transforming execution timing
- **THEN** the service SHALL:
  - Set `isImmediate = true` if command has `isImmediate = true`
  - Set `isImmediate = false` if command has `isImmediate = false`
  - Default to `false` if not specified (limit order)

#### Scenario: Account configuration application
- **WHEN** account configurations are provided
- **THEN** the service SHALL:
  - Include `closeOppositePosition` setting in transformation logic
  - Apply any other account-level trading preferences
  - Log configuration application for traceability

#### Scenario: Command validation
- **WHEN** transforming commands
- **THEN** the service SHALL validate each command type:
  - **LONG/SHORT**: 
    - Symbol exists and is not empty
    - If isImmediate = false (limit order): entry MUST exist
    - If isImmediate = true (market order): entry is optional
  - **MOVE_SL**: Symbol exists, stopLoss is present
  - **SET_TP_SL**: Symbol exists, at least one of (stopLoss, takeProfits) exists
  - **CLOSE**: Symbol exists
  - **CLOSE_ALL/CANCEL/CLOSE_BAD_POSITION/LIMIT_EXECUTED**: Symbol exists
- **AND** it SHALL return null if critical validation fails
- **AND** it SHALL log validation failures with details (command type, reason, messageId, traceToken)

#### Scenario: StopLoss price validation for LONG/SHORT
- **WHEN** transforming LONG/SHORT commands with entry and stopLoss.price
- **THEN** the service SHALL validate stopLoss price direction:
  - For LONG (BUY): stopLoss.price MUST be less than entry price
  - For SHORT (SELL): stopLoss.price MUST be greater than entry price
- **AND** if stopLoss price is invalid:
  - Log warning with details (command, entry, stopLoss, side)
  - Exclude stopLoss from the transformed payload
  - Continue processing (do not fail entire command)
- **AND** if stopLoss has only pips (no price):
  - Include stopLoss without validation
  - Let executor-service calculate the price

#### Scenario: TakeProfit price validation for LONG/SHORT
- **WHEN** transforming LONG/SHORT commands with entry and takeProfits with prices
- **THEN** the service SHALL validate each takeProfit price direction:
  - For LONG (BUY): each TP.price MUST be greater than entry price
  - For SHORT (SELL): each TP.price MUST be less than entry price
- **AND** if any takeProfit price is invalid:
  - Log warning with details (command, entry, invalid TPs, side)
  - Filter out invalid takeProfits
  - Include only valid takeProfits in the payload
  - Continue processing (do not fail entire command)
- **AND** if takeProfits have only pips (no prices):
  - Include all takeProfits without validation
  - Let executor-service calculate the prices
- **AND** if all takeProfits are invalid:
  - Log warning
  - Exclude all takeProfits from the payload
  - Continue processing with no TPs

#### Scenario: Command-specific transformation functions
- **WHEN** implementing transformations
- **THEN** the service SHALL use a Map-based approach similar to groq-ai.service.ts:
  - Map each CommandEnum to its specific transformation function
  - Implement separate functions for different command categories:
    - `transformTradeCommand()` for LONG/SHORT
    - `transformMoveSLCommand()` for MOVE_SL
    - `transformSetTPSLCommand()` for SET_TP_SL
    - `transformCloseCommand()` for CLOSE
    - `transformSymbolOnlyCommand()` for CLOSE_ALL, CANCEL, CLOSE_BAD_POSITION, LIMIT_EXECUTED
  - Use type-safe extractors for each command type
  - Handle NONE command by skipping in the handler (no transformation needed)

### Requirement: Translation Handler Testing
The TranslateResultHandler SHALL have comprehensive integration tests covering the full processing flow.

#### Scenario: Non-command message skipping
- **WHEN** testing with non-command messages
- **THEN** integration tests SHALL verify:
  - Messages with `isCommand = false` are skipped
  - Messages with `command = NONE` are skipped
  - No EXECUTE_ORDER_REQUEST events are published
  - Skip action is logged

#### Scenario: Channel lookup with caching
- **WHEN** testing channel code lookup
- **THEN** integration tests SHALL verify:
  - First lookup queries MongoDB and caches result
  - Second lookup uses cached value (cache hit)
  - Cache miss triggers MongoDB query
  - Invalid channelId returns null

#### Scenario: Active account discovery
- **WHEN** testing account discovery
- **THEN** integration tests SHALL verify:
  - All active accounts for channel are found
  - Inactive accounts are excluded
  - Empty result when no active accounts
  - Correct account filtering by channelCode

#### Scenario: Multi-account command transformation
- **WHEN** testing with multiple accounts
- **THEN** integration tests SHALL verify:
  - Each account receives transformed commands
  - Account-specific configurations are applied
  - Symbol-specific configurations are applied
  - All accounts processed independently

#### Scenario: Event publishing
- **WHEN** testing event publishing
- **THEN** integration tests SHALL verify:
  - EXECUTE_ORDER_REQUEST events are published
  - Events contain correct payload structure
  - Events are routed to correct account streams
  - Trace tokens are preserved
  - Metrics are emitted

#### Scenario: Error handling and retry
- **WHEN** testing error scenarios
- **THEN** integration tests SHALL verify:
  - Errors are caught and logged
  - Errors are captured in error service
  - Errors trigger stream retry
  - Partial results are not published

### Requirement: Cache Service Testing
The TelegramChannelCacheService SHALL have comprehensive unit tests covering caching behavior.

#### Scenario: Cache hit scenario
- **WHEN** testing cache hits
- **THEN** unit tests SHALL verify:
  - Cached values are returned
  - MongoDB is not queried on cache hit
  - Cache TTL is respected

#### Scenario: Cache miss scenario
- **WHEN** testing cache misses
- **THEN** unit tests SHALL verify:
  - MongoDB is queried on cache miss
  - Result is stored in cache
  - Subsequent lookups use cache

#### Scenario: Cache expiration
- **WHEN** testing cache expiration
- **THEN** unit tests SHALL verify:
  - Entries expire after 5 minutes
  - Expired entries trigger MongoDB query
  - Fresh data is cached after expiration

#### Scenario: Cache invalidation
- **WHEN** testing cache invalidation
- **THEN** unit tests SHALL verify:
  - Invalidate removes cached entry from memory
  - Next lookup queries MongoDB
  - New value is cached

#### Scenario: Cache clearing
- **WHEN** testing cache clearing
- **THEN** unit tests SHALL verify:
  - Clear removes all entries from memory
  - Subsequent lookups query MongoDB
  - Cache can be repopulated

### Requirement: Transformer Service Testing
The CommandTransformerService SHALL have comprehensive unit tests covering all transformation scenarios.

#### Scenario: Command type transformations
- **WHEN** testing command transformations
- **THEN** unit tests SHALL verify:
  - All CommandEnum values are handled (LONG, SHORT, MOVE_SL, SET_TP_SL, CLOSE, CLOSE_ALL, CANCEL, CLOSE_BAD_POSITION, LIMIT_EXECUTED)
  - Correct command field is set
  - Required fields are populated

#### Scenario: Stop loss transformations
- **WHEN** testing stop loss transformations
- **THEN** unit tests SHALL verify:
  - Price-based SL is transformed correctly
  - Pips-based SL is transformed correctly
  - Force SL by percentage is applied
  - Missing SL is handled gracefully

#### Scenario: Stop loss price validation
- **WHEN** testing stop loss price validation for LONG/SHORT
- **THEN** unit tests SHALL verify:
  - LONG with valid SL (SL < entry) includes stopLoss in payload
  - LONG with invalid SL (SL > entry) logs warning and excludes stopLoss
  - SHORT with valid SL (SL > entry) includes stopLoss in payload
  - SHORT with invalid SL (SL < entry) logs warning and excludes stopLoss
  - SL with pips only (no price) includes stopLoss without validation
  - Invalid SL does not cause command to return null

#### Scenario: Take profit transformations
- **WHEN** testing take profit transformations
- **THEN** unit tests SHALL verify:
  - Single TP is transformed correctly
  - Multiple TPs are transformed correctly
  - Price and pips formats are handled
  - Missing TPs are handled gracefully

#### Scenario: Take profit price validation
- **WHEN** testing take profit price validation for LONG/SHORT
- **THEN** unit tests SHALL verify:
  - LONG with all valid TPs (all TPs > entry) includes all takeProfits
  - LONG with mixed TPs (some valid, some invalid) filters out invalid TPs and logs warning
  - SHORT with all valid TPs (all TPs < entry) includes all takeProfits
  - SHORT with mixed TPs (some valid, some invalid) filters out invalid TPs and logs warning
  - TPs with pips only (no prices) includes all TPs without validation
  - All TPs invalid logs warning and excludes all takeProfits
  - Invalid TPs do not cause command to return null

#### Scenario: Configuration application
- **WHEN** testing configuration application
- **THEN** unit tests SHALL verify:
  - Account configs are applied correctly
  - Symbol configs are applied correctly
  - Default values are used when configs missing
  - Configs don't override explicit command values

#### Scenario: Command validation
- **WHEN** testing command validation
- **THEN** unit tests SHALL verify:
  - LONG/SHORT validation (missing symbol, side, entry/entryZone)
  - MOVE_SL validation (missing stopLoss)
  - SET_TP_SL validation (missing both stopLoss and takeProfits)
  - CLOSE/CLOSE_ALL/CANCEL/CLOSE_BAD_POSITION/LIMIT_EXECUTED validation (missing symbol)
  - Validation failures return null
  - Validation failures are logged with details
