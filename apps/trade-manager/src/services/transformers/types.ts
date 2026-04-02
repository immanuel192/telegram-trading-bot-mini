/**
 * Shared types and interfaces for command transformers
 */

import {
  ExecuteOrderRequestPayload,
  TranslateMessageResultPayload,
} from '@telegram-trading-bot-mini/shared/utils';
import { Account } from '@dal';

/**
 * Command from TRANSLATE_MESSAGE_RESULT
 */
export type TranslateMessageResultCommand =
  TranslateMessageResultPayload['commands'][number];

/**
 * Transformation context containing message and account data
 */
export interface TransformContext {
  messageId: number;
  channelId: string;
  accountId: string;
  traceToken: string;
  accountConfig?: Account['configs'];
  symbolConfig?: Account['symbols'][string];
  exchangeCode?: string;
}

/**
 * Transformer function signature
 */
export type TransformerFunction = (
  command: TranslateMessageResultCommand,
  context: TransformContext,
) => Promise<ExecuteOrderRequestPayload[] | null>;
