/**
 * Purpose: Handle message edit detection and generate corrective action payloads
 * Exports: MessageEditHandlerService
 * Core Flow: Detects edits, determines action, generates execution payloads
 */

import {
  CommandEnum,
  CommandSide,
  ExecuteOrderRequestPayload,
  LoggerInstance,
  PushNotificationService,
} from '@telegram-trading-bot-mini/shared/utils';
import { ClientSession } from 'mongodb';
import { Order, OrderSide, OrderStatus } from '@dal';
import { OrderService } from './order.service';
import { MessageEditAction } from '../types/message-edit-action.enum';

/**
 * Extracted command details from an existing order
 * Used for comparing old vs new command to determine edit action
 */
interface ExtractedCommand {
  side: OrderSide; // LONG or SHORT (from Order model)
  symbol: string;
  entry?: number;
  status: OrderStatus;
  takeProfits: Array<{ price?: number }>;
  stopLoss?: { price?: number };
}

/**
 * Command extraction from translate result
 */
interface CommandExtraction {
  side?: CommandSide; // BUY or SELL (from AI extraction)
  symbol?: string;
  entry?: number;
  takeProfits?: Array<{ price?: number; pips?: number }>;
  stopLoss?: { price?: number; pips?: number };
}

/**
 * Context for message edit handling
 */
interface MessageEditContext {
  messageId: number;
  channelId: string;
  accountId: string;
  traceToken: string;
}

/**
 * Service to handle message edit detection and corrective actions
 *
 * Responsibilities:
 * - Detect if a message has been edited by checking for existing orders
 * - Determine the appropriate corrective action based on what changed
 * - Generate execution payloads (CLOSE_ALL, CANCEL, SET_TP_SL)
 * - Add audit trails to order history
 */
export class MessageEditHandlerService {
  constructor(
    private readonly orderService: OrderService,
    private readonly logger: LoggerInstance,
    private readonly pushNotificationService?: PushNotificationService,
  ) {}

  /**
   * Handle message edit detection and generate appropriate execution payloads
   *
   * This method checks if an order already exists for this account/message combination.
   * If found, it determines the appropriate edit action and returns execution payloads.
   *
   * @returns Object with payloads array and skipNormalFlow flag:
   *   - payloads: Array of execution payloads to execute (CLOSE_ALL/CANCEL/SET_TP_SL)
   *   - skipNormalFlow: true if should skip normal command transformation (IGNORE/UPDATE_TP_SL)
   */
  async handleMessageEdit(
    extraction: CommandExtraction | undefined,
    context: MessageEditContext,
    session: ClientSession,
  ): Promise<{
    payloads: ExecuteOrderRequestPayload[];
    skipNormalFlow: boolean;
  }> {
    const { messageId, channelId, accountId, traceToken } = context;

    // Check for existing order for THIS account
    const existingOrder = await this.orderService.findOrderByMessageId(
      messageId,
      channelId,
      accountId,
      session,
    );

    if (!existingOrder) {
      // No existing order - not an edit
      return { payloads: [], skipNormalFlow: false };
    }

    // Message edit detected - determine action
    const oldCommand = this.extractCommandFromOrder(existingOrder);
    const action = this.determineEditAction(oldCommand, extraction);

    this.logger.info(
      {
        messageId,
        channelId,
        accountId,
        traceToken,
        orderId: existingOrder.orderId,
        action,
        oldSide: oldCommand.side,
        newSide: extraction?.side,
        oldSymbol: oldCommand.symbol,
        newSymbol: extraction?.symbol,
      },
      `Message edit detected for account - Action: ${action}`,
    );

    // Generate execution payloads based on action
    return this.generatePayloadsForAction(
      action,
      existingOrder,
      extraction,
      context,
      oldCommand,
      session,
    );
  }

