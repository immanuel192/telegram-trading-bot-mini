# Stream Error Handling Specification

## MODIFIED Requirements

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

## ADDED Requirements

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
