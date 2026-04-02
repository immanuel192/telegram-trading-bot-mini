# batch-stream-consumer Specification

## Purpose
Provide batch message processing capabilities for Redis Stream consumers to improve performance when handlers perform I/O-bound operations (e.g., AI service calls, database queries). This capability enables parallel processing of messages from different channel groups while maintaining ordering guarantees within each group.

## ADDED Requirements

### Requirement: Base Redis Stream Consumer
The shared utilities library SHALL provide a base abstract class for Redis Stream consumers that encapsulates common functionality.

#### Scenario: Base class provides shared infrastructure
- **WHEN** implementing a Redis Stream consumer
- **THEN** the base class SHALL provide:
  - Redis client connection management
  - Message fetching via XREADGROUP with configurable BLOCK time
  - Message parsing from Redis format to `StreamMessage<T>`
  - Message validation (schema and expiration checks)
  - Message acknowledgment (XACK)
  - Error capture via Sentry integration
  - Lifecycle management (start/stop/close)
  - Retry configuration

#### Scenario: Base class is abstract
- **WHEN** creating the base class
- **THEN** it SHALL be an abstract class
- **AND** it SHALL NOT be instantiable directly
- **AND** concrete consumers SHALL extend it

#### Scenario: Shared configuration
- **WHEN** configuring a consumer via the base class
- **THEN** the configuration SHALL include:
  - `url`: Redis connection URL
  - `blockTimeMs`: XREADGROUP block time (default: 500ms)
  - `errorCapture`: Optional Sentry error capture instance
  - `validator`: Optional message validator (default: DefaultMessageValidator)
  - `retryConfig`: Optional retry configuration
  - `logger`: Optional logger instance

### Requirement: Batch Stream Consumer Implementation
The shared utilities library SHALL provide a `BatchStreamConsumer` class for batch message processing.

#### Scenario: Batch consumer extends base class
- **WHEN** implementing the batch consumer
- **THEN** it SHALL extend `BaseRedisStreamConsumer`
- **AND** it SHALL reuse base class methods for fetch, parse, validate, and ACK operations

#### Scenario: Batch handler signature
- **WHEN** starting the batch consumer
- **THEN** the handler signature SHALL be:
  ```typescript
  (messages: Array<{
    message: StreamMessage<T>;
    id: string;
    groupKey: string;
  }>) => Promise<Array<{
    id: string;
    success: boolean;
    error?: Error;
  }>>
  ```
- **AND** the handler SHALL receive an array of messages to process
- **AND** the handler SHALL return per-message results indicating success/failure

#### Scenario: Message grouping by channel and account
- **WHEN** fetching messages from the stream
- **THEN** the consumer SHALL group messages by `channelId:accountId` (or `channelId` if no accountId)
- **AND** this grouping SHALL match the existing `RedisStreamConsumer` behavior

### Requirement: Batch Transpose Algorithm
The batch consumer SHALL transpose grouped messages into batches that maximize parallelism while maintaining ordering.

#### Scenario: Transpose groups into batches
- **WHEN** processing grouped messages
- **THEN** the consumer SHALL create batches where:
  - Each batch contains at most one message from each group
  - Messages from the same group are processed in order across batches
  - Batch N contains the Nth message from each group (if it exists)

#### Scenario: Batch formation example
- **GIVEN** messages grouped as:
  - Group A: [A0, A1, A2]
  - Group B: [B0, B1]
  - Group C: [C0]
- **WHEN** creating batches
- **THEN** the batches SHALL be:
  - Batch 0: [A0, B0, C0]
  - Batch 1: [A1, B1]
  - Batch 2: [A2]

#### Scenario: Ordering guarantee
- **WHEN** processing batches
- **THEN** message A0 SHALL be processed before A1
- **AND** message A1 SHALL be processed before A2
- **AND** message B0 SHALL be processed before B1
- **AND** messages within the same batch MAY be processed in parallel

### Requirement: Per-Message ACK Management
The batch consumer SHALL track success/failure per message and ACK only successful messages.

#### Scenario: Successful batch processing
- **WHEN** the batch handler returns results
- **AND** all messages succeeded
- **THEN** the consumer SHALL ACK all message IDs
- **AND** no retries SHALL occur

#### Scenario: Partial batch failure
- **WHEN** the batch handler returns results
- **AND** some messages succeeded and some failed
- **THEN** the consumer SHALL:
  - ACK only the successful message IDs
  - Retry only the failed messages
  - Preserve the failed messages for the next retry attempt

#### Scenario: Handler throws error
- **WHEN** the batch handler throws an error (not returning results)
- **THEN** the consumer SHALL:
  - Treat all messages in the batch as failed
  - Retry the entire batch
  - Apply exponential backoff

#### Scenario: Max retries exceeded
- **WHEN** a message has been retried `maxRetries` times
- **AND** it still fails
- **THEN** the consumer SHALL:
  - ACK the failed message (to prevent infinite retries)
  - Capture the error via Sentry
  - Log the failure with message details

### Requirement: Batch Retry Strategy
The batch consumer SHALL retry failed messages with exponential backoff.

