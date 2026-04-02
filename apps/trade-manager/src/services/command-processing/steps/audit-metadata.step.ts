/**
 * Purpose: Extract updateMessageLivePrice logic to capture audit metadata.
 */

import {
  NextFunction,
  IPipelineStep,
  PriceCacheService,
  LoggerInstance,
} from '@telegram-trading-bot-mini/shared/utils';
import { CommandProcessingContext } from '../execution-context';
import { TelegramMessageRepository } from '@dal';

export class CaptureAuditMetadataStep implements IPipelineStep<CommandProcessingContext> {
  name = 'CaptureAuditMetadataStep';

  constructor(
    private readonly priceCacheService: PriceCacheService,
    private readonly telegramMessageRepository: TelegramMessageRepository,
    private readonly logger: LoggerInstance,
  ) {}

  async execute(
    ctx: CommandProcessingContext,
    next: NextFunction,
  ): Promise<void> {
    const { state, messageContext } = ctx;
    const { executePayloads, command } = state;
    const { channelId, messageId } = messageContext;

    if (executePayloads.length > 0) {
      try {
        // Get cached price from any exchange (max 30 seconds old)
        const cachedPrice =
          await this.priceCacheService.getPriceFromAnyExchange(
            executePayloads[0].symbol,
            30000,
          );

        if (cachedPrice) {
          await this.telegramMessageRepository.updateAuditMetadata(
            channelId,
            messageId,
            {
              bid: cachedPrice.bid || 0,
              ask: cachedPrice.ask || 0,
            },
            command.command,
            undefined as any, // Session removed
          );
        }
      } catch (error) {
        // Log error but don't fail processing (non-blocking)
        this.logger.warn(
          { channelId, messageId, error, symbol: executePayloads[0].symbol },
          'Failed to capture audit metadata (non-blocking)',
        );
      }
    }

    await next();
  }
}
