# Proposal: Auto Update Order Status Job

## Overview
Implement a background job in `executor-service` that periodically synchronizes order statuses with the broker by fetching transaction history. This ensures that orders closed directly on the broker (e.g., hitting TP/SL or manual closure outside the bot) are correctly reflected in our system.

## Why
Sometimes orders are closed manually by humans or hit TP/SL directly on the exchange. Our system currently depends on the `executor-service` receiving explicit results, but it doesn't proactively poll for statuses of OPEN orders. If an order is closed externally, it remains OPEN in our database indefinitely, causing potential issues with risk management (e.g., `maxOpenPositions` limit) and inaccurate reporting.

## What Changes
Create a new background job `auto-update-order-status-job` in `executor-service` that:
1. Scans for orders with `status = OPEN`.
2. Groups them by `accountId`.
3. Fetches transactions from the broker using `adapter.getTransactions`.
4. Updates our `Order` records based on the fetched transaction data.

## Architectural Reasoning
- **Job Placement**: The job lives in `executor-service` because it requires access to broker adapters and the `orderRepository`.
- **Data Consistency**: Updates are performed within MongoDB transactions to ensure `Order` and `Order.history` stay in sync.
- **Efficiency**: 
    - Queries `OPEN` orders only.
    - Limits processing to batches (configurable, default 50).
    - Groups by `accountId` to minimize adapter initialization/fetching overhead.
    - Sorting by `_id ASC` ensures we process oldest orders first.
- **Resilience**: Errors during fetch/update for one account/order do not stop the entire job; they are logged and captured by Sentry.

## Dependencies
- `libs/dal`: `OrderRepository`, `Order` model.
- `apps/executor-service`: `BrokerAdapterFactory`, `IBrokerAdapter`.

## Alternatives Considered
- **Webhooks**: Not all brokers support webhooks for private events (orders/trades), and they can be unreliable or complex to set up securely.
- **Per-Order Polling**: Too many API calls if many orders are open. Batching by account and using `getTransactions` is more efficient.
