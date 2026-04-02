# Tasks: Enhance Translation Result Handling

## Overview
This document outlines the implementation tasks for enhancing the translation result handling logic. Tasks are organized by library/app and include both implementation and testing work.

## Task Organization

Tasks are grouped by:
1. **libs/dal**: Data model and repository changes
2. **libs/shared/utils**: Message contract updates
3. **apps/trade-manager**: Handler implementation
4. **Integration**: Cross-service testing and validation

---

## Phase 1: Data Access Layer (libs/dal)

### ✅ Task 1.1: Update BrokerConfig Interface
**Location**: `libs/dal/src/models/account.model.ts`

**Changes**:
- Rename `oandaAccountId` to `accountId` (generic for all brokers)
- Add `jwtToken?: string` field
- Add `refreshToken?: string` field
- Remove `loginId` field
- Update JSDoc comments

**Validation**:
- TypeScript compilation passes
- No breaking changes to existing Account documents

**Estimated effort**: 30 minutes

---

### ✅ Task 1.2: Add Account Configuration Fields
**Location**: `libs/dal/src/models/account.model.ts`

**Changes**:
- Add `configs` field to Account interface:
  ```typescript
  configs?: {
    closeOppositePosition?: boolean; // Default true
  }
  ```
- Add `symbols` field to Account interface:
  ```typescript
  symbols?: {
    [symbol: string]: {
      forceStopLossByPercentage?: number;
    };
  }
  ```
- Update JSDoc comments with field descriptions

**Validation**:
- TypeScript compilation passes
- Fields are optional (backward compatible)

**Estimated effort**: 30 minutes

---

### ✅ Task 1.2.5: Add Lot Size Configuration to BrokerConfig
**Location**: `libs/dal/src/models/account.model.ts`

**Changes**:
- Add lot size configuration fields to `BrokerConfig` interface:
  ```typescript
  interface BrokerConfig {
    // ... replace all existing fields completely
    unitsPerLot: number;      // Required: How many units = 1.00 lot (e.g., 100000 for standard, 1000 for XM Micro)
    minLotSize?: number;      // Optional: Minimum allowed lot size (e.g., 0.01, 0.001)
    maxLotSize?: number;      // Optional: Maximum allowed lot size (broker-specific)
    lotStepSize?: number;     // Optional: Lot size increment step (e.g., 0.01, 0.001)
  }
  ```
- Add comprehensive JSDoc comments explaining:
  - `unitsPerLot`: Conversion factor from lots to base units
  - `minLotSize`: Broker's minimum lot size restriction
  - `maxLotSize`: Broker's maximum lot size restriction
  - `lotStepSize`: Valid lot size increments
- Include examples for different brokers:
  - XM Micro: `unitsPerLot: 1000, minLotSize: 0.01, lotStepSize: 0.01`
  - XM Standard: `unitsPerLot: 100000, minLotSize: 0.01, lotStepSize: 0.01`
  - Exness Standard: `unitsPerLot: 100000, minLotSize: 0.01, lotStepSize: 0.01`
  - Exness Cent: `unitsPerLot: 100000, minLotSize: 0.001, lotStepSize: 0.001`
  - OANDA: `unitsPerLot: 1, minLotSize: 1, lotStepSize: 1`

**Validation**:
- TypeScript compilation passes
- `unitsPerLot` is required (no default)
- Optional fields have proper types
- JSDoc examples are accurate

**Estimated effort**: 45 minutes

---

### ✅ Task 1.3: Update Order Model with Message Tracking
**Location**: `libs/dal/src/models/order.model.ts`

**Changes**:
- Add `messageId: string` field
- Add `channelId: string` field
- Add `linkedOrders?: string[]` field (optional, default empty array)
- Update JSDoc comments explaining the purpose of each field

**Validation**:
- TypeScript compilation passes
- Fields properly documented

**Estimated effort**: 30 minutes

---

### ✅ Task 1.4: Add Database Indexes for Account
**Location**: `libs/dal/src/infra/db.ts`

**Changes**:
- Add index on `brokerConfig.accountId`:
  ```typescript
  await getSchema(COLLECTIONS.ACCOUNT).createIndex({
    'brokerConfig.accountId': 1
  });
  ```
