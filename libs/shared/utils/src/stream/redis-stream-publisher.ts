/**
 * Purpose: Redis Stream Publisher implementation using native Redis (ioredis)
 * Inputs: Redis connection config, stream topic, message
 * Outputs: Stream entry ID
 * Core Flow: Connect to Redis → Serialize message → XADD to stream → Return entry ID
 */

import * as Sentry from '@sentry/node';
import Redis from 'ioredis';
import {
  IStreamPublisher,
  StreamMessage,
  StreamTopic,
  RedisStreamConfig,
} from './stream-interfaces';
import { MessageType } from '../interfaces/messages/message-type';
import { LoggerInstance } from '../interfaces';

export class RedisStreamPublisher implements IStreamPublisher {
  private _client: Redis;
  private logger?: LoggerInstance;

  /**
   * return client Redis instance
   */
  get client(): Redis {
    return this._client;
  }

  constructor(config: RedisStreamConfig) {
    this._client = new Redis(config.url);
    this.logger = config.logger;
  }

  async publish<T extends MessageType>(
    topic: StreamTopic,
    message: StreamMessage<T>
  ): Promise<string> {
    return await Sentry.startSpan(
      {
        name: `stream.publish.${topic}`,
        op: 'queue.publish',
        attributes: {
          'messaging.system': 'redis',
          'messaging.destination': topic,
          'messaging.message.type': message.type,
        },
      },
      async (span) => {
        // Inject Sentry trace context into message
        const traceData = Sentry.getTraceData();
        const enrichedMessage: StreamMessage<T> = {
          ...message,
          _sentryTrace: traceData['sentry-trace'] || undefined,
          _sentryBaggage: traceData.baggage || undefined,
        };

        // Add traceToken as span attribute for searchability
        if ('traceToken' in message.payload) {
          span.setAttribute('traceToken', (message.payload as any).traceToken);
        }
        span.setAttribute('messageType', message.type);

        // Serialize message to Redis Stream format
        // XADD stream * field1 value1 field2 value2 ...
        const entryId = await this._client.xadd(
          topic as string,
          '*', // Auto-generate ID
          'version',
          enrichedMessage.version,
          'type',
          enrichedMessage.type,
          'payload',
          JSON.stringify(enrichedMessage.payload),
          // Add Sentry trace fields if present
          ...(enrichedMessage._sentryTrace
            ? ['_sentryTrace', enrichedMessage._sentryTrace]
            : []),
          ...(enrichedMessage._sentryBaggage
            ? ['_sentryBaggage', enrichedMessage._sentryBaggage]
            : [])
        );

        // Add messageId as span attribute
        span.setAttribute('messageId', entryId as string);

        this.logger?.debug(
          { topic, entryId, type: message.type },
          'Published message to stream'
        );

        return entryId as string;
      }
    );
  }

  async close(): Promise<void> {
    await this._client.quit();
  }
}
