# live-price-streaming Specification

## Purpose
TBD - created by archiving change improve-trading-accuracy. Update Purpose after archive.
## Requirements
### Requirement: OANDA API async streaming support

The OANDA API client SHALL provide an async method to stream real-time price updates with robust error handling.

#### Scenario: Handle response errors during streaming

**Given** an active price stream  
**When** a response error occurs (e.g., ECONNRESET, socket hang up)  
**Then** the stream controller SHALL detect the error  
**And** the stream SHALL stop receiving data  
**And** the error SHALL be propagated to allow reconnection handling  
**And** the error SHALL be logged with full context  
**And** no unhandled promise rejection SHALL occur

#### Scenario: Clean up resources on stream error

**Given** an active price stream  
**When** a response error occurs  
**Then** the stream SHALL set `isStreamActive` to false  
**And** the stream SHALL stop processing incoming chunks  
**And** the HTTP request SHALL be properly destroyed  
**And** no memory leaks SHALL occur

#### Scenario: Handle request errors before stream establishment

**Given** a stream connection attempt  
**When** a request error occurs before the stream starts (e.g., DNS failure, connection refused)  
**Then** the promise SHALL reject with the error  
**And** the error SHALL include the error code (ECONNREFUSED, ENOTFOUND, etc.)  
**And** the caller SHALL be able to catch and handle the error  
**And** the error SHALL be logged

### Requirement: OANDA price streaming job

The executor-service SHALL provide a job to continuously stream prices from OANDA with automatic error recovery.

#### Scenario: Detect and handle stream disconnection

**Given** an active streaming job  
**When** the stream encounters a response error (ECONNRESET, ETIMEDOUT, etc.)  
**Then** the job SHALL detect the disconnection  
**And** the job SHALL log the error with context (error code, consecutive failures)  
**And** the job SHALL capture the error to Sentry  
**And** the job SHALL clean up the existing stream  
**And** the job SHALL schedule a reconnection attempt

#### Scenario: Retry indefinitely with exponential backoff

**Given** a streaming job that encounters connection errors  
**When** reconnection is needed  
**Then** the job SHALL retry with exponential backoff delays: [1s, 2s, 4s, 8s, 30s]  
**And** the job SHALL cap the maximum delay at 30 seconds  
**And** the job SHALL continue retrying indefinitely until successful or app shutdown  
**And** the job SHALL NOT have a maximum failure limit  
**And** the job SHALL reset the backoff on successful connection

#### Scenario: Handle errors during reconnection attempt

**Given** a streaming job attempting to reconnect  
**When** the reconnection attempt fails  
**Then** the job SHALL increment the consecutive failure counter  
**And** the job SHALL log the failure with attempt number  
**And** the job SHALL capture the error to Sentry  
**And** the job SHALL schedule the next retry with increased backoff  
**And** the job SHALL NOT crash or stop trying

#### Scenario: Prevent multiple simultaneous reconnection attempts

**Given** a streaming job in reconnection backoff  
**When** another error occurs before reconnection completes  
**Then** the job SHALL NOT schedule duplicate reconnection attempts  
**And** the job SHALL continue with the existing reconnection schedule  
**And** only one active stream connection SHALL exist at a time

#### Scenario: Stop reconnection on job shutdown

**Given** a streaming job in reconnection backoff  
**When** the job's `stop()` method is called  
**Then** the job SHALL set `isShuttingDown` flag to true  
**And** the job SHALL cancel any pending reconnection timers  
**And** the job SHALL stop the active stream if present  
**And** the job SHALL NOT attempt further reconnections  
**And** the job SHALL complete shutdown gracefully

#### Scenario: Handle chunk processing errors without crashing stream

**Given** an active streaming job  
**When** an error occurs while processing a price chunk (e.g., Redis write failure)  
**Then** the job SHALL log the error with chunk data  
**And** the job SHALL capture the error to Sentry  
**And** the job SHALL continue processing subsequent chunks  
**And** the stream SHALL remain active  
**And** the job SHALL NOT attempt reconnection

### Requirement: Symbol translation

The streaming job SHALL translate between OANDA symbol format and universal symbol format.

#### Scenario: Translate universal symbols to OANDA format

**Given** universal symbols ["XAUUSD", "EURUSD", "GBPUSD"]  
**When** the job prepares to start streaming  
**Then** the symbols SHALL be translated to OANDA format: ["XAU_USD", "EUR_USD", "GBP_USD"]  
**And** the translated symbols SHALL be passed to the stream API

