# job-scheduling Specification

## Purpose
TBD - created by archiving change scaffold-trade-manager. Update Purpose after archive.
## Requirements
### Requirement: Job Data Model
The system SHALL provide a Job entity to store job scheduling configurations.

#### Scenario: Job structure
- **WHEN** a Job is created
- **THEN** it SHALL include the following fields:
  - `_id`: MongoDB ObjectId (optional)
  - `jobId`: Job class identifier (string, allows duplicates)
  - `name`: Unique job instance name (string)
  - `isActive`: Boolean flag for enabling/disabling the job
  - `config`: JobSchedulerConfig object (cron, timezone, etc.)
  - `meta`: Optional metadata object for extensible data

#### Scenario: Job configuration structure
- **WHEN** defining JobSchedulerConfig
- **THEN** it SHALL include:
  - `cron`: Cron expression (string)
  - `triggerWhenInit`: Optional flag to trigger on initialization (boolean)
  - `timezone`: Optional timezone string
  - `initData`: Optional initialization data (any)

### Requirement: Job Repository
The system SHALL provide a JobRepository for CRUD operations on Job entities.

#### Scenario: Find all active jobs
- **WHEN** querying for active jobs
- **THEN** the repository SHALL return all jobs where isActive is true

#### Scenario: Find jobs by job ID
- **WHEN** searching for jobs by jobId
- **THEN** the repository SHALL return all job instances with matching jobId

#### Scenario: Job CRUD operations
- **WHEN** managing jobs
- **THEN** the repository SHALL support:
  - create: Insert a new job
  - update: Update an existing job
  - delete: Remove a job
  - findOne: Find a single job by criteria

### Requirement: Base Job Class
The trade-manager SHALL provide a BaseJob abstract class for implementing scheduled jobs.

#### Scenario: BaseJob interface
- **WHEN** extending BaseJob
- **THEN** subclasses SHALL implement:
  - `init()`: Async initialization method
  - `onTick()`: Async method called on cron schedule
  - `onComplete()`: Async method called after onTick
  - `jobName`: String property identifying the job

#### Scenario: BaseJob lifecycle methods
- **WHEN** using BaseJob
- **THEN** it SHALL provide:
  - `start()`: Start the cron job
  - `stop()`: Stop the cron job
  - `trigger(params, traceToken)`: Manually trigger the job

#### Scenario: BaseJob utilities
- **WHEN** implementing a job
- **THEN** BaseJob SHALL provide:
  - `getTraceToken()`: Generate a unique trace token
  - `DEFAULT_CONFIG`: Default job configuration
  - `triggerWhenInit`: Getter for initialization trigger flag
  - `logger`: Abstract logger property (must be implemented by subclass)

### Requirement: Job Registry System
The trade-manager SHALL maintain a registry mapping job IDs to job classes.

#### Scenario: Job registry structure
- **WHEN** defining the job registry
- **THEN** it SHALL use a Map<string, typeof BaseJob>
- **AND** the key SHALL be the jobId
- **AND** the value SHALL be the job class constructor

#### Scenario: Loading jobs from database
- **WHEN** the service starts
- **THEN** it SHALL:
  - Query all active jobs from the database
  - For each job, look up the job class in the registry
  - Instantiate the job class with configuration from the database
  - Initialize each job instance
  - Store job instances for lifecycle management

#### Scenario: Job not found in registry
- **WHEN** a database job references a jobId not in the registry
- **THEN** the system SHALL:
  - Log a warning with the jobId
  - Skip instantiating that job
  - Continue loading other jobs

### Requirement: Job Scheduler Lifecycle
The trade-manager SHALL manage the lifecycle of all scheduled jobs.

#### Scenario: Job initialization
- **WHEN** initializing jobs
- **THEN** the system SHALL:
  - Call init() on each job instance
  - If triggerWhenInit is true, call onTick() immediately
  - Handle initialization errors gracefully

#### Scenario: Starting jobs
- **WHEN** starting the job scheduler
- **THEN** the system SHALL call start() on all job instances
- **AND** each job SHALL begin executing on its cron schedule

