# order-execution-flow Specification

## Purpose
TBD - created by archiving change build-executor-service. Update Purpose after archive.
## Requirements
### Requirement: Order Execution Service
The executor-service SHALL provide an OrderExecutorService that orchestrates order execution via broker adapters.

#### Scenario: OrderExecutorService execution pipeline
- **WHEN** OrderExecutorService processes an order
- **THEN** it SHALL run a pipeline that includes:
  - Account and adapter resolution
  - Entry price and stop loss calculation
  - Take profit normalization
  - Take profit selection
  - Broker execution
  - **Database persistence of results, including all normalized TP tiers AND initialization of lotSizeRemaining with the executed lots**
  - Result publication

### Requirement: Order Execution Event Handler
The executor-service SHALL consume EXECUTE_ORDER_REQUEST messages from per-account streams.

#### Scenario: OrderExecutionHandler implementation
- **WHEN** implementing order execution handler
- **THEN** it SHALL extend `BaseMessageHandler<MessageType.EXECUTE_ORDER_REQUEST>`
- **AND** it SHALL be constructed with:
  - `accountId`: string (account this handler is for)
  - `orderExecutor`: OrderExecutorService
  - `logger`: LoggerInstance
  - `errorCapture`: IErrorCapture
- **AND** the `handle` method SHALL:
  - Log message received
  - Call `orderExecutor.executeOrder(payload)`
  - Catch and log errors
  - Re-throw errors to trigger retry/DLQ

#### Scenario: Per-account stream consumption
- **WHEN** executor-service starts
- **THEN** it SHALL:
  - Fetch all active accounts from `accountRepository.find({ isActive: true })`
  - For each account, create:
    - Stream topic: `stream:trade:account:{accountId}`
    - Consumer group: `executor-service-{accountId}`
    - Consumer name: `executor-1` (MVP: single instance)
    - Handler: `OrderExecutionHandler` for that account
  - Start consumer using `RedisStreamConsumer.start()`
- **AND** each account's stream SHALL be consumed independently
- **AND** ordering SHALL be maintained within each account stream

### Requirement: Trade-Manager Order Publishing
The trade-manager SHALL publish order execution requests to per-account streams.

#### Scenario: Publish orders from TranslateResultHandler
- **WHEN** trade-manager consumes `TRANSLATE_MESSAGE_RESULT` with trading commands
- **THEN** for each command in `payload.commands`:
  - Create `Order` entity using `orderRepository.create()` with:
    - `messageId`, `channelId`, `accountId`, `orderId` (generated)
    - `type`, `executionType`, `symbol`, `lotSize`, `price`
  - Persist order to database
  - Publish `EXECUTE_ORDER_REQUEST` message to `stream:trade:account:{accountId}`
  - Include all order details in payload
  - Include `traceToken` for tracing

#### Scenario: Order ID generation
- **WHEN** creating an Order for execution
- **THEN** `orderId` SHALL be generated using `short-unique-id` package
- **AND** SHALL be unique across all orders
- **AND** SHALL be used for correlation between trade-manager and executor-service

### Requirement: Execution Result Handling in Trade-Manager
The trade-manager SHALL consume execution results from executor-service, update Order entities, and synchronize the in-memory cache.

#### Scenario: Order update on successful execution
- **WHEN** an execution result indicates success
- **THEN** trade-manager SHALL:
  - Find Order by `orderId`
  - Update Order with:
    - `actualSymbol` = `payload.actualSymbol`
    - **`lotSizeRemaining` = `payload.executedLots` (initial value)**
    - Append to `history` array:
      ```json
      {
        "event": "EXECUTED",
        "timestamp": payload.executedAt,
        "data": payload
      }
      ```
  - **Notify `OrderCacheService` to update the in-memory state based on the payload type and data.**

### Requirement: End-to-End Order Flow Integration
The complete order execution flow SHALL work end-to-end from trade-manager to executor-service and back.

#### Scenario: Successful order flow
- **GIVEN** a `TRANSLATE_MESSAGE_RESULT` is consumed by trade-manager
- **AND** it contains a trading command
- **WHEN** trade-manager processes the message
- **THEN** the following SHALL occur in sequence:
  1. trade-manager creates Order entity
  2. trade-manager publishes `EXECUTE_ORDER_REQUEST` to `stream:trade:account:{accountId}`
  3. executor-service consumes message from account stream
  4. executor-service executes order via broker adapter
  5. executor-service publishes `EXECUTE_ORDER_RESULT` with success=true
  6. trade-manager consumes execution result
  7. trade-manager updates Order with execution details
- **AND** the Order SHALL have:
  - `actualSymbol` populated
  - `history` containing "EXECUTED" event

#### Scenario: Failed order flow
- **GIVEN** an order execution fails at the broker
- **WHEN** executor-service processes the order
- **THEN** the following SHALL occur:
  1. executor-service catches the error
  2. executor-service classifies error code
  3. executor-service publishes `EXECUTE_ORDER_RESULT` with success=false
  4. trade-manager consumes execution result
  5. trade-manager updates Order with error details
- **AND** the Order SHALL have:
  - `history` containing "EXECUTION_FAILED" event with error message

### Requirement: Trade-Manager Configuration for Execution Results
The trade-manager SHALL add configuration for the execution results consumer.

