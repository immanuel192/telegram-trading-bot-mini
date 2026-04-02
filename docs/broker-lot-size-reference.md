# Broker Lot Size Configuration Reference

## Overview

Different brokers use different lot size conventions and minimum lot sizes. This document provides a comprehensive reference for configuring the `BrokerConfig.unitsPerLot` and related fields to ensure proper lot-to-unit conversion across all supported brokers.

---

## Lot Size Fundamentals

### Standard Forex Convention
In standard forex trading:
- **1 Standard Lot** = 100,000 units of base currency
- **1 Mini Lot** (0.10) = 10,000 units
- **1 Micro Lot** (0.01) = 1,000 units
- **1 Nano Lot** (0.001) = 100 units (some brokers)

### XAUUSD (Gold) Specifics
For XAUUSD (Gold):
- **1 unit** = 1 troy ounce of gold
- **0.01 lot** = 1 oz (for standard brokers)
- **1.00 lot** = 100 oz (for standard brokers)

---

## Broker-Specific Configuration

### XM Broker

#### XM Micro Account
**Special Case**: XM Micro uses a non-standard lot size!

```typescript
{
  unitsPerLot: 1000,      // 1 lot = 1,000 units (NOT 100,000!)
  minLotSize: 0.01,       // Minimum: 0.01 lot = 10 units
  maxLotSize: 100,        // Maximum: 100 lots = 100,000 units
  lotStepSize: 0.01       // Increment: 0.01 lot
}
```

**XAUUSD Example:**
- 0.01 lot = 10 units = 10 oz
- 0.10 lot = 100 units = 100 oz
- 1.00 lot = 1,000 units = 1,000 oz

**Pip Value (EUR/USD):**
- 1 micro-lot = ~$0.10 per pip
- 0.10 micro-lot = ~$0.01 per pip
- 0.01 micro-lot = ~$0.001 per pip

