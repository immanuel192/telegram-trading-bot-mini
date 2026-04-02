/**
 * Purpose: Application-specific logger instance for telegram-service.
 * Creates a configured logger using the app's config.
 */

import { createLogger as createBaseLogger } from '@telegram-trading-bot-mini/shared/utils';

import { config } from './config';

export const logger = createBaseLogger(config('APP_NAME'), config);
