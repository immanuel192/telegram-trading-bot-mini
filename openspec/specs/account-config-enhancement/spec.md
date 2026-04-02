# account-config-enhancement Specification

## Purpose
TBD - created by archiving change improve-trading-accuracy. Update Purpose after archive.
## Requirements
### Requirement: Symbol-specific pip value configuration

The `Account` model SHALL support symbol-specific pip value configuration to enable accurate pips-to-price conversion.

#### Scenario: Configure pip value for a symbol

**Given** an Account with symbol configuration for "XAUUSD"  
**When** the symbol configuration includes `pipValue: 0.1`  
**Then** the system SHALL use 0.1 as the pip value for XAUUSD  
**And** the pip value SHALL be used for pips-to-price conversion in SET_TP_SL commands

#### Scenario: Use default pip value when not configured

**Given** an Account with symbol configuration for "EURUSD"  
**When** the symbol configuration does NOT include `pipValue`  
**Then** the system SHALL use the default pip value of 0.1  
**And** the default SHALL be applied consistently across all operations

#### Scenario: Validate pip value configuration

**Given** an Account with symbol configuration  
**When** `pipValue` is set to a non-positive number  
**Then** the system SHALL reject the configuration  
**And** an error SHALL be returned indicating invalid pip value

### Requirement: Entry price validation threshold configuration

The `Account` model SHALL support configuration of entry price validation thresholds to detect and correct AI misinterpretation of prices.

#### Scenario: Configure entry price validation threshold

**Given** an Account with configs  
**When** `entryPriceValidationThreshold` is set to 0.005 (0.5%)  
**Then** the system SHALL use 0.5% as the threshold for entry price validation  
**And** entry prices differing from market price by more than 0.5% SHALL trigger validation logic

#### Scenario: Use default validation threshold when not configured

**Given** an Account with configs  
**When** `entryPriceValidationThreshold` is NOT set  
**Then** the system SHALL use the default threshold of 0.005 (0.5%)  
**And** the default SHALL be applied consistently

#### Scenario: Disable entry price validation

**Given** an Account with configs  
**When** `entryPriceValidationThreshold` is set to 0 or undefined  
**Then** the system SHALL skip entry price validation  
**And** AI-inferred prices SHALL be accepted without validation

### Requirement: Documentation and examples

The `Account` model SHALL include comprehensive JSDoc documentation for new configuration fields.

#### Scenario: Pip value documentation

**Given** the `pipValue` field in Account.symbols  
**When** a developer views the field documentation  
**Then** the JSDoc SHALL include:
- Purpose: "Pip value for this symbol"
- Examples: XAUUSD (0.1), EURUSD (0.0001), USDJPY (0.01)
- Default value: 0.1
- Usage context: SET_TP_SL pips conversion

#### Scenario: Validation threshold documentation

**Given** the `entryPriceValidationThreshold` field in Account.configs  
**When** a developer views the field documentation  
**Then** the JSDoc SHALL include:
- Purpose: "Threshold for validating AI-inferred entry prices"
- Default value: 0.005 (0.5%)
- Behavior: Market orders use cached price if difference exceeds threshold
- Use cases: Detect AI misinterpretation of abbreviated prices

---

