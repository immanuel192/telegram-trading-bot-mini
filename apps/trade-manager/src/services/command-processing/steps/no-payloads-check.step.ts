/**
 * Purpose: Check if any execution payloads were generated.
 * If no payloads exist, log a warning and stop the pipeline.
 */

import {
  NextFunction,
  IPipelineStep,
  LoggerInstance,
} from '@telegram-trading-bot-mini/shared/utils';
import { CommandProcessingContext } from '../execution-context';

export class NoPayloadsCheckStep implements IPipelineStep<CommandProcessingContext> {
  name = 'NoPayloadsCheckStep';

  constructor(private readonly logger: LoggerInstance) {}

  async execute(
    ctx: CommandProcessingContext,
    next: NextFunction,
  ): Promise<void> {
    const { state, messageContext } = ctx;

    if (state.executePayloads.length === 0) {
      this.logger.warn(
        {
          messageId: messageContext.messageId,
          channelId: messageContext.channelId,
          accountId: state.account.accountId,
          command: state.command.command,
          traceToken: messageContext.traceToken,
        },
        'No execution payloads generated - skipping',
      );
      // Stop the pipeline by NOT calling next()
      return;
    }

    await next();
  }
}