#### Scenario: Stopping jobs
- **WHEN** stopping the job scheduler
- **THEN** the system SHALL call stop() on all job instances
- **AND** each job SHALL stop accepting new executions
- **AND** in-flight executions SHALL complete before shutdown

#### Scenario: Job execution error handling
- **WHEN** a job's onTick() throws an error
- **THEN** the system SHALL:
  - Log the error with job name and trace token
  - Capture the error in Sentry
  - NOT crash the service
  - Continue scheduling future executions

### Requirement: Job Service for Manual Triggering
The trade-manager SHALL provide a JobService for manually triggering jobs.

#### Scenario: Job service initialization
- **WHEN** initializing the JobService
- **THEN** it SHALL create an in-memory queue using fastq
- **AND** the queue SHALL process one job at a time (concurrency: 1)

#### Scenario: Triggering a job manually
- **WHEN** triggerJob is called with jobName and params
- **THEN** the JobService SHALL:
  - Add the job to the queue
  - Look up the job by name
  - If found, call the job's trigger() method with params and traceToken
  - If not found, log an error

#### Scenario: Job queue error handling
- **WHEN** a job trigger fails
- **THEN** the JobService SHALL:
  - Log the error with job name and trace token
  - Capture the error in Sentry
  - Continue processing other queued jobs

#### Scenario: Draining the job queue
- **WHEN** drainJobTriggeringQueue is called
- **THEN** the JobService SHALL wait for all queued jobs to complete
- **AND** return a promise that resolves when the queue is empty

### Requirement: Graceful Shutdown with Job Draining
The trade-manager SHALL gracefully shutdown all jobs and drain queues before stopping.

#### Scenario: Shutdown sequence
- **WHEN** the service receives SIGTERM or SIGINT signal
- **THEN** the system SHALL execute shutdown in this order:
  1. Stop all cron jobs (prevent new scheduled executions)
  2. Drain the job triggering queue (wait for manual triggers to complete)
  3. Stop all stream consumers
  4. Close database connections
  5. Exit the process

#### Scenario: Job draining on shutdown
- **WHEN** graceful shutdown is initiated
- **THEN** the system SHALL:
  - Call stop() on all job instances
  - Call drainJobTriggeringQueue() to wait for queued jobs
  - Wait for both operations to complete before proceeding
  - Log the completion of job draining

#### Scenario: Shutdown timeout handling
- **WHEN** jobs take too long to drain
- **THEN** the system SHALL:
  - Log a warning after a reasonable timeout (e.g., 30 seconds)
  - Continue with shutdown to prevent hanging
  - Ensure critical cleanup (DB close) still happens

### Requirement: Sample Job Implementation
The trade-manager SHALL include a sample job demonstrating the job scheduling pattern.

#### Scenario: Sample job structure
- **WHEN** implementing the sample job
- **THEN** it SHALL:
  - Extend BaseJob
  - Define a jobName property
  - Implement init() to create the CronJob instance
  - Implement onTick() to log execution
  - Implement onComplete() to return successfully

#### Scenario: Sample job configuration
- **WHEN** configuring the sample job
- **THEN** it SHALL use a default cron expression (e.g., '*/5 * * * *')
- **AND** it SHALL be registered in the job registry

### Requirement: Job Scheduling Testing
The job scheduling system SHALL have comprehensive unit and integration tests.

#### Scenario: BaseJob unit tests
- **WHEN** testing BaseJob
- **THEN** tests SHALL verify:
  - start() starts the cron job
  - stop() stops the cron job
  - trigger() calls onTick with correct params
  - getTraceToken() generates unique tokens

#### Scenario: Sample job unit tests
- **WHEN** testing the sample job
- **THEN** tests SHALL verify:
  - init() creates a CronJob instance
  - onTick() executes successfully
  - Job configuration is set correctly

#### Scenario: Job scheduler integration tests
- **WHEN** testing job scheduling
- **THEN** tests SHALL verify:
  - Jobs load from database correctly
  - Jobs initialize and start successfully
  - Jobs execute on schedule
  - Manual triggering works correctly
  - Jobs stop gracefully on shutdown

