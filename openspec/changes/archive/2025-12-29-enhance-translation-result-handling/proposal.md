# Proposal: Enhance Translation Result Handling

## Overview

Refactor the message translation result processing flow to delegate order execution logic to the executor-service. This change optimizes the event-driven architecture by removing the need to wait for all translation results before sending the next message, enabling true asynchronous processing while maintaining strict per-account ordering guarantees.

## Why

The current sequential message processing creates a bottleneck that prevents the system from scaling effectively. Messages must be processed in strict order, which means:

1. **Blocked parallelization**: Multiple accounts cannot process the same message simultaneously
2. **Wasted resources**: The system waits for all translation results before processing the next message, even though accounts are independent
3. **Unused fields**: The `closeIds` field in translation results is not utilized, adding unnecessary complexity
4. **Limited flexibility**: The rigid execution request contract doesn't support modern trading patterns (multiple TPs, flexible SL configurations)
5. **Poor traceability**: Orders cannot be traced back to their originating messages or linked to related orders

By delegating execution logic to the executor-service and enhancing the data models, we:

- **Enable true async processing**: trade-manager publishes execution requests and moves on, executor-service handles per-account ordering
- **Improve scalability**: Multiple accounts can process messages in parallel
- **Simplify contracts**: Remove unused fields, focus on essential data
- **Add flexibility**: Support modern trading patterns with configurable SL/TP
- **Enhance traceability**: Link orders to messages and related orders for better debugging and analysis

This change aligns with the event-driven architecture principles and sets the foundation for robust, scalable order execution.

## Context

Currently, the system processes Telegram messages in order through this flow:
1. `telegram-service` → publishes `NEW_MESSAGE`
2. `interpret-service` → consumes, translates, publishes `TRANSLATE_MESSAGE_RESULT`
3. `trade-manager` → consumes `TRANSLATE_MESSAGE_RESULT` (currently just logs)

The `TRANSLATE_MESSAGE_RESULT` payload contains:
- Message metadata (messageId, channelId, traceToken)
- Array of commands with extraction data (symbol, side, entry, SL, TP, etc.)
- `closeIds` field for tracking positions to close

The current design has several limitations:
1. **Sequential bottleneck**: Processing messages in strict order prevents parallel execution
2. **Unused closeIds field**: The `closeIds` field in extraction data is not utilized
3. **Limited account configuration**: No per-account or per-symbol trading preferences
4. **Incomplete order tracking**: Orders don't link back to originating messages or related orders
5. **Rigid execution model**: No support for immediate vs. limit order distinction or flexible SL/TP configuration

## Problem Statement

The system needs to:
1. **Enable asynchronous message processing** without waiting for all results before processing the next message
2. **Delegate execution logic** to executor-service, which can handle per-account ordering
3. **Simplify translation result payload** by removing unused fields
4. **Enhance account configuration** to support trading preferences (close opposite positions, force SL by percentage)
5. **Improve order tracking** by linking orders to messages and related orders
6. **Flexible order execution** with support for immediate/limit orders and configurable SL/TP

## Proposed Solution

### High-Level Changes

1. **Simplify `TRANSLATE_MESSAGE_RESULT` payload**
   - Remove `closeIds` field from extraction data
   - Keep payload focused on AI interpretation results

2. **Enhance `Account` model**
   - Add trading configuration options (`closeOppositePosition`)
   - Add symbol-specific settings (`forceStopLossByPercentage`)
   - Rename `oandaAccountId` to `accountId` in `BrokerConfig`
   - Add `jwtToken` and `refreshToken` for web terminal brokers
   - Remove `loginId` (replaced by tokens)

3. **Enhance `Order` model**
   - Add `messageId` and `channelId` to track originating message
   - Add `linkedOrders` array to track related orders

4. **Refactor `EXECUTE_ORDER_REQUEST` payload**
   - Remove `orderId` (executor-service will generate)
   - Replace rigid `executionType`, `type`, `price`, `sl`, `tp` with flexible structure:
     - `command`: CommandEnum (LONG, SHORT, MOVE_SL, etc.)
     - `isImmediate`: boolean (market vs limit)
     - `entry`: optional entry price
     - `stopLoss`: object with `price` or `pips`
     - `takeProfits`: array of objects with `price` or `pips`

