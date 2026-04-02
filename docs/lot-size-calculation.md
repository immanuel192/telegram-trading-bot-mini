This document explains the technical implementation and business rules for lot size calculation within the system. The logic is primarily encapsulated in the `LotSizeCalculatorService`.

## Overview

The primary goal of lot size calculation is **Risk Management**. The system ensures that every trade respects the account's risk parameters while also considering margin availability and broker-specific constraints.

## Calculation Flow

The `calculateLotSize` method follows a 5-step process:

### 1. Determination Mode
The initial lot size is determined based on the provided parameters:
- **Explicit**: If `lotSize > 0` is provided in the request, that value is used as the base.
- **Risk-Based**: If `lotSize = 0`, the system attempts a risk-based calculation using account balance and `maxRiskPercentage`.
- **Default**: if risk-based calculation is impossible (missing balance or SL), it falls back to `defaultLotSize`.

### 2. Risk-Based Calculation (Dual Constraints)
When calculating from risk, the system applies two simultaneous constraints and takes the **Minimum** of the two.

#### Constraint A: Risk Management
Ensures that if the Stop Loss is hit, the loss does not exceed the allowed risk amount.
**Formula:**
$$LotSize_{risk} = \frac{EffectiveBalance \times (\frac{MaxRiskPercentage}{100}) \times Leverage}{|Entry - StopLoss| \times UnitsPerLot}$$

#### Constraint B: Margin Allocation (DCA Aware)
If `maxOpenPositions` is configured, the system allocates a specific portion of the total balance to each trade to ensure room for multiple concurrent positions (essential for DCA strategies).
**Formula:**
$$MarginPerPosition = \frac{EffectiveBalance}{maxOpenPositions}$$
$$LotSize_{margin} = \frac{MarginPerPosition \times Leverage}{Entry \times UnitsPerLot}$$

**Final calculated size** = `min(LotSize_risk, LotSize_margin)`

### 3. Lot Size Reduction
If the `meta.reduceLotSize` flag is present (e.g., for certain types of signal updates or lower-confidence signals), the lot size is multiplied by a reduction percentage.
- **Source**: `account.symbols[symbol].reduceLotSizePercent`
- **Fallback**: 0.5 (50% reduction)

### 4. Exchange Clamping
The potential lot size is adjusted to meet exchange technical requirements:
- **Step Size**: Rounded to the nearest `lotStepSize` (e.g., 0.01).
- **Minimum**: Clamped to `minLotSize`.
- **Maximum**: Clamped to `maxLotSize`.

## Configuration Hierarchy

The service always prioritizes specific configurations over general ones:

| Parameter            | 1st Priority                           | 2nd Priority                       | 3rd Priority |
| :------------------- | :------------------------------------- | :--------------------------------- | :----------- |
| **Max Risk %**       | `symbols[symbol].maxRiskPercentage`    | `configs.defaultMaxRiskPercentage` | -            |
| **Default Lot Size** | `symbols[symbol].defaultLotSize`       | `configs.defaultLotSize`           | -            |
| **Reduction %**      | `symbols[symbol].reduceLotSizePercent` | 0.5 (Hardcoded)                    | -            |
| **Units Per Lot**    | `account.unitsPerLot`                  | 100,000 (Standard)                 | -            |

## Real-Time Data Integration

- **Effective Balance**: The system prefers **Equity** (Balance + Floating P&L) over raw Balance to account for current market exposure.
- **Cache Dependency**: Calculation relies on `BalanceCacheService`. If the cache is missing or expired, the system will log a warning and fallback to `defaultLotSize`.

## Error Handling & Fallbacks

1. **Missing Inputs**: If `lotSize=0` but no `maxRiskPercentage` or `balance` is available, it falls back to `defaultLotSize`.
2. **Zero Price Risk**: If `entry == stopLoss`, risk calculation is impossible; it falls back to `defaultLotSize`.
3. **Fatal Configuration**: If both risk calculation and `defaultLotSize` are unavailable, the service throws an `Error`, preventing the order from being executed with an ambiguous size.

## Logging & Observability
The service logs detailed structured info for every calculation, including:
- The `limitingFactor` (whether it was limited by risk rules or margin availability).
- Verification of each step (rounding, clamping, reduction).
- Trace tokens for end-to-end debugging.
