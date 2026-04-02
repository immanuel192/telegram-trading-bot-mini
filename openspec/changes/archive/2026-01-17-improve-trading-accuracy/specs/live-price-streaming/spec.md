# live-price-streaming Specification

## Purpose
Implement real-time price streaming for OANDA to reduce price latency from 20 seconds (polling) to sub-second (streaming). This enables more accurate entry price validation, faster order execution, and better trading decisions based on current market conditions.

## ADDED Requirements

### Requirement: OANDA API async streaming support

The OANDA API client SHALL provide an async method to stream real-time price updates.

#### Scenario: Start price stream for multiple instruments

**Given** an OANDA account ID and instruments list ["EUR_USD", "USD_JPY"]  
**When** `streamAsync(accountID, instruments, onChunk)` is called  
**Then** the API SHALL establish a streaming connection to OANDA  
**And** the method SHALL return a Promise with `{ stop: () => void }` function  
**And** the stream SHALL remain open until stop() is called

#### Scenario: Parse PRICE events from stream

**Given** an active price stream  
**When** a PRICE event is received from OANDA  
**Then** the API SHALL parse the JSON chunk  
**And** the API SHALL create a `ClientPrice` object  
**And** the API SHALL invoke the `onChunk` callback with the ClientPrice  
**And** the callback SHALL receive bid, ask, instrument, and timestamp

#### Scenario: Parse HEARTBEAT events from stream

**Given** an active price stream  
**When** a HEARTBEAT event is received from OANDA  
**Then** the API SHALL parse the JSON chunk  
**And** the API SHALL create a `PricingHeartbeat` object  
**And** the API SHALL invoke the `onChunk` callback with the PricingHeartbeat  
**And** the callback SHALL receive the heartbeat timestamp

#### Scenario: Handle malformed JSON chunks

**Given** an active price stream  
**When** a malformed JSON chunk is received  
**Then** the API SHALL log an error  
**And** the API SHALL skip the malformed chunk  
**And** the stream SHALL continue processing subsequent chunks  
**And** no exception SHALL be thrown

#### Scenario: Stop stream gracefully

**Given** an active price stream  
**When** the `stop()` function is called  
**Then** the API SHALL close the stream connection  
**And** the API SHALL stop invoking the `onChunk` callback  
**And** no errors SHALL be thrown  
**And** resources SHALL be cleaned up

### Requirement: OANDA price streaming job

The executor-service SHALL provide a job to continuously stream prices from OANDA and cache them in Redis.

#### Scenario: Job starts streaming on initialization

**Given** an `oanda-price-streaming-job` configured with symbols ["XAUUSD", "EURUSD"]  
**When** the job's `init()` method is called  
**Then** the job SHALL delete the cronExpression from config  
**And** the job SHALL start streaming immediately  
**And** the job SHALL translate universal symbols to OANDA format (XAUUSD → XAU_USD, EURUSD → EUR_USD)  
**And** the job SHALL use the first OANDA adapter from the broker factory

#### Scenario: Job caches PRICE events

**Given** an active streaming job  
**When** a PRICE event is received for EUR_USD  
**Then** the job SHALL translate the symbol to universal format (EUR_USD → EURUSD)  
**And** the job SHALL extract bid and ask from the first price bucket  
**And** the job SHALL cache the price using `PriceCacheService.setPrice(symbol, bid, ask)`  
**And** the cached price SHALL be available to other services

#### Scenario: Job handles HEARTBEAT events

**Given** an active streaming job  
**When** a HEARTBEAT event is received  
**Then** the job SHALL log a debug message with the heartbeat timestamp  
**And** the job SHALL NOT cache any data  
**And** the job SHALL continue processing

#### Scenario: Job reconnects on disconnect with exponential backoff

**Given** an active streaming job  
**When** the stream connection is lost  
**Then** the job SHALL wait 1 second before first reconnect attempt  
**And** the job SHALL wait 2 seconds before second reconnect attempt  
**And** the job SHALL wait 4 seconds before third reconnect attempt  
**And** the job SHALL wait 8 seconds before fourth reconnect attempt  
**And** the job SHALL wait a maximum of 30 seconds between attempts  
**And** the job SHALL reset the backoff timer on successful reconnection

#### Scenario: Job stops after maximum failures

**Given** an active streaming job  
**When** the stream fails to connect 5 consecutive times  
**Then** the job SHALL stop attempting to reconnect  
**And** the job SHALL log an error indicating max failures reached  
**And** the job SHALL capture the error to Sentry  
**And** the job SHALL terminate gracefully

#### Scenario: Job stops gracefully on shutdown

**Given** an active streaming job  
**When** the job's `stop()` method is called  
**Then** the job SHALL call the stream's stop() function  
**And** the job SHALL wait for the stream to close  
**And** the job SHALL call `super.stop()`  
**And** the job SHALL log a shutdown message  
**And** no errors SHALL be thrown

#### Scenario: Job handles missing OANDA adapter

**Given** an `oanda-price-streaming-job` configuration  
**When** no OANDA adapter is available in the broker factory  
**Then** the job SHALL log a warning  
**And** the job SHALL NOT start streaming  
**And** the job SHALL NOT throw an error  
**And** the job SHALL remain in a stopped state

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

### Requirement: Future extensibility

The streaming job SHALL include placeholders for future enhancements.

#### Scenario: TODO placeholder for LIVE_PRICE_UPDATE event

**Given** the streaming job source code  
**When** a developer reviews the code  
**Then** a TODO comment SHALL be present indicating future work  
**And** the TODO SHALL mention emitting `LIVE_PRICE_UPDATE` events  
**And** the TODO SHALL explain the purpose: "trigger trade-manager updates"  
**And** the TODO SHALL note this is out of scope for the current change

---
