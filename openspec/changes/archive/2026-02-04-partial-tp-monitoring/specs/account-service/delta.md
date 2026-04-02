# Account Service Delta

Introduce memory caching to the trade-manager version of the account service.

## ADDED Requirements

### Requirement: Read-through Memory Cache
The `trade-manager` account service must implement a TTL-based memory cache for account lookups.

#### Scenario: Cache Hit
- **WHEN** Requesting an account that was fetched < 30 seconds ago
- **THEN** Return the cached account document without querying the database.

#### Scenario: Cache Miss / Expiry
- **WHEN** Requesting an account that is missing or expired in cache
- **THEN** Fetch from database, update cache with new TTL, and return document.