- Add compound indexes for common queries:
  ```typescript
  // For message-based lookups
  await getSchema(COLLECTIONS.ACCOUNT).createIndex({
    messageId: 1,
    channelId: 1
  });
  
  // For order lookups
  await getSchema(COLLECTIONS.ACCOUNT).createIndex({ orderId: 1 });
  
  // For trace token lookups
  await getSchema(COLLECTIONS.ACCOUNT).createIndex({ traceToken: 1 });
  
  // For symbol lookups
  await getSchema(COLLECTIONS.ACCOUNT).createIndex({ symbol: 1 });
  ```

**Validation**:
- Indexes created successfully on startup
- No duplicate index errors

**Estimated effort**: 45 minutes

---

### ✅ Task 1.5: Add Database Indexes for Order
**Location**: `libs/dal/src/infra/db.ts`

**Changes**:
- Add compound index for message-based order lookups:
  ```typescript
  await getSchema(COLLECTIONS.ORDERS).createIndex({
    messageId: 1,
    channelId: 1
  });
  ```

**Validation**:
- Index created successfully
- Query performance improved for message-based lookups

**Estimated effort**: 15 minutes

---

### ✅ Task 1.6: Update AccountRepository Tests
**Location**: `libs/dal/test/integration/repositories/account.repository.spec.ts`

**Changes**:
- Add test for accounts with new `configs` field
- Add test for accounts with `symbols` configuration
- Add test for `BrokerConfig` with new token fields
- Verify backward compatibility (accounts without new fields)

**Validation**:
- All integration tests pass
- New fields properly persisted and retrieved

**Estimated effort**: 1 hour

---

### ✅ Task 1.7: Update OrderRepository Tests
**Location**: `libs/dal/test/integration/repositories/order.repository.spec.ts`

**Changes**:
- Add test for creating orders with `messageId` and `channelId`
- Add test for creating orders with `linkedOrders`
- Add test for querying orders by message (messageId + channelId)
- Verify compound index usage

**Validation**:
- All integration tests pass
- Message-based queries work correctly

**Estimated effort**: 1 hour

---

## Phase 2: Message Contracts (libs/shared/utils)

### ✅ Task 2.1: Remove closeIds from TranslateMessageResultPayload
**Location**: `libs/shared/utils/src/interfaces/messages/translate-message-result.ts`

**Changes**:
- Remove `closeIds: Type.Optional(Type.Array(Type.String()))` from extraction schema (line 102)
- Update file header comment if needed
- Update TypeScript type inference

**Validation**:
- TypeScript compilation passes
- Schema validation tests pass

**Estimated effort**: 15 minutes

---

### ✅ Task 2.2: Refactor ExecuteOrderRequestPayload Schema
**Location**: `libs/shared/utils/src/interfaces/messages/execute-order-request-payload.ts`

**Changes**:
- Remove `orderId` field
- Remove `type` field (OrderType enum)
- Remove `executionType` field (OrderExecutionType enum)
- Remove `price` field
- Remove `sl` field
- Remove `tp` field
- Remove `OrderExecutionType` enum definition
- Add new fields:
  ```typescript
  command: Type.Enum(CommandEnum),
  isImmediate: Type.Optional(Type.Boolean()), // Default false
  entry: Type.Optional(Type.Number({ minimum: 0 })),
  stopLoss: Type.Optional(
    Type.Object({
      price: Type.Optional(Type.Number({ minimum: 0 })),
      pips: Type.Optional(Type.Number())
    })
  ),
  takeProfits: Type.Optional(
    Type.Array(
      Type.Object({
        price: Type.Optional(Type.Number({ minimum: 0 })),
        pips: Type.Optional(Type.Number())
      })
    )
  )
  ```
- Update JSDoc comments
- Import `CommandEnum` from command-enum.ts

**Validation**:
- TypeScript compilation passes
- Schema properly validates new structure

**Estimated effort**: 1 hour

---

### ✅ Task 2.3: Update Message Validator Tests
**Location**: `libs/shared/utils/test/unit/message-validator.spec.ts`

**Changes**:
- Update test cases for `TRANSLATE_MESSAGE_RESULT` (without closeIds)
- Add test cases for new `EXECUTE_ORDER_REQUEST` structure
- Test validation of optional fields (stopLoss, takeProfits)
- Test validation with command enum values

