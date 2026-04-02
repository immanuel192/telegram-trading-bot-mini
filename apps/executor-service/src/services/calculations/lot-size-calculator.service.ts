/**
 * Purpose: Calculate lot sizes for orders using risk-based formulas
 * Exports: LotSizeCalculatorService class
 * Core Flow: Receives order parameters → calculates risk-based lot size → applies reductions → clamps to broker limits
 *
 * This service handles:
 * 1. Risk-based lot size calculation using account balance and risk percentage
 * 2. Fallback to default lot sizes when risk calculation is not possible
 * 3. Lot size reduction based on meta flags
 * 4. Clamping to broker min/max/step limits
 */

import { Account, BrokerConfig } from '@dal';
import {
  BalanceInfo,
  LoggerInstance,
} from '@telegram-trading-bot-mini/shared/utils';

export interface CalculateLotSizeParams {
  lotSize: number;
  symbol: string;
  account: Account;
  accountBalanceInfo?: BalanceInfo;
  entry?: number;
  stopLoss?: { price?: number };
  leverage: number;
  meta?: { reduceLotSize?: boolean; adjustEntry?: boolean };
}

export interface CalculateLotSizeFromRiskParams {
  riskAmount: number;
  symbol: string;
  entry?: number;
  stopLoss?: { price?: number };
  account: Account;
  accountBalanceInfo?: BalanceInfo;
  leverage: number;
}

export class LotSizeCalculatorService {
  constructor(private logger: LoggerInstance) {}

  /**
   * Calculate lot size with risk-based calculation and fallback logic
   *
   * Flow:
   * 1. If lotSize > 0, use provided value
   * 2. If lotSize = 0, try risk-based calculation
   * 3. Apply margin constraints if maxOpenPositions is configured
   * 4. Fallback to defaultLotSize if risk calculation fails
   * 5. Apply reduction if meta.reduceLotSize = true
   * 6. Clamp to broker limits (min/max/step)
   *
   * @param params - Lot size calculation parameters
   * @returns Final adjusted lot size
   */
  calculateLotSize(params: CalculateLotSizeParams): number {
    const {
      lotSize,
      symbol,
      account,
      accountBalanceInfo,
      entry,
      stopLoss,
      leverage,
      meta,
    } = params;

    let finalLotSize = lotSize;

    // Step 1: If lotSize = 0, try risk-based calculation or use default
    if (lotSize === 0) {
      // Prefer equity (balance + unrealized P&L) over balance
      const effectiveBalance =
        accountBalanceInfo?.equity ?? accountBalanceInfo?.balance;

      // Get config with symbol-level priority over account-level
      const symbolConfig = account.symbols?.[symbol];
      const maxRiskPercentage =
        symbolConfig?.maxRiskPercentage ??
        account.configs?.defaultMaxRiskPercentage;
      const defaultLotSize =
        symbolConfig?.defaultLotSize ?? account.configs?.defaultLotSize;

      // Try risk-based calculation if we have all required inputs
      if (effectiveBalance && maxRiskPercentage && entry && stopLoss?.price) {
        const riskAmount = effectiveBalance * (maxRiskPercentage / 100);
        const calculatedLotSize = this.calculateLotSizeFromRisk({
          riskAmount,
          symbol,
          entry,
          stopLoss,
          account,
          accountBalanceInfo,
          leverage,
        });

        if (calculatedLotSize > 0) {
          finalLotSize = calculatedLotSize;
          this.logger.info(
            {
              accountId: account.accountId,
              symbol,
              balance: effectiveBalance,
              maxRiskPercentage,
              riskAmount,
              leverage,
              entry,
              stopLoss: stopLoss.price,
              calculatedLotSize,
            },
            'Calculated lot size using risk-based formula with leverage',
          );
        } else {
          // Risk calculation returned 0, fallback to default
          if (defaultLotSize) {
            finalLotSize = defaultLotSize;
            this.logger.warn(
              {
                accountId: account.accountId,
                symbol,
                defaultLotSize,
                reason: 'Risk calculation returned 0',
              },
              'Falling back to defaultLotSize',
            );
          } else {
            throw new Error(
              `Cannot calculate lot size: risk calculation failed and no defaultLotSize configured for account ${account.accountId}, symbol ${symbol}`,
            );
          }
        }
      } else {
        // Missing inputs for risk calculation, use default lot size
        if (defaultLotSize) {
          finalLotSize = defaultLotSize;
          this.logger.warn(
            {
              accountId: account.accountId,
              symbol,
              defaultLotSize,
              hasBalance: !!effectiveBalance,
              hasMaxRiskPercentage: !!maxRiskPercentage,
              hasEntry: !!entry,
              hasStopLoss: !!stopLoss?.price,
            },
            'Using defaultLotSize - missing inputs for risk calculation',
          );
        } else {
          throw new Error(
            `Cannot calculate lot size: missing balance/entry/SL and no defaultLotSize configured for account ${account.accountId}, symbol ${symbol}`,
          );
        }
      }
    }

    // Step 2: Apply reduction if meta.reduceLotSize is true
    if (meta?.reduceLotSize) {
      const symbolConfig = account.symbols?.[symbol];
      const reducePercent = symbolConfig?.reduceLotSizePercent ?? 0.5; // Default 50%

      finalLotSize = finalLotSize * reducePercent;

      this.logger.info(
        {
          accountId: account.accountId,
          symbol,
          beforeReduction: lotSize,
          afterReduction: finalLotSize,
          reducePercent,
        },
        'Reduced lot size based on meta.reduceLotSize',
      );
    }

    // Step 3: Clamp to broker limits
    const clampedLotSize = this.clampLotSize(
      finalLotSize,
      account.brokerConfig,
    );

    return clampedLotSize;
  }

