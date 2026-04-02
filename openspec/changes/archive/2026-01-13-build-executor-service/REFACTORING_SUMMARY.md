# Summary: IBrokerAdapter Interface Refactoring

## Date: 2025-12-30

## Changes Made

Updated the `IBrokerAdapter` interface in the build-executor-service OpenSpec to align with the command-based architecture and current `ExecuteOrderRequestPayload` structure.

## Key Changes

### 1. Replaced `executeOrder()` with Specific Methods

**Before:**
```typescript
executeOrder(params: ExecuteOrderParams): Promise<ExecuteOrderResult>;
```

**After:**
```typescript
// For LONG/SHORT commands
openOrder(params: OpenOrderParams): Promise<OpenOrderResult>;

// For CLOSE_ALL/CLOSE_BAD_POSITION commands
closeOrder(params: CloseOrderParams): Promise<CloseOrderResult>;
```

### 2. Updated Method Signatures

**Before:**
```typescript
cancelOrder(orderId: string, symbol: string): Promise<void>;
updateStopLoss(orderId: string, slPrice: number): Promise<void>;
updateTakeProfit(orderId: string, tpPrice: number): Promise<void>;
```

**After:**
```typescript
cancelOrder(params: CancelOrderParams): Promise<void>;
updateStopLoss(params: UpdateStopLossParams): Promise<void>;
updateTakeProfit(params: UpdateTakeProfitParams): Promise<void>;
```

### 3. New Parameter Interfaces

#### OpenOrderParams
- Aligned with `ExecuteOrderRequestPayload` for LONG/SHORT commands
- Includes: `symbol`, `side`, `lotSize`, `isImmediate`, `entry`, `stopLoss`, `takeProfits`, `leverage`, `meta`, `traceToken`
- **Important:** Includes `meta` field with `reduceLotSize` and `adjustEntry` flags

#### CloseOrderParams
- For closing OPEN positions
- Includes: `orderId`, `symbol`, `traceToken`

#### CancelOrderParams
- For canceling PENDING orders only
- Includes: `orderId`, `symbol`, `traceToken`

#### UpdateStopLossParams / UpdateTakeProfitParams
- For updating SL/TP on existing orders
- Includes: `orderId`, `symbol`, `price`, `traceToken`

### 4. Command Mapping

| Command            | Broker Adapter Method                     |
| ------------------ | ----------------------------------------- |
| LONG               | `openOrder()`                             |
| SHORT              | `openOrder()`                             |
| CLOSE_ALL          | `closeOrder()`                            |
| CLOSE_BAD_POSITION | `closeOrder()`                            |
| CANCEL             | `cancelOrder()` (PENDING orders only)     |
| MOVE_SL            | `updateStopLoss()`                        |
| SET_TP_SL          | `updateStopLoss()` / `updateTakeProfit()` |

## Architecture Rationale

1. **Separation of Concerns**: Opening and closing orders are fundamentally different operations with different parameters
2. **Type Safety**: Each method has specific parameter types matching its use case
3. **Clarity**: Method names clearly indicate their purpose (openOrder vs closeOrder)
4. **Alignment**: Parameters align with `ExecuteOrderRequestPayload` structure from trade-manager
5. **Independence**: Broker adapter interface is independent of event payload, with consumer layer handling translation

## Files Updated

1. `/openspec/changes/build-executor-service/tasks.md`
   - Task 2.1: Define Broker Adapter Interface
   - Task 2.2: Implement Base Broker Adapter
   - Task 2.3: Create Mock Broker Adapter

## Next Steps

1. Implement Task 2.1: Create the actual `interfaces.ts` file
2. Implement Task 2.2: Create the actual `base.adapter.ts` file
3. Implement Task 2.3: Create the actual `mock.adapter.ts` file
4. Update consumer layer to translate `ExecuteOrderRequestPayload` to appropriate broker adapter method calls

## Notes

- The `meta` field in `OpenOrderParams` is crucial for executor-service to adjust execution behavior (lot size reduction, entry adjustment)
- `cancelOrder()` is specifically for PENDING orders, not OPEN positions
- `closeOrder()` is specifically for OPEN positions
- All methods now include `traceToken` for distributed tracing
