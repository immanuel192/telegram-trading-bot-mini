/**
 * Purpose: Batch Stream Consumer for parallel processing across channel groups
 *
 * Architecture:
 * - Extends BaseRedisStreamConsumer for shared Redis operations
 * - Groups messages by channelId:accountId
 * - Transposes groups into batches for parallel processing
 * - Processes batches SEQUENTIALLY to maintain ordering within groups
 * - Within each batch, handler can process messages in parallel
 * - Tracks per-message success/failure for granular ACK management
 *
 * Key Features:
 * - Batch handler signature: accepts array of messages, returns array of results
 * - Transpose algorithm: creates batches where each batch has at most one message per group
 * - Per-message ACK tracking: only ACK successful messages
 * - Retry logic: retry failed messages with exponential backoff
 * - DLQ support: ACK failed messages after max retries
 *
 * Processing Flow:
 * 1. Fetch messages (XREADGROUP)
 * 2. Group by channelId:accountId
 * 3. Transpose groups into batches
 * 4. For each batch (sequentially):
 *    a. Call batch handler
 *    b. ACK successful messages
 *    c. Retry failed messages
 *    d. After max retries: ACK failed messages (DLQ)
 */

import { BaseRedisStreamConsumer } from './base-redis-stream-consumer';
import {
  StreamMessage,
  StreamTopic,
  BatchMessageHandler,
  IStreamConsumer,
} from '../stream-interfaces';
import { MessageType } from '../../interfaces/messages/message-type';

/**
 * Batch Stream Consumer
 * Processes messages in batches for improved I/O-bound performance
 */
