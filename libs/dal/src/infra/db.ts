/**
 * Purpose: Manage MongoDB database connection, schema initialization, and collection access.
 * Inputs: Config and Logger instances (via init function).
 * Outputs: Typed collection accessors via getSchema(), database connection lifecycle.
 * Core Flow: Connect to MongoDB → Create indexes → Run migrations → Provide typed collection access.
 */

import { Db, Document, MongoClient } from 'mongodb';
import {
  Config,
  BaseConfig,
  LoggerInstance,
} from '@telegram-trading-bot-mini/shared/utils/interfaces';
import { migration as accountMigration } from '../models/account.migration';

export enum COLLECTIONS {
  ACCOUNT = 'accounts',
  CONFIGS = 'configs',
  JOBS_TRADE_MANAGER = 'trade-manager-jobs',
  JOBS_EXECUTOR_SERVICE = 'executor-service-jobs',
  ORDERS = 'orders',
  PROMPT_RULE = 'prompt-rules',
  TELEGRAM_CHANNELS = 'telegram-channels',
  TELEGRAM_MESSAGES = 'telegram-messages',
}

let mongoDb: Db;
let client: MongoClient;

export const getSchema = <T extends Document>(collection: COLLECTIONS) =>
  mongoDb.collection<T>(collection);

const initSchemas = async () => {
  // Configs
  await getSchema(COLLECTIONS.CONFIGS).createIndex(
    { key: 1 },
    { unique: true },
  );

  // Trade Manager Jobs
  await getSchema(COLLECTIONS.JOBS_TRADE_MANAGER).createIndex({ jobId: 1 });
  await getSchema(COLLECTIONS.JOBS_TRADE_MANAGER).createIndex(
    { name: 1 },
    { unique: true },
  );
  await getSchema(COLLECTIONS.JOBS_TRADE_MANAGER).createIndex({ isActive: 1 });

  // Executor Service Jobs
  await getSchema(COLLECTIONS.JOBS_EXECUTOR_SERVICE).createIndex({ jobId: 1 });
  await getSchema(COLLECTIONS.JOBS_EXECUTOR_SERVICE).createIndex(
    { name: 1 },
    { unique: true },
  );
  await getSchema(COLLECTIONS.JOBS_EXECUTOR_SERVICE).createIndex({
    isActive: 1,
  });

  // accounts
  await getSchema(COLLECTIONS.ACCOUNT).createIndex(
    { accountId: 1 },
    { unique: true },
  );
  await getSchema(COLLECTIONS.ACCOUNT).createIndex({ isActive: 1 });
  await getSchema(COLLECTIONS.ACCOUNT).createIndex({ promptId: 1 });
  // Compound index for findActiveByChannelCode() query
  await getSchema(COLLECTIONS.ACCOUNT).createIndex({
    telegramChannelCode: 1,
    isActive: 1,
  });

  // Prompt Rules
  await getSchema(COLLECTIONS.PROMPT_RULE).createIndex(
    { promptId: 1 },
    { unique: true },
  );
  await getSchema(COLLECTIONS.PROMPT_RULE).createIndex({ createdAt: 1 });

  // Telegram Channels
  await getSchema(COLLECTIONS.TELEGRAM_CHANNELS).createIndex(
    { channelCode: 1 },
    { unique: true },
  );
  await getSchema(COLLECTIONS.TELEGRAM_CHANNELS).createIndex({ isActive: 1 });
  await getSchema(COLLECTIONS.TELEGRAM_CHANNELS).createIndex(
    { channelId: 1 },
    { unique: true },
  );
  await getSchema(COLLECTIONS.TELEGRAM_CHANNELS).createIndex({
    channelId: 1,
    accessHash: 1,
  });

  // Telegram Messages
  await getSchema(COLLECTIONS.TELEGRAM_MESSAGES).createIndex({
    channelCode: 1,
  });
  await getSchema(COLLECTIONS.TELEGRAM_MESSAGES).createIndex({
    channelId: 1,
    messageId: 1,
  });
  await getSchema(COLLECTIONS.TELEGRAM_MESSAGES).createIndex({
    receivedAt: 1,
  });
  await getSchema(COLLECTIONS.TELEGRAM_MESSAGES).createIndex({
    deletedAt: 1,
  });
  // TTL index: expire after 30 days (2592000 seconds) based on sentAt
  await getSchema(COLLECTIONS.TELEGRAM_MESSAGES).createIndex(
    { sentAt: 1 },
    { expireAfterSeconds: 2592000 },
  );

  // Orders
  await getSchema(COLLECTIONS.ORDERS).createIndex(
    { orderId: 1 },
    { unique: true },
  );
  await getSchema(COLLECTIONS.ORDERS).createIndex({ status: 1 });
  await getSchema(COLLECTIONS.ORDERS).createIndex({ traceToken: 1 });
  await getSchema(COLLECTIONS.ORDERS).createIndex({ symbol: 1 });
  await getSchema(COLLECTIONS.ORDERS).createIndex({ createdAt: 1 });
  // Compound index for findAll({ accountId, status: { $in: [...] } }) query
  await getSchema(COLLECTIONS.ORDERS).createIndex({
    accountId: 1,
    status: 1,
  });
  // Compound index for opposite position queries
  // Supports: { accountId, symbol, status, side } in closeOppositePositionsIfNeeded
  // Index field order: most selective first (accountId > symbol > status > side)
  await getSchema(COLLECTIONS.ORDERS).createIndex({
    accountId: 1,
    symbol: 1,
    status: 1,
    side: 1,
  });
  // Compound index for message-based order lookups
  await getSchema(COLLECTIONS.ORDERS).createIndex({
    messageId: 1,
    channelId: 1,
  });
  // Compound index for pending-order-cleanup-job query
  // Supports: { status: PENDING, executionType: market, createdAt: { $lt: cutoff } }
  await getSchema(COLLECTIONS.ORDERS).createIndex({
    status: 1,
    executionType: 1,
    createdAt: 1,
  });
  // data migration
  await Promise.all([accountMigration()]);
};

export const init = async (
  config: Config<BaseConfig>,
  logger: LoggerInstance,
) => {
  const uri = config('MONGODB_URI');
  client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000, // Fail fast if can't connect (5 seconds)
    connectTimeoutMS: 10000, // Connection timeout (10 seconds)
    maxPoolSize: 10,
    maxIdleTimeMS: 60_000,
    socketTimeoutMS: 20_000,
    retryReads: true,
    retryWrites: true,
  });

  await client.connect();

  logger.info('Connected successfully to server');

  mongoDb = client.db(config('MONGODB_DBNAME'));
  await initSchemas();
};

export const close = async () => {
  if (client) {
    await client.close();
  }
};

export { mongoDb };
