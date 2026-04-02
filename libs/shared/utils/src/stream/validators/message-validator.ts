/**
 * Purpose: Validate stream messages using TypeBox schemas
 * Inputs: StreamMessage with typed payload
 * Outputs: MessageValidationResult with validation status and error details
 * Core Flow: Extract message type → Get corresponding TypeBox schema → Validate payload → Return detailed result
 */

import { TSchema } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import {
  IMessageValidator,
  MessageValidationResult,
  StreamMessage,
} from '../stream-interfaces';
import { MessageType } from '../../interfaces/messages/message-type';
import { NewMessagePayloadSchema } from '../../interfaces/messages/new-message';
import { TranslateMessageRequestPayloadSchema } from '../../interfaces/messages/translate-message-request';
import { TranslateMessageResultPayloadSchema } from '../../interfaces/messages/translate-message-result';
import { SymbolFetchLatestPricePayloadSchema } from '../../interfaces/messages/symbol-fetch-latest-price';
import { ExecuteOrderRequestPayloadSchema } from '../../interfaces/messages/execute-order-request-payload';
import { ExecuteOrderResultPayloadSchema } from '../../interfaces/messages/execute-order-result-payload';
import { LivePriceUpdatePayloadSchema } from '../../interfaces/messages/live-price-update-payload';

/**
 * Map message types to their TypeBox schemas
 */
const MESSAGE_SCHEMAS: Record<MessageType, TSchema> = {
  [MessageType.NEW_MESSAGE]: NewMessagePayloadSchema,
  [MessageType.TRANSLATE_MESSAGE_REQUEST]: TranslateMessageRequestPayloadSchema,
  [MessageType.TRANSLATE_MESSAGE_RESULT]: TranslateMessageResultPayloadSchema,
  [MessageType.SYMBOL_FETCH_LATEST_PRICE]: SymbolFetchLatestPricePayloadSchema,
  [MessageType.EXECUTE_ORDER_REQUEST]: ExecuteOrderRequestPayloadSchema,
  [MessageType.EXECUTE_ORDER_RESULT]: ExecuteOrderResultPayloadSchema,
  [MessageType.LIVE_PRICE_UPDATE]: LivePriceUpdatePayloadSchema,
};

/**
 * Compile schemas for better performance
 */
const COMPILED_SCHEMAS = Object.fromEntries(
  Object.entries(MESSAGE_SCHEMAS).map(([type, schema]) => [
    type,
    TypeCompiler.Compile(schema),
  ])
) as Record<MessageType, ReturnType<typeof TypeCompiler.Compile>>;

/**
 * Default message validator using TypeBox schemas
 */
export class MessageValidator implements IMessageValidator {
  /**
   * Validate a stream message against its TypeBox schema
   */
  async validate<T extends MessageType>(
    message: StreamMessage<T>
  ): Promise<MessageValidationResult> {
    const compiledSchema = COMPILED_SCHEMAS[message.type];

    if (!compiledSchema) {
      return {
        valid: false,
        error: `Unknown message type: ${message.type}`,
      };
    }

    const isValid = compiledSchema.Check(message.payload);

    if (!isValid) {
      // Get first validation error for detailed logging
      const errors = [...compiledSchema.Errors(message.payload)];
      const firstError = errors[0];

      if (firstError) {
        return {
          valid: false,
          error: `Validation failed at '${firstError.path}': ${firstError.message}`,
        };
      }

      return {
        valid: false,
        error: 'Validation failed: Unknown error',
      };
    }

    return { valid: true };
  }

  /**
   * Check if a message has expired based on its exp timestamp
   */
  isExpired<T extends MessageType>(message: StreamMessage<T>): boolean {
    // Check if payload has exp field
    const payload = message.payload as any;

    if (!payload.exp || typeof payload.exp !== 'number') {
      return false;
    }

    return Date.now() > payload.exp;
  }
}
