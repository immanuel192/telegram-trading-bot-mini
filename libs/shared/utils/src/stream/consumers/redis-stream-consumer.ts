/**
 * Purpose: Redis Stream Consumer with concurrent processing by channelId:accountId
 *
 * Current Architecture:
 * - Fetches messages in batches using XREADGROUP with BLOCK (default 500ms)
 * - Groups messages by channelId:accountId (or channelId if no accountId) in-memory
 * - Processes each group's messages concurrently (Promise.allSettled)
 * - Within each group, processes messages sequentially to maintain order
 * - Validates messages during processing (concurrent per group)
 * - On failure: stops processing that group, doesn't ACK failed/subsequent messages
 *
 * Benefits:
 * - Messages from different accounts process in parallel (even on same channel)
 * - Order preserved within each account
 * - Failed groups don't block other groups
 * - Clear error boundaries per account
 * - Backward compatible: messages without accountId still group by channelId
 *
 * Future Scaling Options:
 * 1. Active Stream Split (10-50 channels):
 *    - Create separate streams per channel: `MESSAGES:channel_1`, `MESSAGES:channel_2`
 *    - One consumer per channel for true isolation
 *    - Easier horizontal scaling across instances
 *
 * 2. Sharding by channelCode (50+ channels):
 *    - Hash channelCode to shard ID: `MESSAGES:shard_0`, `MESSAGES:shard_1`
 *    - Multiple channels per shard
 *    - Balance load across shards
 *
 * 3. Migration to Kafka (high throughput):
 *    - Use channelId as partition key for natural partitioning
 *    - Better built-in scaling and replication
 *    - Consumer groups with automatic rebalancing
 *
 * Core Flow:
 * Connect → XREADGROUP (BLOCK) → Parse → Group by channelId:accountId →
 * Process concurrently (validate + handle) → ACK on success
 */

import { BaseRedisStreamConsumer } from './base-redis-stream-consumer';
import {
  IStreamConsumer,
  StreamMessage,
  StreamTopic,
  RedisStreamConsumerConfig,
  MessageHandler,
} from '../stream-interfaces';
import { MessageType } from '../../interfaces/messages/message-type';

