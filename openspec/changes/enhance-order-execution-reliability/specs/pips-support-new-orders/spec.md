# Spec Delta: Pips Support for New Orders

**Capability:** `pips-support-new-orders`  
**Related Specs:** `order-execution-flow`, `set-tpsl-pips-support`

## ADDED Requirements

### Requirement: Support pips-based TP/SL during order creation

The executor-service SHALL convert pips to prices for both stop loss and take profit when creating new orders (market or limit), ensuring consistent behavior with the existing `SET_TP_SL` command.

#### Scenario: Market order with SL in pips

**Given** a market order request with:
- Symbol: XAUUSD
- Side: LONG
- Entry: not provided (market order)
- Stop loss: 100 pips
- Account pip value: 0.1

**When** the order is executed

**Then** the system SHALL:
1. Resolve entry price from cached price
2. Convert pips to price: SL = entry - (100 × 0.1)
3. Pass price-based SL to broker adapter
4. Create order with calculated SL price

#### Scenario: Limit order with TP in pips

**Given** a limit order request with:
- Symbol: XAUUSD
- Side: LONG
- Entry: 4200
- Take profit: 200 pips
- Account pip value: 0.1

**When** the order is executed

**Then** the system SHALL:
1. Use provided entry price (4200)
2. Convert pips to price: TP = 4200 + (200 × 0.1) = 4220
3. Pass price-based TP to broker adapter
4. Create order with calculated TP price

#### Scenario: Order with both SL and TP in pips

**Given** an order request with:
- Symbol: XAUUSD
- Side: SHORT
- Entry: 4300
- Stop loss: 50 pips
- Take profit: 150 pips
- Account pip value: 0.1

**When** the order is executed

**Then** the system SHALL:
1. Convert SL pips to price: SL = 4300 + (50 × 0.1) = 4305
2. Convert TP pips to price: TP = 4300 - (150 × 0.1) = 4285
3. Pass both price-based SL and TP to broker adapter
4. Create order with calculated prices

#### Scenario: Order with multiple TP tiers in pips

**Given** an order request with:
- Symbol: XAUUSD
- Side: LONG
- Entry: 4200
- Take profits: [70 pips, 100 pips, 150 pips]
- Account pip value: 0.1

**When** the order is executed

**Then** the system SHALL:
1. Convert all TP pips to prices:
   - TP1 = 4200 + (70 × 0.1) = 4207
   - TP2 = 4200 + (100 × 0.1) = 4210
   - TP3 = 4200 + (150 × 0.1) = 4215
2. Pass all price-based TPs to broker adapter
3. Broker adapter selects appropriate TP based on account config (e.g., takeProfitIndex)
4. Create order with selected TP price

#### Scenario: Mixed price and pips (price takes precedence)

**Given** an order request with:
- Stop loss: { price: 4250, pips: 100 }

**When** the order is processed

**Then** the system SHALL:
1. Use the price value (4250)
2. Ignore the pips value
3. Pass price-based SL to broker adapter

### Requirement: Maintain entry price resolution order

The executor-service SHALL resolve entry price BEFORE processing TP/SL to ensure pips conversion has access to entry price.

#### Scenario: Entry price resolution for market order

**Given** a market order without entry price

**When** processing the order

**Then** the system SHALL:
1. Attempt to get cached price BEFORE TP/SL processing
2. Use cached price for pips conversion if available
3. Defer SL/TP if no entry price available

#### Scenario: Entry price available for limit order

**Given** a limit order with entry price 4200

**When** processing the order

**Then** the system SHALL:
1. Use provided entry price (4200)
2. Convert any pips-based SL/TP using this entry
3. NOT defer SL/TP processing

### Requirement: Preserve existing price-based behavior

The executor-service SHALL maintain backward compatibility with price-based TP/SL specifications.

#### Scenario: Order with price-based SL (no pips)

**Given** an order with:
- Stop loss: { price: 4250 }

**When** the order is processed

**Then** the system SHALL:
1. Use the price directly (4250)
2. NOT perform any pips conversion
3. Pass price to broker adapter unchanged

#### Scenario: Order with no SL or TP

**Given** an order without SL or TP

**When** the order is processed

**Then** the system SHALL:
1. NOT add any SL or TP
2. Create order without SL/TP
3. Maintain existing behavior

### Requirement: Validate pip value configuration

The executor-service SHALL validate pip value from account configuration and use a safe default when invalid or missing.

#### Scenario: Invalid pip value (zero or negative)

**Given** an account with symbol configuration:
- Symbol: XAUUSD
- Pip value: 0 (invalid)

**When** converting pips to price

**Then** the system SHALL:
1. Detect invalid pip value
2. Log error with symbol and invalid value
3. Use default pip value of 0.1
4. Proceed with conversion using default

#### Scenario: Missing pip value configuration

**Given** an account without pip value configured for symbol

**When** converting pips to price

**Then** the system SHALL:
1. Use default pip value of 0.1
2. Proceed with conversion
3. NOT log error (expected default behavior)

### Requirement: Log pips conversion in order history

The executor-service SHALL record pips-to-price conversions in order history for auditability and debugging.

#### Scenario: Log SL pips conversion

**Given** an order with SL in pips that is converted to price

**When** the order is created

**Then** the system SHALL:
1. Add INFO history entry
2. Include conversion details: original pips, calculated price, pip value used
3. Include entry price used for calculation
4. Tag with action: 'pips_to_price_conversion'

#### Scenario: Log both SL and TP conversions

**Given** an order with both SL and TP in pips

**When** conversions are performed

**Then** the system SHALL:
1. Add single INFO history entry
2. Include all conversions in one entry
3. List each conversion with type (SL/TP), pips, and calculated price

## MODIFIED Requirements

None - This is a new capability that extends existing functionality without modifying current behavior.

## REMOVED Requirements

None
