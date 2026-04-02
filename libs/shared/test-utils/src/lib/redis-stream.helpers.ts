/**
 * Redis stream testing utilities
 * Purpose: Helper functions for reading and parsing Redis stream messages in tests
 */

import type { Redis } from 'ioredis';

/**
 * Parsed stream message with type and payload
 */
export interface ParsedStreamMessage<T = any> {
  id: string;
  version: string;
  type: string;
  payload: T;
  _sentryTrace?: string;
  _sentryBaggage?: string;
}

/**
 * Read and parse all messages from a Redis stream
 * @param client Redis client
 * @param streamKey Stream key/topic
 * @returns Array of parsed messages
 */
export async function readStreamMessages<T = any>(
  client: Redis,
  streamKey: string
): Promise<ParsedStreamMessage<T>[]> {
  const messages = await client.xrange(streamKey, '-', '+');

  return messages.map((message) => {
    const [id, fields] = message;

    // Parse fields array [field1, value1, field2, value2, ...]
    const fieldMap: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      fieldMap[fields[i]] = fields[i + 1];
    }

    return {
      id,
      version: fieldMap['version'] || '1.0',
      type: fieldMap['type'],
      payload: fieldMap['payload'] ? JSON.parse(fieldMap['payload']) : {},
      _sentryTrace: fieldMap['_sentryTrace'],
      _sentryBaggage: fieldMap['_sentryBaggage'],
    };
  });
}

/**
 * Read the last N messages from a Redis stream
 * @param client Redis client
 * @param streamKey Stream key/topic
 * @param count Number of messages to read (default: 1)
 * @returns Array of parsed messages
 */
export async function readLastStreamMessages<T = any>(
  client: Redis,
  streamKey: string,
  count: number = 1
): Promise<ParsedStreamMessage<T>[]> {
  const allMessages = await readStreamMessages<T>(client, streamKey);
  return allMessages.slice(-count);
}

/**
 * Read the last message from a Redis stream
 * @param client Redis client
 * @param streamKey Stream key/topic
 * @returns Parsed message or null if stream is empty
 */
export async function readLastStreamMessage<T = any>(
  client: Redis,
  streamKey: string
): Promise<ParsedStreamMessage<T> | null> {
  const messages = await readLastStreamMessages<T>(client, streamKey, 1);
  return messages.length > 0 ? messages[0] : null;
}

/**
 * Count messages in a Redis stream
 * @param client Redis client
 * @param streamKey Stream key/topic
 * @returns Number of messages
 */
export async function countStreamMessages(
  client: Redis,
  streamKey: string
): Promise<number> {
  const messages = await client.xrange(streamKey, '-', '+');
  return messages.length;
}
