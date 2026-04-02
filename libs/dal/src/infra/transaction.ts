/**
 * Purpose: Provide reusable MongoDB transaction utilities for atomic operations.
 * Exports: withMongoTransaction, startMongoTransaction, commitMongoTransaction, abortMongoTransaction
 * Core Flow: Start session → Execute callback within transaction → Commit or rollback → Cleanup session.
 */

import { ClientSession } from 'mongodb';
import { mongoDb } from './db';

/**
 * Execute an operation within a MongoDB transaction
 *
 * This utility ensures atomic operations across multiple database updates.
 * If any operation fails, all changes are rolled back automatically.
 *
 * @example
 * ```typescript
 * await withMongoTransaction(async (session) => {
 *   // Update database
 *   await repository.addHistoryEntry(channelId, messageId, entry, session);
 *
 *   // Publish event
 *   await publisher.publish(topic, message);
 *
 *   // If publish fails, database update will be rolled back
 * });
 * ```
 *
 * @param operation - Async callback that receives a MongoDB session
 * @returns The result of the operation
 * @throws Re-throws any error from the operation after rolling back the transaction
 */
export async function withMongoTransaction<T>(
  operation: (session: ClientSession) => Promise<T>
): Promise<T> {
  // Get the MongoDB client from the connected database
  const client = mongoDb.client;

  // Start a new session
  const session = client.startSession();

  try {
    // Execute the operation within a transaction
    // MongoDB will automatically commit if successful, or abort if an error is thrown
    const result = await session.withTransaction(async () => {
      return await operation(session);
    });

    return result;
  } finally {
    // Always clean up the session, regardless of success or failure
    await session.endSession();
  }
}

/**
 * Start a new MongoDB transaction session
 * Use this for manual transaction control in pipeline patterns
 *
 * IMPORTANT: You MUST call either commitMongoTransaction or abortMongoTransaction
 * and then endSession() when done, otherwise the session will leak
 *
 * @returns A new MongoDB session with an active transaction
 * @example
 * ```typescript
 * const session = await startMongoTransaction();
 * try {
 *   await repository.update({ id: 1 }, { status: 'active' }, session);
 *   await commitMongoTransaction(session);
 * } catch (error) {
 *   await abortMongoTransaction(session);
 *   throw error;
 * } finally {
 *   await session.endSession();
 * }
 * ```
 */
export async function startMongoTransaction(): Promise<ClientSession> {
  const client = mongoDb.client;
  const session = client.startSession();
  session.startTransaction();
  return session;
}

/**
 * Commit an active MongoDB transaction
 *
 * @param session - The session with an active transaction
 * @throws If the transaction cannot be committed
 */
export async function commitMongoTransaction(
  session: ClientSession
): Promise<void> {
  await session.commitTransaction();
}

/**
 * Abort an active MongoDB transaction
 * All changes made within the transaction will be rolled back
 *
 * @param session - The session with an active transaction
 */
export async function abortMongoTransaction(
  session: ClientSession
): Promise<void> {
  await session.abortTransaction();
}