**Reference**: [XM Micro Account Lot Size Guide](https://scribehow.com/page/XM_Micro_Account_Lot_Size_Complete_Guide_for_Traders__-kSNDPE2TCWLiqil7Inj3Q)

#### XM Standard Account
**Standard Convention**: Follows industry standard

```typescript
{
  unitsPerLot: 100000,    // 1 lot = 100,000 units
  minLotSize: 0.01,       // Minimum: 0.01 lot = 1,000 units
  maxLotSize: 50,         // Maximum: 50 lots = 5,000,000 units
  lotStepSize: 0.01       // Increment: 0.01 lot
}
```

**XAUUSD Example:**
- 0.01 lot = 1,000 units = 1,000 oz
- 0.10 lot = 10,000 units = 10,000 oz
- 1.00 lot = 100,000 units = 100,000 oz

---

### Exness Broker

#### Exness Standard Account
**Standard Convention**: Industry standard

```typescript
{
  unitsPerLot: 100000,    // 1 lot = 100,000 units
  minLotSize: 0.01,       // Minimum: 0.01 lot (Micro Lot)
  maxLotSize: 200,        // Maximum: 200 lots (account-dependent)
  lotStepSize: 0.01       // Increment: 0.01 lot
}
```

**Lot Breakdown:**
- **Standard Lot (1.00)**: 100,000 units
- **Mini Lot (0.10)**: 10,000 units
- **Micro Lot (0.01)**: 1,000 units

**XAUUSD Example:**
- 0.01 lot = 1,000 units = 1,000 oz
- 1.00 lot = 100,000 units = 100,000 oz

#### Exness Cent Account
**Nano Lot Support**: Allows even smaller positions

```typescript
{
  unitsPerLot: 100000,    // 1 lot = 100,000 units (same conversion!)
  minLotSize: 0.001,      // Minimum: 0.001 lot (Nano Lot)
  maxLotSize: 200,        // Maximum: 200 lots
  lotStepSize: 0.001      // Increment: 0.001 lot
}
```

**Lot Breakdown:**
- **Nano Lot (0.001)**: 100 units
- **Micro Lot (0.01)**: 1,000 units
- **Standard Lot (1.00)**: 100,000 units

**Key Insight**: The `unitsPerLot` stays 100,000, but `minLotSize` and `lotStepSize` change to 0.001!

---

### OANDA Broker

#### All OANDA Accounts
**No Lot Concept**: OANDA uses direct units

```typescript
{
  unitsPerLot: 1,         // 1 "lot" = 1 unit (conceptual only)
  minLotSize: 1,          // Minimum: 1 unit
  maxLotSize: 100000000,  // Maximum: 100M units (account-dependent)
  lotStepSize: 1          // Increment: 1 unit
}
```

**XAUUSD Example:**
- 1 unit = 1 oz
- 100 units = 100 oz
- 1,000 units = 1,000 oz (equivalent to ~0.01 lot in other brokers)

**Important**: When converting from lot-based signals to OANDA:
```typescript
// AI says: "Use 0.01 lot"
const aiLotSize = 0.01;
const unitsPerLot = 1; // OANDA
const units = 0.01 * 1 = 0.01 units

// Round up to minimum
const actualUnits = Math.max(1, Math.ceil(units)); // = 1 unit
```

---

## Configuration Reference Table

![Broker Lot Size Configuration Table](/Users/trung.dang/.gemini/antigravity/brain/785e763a-1409-4eaa-8fbe-e87c6c0e6303/uploaded_image_1766743891988.png)

| Broker | Account  | unitsPerLot | minLotSize | lotStepSize | Notes                        |
| ------ | -------- | ----------- | ---------- | ----------- | ---------------------------- |
| XM     | Micro    | 1000        | 0.01       | 0.01        | Special: 1 lot = 1,000 units |
| XM     | Standard | 100000      | 0.01       | 0.01        | Standard convention          |
| Exness | Standard | 100000      | 0.01       | 0.01        | Standard convention          |
| Exness | Cent     | 100000      | 0.001      | 0.001       | Nano lot support             |
| OANDA  | All      | 1           | 1          | 1           | No lots, direct units        |

---

## Usage Examples

### Example 1: XM Micro Account
```typescript
const account = {
  brokerConfig: {
    unitsPerLot: 1000,
    minLotSize: 0.01,
    lotStepSize: 0.01
  }
};

// AI says: "Use 0.05 lot"
const aiLotSize = 0.05;
const units = aiLotSize * account.brokerConfig.unitsPerLot;
// units = 0.05 * 1000 = 50 units

// For XAUUSD: 50 oz
```

### Example 2: Exness Standard Account
```typescript
const account = {
  brokerConfig: {
    unitsPerLot: 100000,
    minLotSize: 0.01,
    lotStepSize: 0.01
  }
};

// AI says: "Use 0.02 lot"
const aiLotSize = 0.02;
const units = aiLotSize * account.brokerConfig.unitsPerLot;
// units = 0.02 * 100000 = 2000 units

// For XAUUSD: 2000 oz
```

### Example 3: OANDA Account
```typescript
const account = {
  brokerConfig: {
    unitsPerLot: 1,
    minLotSize: 1,
    lotStepSize: 1
  }
};

// AI says: "Use 0.01 lot" (conceptual)
const aiLotSize = 0.01;
const units = aiLotSize * account.brokerConfig.unitsPerLot;
// units = 0.01 * 1 = 0.01 units

// Round to minimum
const actualUnits = Math.max(
  account.brokerConfig.minLotSize,
  Math.ceil(units)
);
// actualUnits = 1 unit

// For XAUUSD: 1 oz
```

---

## Validation Rules

### Required Field
- `unitsPerLot`: **MUST** be specified (no default)
  - Valid values: 1, 1000, 10000, 100000
  - Represents the conversion factor from lots to units

### Optional Fields
- `minLotSize`: Defaults to 0.01 if not specified
- `maxLotSize`: No default (broker-specific)
- `lotStepSize`: Defaults to 0.01 if not specified

### Validation Logic
```typescript
function validateLotSize(lotSize: number, config: BrokerConfig): boolean {
  // Check minimum
  if (lotSize < config.minLotSize) {
    return false;
  }
  
  // Check maximum (if specified)
  if (config.maxLotSize && lotSize > config.maxLotSize) {
    return false;
  }
  
  // Check step size
  const stepSize = config.lotStepSize || 0.01;
  const remainder = (lotSize % stepSize).toFixed(10);
  if (parseFloat(remainder) !== 0) {
    return false;
  }
  
  return true;
}
```

---

## Migration Notes

### Existing Accounts
For existing accounts without lot size configuration:
- **Default `unitsPerLot`**: 100000 (standard convention)
- **Default `minLotSize`**: 0.01
- **Default `lotStepSize`**: 0.01

### XM Micro Accounts
**IMPORTANT**: XM Micro accounts MUST be explicitly configured with `unitsPerLot: 1000`!

Migration script example:
```typescript
// Update all XM Micro accounts
await accountRepository.updateMany(
  { 
    'brokerConfig.exchangeCode': 'XM',
    'brokerConfig.accountType': 'MICRO' // if you track this
  },
  {
    $set: {
      'brokerConfig.unitsPerLot': 1000,
      'brokerConfig.minLotSize': 0.01,
      'brokerConfig.lotStepSize': 0.01
    }
  }
);
```

---

## References

- [XM Micro Account Lot Size Guide](https://scribehow.com/page/XM_Micro_Account_Lot_Size_Complete_Guide_for_Traders__-kSNDPE2TCWLiqil7Inj3Q)
- [Exness Lot Size Documentation](https://www.exness.com/support/)
- [OANDA Units Documentation](https://www.oanda.com/us-en/trading/how-to-trade-forex/)

---

**Last Updated**: 2025-12-26  
**Version**: 1.0