**Validation**:
- All unit tests pass
- Invalid payloads properly rejected

**Estimated effort**: 1 hour

---

### ✅ Task 2.4: Create ExecuteOrderRequest Unit Tests
**Location**: `libs/shared/utils/test/unit/execute-order-request.spec.ts` (create if doesn't exist)

**Changes**:
- Create test suite for new ExecuteOrderRequestPayload schema
- Test all CommandEnum values
- Test optional fields (isImmediate, entry, stopLoss, takeProfits)
- Test validation edge cases (both price and pips provided, neither provided)
- Test array validation for takeProfits

**Validation**:
- All unit tests pass
- Schema validation works as expected

**Estimated effort**: 1.5 hours

---

## Phase 3: Trade Manager Implementation (apps/trade-manager)

### ✅ Task 3.1: Add TelegramChannel Caching Service
**Location**: `apps/trade-manager/src/services/telegram-channel-cache.service.ts` (new file)

**Changes**:
- Create new service class `TelegramChannelCacheService`
- Implement in-memory cache pattern (simpler than Redis):
  - Use Map<string, { channelCode: string, timestamp: number }> for cache storage
  - TTL: 5 minutes (300000 ms)
  - Check cache first, return if valid (not expired)
  - If miss or expired, query MongoDB
  - Store in memory cache with current timestamp
- Methods:
  - `getChannelCodeById(channelId: string): Promise<string | null>`
  - `invalidate(channelId: string): void` - removes from cache
  - `clear(): void` - clears entire cache
- Add automatic cleanup of expired entries (optional)
- Add proper error handling

**Validation**:
- Service properly caches and retrieves channel codes
- Cache TTL works correctly (entries expire after 5 minutes)
- Fallback to DB on cache miss or expiration

**Estimated effort**: 1.5 hours

---

### ✅ Task 3.2: Add Unit Tests for TelegramChannelCacheService
**Location**: `apps/trade-manager/test/unit/services/telegram-channel-cache.service.spec.ts` (new file)

**Changes**:
- Test cache hit scenario (within TTL)
- Test cache miss with DB fallback
- Test cache expiration (after TTL)
- Test cache invalidation
- Test error handling (DB down)
- Mock TelegramChannelRepository dependency

**Validation**:
- All unit tests pass
- Edge cases covered
- Cache behavior verified

**Estimated effort**: 1 hour

---

### ✅ Task 3.3: Implement Command Transformation Logic
**Location**: `apps/trade-manager/src/services/command-transformer.service.ts` (new file)

**Changes**:
- Create `CommandTransformerService` class following the pattern from `groq-ai.service.ts`
- Implement command-specific transformation functions using a Map:
  ```typescript
  private readonly transformers = new Map<
    CommandEnum,
    (command: TranslateMessageResultCommand, context: TransformContext) => ExecuteOrderRequestPayload | null
  >([
    [CommandEnum.LONG, (cmd, ctx) => this.transformTradeCommand(cmd, ctx)],
    [CommandEnum.SHORT, (cmd, ctx) => this.transformTradeCommand(cmd, ctx)],
    [CommandEnum.MOVE_SL, (cmd, ctx) => this.transformMoveSLCommand(cmd, ctx)],
    [CommandEnum.SET_TP_SL, (cmd, ctx) => this.transformSetTPSLCommand(cmd, ctx)],
    [CommandEnum.CLOSE, (cmd, ctx) => this.transformCloseCommand(cmd, ctx)],
    [CommandEnum.CLOSE_ALL, (cmd, ctx) => this.transformSymbolOnlyCommand(cmd, ctx)],
    [CommandEnum.CANCEL, (cmd, ctx) => this.transformSymbolOnlyCommand(cmd, ctx)],
    [CommandEnum.CLOSE_BAD_POSITION, (cmd, ctx) => this.transformSymbolOnlyCommand(cmd, ctx)],
    [CommandEnum.LIMIT_EXECUTED, (cmd, ctx) => this.transformSymbolOnlyCommand(cmd, ctx)],
    // NONE is skipped in handler, no transformation needed
  ]);
  ```
- Implement main transformation method:
  ```typescript
  transform(
    command: TranslateMessageResultCommand,
    messageId: string,
    channelId: string,
    accountId: string,
    traceToken: string,
    accountConfig?: Account['configs'],
    symbolConfig?: Account['symbols'][string]
  ): ExecuteOrderRequestPayload | null
  ```
- Implement command-specific transformation functions:
  - `transformTradeCommand()` - for LONG/SHORT with full extraction
  - `transformMoveSLCommand()` - for MOVE_SL
  - `transformSetTPSLCommand()` - for SET_TP_SL
  - `transformCloseCommand()` - for CLOSE
  - `transformSymbolOnlyCommand()` - for CLOSE_ALL, CANCEL, CLOSE_BAD_POSITION, LIMIT_EXECUTED
- Add validation for each command type with detailed rules:
  - **LONG/SHORT**: 
    - Validate symbol exists and is not empty
    - **Entry validation based on order type**:
      - If `isImmediate = false` (limit order): entry MUST exist → return null if missing
      - If `isImmediate = true` (market order): entry is optional (can be null for immediate execution)
    - **StopLoss validation** (only when entry exists):
      - For LONG (BUY): stopLoss.price must be < entry (if price provided)
      - For SHORT (SELL): stopLoss.price must be > entry (if price provided)
      - If validation fails, log warning and ignore stopLoss (don't fail entire command)
      - If stopLoss has only pips (no price), include without validation
    - **TakeProfit validation** (only when entry exists):
      - For LONG (BUY): each TP.price must be > entry (if price provided)
      - For SHORT (SELL): each TP.price must be < entry (if price provided)
      - If any TP is invalid, log warning and filter out invalid TPs
      - If TPs have only pips (no prices), include without validation
    - **Critical validation failures** (return null):
      - Symbol missing or empty
      - Limit order (isImmediate=false) without entry
  - **MOVE_SL**: 
    - Validate symbol exists
    - Return null if validation fails
  - **SET_TP_SL**: 
    - Validate symbol exists
    - Validate at least one of (stopLoss, takeProfits) exists
    - Return null if validation fails
  - **CLOSE**: 
    - Validate symbol exists
    - Return null if validation fails
  - **CLOSE_ALL/CANCEL/CLOSE_BAD_POSITION/LIMIT_EXECUTED**: 
    - Validate symbol exists
    - Return null if validation fails
- Apply account and symbol configurations:
  - Apply `forceStopLossByPercentage` from symbol config if present
  - Include `closeOppositePosition` setting in transformation context
- Generate proper stopLoss and takeProfits structures
- Add comprehensive JSDoc for all methods
- Log all validation failures with details (command type, reason, messageId, traceToken)

**Validation**:
- All command types properly transformed
- Validation rules enforced for each command
- Invalid commands return null
- Market orders (isImmediate=true) can have no entry
- Limit orders (isImmediate=false) must have entry
- SL/TP validation only applies when entry exists
- SL/TP validation prevents incorrect orders
- Configurations applied correctly
- Edge cases handled (missing SL, multiple TPs, invalid SL/TP prices, market vs limit orders)

**Estimated effort**: 5 hours

---

### ✅ Task 3.4: Add Unit Tests for CommandTransformerService
**Location**: `apps/trade-manager/test/unit/services/command-transformer.service.spec.ts` (new file)

**Changes**:
- Test transformation for each CommandEnum value:
  - LONG, SHORT, MOVE_SL, SET_TP_SL, CLOSE, CLOSE_ALL, CANCEL, CLOSE_BAD_POSITION, LIMIT_EXECUTED
- Test command-specific validation rules:
  - **LONG/SHORT**: 
    - Missing symbol → returns null
    - Limit order (isImmediate=false) without entry → returns null
    - Market order (isImmediate=true) without entry → transforms correctly
    - Valid command with entry → transforms correctly
    - Valid command with entryZone → transforms correctly
  - **MOVE_SL**: 
    - Missing symbol → returns null
    - Valid command → transforms correctly
  - **SET_TP_SL**: 
    - Missing symbol → returns null
    - Missing both stopLoss and takeProfits → returns null
    - Valid with only stopLoss → transforms correctly
    - Valid with only takeProfits → transforms correctly
    - Valid with both → transforms correctly
  - **CLOSE**: 
    - Missing symbol → returns null
    - Valid command → transforms correctly
  - **CLOSE_ALL/CANCEL/CLOSE_BAD_POSITION/LIMIT_EXECUTED**: 
    - Missing symbol → returns null
    - Valid command → transforms correctly
- Test SL/TP validation for LONG/SHORT:
  - **StopLoss validation**:
    - LONG with valid SL (SL < entry) → includes stopLoss
    - LONG with invalid SL (SL > entry) → logs warning, excludes stopLoss
    - SHORT with valid SL (SL > entry) → includes stopLoss
    - SHORT with invalid SL (SL < entry) → logs warning, excludes stopLoss
    - SL with pips only (no price) → includes stopLoss (no validation)
  - **TakeProfit validation**:
    - LONG with valid TPs (all TPs > entry) → includes all takeProfits
    - LONG with mixed TPs (some valid, some invalid) → filters out invalid TPs, logs warning
    - SHORT with valid TPs (all TPs < entry) → includes all takeProfits
    - SHORT with mixed TPs (some valid, some invalid) → filters out invalid TPs, logs warning
    - TPs with pips only (no price) → includes all TPs (no validation)
    - All TPs invalid → logs warning, excludes all takeProfits
- Test with various extraction data combinations
- Test account config application (closeOppositePosition)
- Test symbol config application (forceStopLossByPercentage)
- Test edge cases:
  - Missing SL → command still valid
  - No TP → command still valid
  - Multiple TPs → all valid TPs included
  - Invalid SL/TP prices → logged and filtered
- Test validation failures return null
- Test logging of validation failures with correct details

**Validation**:
- All unit tests pass
- Transformations correct for all scenarios
- Validation rules properly enforced
- SL/TP validation prevents incorrect orders
- Invalid values are filtered, not causing command failure

**Estimated effort**: 3 hours

---

### ✅ Task 3.5: Update Container with Services
**Location**: `apps/trade-manager/src/container.ts`

**Changes**:
- Add `TelegramChannelCacheService` to container
- Add `CommandTransformerService` to container
- Inject TelegramChannelRepository into cache service
- Inject logger into both services
- Wire up dependencies

**Validation**:
- Container properly initializes services
- Dependencies injected correctly

**Estimated effort**: 30 minutes

---

### ✅ Task 3.6: Update TranslateResultHandler
**Location**: `apps/trade-manager/src/events/consumers/translate-result-handler.ts`

**Changes**:
- Inject `TelegramChannelCacheService`, `AccountRepository`, `CommandTransformerService`, stream publisher
- Update `handle` method:
  1. Skip messages where `isCommand = false` or `command = NONE`
  2. Extract messageId and channelId from payload
  3. Lookup channelCode using cache service (in-memory)
  4. Query active accounts by channelCode using `findActiveByChannelCode`
  5. For each account and each command:
     - Get account configs and symbol configs
     - Transform command using transformer.transform()
     - Skip if transformation returns null (validation failed)
     - Publish to executor-service stream
  6. Add proper error handling and logging
  7. Log validation failures with details
- Update metrics emission
- Add tracing for each transformation

**Validation**:
- Non-command messages skipped
- Channel lookup works with in-memory caching
- Commands properly transformed per account
- Invalid commands skipped with logging
- Events published correctly

**Estimated effort**: 3 hours

---

### ✅ Task 3.7: Update TranslateResultHandler Integration Tests
**Location**: `apps/trade-manager/test/integration/events/consumers/translate-result-handler.spec.ts`

**Changes**:
- Update existing tests for new behavior
- Add test: Skip non-command messages (isCommand = false)
- Add test: Skip NONE commands
- Add test: Lookup channel code with caching
- Add test: Find active accounts by channel
- Add test: Transform and publish for multiple accounts
- Add test: Handle missing channel (error case)
- Add test: Handle no active accounts (skip gracefully)
- Mock Redis, repositories, and stream publisher

**Validation**:
- All integration tests pass
- Full flow tested end-to-end

**Estimated effort**: 3 hours

---

## Phase 4: Integration & Validation

### ✅ Task 4.1: End-to-End Integration Test
**Location**: `apps/trade-manager/test/integration/events/consumers/translate-result-handler.spec.ts` (covered by existing integration tests)

**Changes**:
- Create full flow integration test:
  1. Publish `TRANSLATE_MESSAGE_RESULT` to stream
  2. Verify `TranslateResultHandler` processes it
  3. Verify `EXECUTE_ORDER_REQUEST` events published
  4. Verify correct transformation for multiple accounts
  5. Verify caching behavior
- Use Docker containers for Redis and MongoDB
- Clean up test data after execution

**Validation**:
- Full flow works end-to-end
- Multiple accounts handled correctly
- Events properly published

**Estimated effort**: 3 hours

---

### ⏭️ Task 4.2: Performance Testing (SKIPPED)
**Location**: `apps/trade-manager/test/performance/translate-result-handler.perf.spec.ts` (new file)

**Changes**:
- Test handler performance with:
  - 1 message, 1 account
  - 1 message, 10 accounts
  - 10 messages, 10 accounts
  - 100 messages, 10 accounts
- Measure:
  - Processing latency per message
  - Cache hit rate
  - Memory usage
  - Event publishing throughput
- Set performance thresholds

**Validation**:
- Performance meets requirements (< 100ms per message)
- Cache hit rate > 90%
- No memory leaks

**Estimated effort**: 2 hours

---

### ✅ Task 4.3: Update Documentation
**Location**: Multiple files

**Changes**:
- Update `apps/trade-manager/README.md` with new handler logic
- Update architecture diagrams (if any)
- Add JSDoc to all new services and methods
- Update message flow documentation

**Validation**:
- Documentation accurate and complete
- Code examples work

**Estimated effort**: 1.5 hours

---

### ✅ Task 4.4: OpenSpec Validation
**Location**: Root directory

**Changes**:
- Run `openspec validate enhance-translation-result-handling --strict`
- Fix any validation errors
- Ensure all spec deltas are correct
- Verify task completion

**Validation**:
- OpenSpec validation passes
- All requirements covered
- All scenarios tested

**Estimated effort**: 1 hour

---

## Summary

### Total Estimated Effort
- **Phase 1 (libs/dal)**: ~5.75 hours
  - Task 1.1: 30 minutes (BrokerConfig updates)
  - Task 1.2: 30 minutes (Account configs/symbols)
  - Task 1.2.5: 45 minutes (Lot size configuration)
  - Task 1.3: 30 minutes (Order model updates)
  - Task 1.4: 45 minutes (Account indexes)
  - Task 1.5: 15 minutes (Order indexes)
  - Task 1.6: 1 hour (Account repository tests)
  - Task 1.7: 1 hour (Order repository tests)
- **Phase 2 (libs/shared/utils)**: ~4 hours
- **Phase 3 (apps/trade-manager)**: ~16.5 hours
  - Task 3.1: 1.5 hours (Cache service)
  - Task 3.2: 1 hour (Cache tests)
  - Task 3.3: 5 hours (Transformer service with validation)
  - Task 3.4: 3 hours (Transformer tests)
  - Task 3.5: 30 minutes (Container)
  - Task 3.6: 3 hours (Handler)
  - Task 3.7: 3 hours (Handler tests)
- **Phase 4 (Integration)**: ~7.5 hours

**Grand Total**: ~33.75 hours (~4 days)

### Task Dependencies

```
Phase 1 (DAL) → Phase 2 (Contracts) → Phase 3 (Trade Manager) → Phase 4 (Integration)
     ↓                ↓                        ↓                          ↓
  1.1-1.7          2.1-2.4                  3.1-3.7                    4.1-4.4
```

### Parallel Work Opportunities
- Tasks 1.1-1.5 can be done in parallel (different files)
- Tasks 2.1-2.2 can be done in parallel
- Tasks 3.1 and 3.3 can be done in parallel
- All testing tasks (*.6, *.7) can be done after implementation tasks

### Critical Path
1. Task 1.2 (Account configs) → Task 3.3 (Transformer)
2. Task 2.2 (ExecuteOrderRequest schema) → Task 3.3 (Transformer)
3. Task 3.1 (Cache service) → Task 3.2 (Cache tests) → Task 3.6 (Handler)
4. Task 3.3 (Transformer) → Task 3.4 (Transformer tests) → Task 3.6 (Handler)
5. Task 3.5 (Container) → Task 3.6 (Handler)
6. Task 3.6 (Handler) → Task 3.7 (Handler tests) → Task 4.1 (E2E test)
