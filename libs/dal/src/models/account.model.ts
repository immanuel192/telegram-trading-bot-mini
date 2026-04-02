/**
 * Purpose: Define the Account entity and its configuration structures for trading accounts.
 * Exports: Account (main entity), AccountSymbolConfig (per-symbol trading settings).
 * Core Flow: Extends MongoDB Document, includes exchange credentials, trading configs, and symbol-specific overrides.
 */

import { Document, ObjectId } from 'mongodb';

export enum AccountType {
  MT5 = 'mt5',
  API = 'api',
}

/**
 * Valid values for TP partial close percentage
 */
export type TpClosePercent = number | 'REMAINING';

/**
 * Valid levels for SL movement during TP hits
 */
export type TpSlMoveLevel = 'ENTRY' | 'TP1' | 'TP2' | 'TP3';

/**
 * TP Action definition for multi-tier TP monitoring
 */
export interface TpAction {
  /**
   * Percentage to close
   *
   * - Number (0-100): Close this percentage of current position
   * - 'REMAINING': Close all remaining position volume
   * - undefined: Don't perform a partial close
   *
   * @example 30 // Close 30%
   * @example 'REMAINING' // Close all
   */
  closePercent?: TpClosePercent;

  /**
   * Where to move SL (optional)
   *
   * - 'ENTRY': Move to entry price (break-even)
   * - 'TP1': Move to TP1 price
   * - 'TP2': Move to TP2 price
   * - 'TP3': Move to TP3 price
   * - undefined: Don't move SL
   *
   * @example 'ENTRY' // Move SL to entry (break-even)
   */
  moveSL?: TpSlMoveLevel;
}

/**
 * Operation hours configuration
 * Defines when trading is allowed for a broker or specific symbol
 */
export interface OperationHoursConfig {
  /**
   * Timezone for schedule validation (e.g., 'America/New_York')
   */
  timezone: string;
  /**
   * Schedule string format: 'Day-Day: HH:mm - HH:mm'
   * Example: 'Sun-Fri: 18:05 - 16:59'
   * If endTime < startTime, it implies overnight session with a daily break.
   */
  schedule: string;
}

/**
 * Broker connection configuration for executor-service
 * Stores credentials and connection details for broker API integration
 */
export interface BrokerConfig {
  /**
   * Exchange/broker identifier code
   * Examples: 'binanceusdm', 'oanda', 'xm', 'exness', 'mock'
   * Validated at runtime when creating broker adapter
   */
  exchangeCode: string;
  /**
   * API key for broker authentication
   */
  apiKey: string;
  /**
   * API secret for broker authentication (optional, not all brokers require it)
   */
  apiSecret?: string;
  /**
   * Whether to use sandbox/testnet mode (optional)
   * @default false
   */
  isSandbox?: boolean;
  /**
   * Broker account ID (generic for all brokers)
   * - For OANDA: account ID from OANDA API
   * - For XM/Exness: web terminal account number
   * - For other brokers: broker-specific account identifier
   */
  accountId?: string;
  /**
   * Custom server URL (optional, for brokers with multiple endpoints)
   */
  serverUrl?: string;
  /**
   * JWT token for web terminal authentication (optional, for XM/Exness)
   * Used for session-based authentication with web terminal brokers
   */
  jwtToken?: string;
  /**
   * Refresh token for web terminal authentication (optional, for XM/Exness)
   * Used to refresh expired JWT tokens
   */
  refreshToken?: string;
  /**
   * Lot size configuration
   * Defines how lots are calculated and validated for this broker
   */
  /**
   * Units per 1.00 lot (conversion factor from lots to base units)
   * Examples:
   * - XM Micro: 1000 (1.00 lot = 1,000 units)
   * - XM Standard: 100000 (1.00 lot = 100,000 units)
   * - Exness Standard: 100000 (1.00 lot = 100,000 units)
   * - Exness Cent: 100000 (1.00 lot = 100,000 units, but in cents)
   * - OANDA: 1 (1.00 lot = 1 unit, OANDA uses units directly)
   */
  unitsPerLot: number;
  /**
   * Minimum allowed lot size (optional)
   * Examples:
   * - XM Micro/Standard: 0.01
   * - Exness Standard: 0.01
   * - Exness Cent: 0.001
   * - OANDA: 1
   */
  minLotSize?: number;
  /**
   * Maximum allowed lot size (optional, broker-specific)
   * Set by broker to limit position size
   */
  maxLotSize?: number;
  /**
   * Lot size increment step (optional)
   * Defines valid lot size increments
   * Examples:
   * - XM: 0.01 (can trade 0.01, 0.02, 0.03, etc.)
   * - Exness Cent: 0.001 (can trade 0.001, 0.002, 0.003, etc.)
   * - OANDA: 1 (can trade 1, 2, 3, etc. units)
   */
  lotStepSize?: number;
  /**
   * Symbol mapping overrides (optional)
   * Maps universal symbol → [sandboxSymbol, productionSymbol]
   * Used to override default symbol transformation logic
   *
   * Universal symbols follow our standard format:
   * - XAUUSD for gold
   * - BTCUSDT for Bitcoin
   * - EURUSD for EUR/USD
   *
   * Different brokers use different formats:
   * - Oanda: XAU_USD (underscore separator)
   * - Binance: BTCUSDT (no separator)
   * - Others may vary
   *
   * Example for Oanda:
   * {
   *   "XAUUSD": ["XAU_USD", "XAU_USD"],
   *   "BTCUSDT": ["BTC_USDT", "BTC_USDT"],
   *   "EURUSD": ["EUR_USD", "EUR_USD"]
   * }
   *
   * If not specified, the adapter will use its default transformation logic.
   */
  symbolMapping?: {
    [universalSymbol: string]: [string, string]; // [sandbox, production]
  };
  /**
   * Maximum number of virtual accounts sharing this real broker account.
   *
   * **Purpose:**
   * Allows a single broker account balance to be split across multiple "virtual" trading accounts
   * in our system. Each virtual account will see only a portion of the total balance.
   *
   * **Behavior:**
   * The actual balance and equity from the broker are divided by this number before being cached.
   * For example, if maxShareVirtualAccounts = 2 and real balance is $1000, each account
   * will show $500 balance.
   *
   * **Note:**
   * If using this, the balance and equity might be affected by trades from other virtual accounts
   * sharing the same real account. This is similar to CROSS margin mode in Binance Futures.
   *
   * @default 1
   */
  maxShareVirtualAccounts?: number;
}

