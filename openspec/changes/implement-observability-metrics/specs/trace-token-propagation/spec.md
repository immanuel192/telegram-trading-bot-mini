# trace-token-propagation Specification

## Purpose
Strengthens trace token propagation across all services to enable end-to-end message tracing and correlation in logs and metrics.

## ADDED Requirements
### Requirement: Trace Token Propagation in Redis Streams
All services MUST include trace tokens in Redis Stream messages to enable downstream traceability.

#### Scenario: Telegram service stream message enhancement
**Given** a message event is published to `stream:telegram:raw`  
**When** the stream message is created  
**Then** the message payload MUST include a `traceToken` field  
**And** the trace token MUST be the same as generated for the original message  
**And** downstream services MUST be able to extract the trace token

#### Scenario: Interpret service stream message enhancement
**Given** a signal is published to trade execution streams  
**When** the stream message is created  
**Then** the message payload MUST include the original `traceToken` field  
**And** the trace token MUST be preserved from the upstream message  
**And** trade-manager MUST be able to extract the trace token

### Requirement: Trace Token Extraction and Usage
Downstream services MUST extract and use trace tokens from received messages.

#### Scenario: Interpret service trace token extraction
**Given** a message is received from `stream:telegram:raw`  
**When** the message is processed  
**Then** the trace token MUST be extracted from the message payload  
**And** the extracted trace token MUST be used in all log statements  
**And** the extracted trace token MUST be included in all metric emissions  
**And** the extracted trace token MUST be propagated to downstream streams

#### Scenario: Trade manager trace token extraction
**Given** a signal is received from interpret-service streams  
**When** the signal is processed  
**Then** the trace token MUST be extracted from the signal payload  
**And** the extracted trace token MUST be used in all log statements  
**And** the extracted trace token MUST be included in all metric emissions

### Requirement: Trace Token Fallback Handling
Services MUST handle missing or invalid trace tokens gracefully.

#### Scenario: Missing trace token in stream message
**Given** a message is received from a Redis Stream without a trace token  
**When** the missing trace token is detected  
**Then** a new trace token MUST be generated using available message identifiers  
**And** a warning MUST be logged indicating trace token generation  
**And** the generated trace token MUST be used for all subsequent operations

#### Scenario: Invalid trace token format
**Given** a trace token is extracted but has invalid format  
**When** the invalid format is detected  
**Then** the trace token MUST be treated as malformed  
**And** a new trace token MUST be generated  
**And** a warning MUST be logged indicating trace token replacement

### Requirement: Trace Token in Service Logs
All services MUST include trace tokens in log statements for correlation.

#### Scenario: Log correlation in interpret service
**Given** a message is being processed in interpret-service  
**When** any log statement is written  
**Then** the log MUST include a `traceToken` field  
**And** the trace token MUST be consistent across all logs for that message  
**And** the trace token MUST match the one from the upstream message

#### Scenario: Log correlation in trade manager
**Given** a signal is being processed in trade-manager  
**When** any log statement is written  
**Then** the log MUST include a `traceToken` field  
**And** the trace token MUST be consistent across all logs for that signal  
**And** the trace token MUST match the one from the upstream signal

### Requirement: Trace Token in Notifications
Services MUST include trace tokens in notifications for traceability.

#### Scenario: Push notification trace token inclusion
**Given** a push notification is sent for a message or signal  
**When** the notification is created  
**Then** the notification payload MUST include the trace token  
**And** the trace token MUST match the original message trace token  
**And** the trace token MUST be available for notification troubleshooting

### Requirement: Trace Token Validation
Services MUST validate trace token format and structure.

#### Scenario: Trace token format validation
**Given** a trace token is extracted or received  
**When** the token is processed  
**Then** the token format MUST be validated as `{messageId}{channelId}`  
**And** the token MUST contain only alphanumeric characters  
**And** the token length MUST be reasonable (between 10 and 100 characters)

#### Scenario: Trace token uniqueness verification
**Given** trace tokens are being generated  
**When** multiple messages are processed  
**Then** each trace token MUST be unique per message  
**And** trace token collisions MUST be extremely unlikely  
**And** duplicate trace tokens MUST trigger a warning if detected
