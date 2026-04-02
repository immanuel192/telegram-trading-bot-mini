/**
 * Purpose: Define the execution context for the command processing pipeline.
 * Captures all state required to process a command from a translated result.
 */

import { Account } from '@dal';
import {
  BaseActionPipelineContext,
  ExecuteOrderRequestPayload,
  StreamMessage,
  MessageType,
} from '@telegram-trading-bot-mini/shared/utils';

export type TranslateMessageResultCommand =
  StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT>['payload']['commands'][number];

export interface CommandProcessingState {
  /** The account used for processing */
  account: Account;
  /** The command being processed */
  command: TranslateMessageResultCommand;
  /** Generated payloads for execution-service */
  executePayloads: ExecuteOrderRequestPayload[];
  /** The specific payload used for order creation*/
  orderCreationPayload?: ExecuteOrderRequestPayload;
  /** Whether to skip the normal flow (e.g., if message edit logic handled it) */
  skipNormalFlow?: boolean;
  /** Result of order creation if applicable */
  orderCreated?: boolean;
  /** Error occurred during processing */
  error?: Error;
}

export interface CommandProcessingContext extends BaseActionPipelineContext {
  /** Common message metadata */
  messageContext: {
    messageId: number;
    channelId: string;
    traceToken: string;
    sentryTrace?: string;
    sentryBaggage?: string;
  };
  /** Pipeline state */
  state: CommandProcessingState;
}