/**
 * Data Model for Account
 */
export interface Account extends Document {
  _id?: ObjectId;
  /**
   * Our internal accountId, for management purposes
   * This field should match the executor-service accountId for cross-service account identification
   */
  accountId: string;
  /**
   * Description of the account
   */
  description?: string;
  /**
   * Whether the account is active or not
   */
  isActive: boolean;
  /**
   * 1 to many relationship.
   * One channel can have many accounts
   */
  telegramChannelCode: string;
  /**
   * Account type, that will drive the trading logic to the correct service
   */
  accountType: AccountType;
  /**
   * Reference to PromptRule for AI message translation
   * This links the account to a specific set of AI prompts for interpreting Telegram messages
   */
  promptId: string;
  /**
   * Broker connection configuration for executor-service (optional)
   * Contains API credentials and connection details for broker integration
   * Used by executor-service to establish connection with the broker's API
   */
  brokerConfig?: BrokerConfig;
  /**
   * Account-level trading configurations (optional)
   * Controls global trading behavior for this account
   *
   * These configurations define how the trading bot behaves when executing orders.
   * Most settings can be overridden at the symbol level for fine-grained control.
   */
  configs?: {
    /**
     * Whether to automatically close opposite positions when opening a new position
     *
     * **Purpose:**
     * Prevents holding both LONG and SHORT positions simultaneously on the same symbol.
     * This is useful for accounts that don't support hedging or when you want to avoid
     * conflicting positions.
     *
     * **Behavior:**
     * - If true and you have a LONG position open, opening a SHORT will:
     *   1. Close the existing LONG position first
     *   2. Then open the new SHORT position
     * - If false, both LONG and SHORT positions can exist simultaneously (hedging)
     *
     * **Use Cases:**
     * - Trend-following strategies (always aligned with current signal)
     * - Brokers that don't allow hedging
     * - Simplified position management
     *
     * @default true
     */
    closeOppositePosition?: boolean;

    /**
     * Default maximum risk percentage per trade (account-level)
     *
     * **Purpose:**
     * Defines what percentage of your account balance you're willing to lose PER TRADE
     * if the stop loss is hit. This is the foundation of risk management.
     *
     * **How It Works:**
     * When lotSize = 0 in a trade signal, the system calculates position size to risk
     * exactly this percentage:
     *
     * ```
     * riskAmount = balance × (defaultMaxRiskPercentage / 100)
     * lotSize = (riskAmount × leverage) / (priceRisk × unitsPerLot)
     *
     * Where:
     * - priceRisk = |entry - stopLoss|
     * - Leverage amplifies position size
     * - Margin constraint applies if maxOpenPositions is set
     * ```
     *
     * **Example:**
     * ```
     * balance: $10,000
     * defaultMaxRiskPercentage: 2
     * entry: 2650
     * stopLoss: 2600
     * leverage: 50
     * unitsPerLot: 1 (OANDA)
     *
     * Calculation:
     * riskAmount = $10,000 × 0.02 = $200
     * priceRisk = |2650 - 2600| = 50
     * lotSize = ($200 × 50) / (50 × 1) = 200 units
     *
     * If SL hits: loss = 200 units × 50 points = $10,000... wait, that's wrong!
     *
     * With margin constraint (maxOpenPositions = 5):
     * marginPerPosition = $10,000 / 5 = $2,000
     * marginBasedLotSize = ($2,000 × 50) / (2650 × 1) = 37.7 units
     * finalLotSize = min(200, 37.7) = 37.7 units
     *
     * If SL hits: loss = 37.7 × 50 = $1,885 (18.85% - still needs adjustment!)
     * ```
     *
     * **⚠️ CRITICAL: Must Configure maxOpenPositions!**
     *
     * When using risk-based lot sizing, you **MUST** also configure `maxOpenPositions`
     * to prevent over-leveraging and ensure positions fit within available margin.
     *
     * **Without maxOpenPositions:**
     * ```
     * Example: GOLD SHORT @ 4462, SL @ 4515 (53 points risk)
     * Balance: $10,000, Risk: 2%, Leverage: 50:1
     *
     * Calculated lot size: ($200 × 50) / (53 × 1) = 188 units
     * Margin required: (188 × $4,462) / 50 = $16,509 ❌
     *
     * PROBLEM: Need $16,509 margin but only have $10,000!
     * Result: Order rejected or account over-leveraged
     * ```
     *
     * **With maxOpenPositions = 5:**
     * ```
     * Margin per position: $10,000 / 5 = $2,000
     * Margin-based lot size: ($2,000 × 50) / (4462 × 1) = 22 units
     * Final lot size: min(188, 22) = 22 units ✅
     * Margin required: $1,969 per position ✅
     * Can open 5 DCA positions successfully!
     * ```
     *
     * **Recommended maxOpenPositions Values:**
     * - **Single position strategy:** maxOpenPositions = 1
     * - **Basic DCA:** maxOpenPositions = 2-3
     * - **Moderate DCA:** maxOpenPositions = 3-5
     * - **Aggressive DCA:** maxOpenPositions = 5-10
     *
     * **Important Notes:**
     * - This is the ACTUAL DOLLAR LOSS if SL hits, not margin used
     * - Total risk across multiple positions = defaultMaxRiskPercentage × number of open positions
     * - Use maxOpenPositions to limit total exposure
     * - Can be overridden per symbol via symbols[symbol].maxRiskPercentage
     *
     * **Recommended Values:**
     * - Conservative: 1-2% (professional traders)
     * - Moderate: 2-3%
     * - Aggressive: 5%+ (high risk of account depletion)
     *
     * @default undefined (must use defaultLotSize instead)
     */
    defaultMaxRiskPercentage?: number;

    /**
     * Default lot size fallback (account-level)
     *
     * **Purpose:**
     * Provides a fixed lot size to use when risk-based calculation is not possible
     * or when you prefer fixed position sizing over risk-based sizing.
     *
     * **When Used:**
     * 1. lotSize = 0 in trade signal AND risk calculation fails because:
     *    - No balance available
     *    - No entry price (market order without price)
     *    - No stop loss provided
     * 2. As a safety fallback for any calculation errors
     *
     * **Example:**
     * ```
     * defaultLotSize: 0.01
     *
     * Scenario 1: Missing balance
     * - balance: undefined
     * - Signal: LONG XAUUSD, entry: 2650, SL: 2600
     * - Result: Uses 0.01 lots (can't calculate risk-based)
     *
     * Scenario 2: Market order without SL
     * - Signal: LONG XAUUSD (market order, no SL)
     * - Result: Uses 0.01 lots
     * ```
     *
     * **Broker-Specific Examples:**
     * - OANDA (unitsPerLot = 1): defaultLotSize = 100 means 100 units
     * - XM Standard (unitsPerLot = 100000): defaultLotSize = 0.01 means 1,000 units
     * - XM Micro (unitsPerLot = 1000): defaultLotSize = 0.01 means 10 units
     *
     * **Priority:**
     * symbol-level defaultLotSize > account-level defaultLotSize
     *
     * **Use Cases:**
     * - Testing with small fixed sizes
     * - Accounts without balance tracking
     * - Simple strategies without risk management
     *
     * @default undefined (will throw error if risk calculation fails)
     */
    defaultLotSize?: number;

    /**
     * Stop loss widening percentage for entry adjustment (account-level)
     *
     * **Purpose:**
     * Widens the stop loss distance AFTER a market order is executed to give the
     * position more breathing room. This is triggered by meta.adjustEntry flag.
     *
     * **How It Works:**
     * After market order execution, the SL distance is increased by this percentage:
     *
     * ```
     * LONG:
     * originalDistance = entry - SL
     * newDistance = originalDistance × (1 + addOnStopLossPercentForAdjustEntry)
     * adjustedSL = entry - newDistance
     *
     * SHORT:
     * originalDistance = SL - entry
     * newDistance = originalDistance × (1 + addOnStopLossPercentForAdjustEntry)
     * adjustedSL = entry + newDistance
     * ```
     *
     * **Example:**
     * ```
     * addOnStopLossPercentForAdjustEntry: 0.1 (10%)
     *
     * LONG XAUUSD:
     * - Entry: 2650
     * - Original SL: 2600
     * - Original distance: 50 points
     * - New distance: 50 × 1.1 = 55 points
     * - Adjusted SL: 2650 - 55 = 2595
     *
     * Trade-off:
     * - More breathing room (less likely to hit SL on noise)
     * - Larger potential loss (55 points instead of 50)
     * ```
     *
     * **When To Use:**
     * - Volatile markets where price spikes are common
     * - When broker prices differ from signal source
     * - Market orders where slippage is expected
     *
     * **Activation:**
     * Only applies when meta.adjustEntry = true in the execution request
     *
     * **Warning:**
     * This increases your risk per trade! If you risk 2% with original SL,
     * you'll risk 2.2% with 10% adjustment.
     *
     * @default undefined (no adjustment)
     */
    addOnStopLossPercentForAdjustEntry?: number;

    /**
     * Take profit level selector index (zero-based)
     *
     * **Purpose:**
     * When multiple take profit levels are provided in a signal, this determines
     * which one to actually use for the order.
     *
     * **How It Works:**
     * 1. Take profits are sorted by highest profit first:
     *    - LONG: highest price first (descending order)
     *    - SHORT: lowest price first (ascending order)
     * 2. The index selects which TP to use from the sorted array
     *
     * **Example:**
     * ```
     * takeProfitIndex: 1
     *
     * LONG Signal:
     * - Entry: 2650
     * - TPs: [2700, 2750, 2800, 2850]
     * - Sorted: [2850, 2800, 2750, 2700] (highest first)
     * - Selected: 2800 (index 1)
     *
     * SHORT Signal:
     * - Entry: 2650
     * - TPs: [2600, 2550, 2500, 2450]
     * - Sorted: [2450, 2500, 2550, 2600] (lowest first)
     * - Selected: 2500 (index 1)
     * ```
     *
     * **Strategy Examples:**
     * - takeProfitIndex = 0: Most aggressive (highest profit, furthest TP)
     * - takeProfitIndex = 1: Balanced (second highest profit)
     * - takeProfitIndex = 2: Conservative (closer TP, higher probability)
     *
     * **Edge Cases:**
     * - If index >= number of TPs, uses the last TP
     * - If no TPs provided, no TP is set (unless forceNoTakeProfit is used)
     *
     * @default 0 (most aggressive TP)
     */
    takeProfitIndex?: number;

    /**
     * Disable all take profit orders
     *
     * **Purpose:**
     * Completely ignores all take profit levels from trading signals.
     * Useful for manual TP management or trailing stop strategies.
     *
     * **Behavior:**
     * - When true: All TP levels from signals are ignored
     * - When false: TPs are set according to takeProfitIndex
     *
     * **Example:**
     * ```
     * forceNoTakeProfit: true
     *
     * Signal: LONG XAUUSD, Entry: 2650, SL: 2600, TPs: [2700, 2750, 2800]
     * Result: Order opened with SL but NO TP
     *
     * You must manually close or set TP later
     * ```
     *
     * **Use Cases:**
     * - Trailing stop strategies (let profits run)
     * - Manual exit management
     * - Testing strategies without TPs
     * - When you want to close based on other signals
     *
     * **Warning:**
     * Without TP, positions can run indefinitely. Ensure you have:
     * - Manual monitoring
     * - Alternative exit strategy
     * - Trailing stop implementation
     *
     * @default false (use TPs from signals)
     */
    forceNoTakeProfit?: boolean;

    /**
     * Force stop loss by percentage when none provided (account-level)
     *
     * **Purpose:**
     * Automatically adds a stop loss to orders that don't have one, calculated
     * as a percentage distance from entry price. This is a safety mechanism.
     *
     * **How It Works:**
     * When a signal has no stop loss:
     *
     * ```
     * LONG:
     * forcedSL = entry × (1 - forceStopLossByPercentage)
     *
     * SHORT:
     * forcedSL = entry × (1 + forceStopLossByPercentage)
     * ```
     *
     * **Example:**
     * ```
     * forceStopLossByPercentage: 0.02 (2%)
     *
     * LONG XAUUSD:
     * - Entry: 2650
     * - No SL in signal
     * - Forced SL: 2650 × (1 - 0.02) = 2650 × 0.98 = 2597
     * - Risk: 53 points
     *
     * SHORT XAUUSD:
     * - Entry: 2650
     * - No SL in signal
     * - Forced SL: 2650 × (1 + 0.02) = 2650 × 1.02 = 2703
     * - Risk: 53 points
     * ```
     *
     * **Important Notes:**
     * - This is a PERCENTAGE of price, not account balance
     * - Different from defaultMaxRiskPercentage (which is % of balance)
     * - Can be overridden per symbol
     * - Does NOT apply broker adjustments (stopLossAdjustPricePercentage)
     *
     * **Priority:**
     * symbol-level forceStopLossByPercentage > account-level forceStopLossByPercentage
     *
     * **Use Cases:**
     * - Protect against signals without SL
     * - Enforce maximum risk per trade
     * - Safety net for automated trading
     *
     * **Recommended Values:**
     * - Forex: 0.01-0.02 (1-2%)
     * - Crypto: 0.03-0.05 (3-5% due to volatility)
     * - Gold: 0.01-0.015 (1-1.5%)
     *
     * @default undefined (no forced stop loss)
     */
    forceStopLossByPercentage?: number;

    /**
     * Stop loss adjustment for broker price differences (price-based)
     *
     * **Purpose:**
     * Widens the stop loss distance to account for price variations between
     * your signal source and your broker. Prevents premature stop-outs due
     * to price discrepancies.
     *
     * **How It Works:**
     * When SL is specified as a price (not pips), widen the distance:
     *
     * ```
     * LONG:
     * originalDistance = entry - SL
     * adjustedDistance = originalDistance × (1 + stopLossAdjustPricePercentage)
     * adjustedSL = entry - adjustedDistance
     *
     * SHORT:
     * originalDistance = SL - entry
     * adjustedDistance = originalDistance × (1 + stopLossAdjustPricePercentage)
     * adjustedSL = entry + adjustedDistance
     * ```
     *
     * **Example:**
     * ```
     * stopLossAdjustPricePercentage: 0.05 (5%)
     *
     * LONG XAUUSD:
     * - Entry: 2650
     * - Signal SL: 2600 (from TradingView)
     * - Original distance: 50 points
     * - Adjusted distance: 50 × 1.05 = 52.5 points
     * - Adjusted SL: 2650 - 52.5 = 2597.5
     *
     * Why? Your broker (OANDA) might show 2648 when TradingView shows 2650
     * The 5% buffer prevents hitting SL due to price feed differences
     * ```
     *
     * **When To Use:**
     * - Signal source uses different price feed than broker
     * - Example: TradingView signals executed on OANDA
     * - Broker has wider spreads than signal source
     *
     * **Applied To:**
     * - All orders with stopLoss.price
     * - NOT applied to forced SL (forceStopLossByPercentage)
     * - NOT applied to stopLoss.pips (use stopLossAdjustPipsPercentage instead)
     *
     * **Priority:**
     * symbol-level > account-level
     *
     * **Trade-off:**
     * - Pro: Fewer false stop-outs
     * - Con: Larger potential loss per trade
     *
     * **Recommended Values:**
     * - Same broker as signal: 0 (no adjustment)
     * - Different brokers: 0.02-0.05 (2-5%)
     * - High spread brokers: 0.05-0.10 (5-10%)
     *
     * @default undefined (no adjustment)
     */
    stopLossAdjustPricePercentage?: number;

    /**
     * Stop loss adjustment for broker price differences (pips-based)
     *
     * **Purpose:**
     * Similar to stopLossAdjustPricePercentage but applies when SL is specified
     * in pips rather than absolute price.
     *
     * **How It Works:**
     * When SL is specified as pips, widen the pip distance:
     *
     * ```
     * adjustedPips = originalPips × (1 + stopLossAdjustPipsPercentage)
     * ```
     *
     * **Example:**
     * ```
     * stopLossAdjustPipsPercentage: 0.05 (5%)
     *
     * Signal:
     * - LONG XAUUSD
     * - Entry: 2650
     * - SL: 50 pips
     *
     * Calculation:
     * - Original SL: 50 pips
     * - Adjusted SL: 50 × 1.05 = 52.5 pips
     * - Actual SL price: 2650 - 52.5 = 2597.5
     * ```
     *
     * **When To Use:**
     * - Signals provide SL in pips (common in Forex)
     * - Same reasons as stopLossAdjustPricePercentage
     *
     * **Applied To:**
     * - All orders with stopLoss.pips
     * - NOT applied to stopLoss.price
     * - NOT applied to forced SL
     *
     * **Priority:**
     * symbol-level > account-level
     *
     * @default undefined (no adjustment)
     */
    stopLossAdjustPipsPercentage?: number;

    /**
     * Maximum number of concurrent open positions (for DCA and risk management)
     *
     * **Purpose:**
     * Limits the total number of positions that can be open simultaneously.
     * Critical for DCA strategies and controlling total account exposure.
     *
     * **How It Works:**
     * 1. Prevents opening new positions when limit is reached
     * 2. Enables margin-aware lot size calculation for DCA
     * 3. Controls total risk exposure across all positions
     *
     * **Margin-Aware Lot Sizing:**
     * When set, lot size calculation considers available margin per position:
     *
     * ```
     * marginPerPosition = balance / maxOpenPositions
     * marginBasedLotSize = (marginPerPosition × leverage) / (entry × unitsPerLot)
     * finalLotSize = min(riskBasedLotSize, marginBasedLotSize)
     * ```
     *
     * **Example 1: Risk Management**
     * ```
     * maxOpenPositions: 5
     * defaultMaxRiskPercentage: 2
     *
     * Risk per trade: 2%
     * Maximum total risk: 5 × 2% = 10% (if all 5 SLs hit)
     *
     * This limits your worst-case scenario to 10% account drawdown
     * ```
     *
     * **Example 2: DCA with Margin Constraint**
     * ```
     * balance: $10,000
     * maxOpenPositions: 5
     * leverage: 50
     *
     * GOLD SELL @ 4472, SL @ 4477 (5 points risk)
     *
     * Without maxOpenPositions:
     * - Risk-based: ($200 × 50) / (5 × 1) = 2,000 units
     * - Margin needed: (2,000 × 4,472) / 50 = $178,880 ❌ IMPOSSIBLE!
     *
     * With maxOpenPositions = 5:
     * - Margin per position: $10,000 / 5 = $2,000
     * - Margin-based: ($2,000 × 50) / (4,472 × 1) = 22.36 units
     * - Final: min(2,000, 22.36) = 22.36 units ✅
     * - Can open 5 DCA positions successfully
     * ```
     *
     * **Use Cases:**
     * - DCA (Dollar Cost Averaging) strategies
     * - Pyramiding into positions
     * - Risk management (limit total exposure)
     * - Margin management (prevent over-leveraging)
     *
     * **Behavior:**
     * - New trade requests are rejected when limit is reached
     * - Closing a position frees up a slot
     * - Applies across all symbols (account-wide limit)
     *
     * **Recommended Values:**
     * - Conservative: 3-5 positions
     * - Moderate: 5-10 positions
     * - Aggressive: 10+ positions (higher total risk)
     *
     * **Important Notes:**
     * - This is account-wide, not per-symbol
     * - Includes all open positions (LONG and SHORT)
     * - Does NOT include pending orders (only filled orders)
     *
     * @default undefined (no limit on concurrent positions)
     */
    maxOpenPositions?: number;

    /**
     * Default leverage for the account (account-wide)
     *
     * **Purpose:**
     * Sets the leverage ratio for position sizing and margin calculation.
     * Leverage allows you to control larger positions with less capital.
     *
     * **How Leverage Works:**
     * ```
     * Without leverage (1:1):
     * - To buy 100 units @ $2650 = need $265,000
     *
     * With 50:1 leverage:
     * - To buy 100 units @ $2650 = need $265,000 / 50 = $5,300 margin
     * - Profit/loss is still on full 100 units
     * ```
     *
     * **Used In:**
     * 1. **Lot Size Calculation:**
     *    ```
     *    lotSize = (riskAmount × leverage) / (priceRisk × unitsPerLot)
     *    ```
     *
     * 2. **Margin Calculation:**
     *    ```
     *    requiredMargin = (lotSize × entry × unitsPerLot) / leverage
     *    ```
     *
     * 3. **Setting Leverage on Exchange:**
     *    - Sent to broker before opening position
     *    - Cached to avoid redundant API calls
     *
     * **Example:**
     * ```
     * defaultLeverage: 50
     *
     * LONG XAUUSD:
     * - Entry: 2650
     * - Lot size: 100 units
     * - Position value: 100 × $2650 = $265,000
     * - Required margin: $265,000 / 50 = $5,300
     * - If price moves to 2700: profit = 100 × $50 = $5,000
     * ```
     *
     * **Broker-Specific Behavior:**
     * - **Forex (OANDA):** Account-wide leverage, applies to all symbols
     * - **Crypto (Binance, Bitget):** Can be set per-symbol, this is the default
     *
     * **Priority:**
     * symbol-level leverage > defaultLeverage > broker default
     *
     * **Will Be Clamped:**
     * If maxLeverage is set, final leverage = min(defaultLeverage, maxLeverage)
     *
     * **Risk Warning:**
     * - Higher leverage = larger positions = higher profit/loss
     * - 50:1 leverage means a 2% price move = 100% gain or loss
     * - Leverage amplifies BOTH profits and losses
     *
     *
     * @default undefined (uses broker's default leverage)
     */
    defaultLeverage?: number;

    /**
     * Maximum leverage allowed (safety limit)
     *
     * **Purpose:**
     * Acts as a safety cap to prevent accidentally using excessive leverage.
     * Protects against configuration errors and extreme risk-taking.
     *
     * **How It Works:**
     * ```
     * finalLeverage = min(requestedLeverage, maxLeverage)
     *
     * Where requestedLeverage can come from:
     * - symbol-level leverage config
     * - defaultLeverage config
     * - broker default
     * ```
     *
     * **Example:**
     * ```
     * maxLeverage: 100
     * defaultLeverage: 50
     *
     * Symbol BTCUSDT:
     * - Symbol config: leverage = 125
     * - Final leverage: min(125, 100) = 100 (clamped)
     *
     * Symbol XAUUSD:
     * - Symbol config: not set, uses defaultLeverage = 50
     * - Final leverage: min(50, 100) = 50 (not clamped)
     * ```
     *
     * **Use Cases:**
     * - Prevent accidentally setting 500x leverage
     * - Enforce risk management policies
     * - Protect against configuration errors
     * - Comply with internal risk limits
     *
     * **Recommended Values:**
     * - Conservative: 50x
     * - Moderate: 100x
     * - Aggressive: 200x
     *
     * **Note:**
     * This is a MAXIMUM, not a default. It only prevents going higher,
     * it doesn't set the leverage itself.
     *
     * @default undefined (no maximum limit)
     */
    maxLeverage?: number;

    /**
     * Broker operation hours (account-level default)
     *
     * **Purpose:**
     * Defines when trading is allowed for this account. Orders outside these
     * hours will be skipped with a MARKET_CLOSED status.
     *
     * **Structure:**
     * ```typescript
     * {
     *   timezone: string,  // IANA timezone (e.g., 'America/New_York')
     *   schedule: string   // Format: 'Day-Day: HH:mm - HH:mm'
     * }
     * ```
     *
     * **Example:**
     * ```
     * operationHours: {
     *   timezone: 'America/New_York',
     *   schedule: 'Sun-Fri: 18:05 - 16:59'
     * }
     *
     * Meaning:
     * - Trading allowed: Sunday 18:05 to Friday 16:59 (New York time)
     * - Trading blocked: Friday 16:59 to Sunday 18:05
     * ```
     *
     * **Overnight Sessions:**
     * If endTime < startTime, it implies an overnight session with daily break:
     * ```
     * schedule: 'Sun-Fri: 18:05 - 16:59'
     *
     * Interpretation:
     * - Opens: 18:05 each day
     * - Closes: 16:59 next day
     * - Daily break: 16:59 - 18:05 (1 hour 6 minutes)
     * ```
     *
     * **Behavior:**
     * - Orders during closed hours: Skipped with MARKET_CLOSED error
     * - Order history updated with skip reason
     * - Execution result published with success=false
     *
     * **Use Cases:**
     * - Respect broker trading hours
     * - Avoid trading during low liquidity periods
     * - Prevent trading during news events
     * - Match signal provider's active hours
     *
     * **Priority:**
     * symbol-level operationHours > account-level operationHours
     *
     * **Common Schedules:**
     * - Forex: 'Sun-Fri: 17:00 - 16:59' (24/5)
     * - US Stocks: 'Mon-Fri: 09:30 - 16:00'
     * - Crypto: No restriction (24/7)
     *
     * @default undefined (trading allowed 24/7)
     */
    operationHours?: OperationHoursConfig;

    /**
     * Enable Take Profit optimization for linked orders in DCA strategies
     *
     * **Purpose:**
     * Reduces the risk of both linked orders hitting stop loss when price reverses
     * before reaching the shared Take Profit level. This is specifically designed
     * for Dollar Cost Averaging (DCA) strategies where multiple orders are created
     * across sequential messages (e.g., Hang Moon channel).
     *
     * **Behavior:**
     * When enabled (`true`), linked orders receive different TP levels:
     * - **New order** (just created): Gets TP[0] (most aggressive, furthest from entry)
     * - **Orphan order** (created earlier): Gets TP[1] (less aggressive, closer to entry, MORE LIKELY TO HIT)
     *
     * When disabled (`false` or `undefined`): Both orders share the same TP (existing behavior)
     *
     * **How It Works:**
     * 1. Signal provides multiple TPs (e.g., [4094, 4111, 4150])
     * 2. TPs are sorted by profitability:
     *    - LONG: [4150, 4111, 4094] (highest first = most aggressive)
     *    - SHORT: [2500, 2550, 2600] (lowest first = most aggressive)
     * 3. `takeProfitIndex` selects the TP for the new order (e.g., index 0 = 4150)
     * 4. If optimization enabled, orphan order gets next TP (index 1 = 4111)
     *
     * **Example Scenario:**
     * ```
     * Without optimization (linkedOrderOptimiseTp = false):
     * - Message 1: "Gold buy now" → Order A created (no TP)
     * - Message 2: "💥GOLD Buy, TP: 4111, TP: 4150, SL: 4086"
     *   → Order B created with TP: 4150
     *   → Order A synced with TP: 4150 (same as Order B)
     * - Price: 4091 → 4140 (close to TP) → reverses → 4086 (SL)
     * - Result: BOTH orders hit SL ❌
     *
     * With optimization (linkedOrderOptimiseTp = true):
     * - Message 1: "Gold buy now" → Order A created (no TP)
     * - Message 2: "💥GOLD Buy, TP: 4111, TP: 4150, SL: 4086"
     *   → Order B created with TP: 4150 (index 0, furthest)
     *   → Order A synced with TP: 4111 (index 1, closer, MORE LIKELY TO HIT)
     * - Price: 4091 → 4120 → Order A hits TP at 4111 ✓
     * - Price continues: 4120 → reverses → 4086
     * - Result: Order A took profit, Order B hit SL (at least ONE profit!) ✓
     * ```
     *
     * **Requirements:**
     * - Signal must provide at least 2 TP levels
     * - If only 1 TP available: Both orders get the same TP (fallback)
     * - Only applies to linked orders (orphan + new order)
     *
     * **Use Cases:**
     * - DCA strategies (Hang Moon, similar channels)
     * - Pyramiding into positions
     * - Risk management for multi-entry strategies
     *
     * **Trade-offs:**
     * - Pro: Reduces risk of total loss (both orders hitting SL)
     * - Pro: Orphan order more likely to secure profit
     * - Con: New order might miss TP if price reverses early
     * - Con: Requires at least 2 TP levels in signal
     *
     * **Related Configs:**
     * - `takeProfitIndex`: Determines which TP to use (0 = most aggressive)
     * - Works with linked order feature (`isLinkedWithPrevious` flag)
     *
     * @default false (disabled, both orders get same TP)
     */
    linkedOrderOptimiseTp?: boolean;

    /**
     * Disable CLOSE_BAD_POSITION command execution
     *
     * **Purpose:**
     * Prevents automatic closure of less profitable positions when copy trading with DCA strategies.
     * This is critical because of the inherent delay (1-2+ seconds) between signal and execution.
     *
     * **Problem:**
     * When copy trading with DCA:
     * - Signal provider sends CLOSE_BAD_POSITION
     * - By the time you receive it (1-2s+ delay), price may have moved
     * - What was "bad" for them might not be "bad" for you yet
     * - Closing prematurely can lock in unnecessary losses
     *
     * **Behavior:**
     * - When true: CLOSE_BAD_POSITION commands are skipped with SKIPPED history entry
     * - When false/undefined: CLOSE_BAD_POSITION commands execute normally
     *
     * **Recommended Usage:**
     * Use together with `linkedOrderOptimiseTp` for optimal DCA risk management:
     * - `linkedOrderOptimiseTp`: Gives orphan orders better chance to hit TP
     * - `disableCloseBadPosition`: Prevents premature closure due to copy delay
     *
     * **Example Scenario:**
     * ```
     * Without disableCloseBadPosition:
     * - Provider: Price at 4100, closes position at 4095 (5 points loss)
     * - You: Receive command 2s later, price at 4098
     * - Your position closed at 4098 (different loss than provider)
     *
     * With disableCloseBadPosition:
     * - Provider: Closes at 4095
     * - You: Command skipped, position remains open
     * - Your position: Might hit TP at 4111 or SL at 4086 based on YOUR price action
     * ```
     *
     * @default false (CLOSE_BAD_POSITION executes normally)
     */
    disableCloseBadPosition?: boolean;

    /**
     * Entry price validation threshold (percentage)
     *
     * **Purpose:**
     * Validates AI-inferred entry prices against current market prices to catch
     * misinterpretation errors. If the difference exceeds this threshold, the system
     * will use the cached market price instead of the AI-inferred price.
     *
     * **How It Works:**
     * When processing a market order (isImmediate = true):
     * 1. Fetch current price from cache (any exchange, max 30 seconds old)
     * 2. Calculate price difference: `Math.abs(entryPrice - currentPrice) / currentPrice`
     * 3. If difference > threshold:
     *    - Replace entry price with cached price
     *    - Log validation decision
     * 4. If difference <= threshold: Accept AI price as-is
     *
     * **Example:**
     * ```
     * entryPriceValidationThreshold: 0.005 (0.5%)
     *
     * Scenario 1: AI misinterprets "Sell vàng 36" as entry=36
     * - Current price: 4236
     * - AI price: 36
     * - Difference: |36 - 4236| / 4236 = 0.991 (99.1%)
     * - Result: 99.1% > 0.5%, use cached price 4236 ✓
     *
     * Scenario 2: AI correctly interprets "Sell vàng 4236"
     * - Current price: 4238
     * - AI price: 4236
     * - Difference: |4236 - 4238| / 4238 = 0.0004 (0.04%)
     * - Result: 0.04% < 0.5%, accept AI price 4236 ✓
     * ```
     *
     * **Behavior:**
     * - Only applies to market orders (isImmediate = true)
     * - Limit orders are not validated (price is intentional)
     * - If no cached price available: Log warning, use AI price
     * - If cached price expired (>30s): Log warning, use AI price
     *
     * **Use Cases:**
     * - Prevent AI misinterpretation of abbreviated prices
     * - Catch obvious entry price errors
     * - Improve order execution accuracy
     *
     * **Recommended Values:**
     * - Conservative: 0.002 (0.2%) - catches major errors only
     * - Moderate: 0.005 (0.5%) - balanced (default)
     * - Aggressive: 0.01 (1%) - allows more AI price variation
     *
     * **Important Notes:**
     * - This is a PERCENTAGE of price, not absolute value
     * - Validation uses prices from ANY exchange (not just account's exchange)
     * - Price cache TTL is 30 seconds for validation
     *
     * @default 0.005 (0.5%)
     */
    entryPriceValidationThreshold?: number;

    /**
     * Enable multi-tier TP monitoring
     *
     * **Purpose:**
     * Automatically monitor price movements and manage positions based on TP level hits.
     *
     * **Behavior:**
     * - When enabled, orders under this account will be monitored for partial taking profit
     * - Price updates trigger TP level checks
     * - Actions executed based on tp1Action, tp2Action, tp3Action, tp4Action
     *
     * @default false
     */
    enableTpMonitoring?: boolean;

    /**
     * Explicit TP actions
     *
     * **Purpose:**
     * Define custom actions (partial close and SL move) for each TP level hit.
     *
     * **Example:**
     * ```
     * tp1Action: {
     *   closePercent: 50,
     *   moveSL: 'ENTRY'
     * }
     * ```
     *
     * This will:
     * - Close 50% of position when TP1 hits
     * - Move SL to entry price (break-even)
     *
     * **Actions:**
     * - closePercent: TpClosePercent (Number 0-100 or 'REMAINING')
     * - moveSL: TpSlMoveLevel ('ENTRY' | 'TP1' | 'TP2' | 'TP3')
     *
     * **Note:**
     * Both actions are optional. You can:
     * - Only close partial (no SL move)
     * - Only move SL (no close)
     * - Both close + move SL
     */
    tp1Action?: TpAction;
    tp2Action?: TpAction;
    tp3Action?: TpAction;
    tp4Action?: TpAction;
  };
  /**
   * Symbol-specific trading configurations (optional)
   * Allows per-symbol overrides of trading parameters
   */
  symbols?: {
    /**
     * Symbol-specific overrides for trading parameters
     * These override account-level defaults for specific symbols
     */
    [symbol: string]: {
      /**
       * Force stop loss by percentage for this symbol
       * Example: 0.02 = force 2% stop loss from entry if no SL provided
       * Used by executor-service when opening orders without stop loss
       */
      forceStopLossByPercentage?: number;
      /**
       * Stop loss adjustment for broker price differences (price-based)
       * Symbol-level override for stopLossAdjustPricePercentage
       * Example: 0.05 = widen SL by 5% when SL is specified as price
       *
       * Priority: symbol-level > account-level
       * @default undefined (use account-level config)
       */
      stopLossAdjustPricePercentage?: number;
      /**
       * Stop loss adjustment for broker price differences (pips-based)
       * Symbol-level override for stopLossAdjustPipsPercentage
       * Example: 0.05 = widen SL by 5% when SL is specified as pips
       *
       * Priority: symbol-level > account-level
       * @default undefined (use account-level config)
       */
      stopLossAdjustPipsPercentage?: number;
      /**
       * Percentage to reduce lot size for this symbol
       * Example: 0.5 = reduce lot size to 50% when meta.reduceLotSize is true
       * Used by executor-service when meta.reduceLotSize flag is set
       * @default 0.5 (50% reduction)
       */
      reduceLotSizePercent?: number;
      /**
       * Pick best entry from entry zone for limit orders
       * When true, selects optimal entry price from zone based on side:
       * - LONG: picks lowest price (best entry for buying)
       * - SHORT: picks highest price (best entry for selling)
       * @default false
       */
      pickBestEntryFromZone?: boolean;
      /**
       * Delta percentage for best entry selection
       * Example: 0.01 = 1% delta from zone boundary
       * Used with pickBestEntryFromZone to adjust selected entry
       */
      pickBestEntryFromZoneDelta?: number;
      /**
       * Maximum risk percentage for this symbol (overrides defaultMaxRiskPercentage)
       * Example: 3 = risk 3% of account balance per trade for this symbol
       * Used by executor-service to calculate lot size when lotSize = 0
       */
      maxRiskPercentage?: number;
      /**
       * Default lot size for this symbol (overrides account-level defaultLotSize)
       * Example: 0.02 = use 0.02 lots for this symbol when risk calculation fails
       * Used when lotSize = 0 and risk calculation not possible
       */
      defaultLotSize?: number;
      /**
       * Symbol-specific leverage (for crypto exchanges with per-symbol leverage)
       * Overrides defaultLeverage for this symbol
       *
       * Example:
       * - BTC: 125x leverage
       * - ETH: 100x leverage
       * - ALT: 50x leverage
       *
       * Note: For Forex (Oanda), leverage is account-wide, so this is ignored
       *
       * Priority: symbol leverage > defaultLeverage > broker default
       * Will be clamped to maxLeverage if set
       *
       * @default undefined (use defaultLeverage)
       */
      leverage?: number;
      /**
       * Symbol-specific operation hours
       * Overrides account-level operationHours for this specific symbol
       * Example: { timezone: 'America/New_York', schedule: 'Sun-Fri: 18:05 - 16:59' }
       *
       * Priority: symbol-level > account-level
       * @default undefined (use account-level config)
       */
      operationHours?: OperationHoursConfig;
      /**
       * Pip value for this symbol
       *
       * **Purpose:**
       * Defines the price value of 1 pip for this symbol. Used to convert pips to price
       * in SET_TP_SL commands when traders specify stop loss or take profit in pips.
       *
       * **What is a Pip?**
       * A pip ("percentage in point" or "price interest point") is the smallest price move
       * that a given exchange rate can make. Different instruments have different pip values:
       *
       * **Common Pip Values:**
       * - **Gold (XAUUSD):** 0.1 (1 pip = $0.10 price movement)
       *   * Example: Price moves from 2650.0 to 2650.1 = 1 pip
       * - **Forex Major Pairs (EURUSD, GBPUSD):** 0.0001 (1 pip = 0.0001 price movement)
       *   * Example: Price moves from 1.0950 to 1.0951 = 1 pip
       * - **Forex JPY Pairs (USDJPY):** 0.01 (1 pip = 0.01 price movement)
       *   * Example: Price moves from 110.50 to 110.51 = 1 pip
       * - **Crypto (BTCUSDT):** Varies, typically 1.0 or 0.1
       *
       * **How It's Used:**
       * When a SET_TP_SL command specifies pips instead of price:
       * ```typescript
       * // Trader says: "SL 50 pips"
       * // System converts to price:
       *
       * For LONG order:
       * slPrice = entryPrice - (pips × pipValue)
       * Example: 2650 - (50 × 0.1) = 2650 - 5 = 2645
       *
       * For SHORT order:
       * slPrice = entryPrice + (pips × pipValue)
       * Example: 2650 + (50 × 0.1) = 2650 + 5 = 2655
       * ```
       *
       * **Example Scenarios:**
       * ```
       * Symbol: XAUUSD
       * pipValue: 0.1
       *
       * Scenario 1: LONG with SL in pips
       * - Entry: 2650
       * - SL: 80 pips
       * - Calculated SL price: 2650 - (80 × 0.1) = 2642
       *
       * Scenario 2: SHORT with TP in pips
       * - Entry: 2650
       * - TP: 100 pips
       * - Calculated TP price: 2650 - (100 × 0.1) = 2640
       * ```
       *
       * **Configuration Priority:**
       * symbol-level pipValue > default (0.1)
       *
       * **Important Notes:**
       * - This is ONLY used when SL/TP is specified in pips, not price
       * - If not configured, defaults to 0.1 (suitable for XAUUSD)
       * - Must be configured correctly for each symbol to ensure accurate conversions
       * - Incorrect pip value leads to wrong SL/TP prices and unexpected losses
       *
       * **Related Configs:**
       * - stopLossAdjustPipsPercentage: Adjusts pips before conversion
       *
       * @default 0.1 (suitable for XAUUSD/Gold)
       */
      pipValue?: number;
    };
  };
}
