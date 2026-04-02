/**
 * Trade Manager Jobs
 * Imports and exports job system from shared-utils
 * Registers all trade-manager specific jobs
 */

import { JobManager } from '@telegram-trading-bot-mini/shared/utils';

// Import to auto-register jobs
import './sample-job';
import './pending-order-cleanup-job';
import './refresh-order-cache-job';

// Re-export JobManager for use in container
export { JobManager };
