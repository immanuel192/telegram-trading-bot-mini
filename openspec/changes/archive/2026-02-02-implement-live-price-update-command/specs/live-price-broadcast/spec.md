## ADDED Requirements

### Requirement: Adhere to Official Live Price Payload
The system MUST use the payload structure defined in `libs/shared/utils/src/interfaces/messages/live-price-update-payload.ts` as the final source of truth for the `LIVE_PRICE_UPDATE` message. This includes the use of nested `currentPrice` and `previousPrice` objects.

#### Scenario: Validation against official schema
- **WHEN** a `LIVE_PRICE_UPDATE` message is published
- **THEN** it SHALL contain `accountId`, `channelId`, `symbol`, `currentPrice` (with mandatory bid and ask), `previousPrice` (with mandatory bid and ask), and `timestamp`.

### Requirement: Broadcast Live Price Updates
The `executor-service` MUST publish a `LIVE_PRICE_UPDATE` message to the `PRICE_UPDATES` stream ONLY WHEN the following conditions are met:
1. Both `currentPrice` and `previousPrice` exist (have bid or ask values).
2. The `currentPrice` differs from the `previousPrice` in either the bid or the ask value.

#### Scenario: Successful price broadcast
- **WHEN** the OANDA stream receives price update for `XAUUSD`
- **AND** a previous price is stored in the local memory cache
- **AND** the new price's bid or ask is different from the cached bid or ask
- **THEN** the `executor-service` SHALL publish a `LIVE_PRICE_UPDATE` message.

#### Scenario: No broadcast on first price tick
- **WHEN** the OANDA stream receives the first price update for `XAUUSD` after job start
- **AND** no previous price exists in the local memory cache
- **THEN** it SHALL update the cache but NOT publish the `LIVE_PRICE_UPDATE` message.

#### Scenario: No broadcast on identical price
- **WHEN** the OANDA stream receives a price update for `XAUUSD`
- **AND** the values are identical to the cached previous price
- **THEN** it SHALL NOT publish the `LIVE_PRICE_UPDATE` message.

### Requirement: In-Memory Price Tracking
The `executor-service` MUST maintain an internal in-memory map of the latest price for each symbol to allow for efficient previous price lookup without reading from external stores (Redis) on every stream chunk.

#### Scenario: Memory cache update
- **WHEN** a price update for `XAUUSD` is processed
- **THEN** the system SHALL update its internal map for `XAUUSD` with the new price values.

### Requirement: Consumer Registration in Trade Manager
The `trade-manager` MUST register a consumer for the `PRICE_UPDATES` stream and acknowledge messages, even if no business logic is yet implemented.

#### Scenario: Message acknowledgement
- **WHEN** a `LIVE_PRICE_UPDATE` message is received by `trade-manager`
- **THEN** it SHALL be validated against the TypeBox schema and acknowledged in the Redis Stream.