export class RedisStreamConsumer
  extends BaseRedisStreamConsumer
  implements IStreamConsumer<MessageHandler<MessageType>>
{
  private maxConcurrentGroups: number;

  constructor(config: RedisStreamConsumerConfig) {
    super(config);
    this.maxConcurrentGroups = config.maxConcurrentGroups ?? 10; // Default 10 concurrent groups
  }

  /**
   * Internal consume loop that uses blocking reads (no polling!)
   * Implements the abstract method from BaseRedisStreamConsumer
   */
  protected async _consumeLoop<T extends MessageType>(
    topic: StreamTopic,
    groupName: string,
    consumerName: string,
    handler: (message: StreamMessage<T>, id: string) => Promise<void>
  ): Promise<void> {
    while (this.isRunning) {
      try {
        // Use base class method to fetch messages
        const messages = await this.fetchMessages(
          topic,
          groupName,
          consumerName,
          20 // Increased from 10 to 20: with 3 msgs/channel, can handle ~6 channels concurrently
        );

        if (messages.length > 0) {
          // Step 1: Parse and group messages by channelId:accountId (or channelId if no accountId)
          // No validation yet - we'll validate concurrently during processing
          const messagesByGroup = new Map<
            string,
            Array<{ id: string; message: StreamMessage<T> }>
          >();

          for (const [id, fieldsArray] of messages) {
            // Use base class method to parse message
            const parsed = this.parseMessage<T>(id, fieldsArray);

            if (!parsed) {
              // Parsing failed - ACK and skip this message
              await this.ackMessage(topic, groupName, id);
              continue;
            }

            const { message } = parsed;

            // Extract grouping key: channelId:accountId (or just channelId if no accountId)
            // This enables parallel processing per account, even on the same channel
            const channelId = message.payload.channelId;
            const accountId = (message.payload as any).accountId; // Optional: may be undefined for some message types
            const groupKey = accountId
              ? `${channelId}:${accountId}`
              : channelId;

            if (!messagesByGroup.has(groupKey)) {
              messagesByGroup.set(groupKey, []);
            }
            messagesByGroup.get(groupKey)!.push({ id, message });
          }

          // Step 2: Process each group's messages with concurrency control
          // Validation happens during processing (concurrent per group, batched to prevent overload)
          const groupEntries = Array.from(messagesByGroup.entries());

          this.logger?.debug(
            {
              topic,
              totalGroups: groupEntries.length,
              maxConcurrent: this.maxConcurrentGroups,
            },
            'Processing groups with concurrency control'
          );

          const results = await this.processBatched(
            groupEntries,
            async ([groupKey, groupMessages]) => {
              // Process messages in this group sequentially to maintain order
              for (const { id, message } of groupMessages) {
                try {
                  // Use base class method to validate message
                  const isValid = await this.validateMessage(message, id);
                  if (!isValid) {
                    // Acknowledge invalid/expired message to remove from stream
                    await this.ackMessage(topic, groupName, id);
                    continue; // Skip to next message in this group
                  }

                  // Process message with retry
                  await this.processWithRetry(
                    message,
                    id,
                    handler,
                    topic,
                    groupName
                  );
                  // Message processed successfully and ACKed
                } catch (error) {
                  // Message processing failed - stop processing this channel
                  // Don't ACK this message or subsequent messages in this channel
                  // They will be retried on next fetch
                  this.logger?.error(
                    {
                      groupKey,
                      messageId: id,
                      error:
                        error instanceof Error ? error.message : String(error),
                    },
                    'Message processing failed, stopping group processing'
                  );
                  throw error; // Propagate to Promise.allSettled
                }
              }
              return { groupKey, processed: groupMessages.length };
            },
            this.maxConcurrentGroups
          );

          // Log results per channel
          const successful = results.filter((r) => r.status === 'fulfilled');
          const failed = results.filter((r) => r.status === 'rejected');

          if (successful.length > 0) {
            this.logger?.debug(
              {
                topic,
                totalMessages: messages.length,
                groupsProcessed: successful.length,
                groupsFailed: failed.length,
              },
              'Processed messages concurrently by group (channelId:accountId)'
            );
          }

          if (failed.length > 0) {
            this.logger?.warn(
              {
                topic,
                groupsFailed: failed.length,
                totalGroups: messagesByGroup.size,
              },
              'Some groups failed processing, messages will be retried'
            );
          }
        }
        // No explicit wait needed - BLOCK parameter handles it!
      } catch (error) {
        if (this.isRunning) {
          this.logger?.error(
            { error, topic, groupName, consumerName },
            'Error consuming from stream'
          );
          this.errorCapture?.captureException(error as Error, {
            topic,
            groupName,
            consumerName,
          });
          // Wait before retrying
          await this.sleep(200);
        }
      }
    }
  }

  private async processWithRetry<T extends MessageType>(
    message: StreamMessage<T>,
    id: string,
    handler: (message: StreamMessage<T>, id: string) => Promise<void>,
    topic: StreamTopic,
    groupName: string
  ): Promise<void> {
    let retries = 0;
    let delay = this.retryConfig.initialDelayMs;

    while (retries <= this.retryConfig.maxRetries) {
      try {
        await handler(message, id);

        // Use base class method to acknowledge the message on success
        await this.ackMessage(topic, groupName, id);
        return;
      } catch (error) {
        retries++;

        if (retries > this.retryConfig.maxRetries) {
          // Max retries exceeded
          this.logger?.error(
            { id, message, error, retries },
            'Max retries exceeded for message'
          );
          this.errorCapture?.captureException(error as Error, {
            id,
            message,
            retries,
          });

          // TODO: Move to Dead Letter Queue
          // For now, acknowledge to prevent infinite retries
          await this.ackMessage(topic, groupName, id);
          return;
        }

        // Exponential backoff
        this.logger?.warn(
          {
            retries,
            maxRetries: this.retryConfig.maxRetries,
            messageId: id,
            delay,
            error: (error as Error).message,
          },
          `Retry ${retries}/${this.retryConfig.maxRetries} for message ${id}`
        );

        await this.sleep(delay);
        delay = Math.min(
          delay * this.retryConfig.backoffMultiplier,
          this.retryConfig.maxDelayMs
        );
      }
    }
  }

  /**
   * Process items in batches to control concurrency
   * Prevents resource exhaustion when processing many groups
   */
  private async processBatched<T>(
    items: T[],
    processor: (item: T) => Promise<any>,
    batchSize: number
  ): Promise<PromiseSettledResult<any>[]> {
    const results: PromiseSettledResult<any>[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map((item) => processor(item))
      );
      results.push(...batchResults);

      // Log batch completion
      if (this.logger && items.length > batchSize) {
        this.logger.debug(
          {
            batchNumber: Math.floor(i / batchSize) + 1,
            totalBatches: Math.ceil(items.length / batchSize),
            batchSize: batch.length,
            processedSoFar: Math.min(i + batchSize, items.length),
            total: items.length,
          },
          'Batch processing progress'
        );
      }
    }

    return results;
  }

  override async stop(): Promise<void> {
    await super.stop();
    // Wait for the consume loop to finish
    if (this.consumeLoopPromise) {
      await this.consumeLoopPromise;
    }
  }

  override async close(): Promise<void> {
    await this.stop();
    await this.client.quit();
  }
}
