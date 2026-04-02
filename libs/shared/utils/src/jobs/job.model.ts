/**
 * Purpose: Define the Job entity for scheduled job configurations
 * Exports: Job interface, JobSchedulerConfig interface
 * Core Flow: Extends MongoDB Document, includes cron configuration and metadata
 */

import { Document, ObjectId } from 'mongodb';

/**
 * Job Scheduler Configuration
 * Defines when and how a job should be executed
 */
export interface JobSchedulerConfig {
  /**
   * Cron expression for job scheduling
   * @example '0 0 * * *' - Daily at midnight
   * @example '1 * * * *' - Every 1 minutes
   */
  cronExpression: string;

  /**
   * Timezone for cron execution
   * @default 'UTC'
   */
  timezone?: string;

  /**
   * Whether the job should run immediately on startup
   * @default false
   */
  runOnInit?: boolean;
}

/**
 * Job Document Interface
 * Represents a scheduled job configuration stored in MongoDB
 */
export interface Job extends Document {
  _id?: ObjectId;

  /**
   * Job class identifier (allows multiple instances of same job type)
   * Maps to the job class in the registry
   */
  jobId: string;

  /**
   * Unique instance name for this job
   * Used for logging and identification
   */
  name: string;

  /**
   * Whether this job is active
   * Inactive jobs are not loaded or scheduled
   */
  isActive: boolean;

  /**
   * Scheduler configuration
   */
  config: JobSchedulerConfig;

  /**
   * Extensible metadata bag for job-specific configuration
   * Can store any additional data needed by the job
   */
  meta?: Record<string, any>;

  /**
   * Creation timestamp
   */
  createdAt?: Date;

  /**
   * Last update timestamp
   */
  updatedAt?: Date;
}
