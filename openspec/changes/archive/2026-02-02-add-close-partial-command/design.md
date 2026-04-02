## Context

The system needs to support partial order closure to enable multi-tier take profit (TP) targets. Currently, the system only supports closing an entire position (CLOSE_ALL) or closing a set of less profitable positions (CLOSE_BAD_POSITION). This change introduces the `CLOSE_PARTIAL` command and the infrastructure to track remaining position sizes.

## Goals / Non-Goals

**Goals:**
- Add `CLOSE_PARTIAL` command to the trading system.
- Track remaining lot size (`lotSizeRemaining`) for each order to support sequential partial closures.
- Implement the `CLOSE_PARTIAL` execution pipeline in the `executor-service`.
- Support partial closures in the Oanda broker adapter.

**Non-Goals:**
- Automated TP triggering logic (this will be handled in a subsequent change).
- Support for other brokers besides Oanda (initial support focused on Oanda).
- Modifying order status to something other than `OPEN` during partial closures (unless fully closed).

## Decisions

### 1. Re-use ExecuteOrderRequestPayload
The existing `lotSize` field in `ExecuteOrderRequestPayload` will be reused for `CLOSE_PARTIAL`.
- **Rationale**: Keeps the message schema simple. For `LONG/SHORT`, `lotSize` is the opening amount. For `CLOSE_PARTIAL`, it is the reduction amount.
- **Alternatives**: Adding a `reductionAmount` field. Rejected because it adds redundancy.

### 2. Add lotSizeRemaining to Order Model
The `Order` model will now include a `lotSizeRemaining` field.
- **Rationale**: Allows the system to know exactly how much of a position is left without querying the broker every time.
- **Initialization**: Populated in `OpenOrderStep` using the actual executed lots.
- **Updates**: Decremented in the `CLOSE_PARTIAL` pipeline.

### 3. Dedicated CLOSE_PARTIAL Pipeline
A new pipeline will be added to `PipelineOrderExecutorService`.
- **Rationale**: Separates concerns and allows for specific validation (e.g., checking remaining units) without complicating the `CLOSE_ALL` logic.
- **Shared Steps**: Will reuse `ResolveAccountStep`, `ResolveOrderStep`, `ResolveAdapterStep`, `CalculatePnlAfterCloseOrderStep`.

### 4. Broker Adapter Enhancement
Update `IBrokerAdapter.closeOrder` to accept an optional `amount`.
- **Oanda**: When `amount` is provided, pass it to the `units` parameter of the Oanda trade close API.
- **Rationale**: Standardizes the interface for both full and partial closes.

### 5. Validation and Safety
Implement validation in the `CLOSE_PARTIAL` pipeline to handle over-closure requests.
- **Logic**: If `lotSize` > `lotSizeRemaining`, cap the closure to `lotSizeRemaining`.
- **History**: Record a **WARNING** in order history when such an adjustment occurs.

### 6. Cumulative PnL Tracking
- **Decision**: The `Order.pnl.pnl` field will be updated to store the **cumulative realized PnL** for the position.
- **Implementation**: Each partial closure returns a realized PnL from the broker; this value must be added incrementally to the existing PnL record in the database.

### 7. Atomic Updates
- **Decision**: Updates to `lotSizeRemaining` and `pnl.pnl` must use atomic database operations (e.g., MongoDB `$inc` operator).
- **Rationale**: Prevents race conditions during concurrent TP hits, ensuring the remaining balance and total profit are kept in sync with broker actions.

### 8. Numeric messageId for TP Tiers
- **Decision**: Use a numeric suffix for `messageId` to identify TP tiers while keeping the field as a TypeBox Integer.
- **Format**: `originalMessageId * 100 + tierIndex` (e.g., 123 -> 12301 for TP1).
- **Rationale**: Maintains compatibility with existing integer-based messageId logic while providing a clear tracing prefix.

## Risks / Trade-offs

- **[Risk] Race conditions in lotSizeRemaining** → Since multiple updates may happen, we use MongoDB's atomic `$inc` (or `$set` calculated from previous state) and ensure the source of truth is the broker result.
- **[Trade-off] Partial closure complexity** → Managing partial closures increases the complexity of PnL calculation and history tracking, but it's necessary for advanced trading strategies.
