# TP Monitoring Engine

## Purpose
Core logic for detecting price crossings against Take Profit tiers and orchestrating partial closures in `trade-manager`.

## Requirements

### Requirement: Real-time Price Crossing Detection
The engine SHALL detect when a symbol's price crosses a take profit tier based on the order's side.

#### Scenario: Long Position TP Cross Up
- **WHEN** Order is LONG, `previousPrice < tpPrice` and `currentPrice >= tpPrice`
- **THEN** it SHALL detect a crossing event for that tier.

#### Scenario: Short Position TP Cross Down
- **WHEN** Order is SHORT, `previousPrice > tpPrice` and `currentPrice <= tpPrice`
- **THEN** it SHALL detect a crossing event for that tier.

### Requirement: Automated Partial Close Trigger
When a crossing event is detected for a tier that is not yet used, a `CLOSE_PARTIAL` command SHALL be published.

#### Scenario: Trigger Partial Close for Valid Tier
- **WHEN** A crossing event is detected AND `isTpMonitoringAvailable` is true AND tier `isUsed` is false
- **THEN** it SHALL publish a `CLOSE_PARTIAL` event with `lotSize` = 10% of total and a unique tier-specific `messageId`.

#### Scenario: Skip Already Used Tiers
- **WHEN** A crossing event is detected but the tier `isUsed` is true in the cache
- **THEN** it SHALL NOT publish any closure event.

### Requirement: Account Monitoring Guard
Monitoring SHALL only occur for orders belonging to accounts where TP monitoring is explicitly enabled.

#### Scenario: Skip Monitoring for Disabled Accounts
- **WHEN** Account configuration `enableTpMonitoring` is false or missing
- **THEN** the order SHALL have `isTpMonitoringAvailable` set to false in cache and be excluded from price update processing.
