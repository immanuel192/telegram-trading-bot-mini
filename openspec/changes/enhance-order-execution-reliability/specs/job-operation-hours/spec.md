# Spec Delta: Job Operation Hours Enforcement

**Capability:** `job-operation-hours`  
**Related Specs:** `background-jobs`, `executor-job-scheduling`, `account-config-enhancement`

## ADDED Requirements

### Requirement: Validate operation hours before job execution

Background jobs in executor-service SHALL check account operation hours before executing broker API calls, skipping execution when outside configured trading hours.

#### Scenario: Skip price fetch outside operation hours

**Given** an account with operation hours:
- Timezone: America/New_York
- Schedule: Sun-Fri: 18:05 - 16:59
**And** current time is Saturday 10:00 AM EST

**When** `fetch-price-job` executes

**Then** the system SHALL:
1. Get account from adapter
2. Check operation hours configuration
3. Determine market is closed
4. Skip price fetch for this account
5. Log the skip reason
6. Continue with next account (if any)

#### Scenario: Execute price fetch during operation hours

**Given** an account with operation hours:
- Timezone: America/New_York
- Schedule: Sun-Fri: 18:05 - 16:59
**And** current time is Monday 20:00 EST

**When** `fetch-price-job` executes

**Then** the system SHALL:
1. Get account from adapter
2. Check operation hours configuration
3. Determine market is open
4. Fetch prices from broker
5. Cache prices in Redis

#### Scenario: Skip balance fetch outside operation hours

**Given** an account with operation hours configured
**And** current time is outside operation hours

**When** `fetch-balance-job` executes

**Then** the system SHALL:
1. Get account configuration
2. Validate operation hours
3. Skip balance fetch
4. Log the skip with account ID and reason

#### Scenario: No operation hours configured (always execute)

**Given** an account without operation hours configuration

**When** any background job executes

**Then** the system SHALL:
1. Check for operation hours config
2. Find none configured
3. Execute normally (no skip)
4. Fetch data from broker

### Requirement: Reuse operation hours validation logic

The executor-service SHALL extract and reuse the operation hours validation logic from `OrderExecutorService` for background jobs.

#### Scenario: Shared validation logic

**Given** operation hours validation exists in `OrderExecutorService.validateMarketHours`

**When** implementing job validation

**Then** the system SHALL:
1. Extract validation logic to reusable service/utility
2. Use same logic in both order execution and jobs
3. Maintain consistent behavior across features
4. Avoid code duplication

### Requirement: Access account configuration efficiently

Background jobs SHALL use `AccountService.getAccountById` to fetch account configuration with caching support.

#### Scenario: Fetch account for operation hours check

**Given** a job needs to check operation hours
**And** adapter provides `accountId`

**When** validating operation hours

**Then** the system SHALL:
1. Get accountId from adapter
2. Call `AccountService.getAccountById(accountId)`
3. Use cached account data (if available)
4. Extract operation hours from account config
5. Validate using operation hours checker

#### Scenario: Multiple adapters share same account

**Given** multiple adapters for same account
**And** account configuration is cached

**When** job processes multiple adapters

**Then** the system SHALL:
1. Fetch account once (first adapter)
2. Reuse cached account for subsequent adapters
3. Minimize database queries
4. Maintain performance

### Requirement: Track operation hours enforcement metrics

Background jobs SHALL emit metrics for operation hours validation to enable monitoring of skip rates and potential configuration issues.

#### Scenario: Track job execution skip

**Given** a job skips execution due to operation hours

**When** the skip occurs

**Then** the system SHALL:
1. Emit metric: `executor.job.skip.operation_hours`
2. Include tags: job name, account ID, exchange code
3. Track skip count per job type

#### Scenario: Track job execution during hours

**Given** a job executes during operation hours

**When** the job completes

**Then** the system SHALL:
1. Emit metric: `executor.job.execute.success`
2. Include operation hours validation result in tags
3. Track execution count per job type

### Requirement: Support extensibility for other background jobs

The operation hours validation logic SHALL be designed for reuse across any background job that interacts with broker APIs.

#### Scenario: Apply to future jobs

**Given** a new background job that calls broker APIs

**When** implementing the job

**Then** the system SHALL:
1. Use the same `OperationTimeCheckerService`
2. Follow the same validation pattern
3. Emit consistent metrics
4. Maintain consistent logging format

## MODIFIED Requirements

None - This adds new validation to existing jobs without changing their core functionality.

## REMOVED Requirements

None