#### Scenario: Retry configuration
- **WHEN** configuring retry behavior
- **THEN** the consumer SHALL use the same `RetryConfig` as `RedisStreamConsumer`:
  - `maxRetries`: Maximum retry attempts (default: 2)
  - `initialDelayMs`: Initial delay before first retry (default: 500ms)
  - `maxDelayMs`: Maximum delay between retries (default: 30000ms)
  - `backoffMultiplier`: Delay multiplier for exponential backoff (default: 2)

#### Scenario: Immediate retry on failure
- **WHEN** a message fails processing
- **THEN** the consumer SHALL retry immediately (within the same consume loop)
- **AND** it SHALL NOT wait for the next XREADGROUP fetch

#### Scenario: Exponential backoff calculation
- **WHEN** retrying a failed message
- **THEN** the delay SHALL be calculated as:
  - Retry 1: `initialDelayMs` (500ms)
  - Retry 2: `initialDelayMs * backoffMultiplier` (1000ms)
  - Retry 3: `initialDelayMs * backoffMultiplier^2` (2000ms)
  - Capped at `maxDelayMs` (30000ms)

#### Scenario: Retry only failed messages
- **WHEN** retrying a batch
- **THEN** the consumer SHALL only include messages that failed in the previous attempt
- **AND** it SHALL NOT retry messages that succeeded

### Requirement: Batch Consumer Error Handling
The batch consumer SHALL handle errors gracefully without crashing the service.

#### Scenario: Parse error
- **WHEN** a message cannot be parsed from Redis format
- **THEN** the consumer SHALL:
  - Log the parse error with message ID
  - Capture the error via Sentry
  - ACK the message immediately (to remove from stream)
  - Continue processing other messages

#### Scenario: Validation error
- **WHEN** a message fails schema validation or is expired
- **THEN** the consumer SHALL:
  - Log the validation error with message details
  - Capture the error via Sentry
  - ACK the message immediately
  - Continue processing other messages

#### Scenario: Redis connection error
- **WHEN** the Redis connection fails during consume loop
- **THEN** the consumer SHALL:
  - Log the connection error
  - Capture the error via Sentry
  - Wait 200ms before retrying the consume loop
  - Continue attempting to reconnect while `isRunning` is true

### Requirement: Backward Compatibility
The existing `RedisStreamConsumer` SHALL continue to work unchanged.

#### Scenario: Refactor to use base class
- **WHEN** refactoring `RedisStreamConsumer`
- **THEN** it SHALL extend `BaseRedisStreamConsumer`
- **AND** it SHALL reuse base class methods for shared functionality
- **AND** its public API SHALL NOT change
- **AND** its behavior SHALL NOT change

#### Scenario: Existing tests pass
- **WHEN** running existing `RedisStreamConsumer` tests
- **THEN** all tests SHALL pass without modification
- **AND** no new test failures SHALL be introduced

#### Scenario: Existing consumers unaffected
- **WHEN** services use the existing `RedisStreamConsumer`
- **THEN** they SHALL continue to work without code changes
- **AND** their behavior SHALL remain identical

### Requirement: Batch Consumer Testing
The batch consumer SHALL have comprehensive unit and integration tests.

#### Scenario: Unit test - batch transpose algorithm
- **WHEN** testing the transpose algorithm
- **THEN** tests SHALL verify:
  - Empty groups produce empty batches
  - Single group produces single-message batches
  - Multiple groups with equal depth produce equal-sized batches
  - Multiple groups with varying depths produce correctly sized batches
  - Ordering is preserved within each group

#### Scenario: Unit test - ACK tracking
- **WHEN** testing ACK management
- **THEN** tests SHALL verify:
  - All successful messages are ACKed
  - Failed messages are not ACKed
  - Partial failures ACK only successful messages
  - Handler errors result in no ACKs (retry entire batch)

#### Scenario: Unit test - retry logic
- **WHEN** testing retry behavior
- **THEN** tests SHALL verify:
  - Failed messages are retried up to maxRetries times
  - Exponential backoff is applied correctly
  - Only failed messages are included in retry batches
  - After max retries, failed messages are ACKed

#### Scenario: Integration test - end-to-end batch processing
- **WHEN** running integration tests
- **THEN** tests SHALL verify:
  - Messages from multiple channels are batched correctly
  - Batches are processed in the correct order
  - Messages within groups maintain ordering
  - ACK behavior is correct for success/failure scenarios
  - Redis Stream state is correct after processing

## MODIFIED Requirements

### Requirement: Stream Consumer Interface (MODIFIED)
The stream consumer interface SHALL support both single-message and batch handlers.

#### Scenario: Interface remains unchanged (MODIFIED)
- **WHEN** using the `IStreamConsumer` interface
- **THEN** it SHALL define the single-message handler signature:
  ```typescript
  start<T extends MessageType>(
    topic: StreamTopic,
    groupName: string,
    consumerName: string,
    handler: (message: StreamMessage<T>, id: string) => Promise<void>
  ): void;
  ```
- **AND** `RedisStreamConsumer` SHALL implement this interface
- **AND** `BatchStreamConsumer` SHALL NOT implement this interface (different handler signature)

## Related Specifications
- `stream-consumer`: Existing Redis Stream consumer specification (parent spec)
- `ai-translation-service`: Will be updated to use batch consumer for performance improvement
