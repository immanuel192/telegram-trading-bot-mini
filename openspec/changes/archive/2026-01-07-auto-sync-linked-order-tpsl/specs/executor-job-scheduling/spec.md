# Executor Service Job Scheduling Specification Delta

## ADDED Requirements

### Requirement: Auto-Sync TP/SL Linked Order Job
The executor-service SHALL provide an AutoSyncTpSlLinkedOrderJob that synchronizes Take Profit and Stop Loss values across linked orders.

#### Scenario: Job registration and configuration
- **WHEN** the AutoSyncTpSlLinkedOrderJob is implemented
- **THEN** it SHALL be decorated with `@RegisterJob('auto-sync-tp-sl-linked-order')`
- **AND** it SHALL extend `BaseJob<Container, TParams>`
- **AND** it SHALL be registered in the job registry for manual triggering only

#### Scenario: Job parameters definition
- **WHEN** defining job parameters
- **THEN** the `TParams` interface SHALL include:
  - `accountId`: string (required) - Account ID to retrieve the broker adapter
  - `orderId`: string (required) - Target order ID to update
  - `sl`: optional object with `price?: number` - Stop loss price to set
  - `tp`: optional object with `price?: number` - Take profit price to set
- **AND** at least one of `sl` or `tp` MUST have a value

#### Scenario: Prevent scheduled execution
- **WHEN** the job's `init()` method is called
- **THEN** it SHALL override the `cronExpression` to `undefined`
- **AND** it SHALL NOT create a CronJob instance
- **AND** it SHALL only be executable via manual trigger

#### Scenario: Job execution logic
- **WHEN** the job's `onTick()` method executes
- **THEN** it SHALL:
  1. Validate that `accountId` and `orderId` are provided
  2. Validate that at least one of `sl` or `tp` has a value
  3. Retrieve the broker adapter using `container.brokerFactory.getAdapter(accountId)`
  4. Fetch the target order from repository to get account reference
  5. Build an `ExecuteOrderRequestPayload` with:
     - The target `orderId`
     - The provided `sl` and/or `tp` values
     - `skipLinkedOrderSync: true` in the `meta` field
     - `command: CommandEnum.SET_TP_SL`
  6. Call `handleUpdateTakeProfitStopLoss` to update the order
  7. Log success with orderId and traceToken

#### Scenario: Job error handling
- **WHEN** an error occurs during job execution
- **THEN** the error SHALL be logged with job name, orderId, and params
- **AND** the error SHALL be captured in Sentry
- **AND** the job SHALL NOT crash the service
- **AND** the error SHALL be propagated to allow JobService to handle it

#### Scenario: Job dependencies
- **WHEN** the job is instantiated
- **THEN** it SHALL have access to:
  - `Container` for accessing all executor-service dependencies
  - `BrokerAdapterFactory` via container
  - `OrderRepository` via container
  - `OrderExecutorService` via container
  - `Logger` for logging execution details