5. **Implement translation result handler logic**
   - Skip non-command messages (isCommand = false or command = NONE)
   - Lookup channel code from `TelegramChannel` model (with Redis cache)
   - Find all active accounts for the channel
   - Transform each command to `EXECUTE_ORDER_REQUEST`
   - Publish to executor-service per account

### Architecture Flow

```
NEW_MESSAGE (telegram-service)
    ↓
TRANSLATE_MESSAGE_REQUEST (interpret-service)
    ↓
TRANSLATE_MESSAGE_RESULT (trade-manager)
    ↓
TranslateResultHandler:
  1. Extract messageId, channelId, commands
  2. Skip if no commands (isCommand=false or command=NONE)
  3. Lookup channelCode from TelegramChannel (cached)
  4. Find all active accounts by channelCode
  5. For each account + command:
     - Transform to EXECUTE_ORDER_REQUEST
     - Publish to executor-service
    ↓
EXECUTE_ORDER_REQUEST (executor-service)
```

### Event-Driven Benefits

- **No blocking**: trade-manager doesn't wait for execution results
- **Per-account ordering**: executor-service handles strict ordering per account
- **Parallel processing**: Multiple accounts process independently
- **Decoupling**: trade-manager focuses on orchestration, executor-service handles execution

## Data Model Changes

### Account Model

**BrokerConfig changes:**
```typescript
interface BrokerConfig {
  exchangeCode: string;
  apiKey: string;
  apiSecret?: string;
  isSandbox?: boolean;
  accountId?: string;          // Renamed from oandaAccountId, now generic
  serverUrl?: string;
  jwtToken?: string;           // NEW: For web terminal auth
  refreshToken?: string;       // NEW: For web terminal auth
  // REMOVED: loginId
}
```

**Account changes:**
```typescript
interface Account {
  // ... existing fields ...
  configs?: {
    closeOppositePosition?: boolean;  // NEW: Default true
  };
  symbols?: {                         // NEW: Symbol-specific settings
    [symbol: string]: {
      forceStopLossByPercentage?: number;
    };
  };
}
```

### Order Model

```typescript
interface Order {
  // ... existing fields ...
  messageId: string;           // NEW: Original message ID
  channelId: string;           // NEW: Original channel ID
  linkedOrders?: string[];     // NEW: Related order IDs
}
```

### EXECUTE_ORDER_REQUEST Payload

**Before:**
```typescript
{
  messageId: number;
  channelId: string;
  orderId: string;              // Removed
  accountId: string;
  traceToken: string;
  symbol: string;
  type: OrderType;              // Removed
  executionType: OrderExecutionType; // Removed
  lotSize: number;
  price: number;                // Removed
  leverage?: number;
  sl?: number;                  // Removed
  tp?: number;                  // Removed
  timestamp: number;
}
```

**After:**
```typescript
{
  messageId: number;
  channelId: string;
  accountId: string;
  traceToken: string;
  symbol: string;
  command: CommandEnum;         // NEW: LONG, SHORT, MOVE_SL, etc.
  lotSize: number;
  isImmediate?: boolean;        // NEW: Default false
  entry?: number;               // NEW: Entry price
  stopLoss?: {                  // NEW: Flexible SL
    price?: number;
    pips?: number;
  };
  takeProfits?: Array<{         // NEW: Multiple TPs
    price?: number;
    pips?: number;
  }>;
  leverage?: number;
  timestamp: number;
}
```

## Database Index Changes

### Account Collection

**New indexes:**
```javascript
// Existing
{ accountId: 1 } unique
{ isActive: 1 }
{ promptId: 1 }
{ telegramChannelCode: 1, isActive: 1 } compound

// NEW
{ 'brokerConfig.accountId': 1 }
{ messageId: 1, channelId: 1 } compound
{ orderId: 1 }
{ traceToken: 1 }
{ symbol: 1 }
```

### Order Collection

