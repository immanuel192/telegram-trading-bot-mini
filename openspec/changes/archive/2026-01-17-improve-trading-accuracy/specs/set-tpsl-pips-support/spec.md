# set-tpsl-pips-support Specification

## Purpose
Implement pips-to-price conversion in executor-service for SET_TP_SL commands. This enables the system to correctly process stop loss and take profit levels specified in pips, converting them to absolute prices using the order's entry price and symbol-specific pip values.

## ADDED Requirements

### Requirement: Pips-to-price conversion for stop loss

The executor-service SHALL convert stop loss pips to absolute price when processing SET_TP_SL commands.

#### Scenario: Convert SL pips to price for LONG order

**Given** a LONG order with entry price 4236  
**And** a SET_TP_SL command with stopLoss={ pips: 80 }  
**And** symbol XAUUSD has pipValue=0.1  
**When** the executor-service processes the command  
**Then** the SL pips SHALL be converted to price: 4236 - (80 × 0.1) = 4228  
**And** the broker SHALL receive SL price 4228  
**And** the conversion SHALL be logged for audit

#### Scenario: Convert SL pips to price for SHORT order

**Given** a SHORT order with entry price 4236  
**And** a SET_TP_SL command with stopLoss={ pips: 80 }  
**And** symbol XAUUSD has pipValue=0.1  
**When** the executor-service processes the command  
**Then** the SL pips SHALL be converted to price: 4236 + (80 × 0.1) = 4244  
**And** the broker SHALL receive SL price 4244  
**And** the conversion SHALL be logged for audit

#### Scenario: Use default pip value when not configured

**Given** a LONG order with entry price 1.2650  
**And** a SET_TP_SL command with stopLoss={ pips: 50 }  
**And** symbol EURUSD does NOT have pipValue configured  
**When** the executor-service processes the command  
**Then** the default pipValue=0.1 SHALL be used  
**And** the SL price SHALL be calculated as: 1.2650 - (50 × 0.1) = 1.2600  
**And** a warning SHALL be logged about using default pip value

### Requirement: Pips-to-price conversion for take profit

The executor-service SHALL convert take profit pips to absolute price when processing SET_TP_SL commands.

#### Scenario: Convert TP pips to price for LONG order

**Given** a LONG order with entry price 4236  
**And** a SET_TP_SL command with takeProfits=[{ pips: 150 }]  
**And** symbol XAUUSD has pipValue=0.1  
**When** the executor-service processes the command  
**Then** the TP pips SHALL be converted to price: 4236 + (150 × 0.1) = 4251  
**And** the broker SHALL receive TP price 4251  
**And** the conversion SHALL be logged for audit

#### Scenario: Convert TP pips to price for SHORT order

**Given** a SHORT order with entry price 4236  
**And** a SET_TP_SL command with takeProfits=[{ pips: 150 }]  
**And** symbol XAUUSD has pipValue=0.1  
**When** the executor-service processes the command  
**Then** the TP pips SHALL be converted to price: 4236 - (150 × 0.1) = 4221  
**And** the broker SHALL receive TP price 4221  
**And** the conversion SHALL be logged for audit

#### Scenario: Convert multiple TP levels with pips

**Given** a LONG order with entry price 4236  
**And** a SET_TP_SL command with takeProfits=[{ pips: 100 }, { pips: 150 }, { pips: 200 }]  
**And** symbol XAUUSD has pipValue=0.1  
**When** the executor-service processes the command  
**Then** all TP levels SHALL be converted:
- TP1: 4236 + (100 × 0.1) = 4246
- TP2: 4236 + (150 × 0.1) = 4251
- TP3: 4236 + (200 × 0.1) = 4256  
**And** the broker SHALL receive all converted TP prices

### Requirement: Price takes precedence over pips

The executor-service SHALL use explicit price when both price and pips are provided.

#### Scenario: Price takes precedence for stop loss

**Given** a LONG order with entry price 4236  
**And** a SET_TP_SL command with stopLoss={ price: 4200, pips: 80 }  
**When** the executor-service processes the command  
**Then** the explicit price 4200 SHALL be used  
**And** the pips value SHALL be ignored  
**And** the broker SHALL receive SL price 4200

#### Scenario: Price takes precedence for take profit

**Given** a LONG order with entry price 4236  
**And** a SET_TP_SL command with takeProfits=[{ price: 4300, pips: 150 }]  
**When** the executor-service processes the command  
**Then** the explicit price 4300 SHALL be used  
**And** the pips value SHALL be ignored  
**And** the broker SHALL receive TP price 4300

### Requirement: Error handling for missing entry price

The executor-service SHALL handle missing entry price gracefully when pips conversion is required.

#### Scenario: Skip SL conversion when entry price missing

**Given** an order without entry price  
**And** a SET_TP_SL command with stopLoss={ pips: 80 }  
**When** the executor-service processes the command  
**Then** the SL conversion SHALL be skipped  
**And** a warning SHALL be logged indicating missing entry price  
**And** the SL SHALL NOT be set on the broker  
**And** the order history SHALL record the skip reason

#### Scenario: Skip TP conversion when entry price missing

**Given** an order without entry price  
**And** a SET_TP_SL command with takeProfits=[{ pips: 150 }]  
**When** the executor-service processes the command  
**Then** the TP conversion SHALL be skipped  
**And** a warning SHALL be logged indicating missing entry price  
**And** the TP SHALL NOT be set on the broker  
**And** the order history SHALL record the skip reason

### Requirement: Separate MOVE_SL and SET_TP_SL handlers

The executor-service SHALL use separate handlers for MOVE_SL and SET_TP_SL commands to enable different processing logic.

#### Scenario: MOVE_SL routes to dedicated handler

**Given** a MOVE_SL command  
**When** the executor-service processes the command  
**Then** the command SHALL route to `handleMoveStopLoss()` method  
**And** the existing MOVE_SL logic SHALL be preserved  
**And** no pips conversion SHALL be applied (MOVE_SL uses relative movements)

#### Scenario: SET_TP_SL routes to dedicated handler

**Given** a SET_TP_SL command  
**When** the executor-service processes the command  
**Then** the command SHALL route to `handleSetTakeProfitStopLoss()` method  
**And** pips conversion SHALL be applied if needed  
**And** the converted prices SHALL be passed to OrderUpdateService

### Requirement: Backward compatibility

The executor-service SHALL maintain backward compatibility with existing price-based SET_TP_SL commands.

#### Scenario: Process price-based SET_TP_SL unchanged

**Given** a SET_TP_SL command with stopLoss={ price: 4200 }  
**And** no pips value provided  
**When** the executor-service processes the command  
**Then** the behavior SHALL be identical to pre-enhancement implementation  
**And** the price 4200 SHALL be used directly  
**And** no conversion SHALL be applied  
**And** all existing tests SHALL pass

---
