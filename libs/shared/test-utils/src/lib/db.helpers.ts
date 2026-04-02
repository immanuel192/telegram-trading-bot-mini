/**
 * Purpose: Provide test utilities for database connection and cleanup.
 * Exports: setupDb, cleanupDb (database test helpers).
 * Core Flow: Establish DB connection for tests and provide cleanup utilities.
 */

import { Db } from 'mongodb';
import { init, close, mongoDb, COLLECTIONS } from '@dal';
import { createConfig } from '@telegram-trading-bot-mini/shared/utils';
import { fakeLogger } from './logger.helpers';
import { getTestMongoUri } from './environment.helpers';

// Re-export COLLECTIONS for convenience
export { COLLECTIONS };

/**
 * Default collections to clean up
 */
export const defaultAllCollections: COLLECTIONS[] = [
  COLLECTIONS.ACCOUNT,
  COLLECTIONS.CONFIGS,
  COLLECTIONS.JOBS_EXECUTOR_SERVICE,
  COLLECTIONS.JOBS_TRADE_MANAGER,
  COLLECTIONS.ORDERS,
  COLLECTIONS.TELEGRAM_CHANNELS,
  COLLECTIONS.TELEGRAM_MESSAGES,
  COLLECTIONS.PROMPT_RULE,
];

/**
 * Setup database connection for tests
 * Uses environment-aware MongoDB URI (localhost for local, mongo for Docker/CI)
 * @returns Promise that resolves when database is initialized
 * @throws Error if connection fails
 */
export const setupDb = async () => {
  try {
    // Create config with environment-aware MongoDB URI
    const config = createConfig({
      MONGODB_URI: getTestMongoUri(),
    });
    await init(config, fakeLogger);
    return mongoDb;
  } catch (e) {
    console.error('Failed to connect to MongoDB. Make sure it is running.', e);
    throw e;
  }
};

/**
 * Clean up database collections
 * @param db - MongoDB database instance (optional, uses mongoDb from @dal if not provided)
 * @param targetCollections - Collections to clean up (defaults to all collections)
 * @returns Promise that resolves when cleanup is complete
 */
export const cleanupDb = async (
  db: Db | null = null,
  targetCollections: COLLECTIONS[] = defaultAllCollections,
): Promise<void> => {
  const database = db || mongoDb;
  if (!database) {
    throw new Error('Database not initialized. Call setupDb() first.');
  }

  await Promise.all(
    targetCollections.map((col) => database.collection(col).deleteMany({})),
  );
};

/**
 * Teardown database connection
 * @returns Promise that resolves when connection is closed
 */
export const teardownDb = async (): Promise<void> => {
  await close();
};
