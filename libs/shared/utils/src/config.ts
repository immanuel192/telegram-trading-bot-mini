import * as dotenv from 'dotenv';
import { BaseConfig, Config } from './interfaces';

/**
 * Base default configuration values
 * @warning Do not use falsy values
 */
const baseDefaultConfig: Partial<Record<keyof BaseConfig, any>> = {
  NODE_ENV: 'development',
  LOG_LEVEL: 'info',
  APP_NAME: 'telegram-trading-bot',
  MONGODB_URI:
    'mongodb://localhost:27017/?replicaSet=rs0&directConnection=true',
  MONGODB_DBNAME: 'telegram-trading-bot',
};

/**
 * Load environment variables from .env file if DOTENV is set
 * This allows apps to specify which .env file to load (e.g., .env.sample)
 */
if (process.env['DOTENV']) {
  dotenv.config({ path: process.env['DOTENV'] });
} else {
  // Default to loading .env if it exists
  dotenv.config();
}

/**
 * Generic config function that can be extended by apps
 * @param name - Configuration key name
 * @param defaults - Optional default values to merge with base defaults
 * @returns Configuration value
 */
export function createConfig<T extends BaseConfig = BaseConfig>(
  defaults?: Partial<Record<keyof T, any>>
): Config<T> {
  const mergedDefaults = { ...baseDefaultConfig, ...defaults };

  return <K extends keyof T>(name: K): T[K] => {
    const env = process.env[name as string];
    if (!env && !(name in mergedDefaults)) {
      throw new Error(`${String(name)} is not set`);
    }

    return (process.env[name as string] ||
      mergedDefaults[name as keyof typeof mergedDefaults]) as T[K];
  };
}
