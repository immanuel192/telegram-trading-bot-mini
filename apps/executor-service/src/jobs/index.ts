/**
 * Executor Service Jobs
 * Imports and exports job system from shared-utils
 * Registers all executor-service specific jobs
 */

import { JobManager } from '@telegram-trading-bot-mini/shared/utils';

// Import to auto-register jobs
import './sample-job';
import './auto-sync-tp-sl-linked-order.job';
import './auto-update-order-status.job';
import './fetch-balance-job';
import './fetch-price-job';

// Re-export JobManager for use in container
export { JobManager };