#### Scenario: JobService integration tests
- **WHEN** testing JobService
- **THEN** tests SHALL verify:
  - Queue processes jobs sequentially
  - triggerJob adds jobs to queue
  - drainQueue waits for completion
  - Error handling works correctly

### Requirement: Pending Order Cleanup Job Implementation
The trade-manager SHALL provide a PendingOrderCleanupJob that extends BaseJob to automatically clean up stale pending orders.

#### Scenario: Job registration
- **WHEN** the pending order cleanup job is implemented
- **THEN** it SHALL be decorated with `@RegisterJob('pending-order-cleanup-job')`
- **AND** it SHALL extend `BaseJob`
- **AND** it SHALL be registered in the job registry for automatic loading

#### Scenario: Job dependencies
- **WHEN** the job is instantiated
- **THEN** it SHALL have access to:
  - `OrderRepository` for querying and updating orders
  - `PushNotificationService` for sending notifications
  - `Container` for accessing other services
  - `Logger` for logging execution details

#### Scenario: Job execution schedule
- **WHEN** the job is configured in the database
- **THEN** it SHALL use cron expression `*/1 * * * *` (every 1 minute)
- **AND** it SHALL run in UTC timezone
- **AND** it SHALL be active by default (`isActive: true`)

#### Scenario: Job meta configuration
- **WHEN** the job document is created in the database
- **THEN** the `meta` field SHALL include:
  - `timeoutMinutes`: number (default: 1) - How long before a PENDING order is considered stale
  - `notificationAccountIds`: string[] (default: []) - Account IDs that should receive cleanup notifications
- **AND** these values SHALL be configurable without code changes

#### Scenario: onTick implementation
- **WHEN** the job's `onTick()` method executes
- **THEN** it SHALL:
  1. Read `timeoutMinutes` from job meta (default 1 if not set)
  2. Calculate cutoff time as `Date.now() - (timeoutMinutes * 60 * 1000)`
  3. Query all orders with `status = OrderStatus.PENDING`
  4. Filter orders in-memory where `createdAt < cutoffTime`
  5. Process each stale order sequentially
  6. Log the number of stale orders found and cleaned

#### Scenario: Transaction-based order cleanup
- **WHEN** processing a single stale order
- **THEN** the job SHALL use `withMongoTransaction` to ensure atomicity
- **AND** within the transaction it SHALL:
  - Update the order document with `closedAt` and `status`
  - Push a new history entry to the order's `history` array
- **AND** if the transaction fails, it SHALL log the error and continue with the next order

#### Scenario: Error handling in job execution
- **WHEN** an error occurs during job execution
- **THEN** the error SHALL be logged with job name and order details
- **AND** the error SHALL be captured in Sentry
- **AND** the job SHALL NOT crash the service
- **AND** the job SHALL continue processing remaining orders
- **AND** the next scheduled execution SHALL proceed normally

#### Scenario: Notification sending
- **WHEN** an order is successfully cleaned up
- **THEN** the job SHALL check if `order.accountId` is in `meta.notificationAccountIds`
- **AND** if true, it SHALL send a push notification
- **AND** if notification sending fails, it SHALL log the error but NOT fail the cleanup
- **AND** notification is best-effort, order cleanup is critical

#### Scenario: Service name constant
- **WHEN** creating history entries for cleanup
- **THEN** the job SHALL use `ServiceName.PENDING_ORDER_CLEANUP_JOB` as the service identifier
- **AND** this constant SHALL be added to `libs/shared/utils/src/constants/service-names.ts`
- **AND** the value SHALL be `'pending-order-cleanup-job'`

#### Scenario: Integration test coverage
- **WHEN** testing the pending order cleanup job
- **THEN** integration tests SHALL verify:
  - Job correctly identifies stale orders based on timeout
  - Job closes orders and adds history entries
  - Job respects notification whitelist
  - Job handles custom timeout configuration
  - Job continues on transaction failures
  - Job uses correct service name in history

