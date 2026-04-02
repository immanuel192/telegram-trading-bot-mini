# TP Monitoring Engine

Core logic for detecting price crossings against Take Profit tiers and orchestrating partial closures in `trade-manager`.

## ADDED Requirements

### Requirement: Real-time Price Crossing Detection
The engine must detect when a symbol's price crosses a take profit tier based on the order's side.

#### Scenario: Long Position TP Cross Up
- **WHEN** Order is LONG, `previousPrice < 2700.5` and `currentPrice >= 2700.5` (TP tier at 2700.5)
- **THEN** The engine should detect a crossing event for that tier.

#### Scenario: Short Position TP Cross Down
- **WHEN** Order is SHORT, `previousPrice > 2650.0` and `currentPrice <= 2650.0` (TP tier at 2650.0)
- **THEN** The engine should detect a crossing event for that tier.

### Requirement: Automated Partial Close Trigger
When a crossing event is detected for a tier that is not yet used, a `CLOSE_PARTIAL` command must be published.

#### Scenario: Trigger Partial Close for Valid Tier
- **WHEN** A crossing event is detected and `isTpMonitoringAvailable` is true and tier `isUsed` is false
- **THEN** Publish `CLOSE_PARTIAL` event with `lotSize` = 10% of total and a unique tier-specific `messageId`.

#### Scenario: Skip Already Used Tiers
- **WHEN** A crossing event is detected but the tier `isUsed` is true in the cache
- **THEN** Do not publish any closure event.

### Requirement: Account Monitoring Guard
Monitoring must only happen for orders belonging to accounts where TP monitoring is explicitly enabled.

#### Scenario: Skip Monitoring for Disabled Accounts
- **WHEN** Account configuration `enableTpMonitoring` is false or missing
- **THEN** The order should have `isTpMonitoringAvailable` set to false in cache and be excluded from price update processing.