export class BatchStreamConsumer
  extends BaseRedisStreamConsumer
  implements IStreamConsumer<BatchMessageHandler<MessageType>>
{
  /**
   * Internal consume loop - implements batch processing strategy
   */
  protected async _consumeLoop<T extends MessageType>(
    topic: StreamTopic,
    groupName: string,
    consumerName: string,
    handler: BatchMessageHandler<T>
  ): Promise<void> {
    while (this.isRunning) {
      try {
        // Fetch messages using base class method
        const messages = await this.fetchMessages(
          topic,
          groupName,
          consumerName,
          20 // Fetch up to 20 messages
        );

        if (messages.length > 0) {
          // Step 1: Parse and group messages by channelId:accountId
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

            // Validate message
            const isValid = await this.validateMessage(message, id);
            if (!isValid) {
              // Invalid/expired message - ACK and skip
              await this.ackMessage(topic, groupName, id);
              continue;
            }

            // Extract grouping key: channelId:accountId (or just channelId if no accountId)
            const channelId = message.payload.channelId;
            const accountId = (message.payload as any).accountId;
            const groupKey = accountId
              ? `${channelId}:${accountId}`
              : channelId;

            if (!messagesByGroup.has(groupKey)) {
              messagesByGroup.set(groupKey, []);
            }
            messagesByGroup.get(groupKey)!.push({ id, message });
          }

          // Step 2: Transpose groups into batches
          const batches = this.transposeToBatches(messagesByGroup);

          this.logger?.debug(
            {
              topic,
              totalGroups: messagesByGroup.size,
              totalBatches: batches.length,
              totalMessages: messages.length,
            },
            'Processing batches sequentially'
          );

          // Step 3: Process each batch sequentially (for loop, not Promise.allSettled)
          for (const batch of batches) {
            await this.processBatch(batch, handler, topic, groupName);
          }
        }
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

  /**
   * Transpose groups into batches
   * Each batch contains at most one message from each group
   * Batches are ordered by depth (message position within group)
   *
   * Example:
   * Group A: [A0, A1, A2]
   * Group B: [B0, B1]
   * Group C: [C0]
   *
   * Result:
   * Batch 0: [A0, B0, C0]
   * Batch 1: [A1, B1]
   * Batch 2: [A2]
   */
  private transposeToBatches<T extends MessageType>(
    messagesByGroup: Map<
      string,
      Array<{ id: string; message: StreamMessage<T> }>
    >
  ): Array<
    Array<{
      id: string;
      message: StreamMessage<T>;
      groupKey: string;
    }>
  > {
    const batches: Array<
      Array<{
        id: string;
        message: StreamMessage<T>;
        groupKey: string;
      }>
    > = [];

    // Find maximum depth across all groups
    const maxDepth = Math.max(
      ...Array.from(messagesByGroup.values()).map((msgs) => msgs.length),
      0
    );

    // For each depth level, collect one message from each group
    for (let depth = 0; depth < maxDepth; depth++) {
      const batch: Array<{
        id: string;
        message: StreamMessage<T>;
        groupKey: string;
      }> = [];

      for (const [groupKey, messages] of messagesByGroup.entries()) {
        if (messages[depth]) {
          batch.push({
            ...messages[depth],
            groupKey,
          });
        }
      }

      if (batch.length > 0) {
        batches.push(batch);
      }
    }

    return batches;
  }

  /**
   * Process a single batch with retry logic
   * Tracks per-message success/failure for granular ACK management
   */
  private async processBatch<T extends MessageType>(
    batch: Array<{
      id: string;
      message: StreamMessage<T>;
      groupKey: string;
    }>,
    handler: BatchMessageHandler<T>,
    topic: StreamTopic,
    groupName: string
  ): Promise<void> {
    let remainingMessages = batch;
    let retries = 0;

    while (retries <= this.retryConfig.maxRetries) {
      try {
        // Call handler with current batch
        const results = await handler(remainingMessages);

        // ACK successful messages
        const successIds = results.filter((r) => r.success).map((r) => r.id);

        await Promise.all(
          successIds.map((id) => this.ackMessage(topic, groupName, id))
        );

        // Filter to only failed messages for retry
        const failedIds = results.filter((r) => !r.success).map((r) => r.id);

        if (failedIds.length === 0) {
          // All succeeded
          return;
        }

        remainingMessages = batch.filter((m) => failedIds.includes(m.id));

        // Check if max retries exceeded
        if (retries >= this.retryConfig.maxRetries) {
          // ACK failed messages to prevent infinite loop (DLQ)
          await Promise.all(
            failedIds.map((id) => this.ackMessage(topic, groupName, id))
          );

          // Capture errors
          results
            .filter((r) => !r.success)
            .forEach((r) => {
              this.logger?.error(
                { id: r.id, error: r.error },
                'Max retries exceeded for message'
              );
              this.errorCapture?.captureException(
                r.error || new Error('Unknown error'),
                { id: r.id, retries }
              );
            });

          return;
        }

        // Exponential backoff
        retries++;
        const delay = Math.min(
          this.retryConfig.initialDelayMs *
            Math.pow(this.retryConfig.backoffMultiplier, retries - 1),
          this.retryConfig.maxDelayMs
        );

        this.logger?.warn(
          {
            retries,
            maxRetries: this.retryConfig.maxRetries,
            failedCount: failedIds.length,
            delay,
          },
          `Retrying ${failedIds.length} failed messages`
        );

        await this.sleep(delay);
      } catch (error) {
        // Handler threw an error (not returned in results)
        retries++;

        if (retries > this.retryConfig.maxRetries) {
          // ACK all to prevent infinite loop
          await Promise.all(
            batch.map((m) => this.ackMessage(topic, groupName, m.id))
          );
          this.errorCapture?.captureException(error as Error, {
            batchSize: batch.length,
            retries,
          });
          return;
        }

        const delay = Math.min(
          this.retryConfig.initialDelayMs *
            Math.pow(this.retryConfig.backoffMultiplier, retries - 1),
          this.retryConfig.maxDelayMs
        );

        this.logger?.warn(
          {
            retries,
            maxRetries: this.retryConfig.maxRetries,
            error: (error as Error).message,
            delay,
          },
          'Handler error, retrying entire batch'
        );

        await this.sleep(delay);
      }
    }
  }

  /**
   * Override stop to wait for consume loop to finish
   */
  override async stop(): Promise<void> {
    await super.stop();
    // Wait for the consume loop to finish
    if (this.consumeLoopPromise) {
      await this.consumeLoopPromise;
    }
  }
}
