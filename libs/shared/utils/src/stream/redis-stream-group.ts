import Redis from 'ioredis';

/**
 * Creates a consumer group for a Redis stream.
 *
 * @param redis - Redis client instance (ioredis)
 * @param streamKey - The stream key/topic
 * @param groupName - Name of the consumer group
 * @param startId - Starting ID for the group (default: '0' for all messages, '$' for new messages only)
 * @returns Promise that resolves when group is created
 */
export async function createConsumerGroup(
  redis: Redis,
  streamKey: string,
  groupName: string,
  startId = '0'
): Promise<void> {
  try {
    // MKSTREAM creates the stream if it doesn't exist
    await redis.xgroup('CREATE', streamKey, groupName, startId, 'MKSTREAM');
  } catch (error: any) {
    // Ignore error if group already exists
    if (!error?.message?.includes('BUSYGROUP')) {
      throw error;
    }
  }
}

/**
 * Deletes a consumer group from a Redis stream.
 *
 * @param redis - Redis client instance (ioredis)
 * @param streamKey - The stream key/topic
 * @param groupName - Name of the consumer group to delete
 */
export async function deleteConsumerGroup(
  redis: Redis,
  streamKey: string,
  groupName: string
): Promise<void> {
  try {
    await redis.xgroup('DESTROY', streamKey, groupName);
  } catch (error) {
    // Ignore errors if group doesn't exist
  }
}

/**
 * Deletes a Redis stream (and all its consumer groups).
 * Avoid calling this function unless you have clear intention. Use trimStream instead.
 * @param redis - Redis client instance (ioredis)
 * @param streamKey - The stream key/topic
 */
export async function deleteStream(
  redis: Redis,
  streamKey: string
): Promise<void> {
  try {
    await redis.del(streamKey);
  } catch (error) {
    // Ignore errors if stream doesn't exist
  }
}

/**
 * Trim the given stream
 * @param redis
 * @param streamKey
 */
export async function trimStream(
  redis: Redis,
  streamKey: string,
  keep = 0
): Promise<void> {
  try {
    await redis.xtrim(streamKey, 'MAXLEN', keep);
  } catch (error) {
    // Ignore errors if stream doesn't exist
    console.log(error);
  }
}
