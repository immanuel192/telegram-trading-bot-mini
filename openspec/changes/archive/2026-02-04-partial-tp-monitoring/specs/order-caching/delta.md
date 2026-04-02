# Order Caching Delta

Enrich the order cache to support monitoring flags and detailed take profit tracking.

## ADDED Requirements

### Requirement: Full TP Tier Storage
The `OrderCacheService` must store all take profit tiers including their used status to prevent double-triggering.

#### Scenario: Cache Detailed Tiers
- **WHEN** Adding or updating an order in cache
- **THEN** Populate `takeProfits` with `price` AND `isUsed` fields from the DB or execution result.

### Requirement: Account monitoring state sync
The cache must automatically determine if monitoring is enabled for an order based on the account's configuration.

#### Scenario: Populate Monitoring Availability
- **WHEN** Adding an order to cache
- **THEN** Fetch account config, check `enableTpMonitoring`, and set `isTpMonitoringAvailable` on the `CachedOrder`.

### Requirement: Symbol-based Indexing
Support efficient lookup of orders by symbol to handle high-frequency price updates.

#### Scenario: Find Orders by Symbol
- **WHEN** Querying for a symbol (e.g., XAUUSD)
- **THEN** Return all active cached orders for that symbol across all accounts.
