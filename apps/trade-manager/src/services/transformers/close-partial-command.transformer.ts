/**
 * Close Partial command utilities
 */

import {
  ExecuteOrderRequestPayload,
  CommandEnum,
} from '@telegram-trading-bot-mini/shared/utils';

/**
 * Utility function to generate ExecuteOrderRequestPayload for CLOSE_PARTIAL
 */
export function transformToClosePartialPayload(params: {
  orderId: string;
  messageId: number;
  channelId: string;
  accountId: string;
  traceToken: string;
  symbol: string;
  lotSize?: number;
  takeProfits?: ExecuteOrderRequestPayload['takeProfits'];
  timestamp: number;
}): ExecuteOrderRequestPayload {
  return {
    ...params,
    command: CommandEnum.CLOSE_PARTIAL,
  };
}

/**
 * Helper to generate numeric messageId for TP tiers
 * Logic: originalMessageId * 100 + tierIndex (e.g., TP1 index 1 -> 12301)
 * @param originalMessageId The messageId of the original signal
 * @param tierIndex The 1-based index of the take profit tier (1, 2, 3...)
 */
export function generateTpTierMessageId(
  originalMessageId: number,
  tierIndex: number,
): number {
  return originalMessageId * 100 + tierIndex;
}