  /**
   * Calculate lot size from risk amount using dual constraints:
   * 1. Risk-based: lotSize = (riskAmount × leverage) / (priceRisk × unitsPerLot)
   * 2. Margin-based: lotSize = (availableMargin × leverage) / (entry × unitsPerLot)
   *
   * Returns the MINIMUM of the two to ensure:
   * - Position respects risk management rules
   * - Position fits within available margin (especially for DCA with maxOpenPositions)
   *
   * @param params - Risk calculation parameters
   * @returns Calculated lot size or 0 if calculation not possible
   */
  calculateLotSizeFromRisk(params: CalculateLotSizeFromRiskParams): number {
    const {
      riskAmount,
      symbol,
      entry,
      stopLoss,
      account,
      accountBalanceInfo,
      leverage,
    } = params;

    // Validate required inputs
    if (!entry || !stopLoss?.price) {
      this.logger.debug(
        {
          accountId: account.accountId,
          symbol,
          hasEntry: !!entry,
          hasStopLoss: !!stopLoss?.price,
        },
        'Cannot calculate lot size from risk: missing entry or stopLoss',
      );
      return 0;
    }

    // Calculate price risk (distance between entry and stop loss)
    const priceRisk = Math.abs(entry - stopLoss.price);

    // Handle zero price risk (entry = stopLoss)
    if (priceRisk === 0) {
      this.logger.warn(
        {
          accountId: account.accountId,
          symbol,
          entry,
          stopLoss: stopLoss.price,
        },
        'Cannot calculate lot size from risk: entry equals stopLoss (zero risk)',
      );
      return 0;
    }

    // Get unitsPerLot from broker config (default: 100000 for standard lot)
    const unitsPerLot = account.brokerConfig?.unitsPerLot ?? 100000;

    // CONSTRAINT 1: Risk-based lot size
    // This ensures if SL hits, we lose exactly the risk amount
    const riskBasedLotSize =
      (riskAmount * leverage) / (priceRisk * unitsPerLot);

    // Prefer equity (balance + unrealized P&L) over balance
    const effectiveBalance =
      accountBalanceInfo?.equity ?? accountBalanceInfo?.balance;

    // CONSTRAINT 2: Margin-based lot size (if maxOpenPositions is configured)
    let marginBasedLotSize: number | undefined;
    const maxOpenPositions = account.configs?.maxOpenPositions;

    if (effectiveBalance && maxOpenPositions && maxOpenPositions > 0) {
      // Calculate available margin per position for DCA
      const marginPerPosition = effectiveBalance / maxOpenPositions;

      // Calculate max lot size that fits within allocated margin
      // Formula: lotSize = (margin × leverage) / (entry × unitsPerLot)
      marginBasedLotSize =
        (marginPerPosition * leverage) / (entry * unitsPerLot);

      this.logger.debug(
        {
          accountId: account.accountId,
          symbol,
          balance: effectiveBalance,
          maxOpenPositions,
          marginPerPosition,
          leverage,
          entry,
          unitsPerLot,
          marginBasedLotSize,
        },
        'Calculated margin-based lot size for DCA',
      );
    }

    // Take the minimum of risk-based and margin-based constraints
    const finalLotSize =
      marginBasedLotSize !== undefined
        ? Math.min(riskBasedLotSize, marginBasedLotSize)
        : riskBasedLotSize;

    // Determine which constraint was the limiting factor
    const limitingFactor =
      marginBasedLotSize !== undefined && marginBasedLotSize < riskBasedLotSize
        ? 'margin'
        : 'risk';

    this.logger.info(
      {
        accountId: account.accountId,
        symbol,
        riskAmount,
        leverage,
        entry,
        stopLoss: stopLoss.price,
        priceRisk,
        unitsPerLot,
        riskBasedLotSize,
        marginBasedLotSize,
        finalLotSize,
        limitingFactor,
        maxOpenPositions,
      },
      `Calculated lot size with dual constraints (limited by ${limitingFactor})`,
    );

    return finalLotSize;
  }