#### Scenario: Execution results consumer mode config
- **WHEN** trade-manager is configured
- **THEN** it SHALL add:
  - `STREAM_CONSUMER_MODE_EXECUTION_RESULTS`: string
  - Default value: `'>'` (read only new messages)
- **AND** this SHALL control the starting ID for the execution results consumer
- **AND** it SHALL follow the same pattern as `STREAM_CONSUMER_MODE_TRANSLATE_RESULTS`

### Requirement: Order Execution Integration Tests
The order execution flow SHALL have comprehensive integration tests.

#### Scenario: Executor-service integration test
- **WHEN** testing executor-service order handler
- **THEN** integration test SHALL:
  - Publish `EXECUTE_ORDER_REQUEST` to test account stream
  - Wait for executor-service to consume and process
  - Verify `EXECUTE_ORDER_RESULT` published to `StreamTopic.ORDER_EXECUTION_RESULTS`
  - Verify result contains correct orderId and execution details
  - Use sandbox broker (Binance testnet or Oanda practice)

#### Scenario: Trade-manager integration test
- **WHEN** testing trade-manager order publishing
- **THEN** integration test SHALL:
  - Create test `TRANSLATE_MESSAGE_RESULT` with trading command
  - Publish to `StreamTopic.TRANSLATE_RESULTS`
  - Wait for trade-manager to consume
  - Verify Order created in database
  - Verify `EXECUTE_ORDER_REQUEST` published to correct account stream
  - Verify Order has correct fields populated

#### Scenario: End-to-end integration test
- **WHEN** testing full flow
- **THEN** integration test SHALL:
  - Start both trade-manager and executor-service (or mock executor)
  - Publish `TRANSLATE_MESSAGE_RESULT`
  - Wait for complete flow
  - Verify Order updated with execution result
  - Verify order history populated correctly
  - Use test/sandbox broker accounts

### Requirement: Error Handling and Retry
The order execution flow SHALL handle errors with appropriate retry and fallback mechanisms.

#### Scenario: Redis Stream consumer retry
- **WHEN** a message handler throws an error
- **THEN** RedisStreamConsumer SHALL retry the message
- **AND** retry logic SHALL follow shared-utils retry configuration
- **AND** after max retries, message SHALL be moved to DLQ (if configured)

#### Scenario: Broker adapter retry
- **WHEN** a broker API call fails transiently (network error)
- **THEN** broker adapter SHALL retry with exponential backoff
- **AND** SHALL retry up to `ORDER_RETRY_MAX_ATTEMPTS` (from config)
- **AND** if all retries fail, SHALL throw error to executor service

#### Scenario: Execution timeout
- **WHEN** an order execution takes longer than `ORDER_EXECUTION_TIMEOUT_MS`
- **THEN** the operation SHALL timeout
- **AND** executor SHALL publish error result with errorCode='TIMEOUT'
- **AND** trade-manager SHALL log timeout error

### Requirement: Observability for Order Execution Flow
The order execution flow SHALL be fully observable with metrics and logs.

#### Scenario: Metrics for order flow
- **WHEN** orders are processed
- **THEN** the following metrics SHALL be emitted:
  - `executor.order.submitted` (on OrderExecutorService start)
  - `executor.order.success` (on successful execution)
  - `executor.order.failed` (on execution failure, tagged with errorCode)
  - `executor.order.latency` (time from receive to publish result)
  - `trade-manager.order.created` (when Order entity created)
  - `trade-manager.execution.result_received` (when result consumed)

#### Scenario: Trace token propagation
- **WHEN** an order flows through the system
- **THEN** `traceToken` SHALL be:
  - Included in all log messages
  - Passed in message payloads
  - Used to correlate logs across services
- **AND** logs SHALL be searchable by traceToken

### Requirement: Take Profit Normalization
The order execution pipeline SHALL include a dedicated step to normalize take profit levels before selection and execution.

#### Scenario: Normalizing TPs from signal
- **WHEN** the `NormaliseTakeProfitStep` executes
- **THEN** it SHALL extract all take profits from the execution state
- **AND** it SHALL filter out duplicate or invalid levels
- **AND** it SHALL sort the levels by profitability (LONG: descending price, SHORT: ascending price)
- **AND** it SHALL store the sorted list back in the state for subsequent steps

### Requirement: Selective Take Profit Application
The system SHALL support selecting a subset of normalized take profits for broker execution while preserving the full set for monitoring.

#### Scenario: Selecting TP for broker
- **WHEN** the `SelectTakeProfitStep` executes
- **THEN** it SHALL use the normalized take profits from the state
- **AND** it SHALL select the target TP(s) based on the account's `takeProfitIndex` configuration
- **AND** it MAY generate an "optimized" average TP if multiple levels are available and configured

### Requirement: Consistent Execution Result Emission
The executor-service SHALL emit an `EXECUTE_ORDER_RESULT` event for every successful order modification or state change.

#### Scenario: Emission types
- **WHEN** an order is opened
- **THEN** emit `EXECUTE_ORDER_RESULT` with `type: OrderOpen`.
- **WHEN** an order TP/SL is updated
- **THEN** emit `EXECUTE_ORDER_RESULT` with `type: OrderUpdatedTpSl` and latest `takeProfits`.
- **WHEN** an order is closed (partially or fully)
- **THEN** emit `EXECUTE_ORDER_RESULT` with `type: OrderClosed`.

