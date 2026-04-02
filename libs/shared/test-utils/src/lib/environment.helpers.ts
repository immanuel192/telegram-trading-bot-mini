/**
 * Purpose: Provide environment detection utilities for tests.
 * Exports: TestEnvironment enum, detectTestEnvironment, getTestMongoUri, getTestRedisUrl
 * Core Flow: Detect test environment (LOCAL, DOCKER, CI) and provide appropriate connection strings.
 */

import * as os from 'os';

/**
 * Test environment types
 */
export enum TestEnvironment {
  LOCAL = 'local',
  DOCKER = 'docker',
  CI = 'ci',
}

/**
 * Detect the current test environment
 * @returns TestEnvironment enum value
 */
export function detectTestEnvironment(): TestEnvironment {
  // Check for CI environment variable (set in GitHub Actions and docker-compose.test.yml)
  if (process.env['CI'] === 'true') {
    return TestEnvironment.CI;
  }

  // Check for DOCKER environment variable or hostname contains 'docker'
  if (process.env['DOCKER'] === 'true') {
    return TestEnvironment.DOCKER;
  }

  // Check if hostname suggests we're in a Docker container
  const hostname = os.hostname();
  if (hostname.includes('docker') || hostname.length === 12) {
    // Docker containers often have 12-character hostnames
    return TestEnvironment.DOCKER;
  }

  // Default to local environment
  return TestEnvironment.LOCAL;
}

/**
 * Get MongoDB connection URI based on test environment
 * @returns MongoDB connection string
 */
export function getTestMongoUri(): string {
  const env = detectTestEnvironment();

  switch (env) {
    case TestEnvironment.CI:
    case TestEnvironment.DOCKER:
      // Docker/CI environments - use service name
      return 'mongodb://mongo:27017/?replicaSet=rs0&directConnection=true';

    case TestEnvironment.LOCAL:
    default:
      // Local environment - use localhost
      return 'mongodb://localhost:27017/?replicaSet=rs0&directConnection=true';
  }
}

/**
 * Get Redis URL based on test environment
 * @returns Redis URL for native Redis
 */
export function getTestRedisUrl(): string {
  const env = detectTestEnvironment();

  switch (env) {
    case TestEnvironment.CI:
    case TestEnvironment.DOCKER:
      // Docker/CI environments - use service name
      return 'redis://redis:6379';

    case TestEnvironment.LOCAL:
    default:
      // Local environment - use localhost
      return 'redis://localhost:6379';
  }
}