  /**
   * Clamp lot size to broker limits (min/max/step)
   *
   * @param lotSize - Lot size to clamp
   * @param brokerConfig - Broker configuration with lot size limits
   * @returns Clamped lot size
   */
  clampLotSize(lotSize: number, brokerConfig?: BrokerConfig): number {
    if (!brokerConfig) {
      return lotSize;
    }

    let clampedLotSize = lotSize;
    let wasClamped = false;

    // Round to step size if specified
    if (brokerConfig.lotStepSize) {
      const rounded =
        Math.round(clampedLotSize / brokerConfig.lotStepSize) *
        brokerConfig.lotStepSize;
      if (rounded !== clampedLotSize) {
        this.logger.debug(
          {
            original: clampedLotSize,
            rounded,
            stepSize: brokerConfig.lotStepSize,
          },
          'Rounded lot size to step size',
        );
        clampedLotSize = rounded;
        wasClamped = true;
      }
    }

    // Apply minimum lot size
    if (brokerConfig.minLotSize && clampedLotSize < brokerConfig.minLotSize) {
      this.logger.warn(
        {
          original: clampedLotSize,
          clamped: brokerConfig.minLotSize,
          minLotSize: brokerConfig.minLotSize,
        },
        'Clamped lot size to minimum',
      );
      clampedLotSize = brokerConfig.minLotSize;
      wasClamped = true;
    }

    // Apply maximum lot size
    if (brokerConfig.maxLotSize && clampedLotSize > brokerConfig.maxLotSize) {
      this.logger.warn(
        {
          original: clampedLotSize,
          clamped: brokerConfig.maxLotSize,
          maxLotSize: brokerConfig.maxLotSize,
        },
        'Clamped lot size to maximum',
      );
      clampedLotSize = brokerConfig.maxLotSize;
      wasClamped = true;
    }

    if (wasClamped) {
      this.logger.info(
        {
          originalLotSize: lotSize,
          clampedLotSize,
          brokerLimits: {
            min: brokerConfig.minLotSize,
            max: brokerConfig.maxLotSize,
            step: brokerConfig.lotStepSize,
          },
        },
        'Lot size clamped to broker limits',
      );
    }

    return clampedLotSize;
  }
}
