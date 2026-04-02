## Why

The current system has real-time price streaming implemented in `executor-service`, but this data is only used for internal caching in Redis. We need to broadcast these price updates to other services (specifically `trade-manager`) to enable real-time order monitoring, such as automated Take Profit (TP) level detection and Stop Loss (SL) adjustments.

## What Changes

- **Synchronized Message Schemas**: Update the `LIVE_PRICE_UPDATE` payload schema and validator to include `previousPrice` (for crossing detection) and other necessary fields.
- **Enhanced Price Streaming**: Update `OandaPriceStreamingJob` in `executor-service` to publish `LIVE_PRICE_UPDATE` events to the Redis stream.
- **Internal Cache for Publisher**: Implement a local memory cache in `OandaPriceStreamingJob` to track the previous price per symbol, avoiding excessive Redis reads during high-frequency streaming.
- **Consumer in Trade Manager**: Add a `LIVE_PRICE_UPDATE` consumer in `trade-manager` with an initial placeholder handler to satisfy architectural requirements.
- **Configuration**: Add `STREAM_CONSUMER_MODE_PRICE_UPDATES` to `trade-manager` configuration.

## Capabilities

### New Capabilities
- `live-price-broadcast`: Defines the contract and flow for broadcasting real-time price updates from execution adapters to the rest of the system.

### Modified Capabilities
- `multi-tier-tp-monitoring`: Update requirements to officially support real-time price triggers via the new broadcast mechanism.

## Impact

- **Services**: `executor-service` (publisher), `trade-manager` (consumer).
- **Shared Utils**: New message validation logic and interfaces.
- **Performance**: High-frequency event publishing might increase Redis Stream load (mitigated by only publishing when price changes).
