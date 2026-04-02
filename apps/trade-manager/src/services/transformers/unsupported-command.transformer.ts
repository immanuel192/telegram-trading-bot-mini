/**
 * Unsupported command transformer
 * Handles commands that are not yet implemented
 */

import { ExecuteOrderRequestPayload } from '@telegram-trading-bot-mini/shared/utils';
import { BaseTransformer } from './base.transformer';
import { TransformContext, TranslateMessageResultCommand } from './types';

/**
 * Transform unsupported commands
 * Throws an error to indicate the command is not yet implemented
 */
export class UnsupportedCommandTransformer extends BaseTransformer {
  async transform(
    command: TranslateMessageResultCommand,
    context: TransformContext,
  ): Promise<ExecuteOrderRequestPayload[] | null> {
    const errorMessage = `Command ${command.command} is not supported yet`;

    this.logger?.error(
      {
        command: command.command,
        messageId: context.messageId,
        channelId: context.channelId,
        traceToken: context.traceToken,
      },
      errorMessage,
    );

    throw new Error(errorMessage);
  }
}