**New indexes:**
```javascript
// Existing
{ orderId: 1 } unique
{ status: 1 }
{ createdAt: 1 }
{ accountId: 1, status: 1 } compound

// NEW
{ messageId: 1, channelId: 1 } compound
```

## Implementation Phases

### Phase 1: Data Model Updates (libs/dal)
- Update `Account` model with new configs and symbols fields
- Update `BrokerConfig` interface (rename, add tokens, remove loginId)
- Update `Order` model with messageId, channelId, linkedOrders
- Update `AccountRepository` with new methods if needed
- Add database indexes
- Update integration tests

### Phase 2: Message Contract Updates (libs/shared/utils)
- Remove `closeIds` from `TranslateMessageResultPayloadSchema`
- Update `ExecuteOrderRequestPayloadSchema` with new structure
- Remove `OrderExecutionType` enum
- Update message validator
- Update unit tests

### Phase 3: Trade-Manager Handler Implementation (apps/trade-manager)
- Implement `TranslateResultHandler` logic:
  - Skip non-commands
  - Lookup channel code (with caching)
  - Find active accounts
  - Transform commands to execution requests
  - Publish to executor-service
- Add Redis caching for TelegramChannel lookups
- Update integration tests

### Phase 4: Documentation & Validation
- Update API documentation
- Update architecture diagrams
- Run full integration test suite
- Validate with `openspec validate`

## Risk Assessment

### Technical Risks

| Risk                                      | Impact | Mitigation                                                                 |
| ----------------------------------------- | ------ | -------------------------------------------------------------------------- |
| **Breaking changes to message contracts** | High   | Version message schemas, maintain backward compatibility during transition |
| **Database migration complexity**         | Medium | Use migration scripts, test on staging first                               |
| **Cache invalidation issues**             | Low    | Short TTL (5 mins), implement cache warming                                |
| **Order tracking gaps**                   | Medium | Comprehensive integration tests, audit logging                             |

### Operational Risks

| Risk                                    | Impact | Mitigation                                         |
| --------------------------------------- | ------ | -------------------------------------------------- |
| **Deployment coordination**             | Medium | Deploy in sequence: dal → shared → trade-manager   |
| **Data inconsistency during migration** | Low    | Run migration during low-traffic window            |
| **Performance degradation**             | Low    | Monitor metrics, optimize queries with new indexes |

## Success Criteria

1. **Functional**
   - ✅ Translation results processed asynchronously
   - ✅ Commands correctly transformed to execution requests
   - ✅ Account configurations applied correctly
   - ✅ Orders linked to originating messages
   - ✅ Non-command messages skipped

2. **Non-Functional**
   - ✅ No performance degradation in message processing
   - ✅ Cache hit rate > 90% for channel lookups
   - ✅ All integration tests passing
   - ✅ Zero data loss during migration

3. **Code Quality**
   - ✅ Test coverage > 90%
   - ✅ All files < 250 lines
   - ✅ Comprehensive JSDoc comments
   - ✅ OpenSpec validation passes

## Out of Scope

The following are explicitly **out of scope** for this proposal:

1. **Order placement logic**: Actual execution in executor-service (separate change)
2. **Position management**: Tracking open positions, closing opposite positions
3. **Risk management**: Lot size calculation, risk fraction application
4. **Symbol resolution**: Mapping AI-interpreted symbols to broker symbols
5. **XM/Exness integration**: Web terminal broker implementations

## Future Extensions

1. **Advanced account configs**: Per-symbol lot size, max positions, trading hours
2. **Order lifecycle tracking**: Real-time status updates from executor-service
3. **Smart order routing**: Route orders based on account balance, broker availability
4. **Multi-account strategies**: Distribute orders across multiple accounts

## Conclusion

**Recommendation: Proceed with this enhancement**

### Rationale
- **Enables true async processing**: Removes sequential bottleneck
- **Simplifies contracts**: Removes unused fields, focuses on essential data
- **Enhances flexibility**: Account and symbol-specific configurations
- **Improves traceability**: Orders linked to messages and related orders
- **Aligns with architecture**: Delegates execution to executor-service
- **Low risk**: Incremental changes with clear migration path

This change sets the foundation for robust, scalable order execution while maintaining the event-driven architecture principles.
