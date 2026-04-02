# Partial Take Profit Monitoring

This document describes the architecture and implementation of the automated Take Profit (TP) monitoring system.

## Overview

The TP Monitoring system automatically detects when real-time prices cross Take Profit tiers for active orders and triggers partial closures (via `CLOSE_PARTIAL` commands) to lock in profits.

## Components

### 1. Order Cache Service (`apps/trade-manager/src/services/order-cache.service.ts`)
High-performance in-memory cache that stores active `OPEN` orders.
- **Indexing**: Indexed by `accountId` and `symbol` for fast lookup during price updates.
- **Enrichment**: Derives `isTpMonitoringAvailable` flag by checking account-level `enableTpMonitoring` config.
- **Synchronization**: Kept in sync via `LivePriceUpdate` (local break optimization) and `ExecuteOrderResult` (authoritative updates from executor-service).

### 2. Live Price Update Handler (`apps/trade-manager/src/events/consumers/live-price-update-handler.ts`)
A stream consumer that processes `LIVE_PRICE_UPDATE` events.
- **Detection Logic**:
    - **LONG**: Triggers if `prevBid < tpPrice` AND `currBid >= tpPrice`.
    - **SHORT**: Triggers if `prevAsk > tpPrice` AND `currAsk <= tpPrice`.
- **Optimization**: Since TP tiers are sorted by profitability, the handler "breaks" the loop if the first available tier is not reached, reducing CPU usage.

### 3. Result Handler (`apps/trade-manager/src/events/consumers/execute-order-result-handler.ts`)
Updates the local cache when a partial closure is successfully executed by the `executor-service`. This ensures that `isUsed` flags are accurately reflected in the cache to prevent duplicate triggers.

## Flow of Execution

1. **Detection**: `trade-manager` receives a price update.
2. **Trigger**: If a TP tier is hit, `trade-manager` publishes a `CLOSE_PARTIAL` command to `ORDER_EXECUTION_REQUESTS`.
3. **Execution**: `executor-service` executes the partial close via the broker and updates the MongoDB order document (atomically marking the tier as `isUsed: true`).
4. **Sync**: `executor-service` publishes an `EXECUTE_ORDER_RESULT`.
5. **Update**: `trade-manager` consumes the result and marks the tier as `isUsed` in its in-memory cache.

## Monitoring Safety
- **Account Guard**: Monitoring only runs for accounts with `enableTpMonitoring: true`.
- **Sequential Tiers**: Tiers are processed in FIFO order.
- **Authoritative State**: The `executor-service` and MongoDB are the single source of truth for "Used" status. `trade-manager` eventually synchronizes its cache from the execution results.