#### Scenario: Translate OANDA symbols to universal format

**Given** a PRICE event with instrument "EUR_USD"  
**When** the job processes the event  
**Then** the symbol SHALL be translated to universal format: "EURUSD"  
**And** the universal symbol SHALL be used for caching

### Requirement: Error handling and monitoring

The streaming job SHALL handle errors gracefully and provide monitoring capabilities.

#### Scenario: Log and capture stream errors

**Given** an active streaming job  
**When** an error occurs during stream processing  
**Then** the job SHALL log the error with context  
**And** the job SHALL capture the error to Sentry  
**And** the job SHALL include relevant metadata (symbol, accountId, error message)  
**And** the job SHALL attempt to reconnect

#### Scenario: Track consecutive failures

**Given** an active streaming job  
**When** a connection failure occurs  
**Then** the job SHALL increment the consecutive failure counter  
**And** when a successful connection is established  
**Then** the job SHALL reset the consecutive failure counter to 0

### Requirement: Live Price Broadcast

The `executor-service` SHALL broadcast live price updates to a dedicated Redis stream (`PRICE_UPDATES`) to enable real-time order adjustments.

#### Scenario: Validation against official schema
- **WHEN** a `LIVE_PRICE_UPDATE` message is published
- **THEN** it SHALL follow the structure defined in `libs/shared/utils/src/interfaces/messages/live-price-update-payload.ts`.
- **AND** it SHALL contain `accountId`, `channelId`, `symbol`, `currentPrice` (with mandatory bid and ask), `previousPrice` (with mandatory bid and ask), and `timestamp`.

#### Scenario: Conditional broadcasting
- **GIVEN** a price tick is received
- **WHEN** a previous price for the symbol is available in memory
- **AND** the current bid or ask differs from the previous bid or ask
- **THEN** a `LIVE_PRICE_UPDATE` message SHALL be published.

#### Scenario: Suppressed broadcasting
- **WHEN** the first price tick for a symbol is received (no previous price)
- **OR** when the received price is identical to the previous price
- **THEN** no broadcast SHALL be published.

---

### Requirement: Error context and observability

The streaming job SHALL provide comprehensive error context for debugging and monitoring.

#### Scenario: Log errors with full context

**Given** any error in the streaming job  
**When** the error is logged  
**Then** the log SHALL include the error object  
**And** the log SHALL include the error code if available  
**And** the log SHALL include consecutive failure count  
**And** the log SHALL include the account ID  
**And** the log SHALL include the symbols being streamed  
**And** the log SHALL use appropriate log level (error for failures, info for recovery)

#### Scenario: Capture errors to Sentry with metadata

**Given** any error in the streaming job  
**When** the error is captured to Sentry  
**Then** Sentry SHALL receive the error exception  
**And** Sentry SHALL receive context tags (component, action, accountId)  
**And** Sentry SHALL receive extra metadata (symbols, consecutiveFailures, errorCode)  
**And** Sentry SHALL group similar errors appropriately

#### Scenario: Log successful reconnection

**Given** a streaming job that successfully reconnects after failures  
**When** the stream is re-established  
**Then** the job SHALL log an info message  
**And** the log SHALL include the number of failures before recovery  
**And** the log SHALL confirm streaming has resumed  
**And** the consecutive failure counter SHALL be reset to 0

### Requirement: Stream lifecycle management

The streaming job SHALL properly manage the stream lifecycle through all states.

#### Scenario: Initialize stream state on job start

**Given** a new streaming job instance  
**When** the job's `init()` method is called  
**Then** the job SHALL initialize `isShuttingDown` to false  
**And** the job SHALL initialize `consecutiveFailures` to 0  
**And** the job SHALL initialize `streamStop` to undefined  
**And** the job SHALL start the first streaming attempt

#### Scenario: Clean up stream before reconnection

**Given** a streaming job with an active stream  
**When** a disconnection is detected and reconnection is needed  
**Then** the job SHALL call `streamStop()` if it exists  
**And** the job SHALL set `streamStop` to undefined  
**And** the job SHALL wait for cleanup to complete  
**And** the job SHALL then attempt to establish a new stream

#### Scenario: Handle rapid successive errors

**Given** a streaming job experiencing rapid connection failures  
**When** multiple errors occur in quick succession  
**Then** the job SHALL handle each error sequentially  
**And** the job SHALL increment failure count for each error  
**And** the job SHALL apply exponential backoff correctly  
**And** the job SHALL NOT create race conditions  
**And** the job SHALL NOT leak resources

