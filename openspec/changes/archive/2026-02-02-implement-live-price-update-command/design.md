## Context

The `executor-service` currently has an `OandaPriceStreamingJob` that reads prices from Oanda and caches them in Redis. The user wants to broadcast these price updates via Redis Streams so that `trade-manager` can react to them in real-time (for TP/SL monitoring).

## Goals / Non-Goals

**Goals:**
- Update `LivePriceUpdatePayloadSchema` and `MessageValidator` to support crossing detection (adding `previousPrice`).
- Implement broadcast logic in `OandaPriceStreamingJob`.
- Use an in-memory price map in the job to avoid redundant Redis lookups.
- Setup the consumer group and handler in `trade-manager`.

**Non-Goals:**
- Implementation of the full TP monitoring logic in `trade-manager` (this is a placeholder for now).
- Supporting other brokers besides Oanda for real-time streaming in this change.

## Decisions

### 1. In-Memory Price Map for Previous Price
- **Choice**: Use a `Map<string, { bid?: number; ask?: number }>` inside the `OandaPriceStreamingJob` class.
- **Rationale**: Price updates are high-frequency (up to several per second per symbol). Fetching the "previous" price from Redis would add latency and unnecessary load to the Redis instance for data that is already flowing through the job.
- **Alternative**: `await priceCache.getPrice(symbol)` before publishing.
  - **Trade-off**: More consistent across restarts, but significantly slower and higher overhead.

### 2. Payload Structure Synchronization
- **Choice**: Match the payload in `libs/shared/utils/src/interfaces/messages/live-price-update-payload.ts` which already has `currentPrice` and `previousPrice`.
- **Rationale**: Maintain consistency with the user's provided code structure.

### 3. Stream Topic for Price Updates
- **Choice**: Use `StreamTopic.PRICE_UPDATES` (topic name `price-updates`).
- **Rationale**: Keeps price updates separate from orchestration commands or result messages, allowing for independent scaling and consumer group management.

## Risks / Trade-offs

- **[Risk] High Redis Stream Traffic** → **Mitigation**: Only publish if the price actually changes (bid or ask).
- **[Risk] Memory Leak** → **Mitigation**: The number of symbols is small and finite (configured in the job meta), so a simple Map is safe.
- **[Risk] Missing Previous Price on Restart** → **Mitigation**: On the first tick for a symbol after restart, `previousPrice` will be empty. The system will start broadcasting from the second update onwards.
