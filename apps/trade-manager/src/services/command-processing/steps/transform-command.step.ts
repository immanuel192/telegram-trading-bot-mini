/**
 * Purpose: Wrap the CommandTransformerService.transform call into a pipeline step.
 */

import {
  NextFunction,
  IPipelineStep,
} from '@telegram-trading-bot-mini/shared/utils';
import { CommandProcessingContext } from '../execution-context';
import { CommandTransformerService } from '../../command-transformer.service';

export class CommandTransformationStep implements IPipelineStep<CommandProcessingContext> {
  name = 'CommandTransformationStep';

  constructor(
    private readonly commandTransformerService: CommandTransformerService,
  ) {}

  async execute(
    ctx: CommandProcessingContext,
    next: NextFunction,
  ): Promise<void> {
    const { state, messageContext } = ctx;

    // Skip if requested (e.g., skipNormalFlow from MessageEditCheckStep)
    if (state.skipNormalFlow) {
      return next();
    }

    const { account, command } = state;
    const { messageId, channelId, traceToken } = messageContext;

    const normalPayloads = await this.commandTransformerService.transform(
      command,
      messageId,
      channelId,
      account.accountId,
      traceToken,
      account.configs,
      (command.extraction?.symbol
        ? account.symbols?.[command.extraction.symbol]
        : undefined) || {},
      account.brokerConfig?.exchangeCode,
    );

    if (normalPayloads && normalPayloads.length > 0) {
      state.executePayloads.push(...normalPayloads);
    }

    await next();
  }
}
