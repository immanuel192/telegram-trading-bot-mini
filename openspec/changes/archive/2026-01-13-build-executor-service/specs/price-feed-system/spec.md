# price-feed-system Specification

## Purpose
Define the live price feed system that allows executor-service to fetch prices from broker exchanges and publish updates to trade-manager. This provides real-time market context for trade decisions and monitoring. Note: price feed is optional for MVP and primarily lays groundwork for future enhancements.

## ADDED Requirements

### Requirement: Price Feed Service  
The executor-service SHALL provide a PriceFeedService that fetches live prices from brokers.

#### Scenario: PriceFeedService implementation
- **WHEN** PriceFeedService fetches prices
- **THEN** it SHALL:
  - Fetch all active accounts from `accountRepository.find({ isActive: true })`
  - For each account:
    - Get broker adapter from factory
    - Fetch active symbols for that account
    - For each symbol, call `adapter.fetchPrice(symbol)`
    - Publish `LIVE_PRICE_UPDATE` to `StreamTopic.PRICE_UPDATES`
  - Handle errors gracefully (log and continue to next symbol/account)

#### Scenario: Active symbols determination
- **WHEN** determining which symbols to fetch prices for
- **THEN** PriceFeedService SHALL (MVP approach):
  - Use a hardcoded list per exchange (e.g., `['BTCUSDT', 'ETHUSDT']` for Binance)
  - OR fetch distinct symbols from active/recent orders
- **AND** in the future, this SHALL be configurable per account

### Requirement: Price Feed Background Job
The executor-service SHALL run a background job to periodically fetch and publish prices.

#### Scenario: PriceFeedJob implementation
- **WHEN** PriceFeedJob is started
- **THEN** it SHALL:
  - Use `PRICE_FEED_INTERVAL_MS` from config (default: 5000ms)
  - Set up interval using `setInterval`
  - On each interval tick, call `priceFeed.fetchAndPublishPrices()`
  - Catch and log errors without stopping the job
- **AND** it SHALL expose:
  - `start()`: Start the interval
  - `stop()`: Clear the interval

#### Scenario: Price feed job lifecycle
- **WHEN** executor-service starts
- **THEN** price feed job SHALL be started automatically
- **WHEN** executor-service receives shutdown signal (SIGTERM/SIGINT)
- **THEN** price feed job SHALL be stopped before adapter cleanup

### Requirement: Trade-Manager Price Update Consumption (Optional for MVP)
The trade-manager SHALL provide infrastructure to consume live price updates, with full implementation optional for MVP.

#### Scenario: PriceUpdateHandler implementation
- **WHEN** trade-manager implements price update handling
- **THEN** it SHALL create `PriceUpdateHandler` extending `BaseMessageHandler<MessageType.LIVE_PRICE_UPDATE>`
- **AND** it SHALL consume from `StreamTopic.PRICE_UPDATES`
- **AND** the `handle` method SHALL:
  - Log price update received
  - (Future) Update in-memory price cache
  - (Future) Trigger price-based trade logic

#### Scenario: MVP price update handling
- **WHEN** in MVP phase
- **THEN** trade-manager MAY skip implementing `PriceUpdateHandler`
- **OR** MAY implement it with only logging (no business logic)
- **AND** price updates SHALL still be published by executor-service for future use

### Requirement: Price Feed Configuration
The executor-service SHALL configure price feed behavior via environment variables.

#### Scenario: Price feed interval configuration
- **WHEN** configuring price feed
- **THEN** `PRICE_FEED_INTERVAL_MS` SHALL control fetch frequency
- **AND** default value SHALL be 5000ms (5 seconds)
- **AND** minimum value SHALL be 1000ms (to avoid rate limiting)
- **AND** recommended value for production SHALL be 5000-10000ms

#### Scenario: Price feed batch size
- **WHEN** fetching prices for multiple symbols
- **THEN** `PRICE_FEED_BATCH_SIZE` SHALL limit concurrent fetches
- **AND** default value SHALL be 10
- **AND** this SHALL prevent overwhelming broker APIs

### Requirement: Price Feed Error Handling
The price feed system SHALL handle errors gracefully without disrupting order execution.

#### Scenario: Individual symbol fetch failure
- **WHEN** fetching price for a symbol fails
- **THEN** PriceFeedService SHALL:
  - Log error with `{ accountId, symbol, error }`
  - Capture exception in Sentry
  - Continue to next symbol (do not throw)
- **AND** other symbols SHALL still be fetched

#### Scenario: Broker adapter unavailable
- **WHEN** a broker adapter is not ready or unavailable
- **THEN** PriceFeedService SHALL:
  - Skip that account
  - Log warning with `{ accountId }`
  - Continue to next account