  /**
   * Generate execution payloads based on the determined edit action
   */
  private async generatePayloadsForAction(
    action: MessageEditAction,
    existingOrder: Order,
    extraction: CommandExtraction | undefined,
    context: MessageEditContext,
    oldCommand: ExtractedCommand,
    session: ClientSession,
  ): Promise<{
    payloads: ExecuteOrderRequestPayload[];
    skipNormalFlow: boolean;
  }> {
    const { messageId, channelId, accountId, traceToken } = context;

    switch (action) {
      case MessageEditAction.CLOSE_AND_RECREATE:
        // Add audit trail
        await this.orderService.addEditAuditTrail(
          existingOrder.orderId,
          'CLOSE_AND_RECREATE',
          `Side or symbol changed: ${oldCommand.side}/${oldCommand.symbol} → ${extraction?.side}/${extraction?.symbol}`,
          session,
        );

        // Send critical notification
        await this.sendCriticalEditNotification(
          'CLOSE_AND_RECREATE',
          existingOrder,
          oldCommand,
          extraction,
          context,
        );

        // Generate CLOSE_ALL payload to close the existing OPEN order
        return {
          payloads: [
            {
              orderId: existingOrder.orderId,
              messageId,
              channelId,
              accountId,
              traceToken,
              symbol: existingOrder.symbol,
              command: CommandEnum.CLOSE_ALL,
              timestamp: Date.now(),
            },
          ],
          skipNormalFlow: false, // Continue to create new order
        };

      case MessageEditAction.CANCEL_AND_RECREATE:
        // Add audit trail
        await this.orderService.addEditAuditTrail(
          existingOrder.orderId,
          'CANCEL_AND_RECREATE',
          `Entry, side, or symbol changed for pending order`,
          session,
        );

        // Send critical notification
        await this.sendCriticalEditNotification(
          'CANCEL_AND_RECREATE',
          existingOrder,
          oldCommand,
          extraction,
          context,
        );

        // Generate CANCEL payload to cancel the existing PENDING order
        return {
          payloads: [
            {
              orderId: existingOrder.orderId,
              messageId,
              channelId,
              accountId,
              traceToken,
              symbol: existingOrder.symbol,
              command: CommandEnum.CANCEL,
              timestamp: Date.now(),
            },
          ],
          skipNormalFlow: false, // Continue to create new order
        };

      case MessageEditAction.UPDATE_TP_SL:
        // Add audit trail
        await this.orderService.addEditAuditTrail(
          existingOrder.orderId,
          'UPDATE_TP_SL',
          'TP/SL values changed in edited message',
          session,
        );

        // Generate SET_TP_SL payload to update TP/SL on existing order
        return {
          payloads: [
            {
              orderId: existingOrder.orderId,
              messageId,
              channelId,
              accountId,
              traceToken,
              symbol: existingOrder.symbol,
              command: CommandEnum.SET_TP_SL,
              stopLoss: extraction?.stopLoss,
              takeProfits: extraction?.takeProfits,
              timestamp: Date.now(),
            },
          ],
          skipNormalFlow: true, // Don't create new order, just update TP/SL
        };

      case MessageEditAction.IGNORE:
        this.logger.debug(
          {
            messageId,
            channelId,
            accountId,
            orderId: existingOrder.orderId,
          },
          'Message edit ignored for account - no significant changes',
        );
        // Skip normal flow - no action needed
        return { payloads: [], skipNormalFlow: true };
    }
  }

  /**
   * Extract command details from an existing order
   * Note: Returns OrderSide (LONG/SHORT), which needs to be compared with
   * CommandSide (BUY/SELL) in determineEditAction
   */
  private extractCommandFromOrder(order: Order): ExtractedCommand {
    return {
      side: order.side, // OrderSide.LONG or OrderSide.SHORT
      symbol: order.symbol,
      entry: order.entry?.entryPrice,
      status: order.status,
      takeProfits: order.tp
        ? [
            { price: order.tp.tp1Price },
            ...(order.tp.tp2Price ? [{ price: order.tp.tp2Price }] : []),
            ...(order.tp.tp3Price ? [{ price: order.tp.tp3Price }] : []),
          ]
        : [],
      stopLoss: order.sl ? { price: order.sl.slPrice } : undefined,
    };
  }

