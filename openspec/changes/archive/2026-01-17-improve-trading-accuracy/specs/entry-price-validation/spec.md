# entry-price-validation Specification

## Purpose
Implement entry price validation in trade-manager to detect and correct AI misinterpretation of abbreviated prices. This prevents incorrect trade execution due to misinterpreted entry prices (e.g., "36" interpreted as "36" instead of "4236").

## ADDED Requirements

### Requirement: Entry price validation for market orders

The trade-manager SHALL validate AI-inferred entry prices against current market prices and correct them when necessary for market orders.

#### Scenario: Accept correct entry price for market order

**Given** a LONG command with entry price 4236 and isImmediate=true  
**And** current market price from cache is 4235  
**And** validation threshold is 0.005 (0.5%)  
**When** the trade-manager processes the command  
**Then** the entry price SHALL be accepted as-is (4236)  
**And** the order SHALL be created with entry price 4236  
**And** no validation warning SHALL be logged

#### Scenario: Correct incorrect entry price for market order

**Given** a LONG command with entry price 36 and isImmediate=true  
**And** current market price from cache is 4236  
**And** validation threshold is 0.005 (0.5%)  
**And** price difference is 99.15% (exceeds threshold)  
**When** the trade-manager processes the command  
**Then** the entry price SHALL be replaced with cached price (4236)  
**And** the order SHALL be created with entry price 4236  
**And** a validation log SHALL be recorded indicating price correction

#### Scenario: Handle missing cached price for market order

**Given** a LONG command with entry price 36 and isImmediate=true  
**And** no cached price is available for the symbol  
**When** the trade-manager processes the command  
**Then** the AI-inferred entry price SHALL be used (36)  
**And** a warning SHALL be logged indicating no validation was possible  
**And** the order SHALL be created with entry price 36

### Requirement: Entry price validation for limit orders

The trade-manager SHALL validate AI-inferred entry prices for limit orders but SHALL NOT automatically correct them.

#### Scenario: Accept entry price for limit order with warning

**Given** a LONG command with entry price 36 and isImmediate=false  
**And** current market price from cache is 4236  
**And** validation threshold is 0.005 (0.5%)  
**And** price difference is 99.15% (exceeds threshold)  
**When** the trade-manager processes the command  
**Then** the entry price SHALL be accepted as-is (36)  
**And** a warning SHALL be logged indicating potential misinterpretation  
**And** the order SHALL be created with entry price 36

#### Scenario: Accept correct entry price for limit order

**Given** a LONG command with entry price 4200 and isImmediate=false  
**And** current market price from cache is 4236  
**And** validation threshold is 0.005 (0.5%)  
**And** price difference is 0.85% (within reasonable range for limit order)  
**When** the trade-manager processes the command  
**Then** the entry price SHALL be accepted as-is (4200)  
**And** no validation warning SHALL be logged  
**And** the order SHALL be created with entry price 4200

### Requirement: Configurable validation threshold

The trade-manager SHALL use the account-configured validation threshold for entry price validation.

#### Scenario: Use custom validation threshold

**Given** an Account with entryPriceValidationThreshold=0.01 (1%)  
**And** a LONG command with entry price 4190 and isImmediate=true  
**And** current market price from cache is 4236  
**And** price difference is 1.09% (exceeds custom threshold)  
**When** the trade-manager processes the command  
**Then** the entry price SHALL be replaced with cached price (4236)  
**And** the custom threshold (1%) SHALL be used for validation

#### Scenario: Use default validation threshold

**Given** an Account without entryPriceValidationThreshold configured  
**And** a LONG command with entry price 4215 and isImmediate=true  
**And** current market price from cache is 4236  
**And** price difference is 0.50% (equals default threshold)  
**When** the trade-manager processes the command  
**Then** the default threshold (0.5%) SHALL be used for validation  
**And** the entry price SHALL be accepted as-is (within threshold)

### Requirement: Cross-exchange price lookup

The trade-manager SHALL use cross-exchange price lookup to fetch current market prices for validation.

#### Scenario: Fetch price from any available exchange

**Given** a LONG command requiring entry price validation  
**And** no price is cached for the account's exchange  
**And** price is cached for a different exchange  
**When** the trade-manager validates the entry price  
**Then** the system SHALL fetch price from any available exchange  
**And** the fetched price SHALL be used for validation  
**And** the source exchange SHALL be logged

#### Scenario: Handle no cached prices available

**Given** a LONG command requiring entry price validation  
**And** no price is cached for any exchange  
**When** the trade-manager validates the entry price  
**Then** the system SHALL skip validation  
**And** a warning SHALL be logged indicating no cached price available  
**And** the AI-inferred entry price SHALL be used

---
