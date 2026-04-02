/**
 * Purpose: Barrel export for all test helper utilities.
 * Exports: Logger helpers (mockRootLogger, fakeLogger), Suite helpers (suiteName), DB helpers (setupDb, cleanupDb, teardownDb), Environment helpers (TestEnvironment, detectTestEnvironment, getTestMongoUri, getTestRedisUrl, getTestRedisToken).
 */

export * from './lib/logger.helpers';
export * from './lib/suite.helpers';
export * from './lib/db.helpers';
export * from './lib/environment.helpers';
export * from './lib/factories';
export * from './lib/redis-stream.helpers';

/**
 * Sleep for awhile
 * @param ms
 * @returns
 */
export const sleep = async (ms: number = 200) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
