/**
 * Purpose: Default message validator implementation (placeholder)
 * Inputs: StreamMessage with typed payload
 * Outputs: MessageValidationResult (always valid for now)
 * Core Flow: Accept any message → Check expiry if exp field exists → Return result
 */

import {
  IMessageValidator,
  MessageValidationResult,
  StreamMessage,
} from '../stream-interfaces';
import { MessageType } from '../../interfaces/messages/message-type';

/**
 * Default message validator implementation
 */
export class DefaultMessageValidator implements IMessageValidator {
  async validate<T extends MessageType>(
    _message: StreamMessage<T>
  ): Promise<MessageValidationResult> {
    // Placeholder: Always return valid for now
    // TODO: Implement schema validation per message type
    return { valid: true };
  }

  isExpired<T extends MessageType>(message: StreamMessage<T>): boolean {
    // Check if message has exp field and if it's expired
    // Safely access exp field without assuming payload type
    const payload = message.payload;
    if (
      payload &&
      typeof payload === 'object' &&
      'exp' in payload &&
      typeof payload.exp === 'number'
    ) {
      return Date.now() > payload.exp;
    }
    return false;
  }
}