  /**
   * Determine the appropriate edit action based on what changed
   *
   * Decision Matrix:
   * 1. Side or Symbol changed → CLOSE_AND_RECREATE (OPEN) or CANCEL_AND_RECREATE (PENDING)
   * 2. Entry changed (PENDING only) → CANCEL_AND_RECREATE
   * 3. Only TP/SL changed → UPDATE_TP_SL
   * 4. No significant changes → IGNORE
   */
  private determineEditAction(
    oldCommand: ExtractedCommand,
    newExtraction: CommandExtraction | undefined,
  ): MessageEditAction {
    if (!newExtraction) {
      return MessageEditAction.IGNORE;
    }

    // Map CommandSide (BUY/SELL) to OrderSide (LONG/SHORT) for comparison
    const newSide =
      newExtraction.side === CommandSide.BUY
        ? OrderSide.LONG
        : newExtraction.side === CommandSide.SELL
          ? OrderSide.SHORT
          : undefined;

    // Check if side or symbol changed
    const sideChanged = newSide && newSide !== oldCommand.side;
    const symbolChanged =
      newExtraction.symbol && newExtraction.symbol !== oldCommand.symbol;

    if (sideChanged || symbolChanged) {
      // Side or symbol changed - need to close/cancel and recreate
      return oldCommand.status === OrderStatus.OPEN
        ? MessageEditAction.CLOSE_AND_RECREATE
        : MessageEditAction.CANCEL_AND_RECREATE;
    }

    // Check if entry changed (only relevant for PENDING orders)
    if (
      oldCommand.status === OrderStatus.PENDING &&
      newExtraction.entry !== undefined &&
      oldCommand.entry !== undefined &&
      newExtraction.entry !== oldCommand.entry
    ) {
      return MessageEditAction.CANCEL_AND_RECREATE;
    }

    // Check if TP/SL changed
    if (this.hasTpSlChanged(oldCommand, newExtraction)) {
      return MessageEditAction.UPDATE_TP_SL;
    }

    // No significant changes
    return MessageEditAction.IGNORE;
  }

  /**
   * Check if TP or SL values have changed
   */
  private hasTpSlChanged(
    oldCommand: ExtractedCommand,
    newExtraction: CommandExtraction,
  ): boolean {
    // Check if SL changed
    if (newExtraction.stopLoss) {
      const oldSL = oldCommand.stopLoss?.price;
      const newSL = newExtraction.stopLoss.price;
      if (newSL !== undefined && newSL !== oldSL) {
        return true;
      }
    }

    // Check if TP changed
    if (newExtraction.takeProfits && newExtraction.takeProfits.length > 0) {
      // Simple check: if lengths differ or any price differs
      if (newExtraction.takeProfits.length !== oldCommand.takeProfits.length) {
        return true;
      }

      for (let i = 0; i < newExtraction.takeProfits.length; i++) {
        const oldTP = oldCommand.takeProfits[i]?.price;
        const newTP = newExtraction.takeProfits[i]?.price;
        if (newTP !== undefined && newTP !== oldTP) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Send push notification for critical edit actions
   */
  private async sendCriticalEditNotification(
    action: 'CLOSE_AND_RECREATE' | 'CANCEL_AND_RECREATE',
    existingOrder: Order,
    oldCommand: ExtractedCommand,
    newExtraction: CommandExtraction | undefined,
    context: MessageEditContext,
  ): Promise<void> {
    if (!this.pushNotificationService) {
      return; // Notification service not available
    }

    try {
      const changes: string[] = [];

      // Determine what changed
      const newSide =
        newExtraction?.side === CommandSide.BUY
          ? OrderSide.LONG
          : newExtraction?.side === CommandSide.SELL
            ? OrderSide.SHORT
            : undefined;

      if (newSide && newSide !== oldCommand.side) {
        changes.push(`Side: ${oldCommand.side} → ${newSide}`);
      }

      if (newExtraction?.symbol && newExtraction.symbol !== oldCommand.symbol) {
        changes.push(`Symbol: ${oldCommand.symbol} → ${newExtraction.symbol}`);
      }

      if (
        newExtraction?.entry !== undefined &&
        oldCommand.entry !== undefined &&
        newExtraction.entry !== oldCommand.entry
      ) {
        changes.push(`Entry: ${oldCommand.entry} → ${newExtraction.entry}`);
      }

      const title = `⚠️ Critical Order Edit: ${action.replace(/_/g, ' ')}`;
      const message = [
        `Order ${existingOrder.orderId} (${oldCommand.status})`,
        `Symbol: ${existingOrder.symbol}`,
        ``,
        `Changes detected:`,
        ...changes.map((c) => `• ${c}`),
        ``,
        `Action: ${
          action === 'CLOSE_AND_RECREATE'
            ? 'Closing and recreating order'
            : 'Canceling and recreating order'
        }`,
      ].join('\n');

      await this.pushNotificationService.send({
        t: title,
        m: message,
        d: 'a', // Send to all devices
        v: '2', // Vibrate
        traceToken: context.traceToken,
      });

      this.logger.info(
        {
          orderId: existingOrder.orderId,
          action,
          changes,
        },
        'Critical edit notification sent',
      );
    } catch (error) {
      // Log error but don't fail the edit handling
      this.logger.error(
        {
          orderId: existingOrder.orderId,
          action,
          error,
        },
        'Failed to send critical edit notification',
      );
    }
  }
}
