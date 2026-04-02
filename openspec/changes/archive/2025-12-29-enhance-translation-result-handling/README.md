# Enhance Translation Result Handling

**Change ID**: `enhance-translation-result-handling`  
**Status**: Proposed  
**Created**: 2025-12-26

## Summary

This change refactors the message translation result processing flow to enable true asynchronous processing by delegating order execution logic to the executor-service. The enhancement removes sequential bottlenecks, simplifies message contracts, and adds flexible account and symbol-specific trading configurations.

## Motivation

The current system processes messages sequentially, waiting for all translation results before processing the next message. This creates a bottleneck and prevents parallel execution across multiple accounts. Additionally:

- The `closeIds` field in translation results is unused
- Account configurations lack trading preferences
- Orders don't track their originating messages
- The execution request contract is rigid and doesn't support flexible SL/TP configurations

## Key Changes

### 1. Simplified Message Contracts
- **Removed** `closeIds` field from `TRANSLATE_MESSAGE_RESULT`
- **Refactored** `EXECUTE_ORDER_REQUEST` to use:
  - `command` (CommandEnum) instead of separate `type` and `executionType`
  - Flexible `stopLoss` object (price or pips)
  - Array of `takeProfits` (price or pips)
  - `isImmediate` flag for market vs limit orders
  - Optional `entry` price

### 2. Enhanced Account Model
- **Added** `configs` field for trading preferences:
  - `closeOppositePosition`: boolean (default true)
- **Added** `symbols` field for symbol-specific settings:
  - `forceStopLossByPercentage`: number
- **Updated** `BrokerConfig`:
  - Renamed `oandaAccountId` → `accountId` (generic)
  - Added `jwtToken` and `refreshToken` for web terminal brokers
  - Removed `loginId`

### 3. Enhanced Order Model
- **Added** `messageId` and `channelId` to track originating message
- **Added** `linkedOrders` array to track related orders

### 4. Translation Handler Implementation
- Skip non-command messages (`isCommand = false` or `command = NONE`)
- Lookup channel code with Redis caching (5 min TTL)
- Find all active accounts for the channel
- Transform commands to execution requests per account
- Apply account and symbol configurations
- Publish to executor-service

## Architecture Impact

### Before
```
TRANSLATE_MESSAGE_RESULT → trade-manager (logs only)
```

### After
```
TRANSLATE_MESSAGE_RESULT → trade-manager
  ↓
  TranslateResultHandler:
    1. Skip non-commands
    2. Lookup channelCode (cached)
    3. Find active accounts
    4. Transform commands per account
    5. Publish EXECUTE_ORDER_REQUEST
  ↓
EXECUTE_ORDER_REQUEST → executor-service
```

## Benefits

1. **Asynchronous Processing**: No blocking, messages processed independently
2. **Per-Account Ordering**: Executor-service handles strict ordering per account
3. **Parallel Execution**: Multiple accounts process simultaneously
4. **Flexible Configuration**: Account and symbol-specific trading preferences
5. **Better Traceability**: Orders linked to messages and related orders
6. **Simplified Contracts**: Removed unused fields, focused on essential data

## Spec Deltas

This change modifies the following capabilities:

1. **account-configuration**: Enhanced Account model with trading configs and symbol settings
2. **message-contracts**: Simplified translation results, refactored execution requests
3. **order-tracking**: Added message and order linking to Order model
4. **translation-handler**: New handler implementation with caching and transformation

## Implementation Phases

1. **Phase 1**: Data Access Layer (libs/dal) - ~5 hours
2. **Phase 2**: Message Contracts (libs/shared/utils) - ~4 hours
3. **Phase 3**: Trade Manager (apps/trade-manager) - ~15 hours
4. **Phase 4**: Integration & Validation - ~7.5 hours

**Total Estimated Effort**: ~31.5 hours (~4 days)

## Testing Strategy

- **Unit Tests**: All new services and transformers
- **Integration Tests**: Full handler flow with mocked dependencies
- **End-to-End Tests**: Complete message flow from translation to execution request
- **Performance Tests**: Verify < 100ms processing, > 90% cache hit rate

## Dependencies

- Redis (for caching)
- MongoDB (for data persistence)
- Existing stream infrastructure

## Risks & Mitigations

| Risk                              | Mitigation                                       |
| --------------------------------- | ------------------------------------------------ |
| Breaking message contract changes | Version schemas, maintain backward compatibility |
| Database migration complexity     | Use migration scripts, test on staging           |
| Cache invalidation issues         | Short TTL (5 mins), cache warming                |
| Performance degradation           | Monitor metrics, optimize with new indexes       |

## Out of Scope

- Order placement logic in executor-service
- Position management and closing logic
- Risk management and lot size calculation
- Symbol resolution and mapping
- XM/Exness broker integration

## Success Criteria

- ✅ Translation results processed asynchronously
- ✅ Commands correctly transformed to execution requests
- ✅ Account configurations applied correctly
- ✅ Orders linked to originating messages
- ✅ Non-command messages skipped
- ✅ Cache hit rate > 90%
- ✅ All integration tests passing
- ✅ Test coverage > 90%

## Related Changes

- **Prerequisite**: None
- **Depends On**: None
- **Enables**: Order execution in executor-service (future change)

## References

- [Proposal](./proposal.md) - Detailed analysis and design decisions
- [Tasks](./tasks.md) - Implementation task breakdown
- [Specs](./specs/) - Capability-specific requirement deltas

---

**Next Steps**: Review proposal, approve, and proceed with implementation using `/openspec-apply`.
