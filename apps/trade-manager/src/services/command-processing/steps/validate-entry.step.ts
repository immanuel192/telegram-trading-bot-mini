/**
 * Purpose: Extract the entry price validation logic into a standalone step.
 */

import {
  NextFunction,
  IPipelineStep,
  PriceCacheService,
  CommandEnum,
  LoggerInstance,
  ExecuteOrderRequestPayload,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  CommandProcessingContext,
  CommandProcessingState,
} from '../execution-context';

export class ValidateEntryPriceStep implements IPipelineStep<CommandProcessingContext> {
  name = 'ValidateEntryPriceStep';

  private static readonly MAX_PRICE_AGE_MS = 30000;
  private static readonly DEFAULT_VALIDATION_THRESHOLD = 0.005;

  constructor(
    private readonly priceCacheService: PriceCacheService,
    private readonly logger: LoggerInstance,
  ) {}

  async execute(
    ctx: CommandProcessingContext,
    next: NextFunction,
  ): Promise<void> {
    const { state, messageContext } = ctx;
    const createPayload = state.orderCreationPayload;

    // Skip if no payload, not immediate, or no entry price (e.g. limit orders without price specified)
    if (!this.shouldValidate(createPayload)) {
      return next();
    }

    try {
      await this.performPriceValidation(
        createPayload,
        state,
        messageContext.traceToken,
      );
    } catch (error) {
      this.logger.warn(
        {
          symbol: createPayload.symbol,
          aiEntry: createPayload.entry,
          error,
          traceToken: messageContext.traceToken,
        },
        'Entry price validation failed gracefully - using AI price',
      );
    }

    await next();
  }

  /**
   * Determine if the payload requires price validation.
   */
  private shouldValidate(
    payload?: ExecuteOrderRequestPayload,
  ): payload is ExecuteOrderRequestPayload & { entry: number } {
    return !!(payload && payload.isImmediate && payload.entry !== undefined);
  }

  /**
   * Orchestrates the price validation process.
   */
  private async performPriceValidation(
    payload: ExecuteOrderRequestPayload & { entry: number },
    state: CommandProcessingState,
    traceToken: string,
  ): Promise<void> {
    const { symbol, entry } = payload;

    const cachedPrice = await this.priceCacheService.getPriceFromAnyExchange(
      symbol,
      ValidateEntryPriceStep.MAX_PRICE_AGE_MS,
    );

    if (!cachedPrice) {
      this.logger.warn(
        { symbol, aiEntry: entry, traceToken },
        'No cached price available for entry price validation - using AI price',
      );
      return;
    }

    const currentPrice = (cachedPrice.bid + cachedPrice.ask) / 2;
    const threshold =
      state.account.configs?.entryPriceValidationThreshold ??
      ValidateEntryPriceStep.DEFAULT_VALIDATION_THRESHOLD;

    const priceDiff = Math.abs(entry - currentPrice) / currentPrice;

    if (priceDiff > threshold) {
      this.handleValidationFailure(
        payload,
        currentPrice,
        cachedPrice,
        priceDiff,
        threshold,
        traceToken,
      );
    } else {
      this.logger.debug(
        {
          symbol,
          aiEntry: entry,
          currentPrice,
          priceDiff: this.toPercent(priceDiff),
          traceToken,
        },
        'Entry price validation passed',
      );
    }
  }

  /**
   * Updates payload on failure and logs the warning.
   */
  private handleValidationFailure(
    payload: ExecuteOrderRequestPayload & { entry: number },
    currentPrice: number,
    cachedPrice: any,
    priceDiff: number,
    threshold: number,
    traceToken: string,
  ): void {
    const originalEntry = payload.entry;
    payload.entry = currentPrice;

    this.logger.warn(
      {
        symbol: payload.symbol,
        aiEntry: originalEntry,
        currentPrice,
        cachedBid: cachedPrice.bid,
        cachedAsk: cachedPrice.ask,
        priceDiff: this.toPercent(priceDiff),
        threshold: this.toPercent(threshold),
        traceToken,
      },
      'Entry price validation failed - using cached price instead of AI price',
    );
  }

  private toPercent(value: number): string {
    return (value * 100).toFixed(2) + '%';
  }
}
