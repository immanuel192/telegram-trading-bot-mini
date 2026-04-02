/**
 * Purpose: Extract logic for checking message edits and determining if normal flow should be skipped.
 */

import {
  NextFunction,
  IPipelineStep,
  LoggerInstance,
} from '@telegram-trading-bot-mini/shared/utils';
import { CommandProcessingContext } from '../execution-context';
import { MessageEditHandlerService } from '../../message-edit-handler.service';
import { OrderService } from '../../order.service';
import { PushNotificationService } from '@telegram-trading-bot-mini/shared/utils';

export class MessageEditCheckStep implements IPipelineStep<CommandProcessingContext> {
  name = 'MessageEditCheckStep';
  private readonly messageEditHandler: MessageEditHandlerService;

  constructor(
    orderService: OrderService,
    pushNotificationService: PushNotificationService,
    logger: LoggerInstance,
  ) {
    this.messageEditHandler = new MessageEditHandlerService(
      orderService,
      logger,
      pushNotificationService,
    );
  }

  async execute(
    ctx: CommandProcessingContext,
    next: NextFunction,
  ): Promise<void> {
    const { state, messageContext } = ctx;

    // Perform message edit check
    // Note: We need a way to pass the session if we are in a transaction.
    // For now, following the decision to remove global transactions, we use the step normally.
    const editResult = await this.messageEditHandler.handleMessageEdit(
      state.command.extraction,
      {
        messageId: messageContext.messageId,
        channelId: messageContext.channelId,
        accountId: state.account.accountId,
        traceToken: messageContext.traceToken,
      },
      undefined as any, // Session removed as per architecture decision 2
    );

    // Update state with edit results
    if (editResult.payloads.length > 0) {
      state.executePayloads.push(...editResult.payloads);
    }

    state.skipNormalFlow = editResult.skipNormalFlow;

    await next();
  }
}
