## Why

Build multi-tier take profit (TP) monitoring capabilities to allow accounts to automatically manage positions across multiple TP levels. This change focuses on setting up the necessary configuration structures in the account model to support these actions.

## What Changes

- Add `TpAction` interface to define partial close and SL movement actions.
- Add `TpClosePercent` type to support numerical percentages or 'REMAINING'.
- Add `TpSlMoveLevel` type to support 'ENTRY', 'TP1', 'TP2', 'TP3'.
- Add TP monitoring configuration fields to `Account.configs`:
  - `enableTpMonitoring`: Toggle for the feature.
  - `tp1Action`, `tp2Action`, `tp3Action`, `tp4Action`: Specific actions for each tier.

## Capabilities

### New Capabilities
- `multi-tier-tp-config`: Define configuration schema for multi-tier take profit actions including partial closes and stop-loss adjustments.

### Modified Capabilities
- `account-management`: Update account configuration to include TP monitoring settings.

## Impact

- `libs/dal`: Updated `Account` model with new configuration fields.
- `trade-manager` & `executor-service`: Will eventually consume these configs to monitor and execute TP actions.
