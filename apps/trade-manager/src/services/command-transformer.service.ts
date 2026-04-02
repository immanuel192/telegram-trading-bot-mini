/**
 * Purpose: Transform TRANSLATE_MESSAGE_RESULT commands into EXECUTE_ORDER_REQUEST payloads
 * Exports: CommandTransformerService class
 * Core Flow: Receive command → Validate → Apply configs → Transform to execution payload
 *
 * This service handles command-specific transformation logic with validation rules
 * for different order types (market vs limit) and SL/TP price validation.
 *
 * Order creation is handled separately by the caller using OrderService.
 */

import {
  CommandEnum,
  ExecuteOrderRequestPayload,
} from '@telegram-trading-bot-mini/shared/utils';
import { Account } from '@dal';
import { Redis } from 'ioredis';
import { LoggerInstance } from '@telegram-trading-bot-mini/shared/utils';
import { OrderService } from './order.service';
import {
  TransformContext,
  TranslateMessageResultCommand,
  TransformerFunction,
  TradeCommandTransformer,
  MoveSLCommandTransformer,
  SetTPSLCommandTransformer,
  CloseAllCommandTransformer,
  CancelCommandTransformer,
  CloseBadPositionCommandTransformer,
  UnsupportedCommandTransformer,
} from './transformers';

/**
 * Service for transforming AI-detected commands into executable order requests
 * Handles validation, configuration application, and payload generation
 *
 * Note: Order creation is handled separately by the caller
 */
export class CommandTransformerService {
  private readonly transformers = new Map<CommandEnum, TransformerFunction>();

  constructor(
    private readonly orderService: OrderService,
    private readonly redis: Redis,
    private readonly logger?: LoggerInstance,
  ) {
    // Initialize transformer instances
    const tradeTransformer = new TradeCommandTransformer(
      this.orderService,
      this.logger,
    );
    const moveSLTransformer = new MoveSLCommandTransformer(
      this.orderService,
      this.logger,
    );
    const setTPSLTransformer = new SetTPSLCommandTransformer(
      this.orderService,
      this.logger,
    );
    const closeAllTransformer = new CloseAllCommandTransformer(
      this.orderService,
      this.logger,
    );
    const cancelTransformer = new CancelCommandTransformer(
      this.orderService,
      this.logger,
    );
    const closeBadPositionTransformer = new CloseBadPositionCommandTransformer(
      this.orderService,
      this.redis,
      this.logger,
    );
    const unsupportedTransformer = new UnsupportedCommandTransformer(
      this.orderService,
      this.logger,
    );

    // Map commands to their transformer functions
    this.transformers.set(CommandEnum.LONG, (cmd, ctx) =>
      tradeTransformer.transform(cmd, ctx),
    );
    this.transformers.set(CommandEnum.SHORT, (cmd, ctx) =>
      tradeTransformer.transform(cmd, ctx),
    );
    this.transformers.set(CommandEnum.MOVE_SL, (cmd, ctx) =>
      moveSLTransformer.transform(cmd, ctx),
    );
    this.transformers.set(CommandEnum.SET_TP_SL, (cmd, ctx) =>
      setTPSLTransformer.transform(cmd, ctx),
    );
    this.transformers.set(CommandEnum.CLOSE_ALL, (cmd, ctx) =>
      closeAllTransformer.transform(cmd, ctx),
    );
    this.transformers.set(CommandEnum.CLOSE_BAD_POSITION, (cmd, ctx) =>
      closeBadPositionTransformer.transform(cmd, ctx),
    );
    this.transformers.set(CommandEnum.CANCEL, (cmd, ctx) =>
      cancelTransformer.transform(cmd, ctx),
    );
    this.transformers.set(CommandEnum.LIMIT_EXECUTED, (cmd, ctx) =>
      unsupportedTransformer.transform(cmd, ctx),
    );
    // NONE is skipped in handler, no transformation needed
  }

  /**
   * Transform a command into executable order request payload(s)
   *
   * @param command - Command from AI translation result
   * @param messageId - Telegram message ID
   * @param channelId - Telegram channel ID
   * @param accountId - Trading account ID
   * @param traceToken - Trace token for tracking
   * @param accountConfig - Account-level configurations
   * @param symbolConfig - Symbol-specific configurations
   * @param exchangeCode - Broker exchange code
   * @returns Array of executable order request payloads or null if validation fails
   */
  async transform(
    command: TranslateMessageResultCommand,
    messageId: number,
    channelId: string,
    accountId: string,
    traceToken: string,
    accountConfig?: Account['configs'],
    symbolConfig?: Account['symbols'][string],
    exchangeCode?: string,
  ): Promise<ExecuteOrderRequestPayload[] | null> {
    const context: TransformContext = {
      messageId,
      channelId,
      accountId,
      traceToken,
      accountConfig,
      symbolConfig,
      exchangeCode,
    };

    const transformer = this.transformers.get(command.command);
    if (!transformer) {
      this.logger?.warn(
        {
          command: command.command,
          messageId,
          traceToken,
        },
        'No transformer found for command',
      );
      return null;
    }

    return await transformer(command, context);
  }
}
