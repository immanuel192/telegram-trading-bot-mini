/**
 * Purpose: Extract the payload used for order creation (LONG/SHORT commands).
 * Storing it in the state simplifies downstream steps like ValidateEntryPriceStep and OrderCreationStep.
 */

import {
  NextFunction,
  IPipelineStep,
  CommandEnum,
} from '@telegram-trading-bot-mini/shared/utils';
import { CommandProcessingContext } from '../execution-context';

export class ExtractOrderCreationPayloadStep implements IPipelineStep<CommandProcessingContext> {
  name = 'ExtractOrderCreationPayloadStep';

  private readonly tradeCommands = [CommandEnum.LONG, CommandEnum.SHORT];

  async execute(
    ctx: CommandProcessingContext,
    next: NextFunction,
  ): Promise<void> {
    const { state } = ctx;

    // Only relevant for LONG/SHORT commands
    state.orderCreationPayload = state.executePayloads.find((p) =>
      this.tradeCommands.includes(p.command),
    );

    await next();
  }
}
