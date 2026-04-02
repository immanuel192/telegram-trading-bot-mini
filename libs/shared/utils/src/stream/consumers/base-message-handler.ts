/**
 * Purpose: Base class for all message type handlers.
 * Provides common structure for processing different message types from Redis Stream.
 * Each message type should have its own handler extending this base class.
 */

import * as Sentry from '@sentry/node';
import { StreamMessage } from '../stream-interfaces';
import { MessageType } from '../../interfaces/messages/message-type';
import { LoggerInstance } from '../../interfaces';
import { IErrorCapture } from '../../error-capture';

/**
 * Abstract base class for message handlers
 * Each message type (TRANSLATE_MESSAGE_REQUEST, etc.) should have a concrete handler extending this
 */
export abstract class BaseMessageHandler<T extends MessageType> {
  constructor(
    protected readonly logger: LoggerInstance,
    protected readonly errorCapture: IErrorCapture
  ) {}

  /**
   * Handle incoming message events from the stream
   * @param message - The stream message with typed payload
   * @param id - The stream message ID
   */
  abstract handle(message: StreamMessage<T>, id: string): Promise<void>;

  /**
   * Process a message with distributed tracing support.
   * Extracts Sentry trace context from the message and continues the trace.
   *
   * @param message - The stream message with typed payload
   * @param id - The stream message ID
   * @param handler - The handler function to execute within the trace context
   */
  protected async processWithTracing<TMsg extends MessageType>(
    message: StreamMessage<TMsg>,
    id: string,
    handler: () => Promise<void>
  ): Promise<void> {
    // Extract Sentry trace context from message (handle undefined gracefully)
    const sentryTrace = message._sentryTrace;
    const baggage = message._sentryBaggage;

    // Continue the trace if context exists, otherwise start fresh
    return await Sentry.continueTrace(
      {
        sentryTrace: sentryTrace || '',
        baggage: baggage || '',
      },
      async () => {
        // Wrap handler execution in a span
        return await Sentry.startSpan(
          {
            name: `stream.consume.${message.type}`,
            op: 'queue.process',
            attributes: {
              'messaging.system': 'redis',
              'messaging.message.id': id,
              'messaging.message.type': message.type,
            },
          },
          async (span) => {
            // Add traceToken and streamMessageId as span attributes for searchability
            if ('traceToken' in message.payload) {
              span.setAttribute(
                'traceToken',
                (message.payload as any).traceToken
              );
            }
            span.setAttribute('streamMessageId', id);

            // Execute the handler logic
            await handler();
          }
        );
      }
    );
  }

  /**
   * Common logging helper for all handlers
   */
  protected logMessageReceived(
    id: string,
    messageType: T,
    payload: Record<string, any>
  ): void {
    this.logger.info(
      {
        streamMessageId: id,
        messageType,
        ...payload,
      },
      `Received ${messageType} event`
    );
  }

  /**
   * Common error logging helper for all handlers
   */
  protected logError(
    id: string,
    messageType: T,
    error: Error,
    context?: Record<string, any>
  ): void {
    this.logger.error(
      {
        streamMessageId: id,
        messageType,
        error: error.message,
        stack: error.stack,
        ...context,
      },
      `Error processing ${messageType} event`
    );
  }
}