- **AND** price feed job SHALL NOT crash

#### Scenario: Rate limiting from broker
- **WHEN** broker API returns rate limit error
- **THEN** adapter SHALL:
  - Log rate limit warning
  - Skip this interval tick
  - Resume on next interval
- **AND** future enhancement MAY implement adaptive interval adjustment

### Requirement: Price Feed Observability
The price feed system SHALL emit metrics and logs for monitoring.

#### Scenario: Price feed metrics
- **WHEN** prices are fetched
- **THEN** the following metrics SHALL be emitted:
  - `executor.price.fetched` (increment per symbol, tagged with accountId, symbol)
  - `executor.price.fetch_latency` (timing in ms, tagged with accountId, broker)
  - `executor.price.fetch_error` (increment on failure, tagged with errorType)

#### Scenario: Price feed logging
- **WHEN** price feed runs
- **THEN** logs SHALL:
  - Log at DEBUG level for each price fetch
  - Log at INFO level on job start/stop
  - Log at WARN level for rate limits or adapter unavailable
  - Log at ERROR level for unexpected errors
- **AND** logs SHALL include `{ accountId, symbol, bid, ask, timestamp }` for price updates

### Requirement: Price Feed Future Enhancements
The price feed system SHALL support future enhancements without breaking changes.

#### Scenario: Price caching in trade-manager
- **WHEN** future work adds price context to trade logic
- **THEN** trade-manager SHALL:
  - Maintain in-memory price cache (Map<symbol, PriceData>)
  - Update cache on `LIVE_PRICE_UPDATE` events
  - Expire cached prices after TTL (e.g., 60 seconds)
  - Use cached prices for risk calculations or signal validation

#### Scenario: Historic price storage
- **WHEN** future work requires price history
- **THEN** price updates MAY be persisted to database
- **AND** a new collection `prices` MAY be created
- **AND** retention policy SHALL be defined (e.g., keep 30 days)

#### Scenario: Configurable symbol lists per account
- **WHEN** future work adds symbol configuration
- **THEN** Account model MAY be extended with:
  - `activeSymbols: string[]` - List of symbols to track
- **AND** PriceFeedService SHALL fetch prices only for symbols in this list

#### Scenario: Adaptive fetch intervals
- **WHEN** future work optimizes API usage
- **THEN** price feed MAY:
  - Reduce interval during low activity
  - Increase interval during high activity
  - Pause fetching if no active orders exist
- **AND** configuration SHALL support dynamic interval adjustment

### Requirement: Price Feed Integration Tests  
The price feed system SHALL have integration tests verifying end-to-end functionality.

#### Scenario: Price feed service integration test
- **WHEN** testing PriceFeedService
- **THEN** integration test SHALL:
  - Use sandbox broker accounts (Binance testnet, Oanda practice)
  - Call `priceFeed.fetchAndPublishPrices()`
  - Verify `LIVE_PRICE_UPDATE` messages published to stream
  - Verify message payloads contain correct fields (accountId, symbol, bid, ask, timestamp)
  - Verify at least one price fetched per active account

#### Scenario: Price feed job integration test
- **WHEN** testing PriceFeedJob
- **THEN** integration test SHALL:
  - Start job with short interval (e.g., 1000ms for testing)
  - Wait for at least 2 interval ticks
  - Verify multiple price updates published
  - Stop job and verify no more updates published
  - Verify job can be stopped gracefully

#### Scenario: Error handling integration test
- **WHEN** testing price feed error handling
- **THEN** integration test SHALL:
  - Mock adapter to throw error for specific symbol
  - Verify job continues and fetches other symbols
  - Verify error logged
  - Verify error captured in Sentry (if configured)

### Requirement: Price Feed MVP Scope
The price feed system SHALL deliver minimal viable functionality in MVP with clear extension points.

#### Scenario: MVP deliverables
- **WHEN** MVP is completed
- **THEN** price feed SHALL:
  - Fetch prices for hardcoded symbol list
  - Publish to `StreamTopic.PRICE_UPDATES`
  - Run on configurable interval
  - Handle errors gracefully
  - Emit observability metrics
- **AND** price feed SHALL NOT:
  - Persist prices to database
  - Implement adaptive intervals
  - Support per-account symbol configuration
  - Require trade-manager consumption (optional)

#### Scenario: Non-blocking implementation
- **WHEN** implementing price feed
- **THEN** it SHALL:
  - Run in separate background job
  - NOT block order execution
  - NOT interfere with stream consumers
  - Be independently testable

