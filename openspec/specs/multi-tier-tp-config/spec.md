# multi-tier-tp-config Specification

## Purpose
Define configuration schema for multi-tier take profit actions including partial closes and stop-loss adjustments.

## Requirements

### Requirement: Multi-Tier TP Monitoring Config
The system SHALL support configuring multi-tier Take Profit (TP) monitoring at the account level.

#### Scenario: TpAction structure
- **WHEN** configuring a TP action
- **THEN** it SHALL support the following fields:
  - `closePercent`: Percentage of position to close (number 0-100, or the string 'REMAINING')
  - `moveSL`: Target level to move Stop Loss to (one of: 'ENTRY', 'TP1', 'TP2', 'TP3')

#### Scenario: Account configuration fields
- **WHEN** updating `Account.configs`
- **THEN** the following fields SHALL be available:
  - `enableTpMonitoring`: Boolean flag to enable/disable monitoring
  - `tp1Action`, `tp2Action`, `tp3Action`, `tp4Action`: Optional `TpAction` configurations for up to 4 TP tiers

#### Scenario: Close percentage validation
- **WHEN** `closePercent` is configured as a number
- **THEN** it MUST be within the range [0, 100]
- **AND** if set to 'REMAINING', it SHALL signify closing the entire remaining position

#### Scenario: SL move level validation
- **WHEN** `moveSL` is configured
- **THEN** it MUST be one of the predefined levels: 'ENTRY', 'TP1', 'TP2', 'TP3'
