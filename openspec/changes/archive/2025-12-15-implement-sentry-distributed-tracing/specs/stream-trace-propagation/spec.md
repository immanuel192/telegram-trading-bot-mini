# stream-trace-propagation Specification

## Purpose
Enable automatic distributed tracing across Redis Stream-based message flows by propagating Sentry trace context through stream messages, creating parent-child span relationships across services.

## ADDED Requirements

### Requirement: Stream Message Trace Context Schema
Stream messages MUST include optional Sentry trace context fields to enable distributed tracing across services.

#### Scenario: Trace context fields in stream message
**Given** a stream message is being created  
**When** the message schema is defined  
**Then** the message MUST include optional `_sentryTrace` field of type string  
**And** the message MUST include optional `_sentryBaggage` field of type string  
**And** these fields MUST be optional to maintain backward compatibility  
**And** the fields MUST use underscore prefix to indicate system/internal fields

#### Scenario: Backward compatibility with existing messages
**Given** an existing message without trace context fields  
**When** the message is consumed  
**Then** the consumer MUST process the message successfully  
**And** the consumer MUST NOT fail due to missing trace fields  
**And** a new trace MUST be started if trace context is missing

### Requirement: Publisher Trace Context Injection
Stream publishers MUST inject Sentry trace context into messages when publishing to enable trace propagation.

#### Scenario: Inject trace context on publish
**Given** a message is being published to a Redis Stream  
**When** the publisher serializes the message  
**Then** the publisher MUST call `Sentry.getTraceData()` to get current trace context  
**And** the publisher MUST add `_sentryTrace` field with the trace header value  
**And** the publisher MUST add `_sentryBaggage` field with the baggage value  
**And** the enriched message MUST be published to the stream

#### Scenario: Publish operation wrapped in span
**Given** a message is being published  
**When** the publish operation executes  
**Then** the operation MUST be wrapped in a Sentry span  
**And** the span name MUST be `stream.publish.{topic}`  
**And** the span operation type MUST be `queue.publish`  
**And** the span MUST include messaging attributes (system, destination, message type)

#### Scenario: Span attributes for published message
**Given** a message is being published within a span  
**When** the span is created  
**Then** the span MUST include attribute `messaging.system` with value `redis`  
**And** the span MUST include attribute `messaging.destination` with the topic name  
**And** the span MUST include attribute `messaging.message.type` with the message type  
**And** the span MUST include attribute `traceToken` with the message's trace token  
**And** the span MUST include attribute `messageId` with the Redis Stream message ID after publish

### Requirement: Consumer Trace Context Continuation
Stream consumers MUST extract and continue Sentry trace context from messages to link consumer spans to publisher spans.

#### Scenario: Continue trace from message
**Given** a message with trace context is consumed from a Redis Stream  
**When** the consumer processes the message  
**Then** the consumer MUST extract `_sentryTrace` and `_sentryBaggage` from the message  
**And** the consumer MUST call `Sentry.continueTrace()` with the extracted context  
**And** the consumer's span MUST be a child of the publisher's span in the trace

#### Scenario: Consume operation wrapped in span
**Given** a message is being consumed  
**When** the consumer processes the message  
**Then** the processing MUST be wrapped in a Sentry span  
**And** the span name MUST be `stream.consume.{messageType}`  
**And** the span operation type MUST be `queue.process`  
**And** the span MUST include messaging attributes (system, message ID, message type)

#### Scenario: Span attributes for consumed message
**Given** a message is being consumed within a span  
**When** the span is created  
**Then** the span MUST include attribute `messaging.system` with value `redis`  
**And** the span MUST include attribute `messaging.message.id` with the Redis Stream message ID  
**And** the span MUST include attribute `messaging.message.type` with the message type  
**And** the span MUST include attribute `traceToken` with the message's trace token  
**And** the span MUST include attribute `streamMessageId` with the Redis Stream message ID

### Requirement: Base Message Handler Tracing Support
The base message handler MUST provide a tracing wrapper method for subclasses to use.

#### Scenario: Tracing wrapper method
**Given** a message handler extends `BaseMessageHandler`  
**When** the handler implements its `handle` method  
**Then** the handler MUST have access to a `processWithTracing` method  
**And** the method MUST accept the message, stream ID, and handler function  
**And** the method MUST handle trace continuation and span creation  
**And** the method MUST execute the provided handler function within the span

#### Scenario: Handler uses tracing wrapper
**Given** a message handler is processing a message  
**When** the handler's `handle` method is called  
**Then** the handler MUST call `processWithTracing` with the message and handler logic  
**And** the handler logic MUST be executed within a Sentry span  
**And** the span MUST be linked to the publisher's span if trace context exists

### Requirement: End-to-End Trace Visibility
Complete message flows MUST create unified traces visible in Sentry UI showing all service hops.

#### Scenario: Multi-service trace creation
**Given** a message flows through multiple services (telegram-service → trade-manager → interpret-service)  
**When** each service publishes and consumes the message  
**Then** a single unified trace MUST be created in Sentry  
**And** the trace MUST show all spans from all services in chronological order  
**And** the trace MUST show parent-child relationships between spans  
**And** the trace MUST be searchable by `traceToken` in Sentry UI

#### Scenario: Trace waterfall visualization
**Given** a complete message flow has been processed  
**When** viewing the trace in Sentry UI  
**Then** the trace MUST display as a waterfall chart  
**And** each span MUST show its duration  
**And** nested spans MUST be indented to show hierarchy  
**And** the total trace duration MUST be visible

### Requirement: TraceToken Integration
Sentry spans MUST include the existing `traceToken` as an attribute for cross-system correlation.

#### Scenario: TraceToken in span attributes
**Given** a message is being processed within a Sentry span  
**When** the span is created  
**Then** the span MUST include the message's `traceToken` as a custom attribute  
**And** the `traceToken` MUST be searchable in Sentry UI  
**And** the `traceToken` MUST be visible in span details

#### Scenario: Dual correlation system
**Given** the system uses both Sentry traces and custom traceToken  
**When** debugging a message flow  
**Then** users MUST be able to find traces by searching for `traceToken` in Sentry  
**And** users MUST be able to find logs by searching for `traceToken` in log aggregation  
**And** both systems MUST provide consistent correlation

## MODIFIED Requirements

### Requirement: Stream Message Schema (from stream-publisher spec)
Stream messages MUST include optional Sentry trace context fields in addition to existing version, type, and payload fields.

**Modified**: Add optional Sentry trace context fields

**Original**: Stream messages contain version, type, and payload  
**New**: Stream messages additionally contain optional `_sentryTrace` and `_sentryBaggage` fields for distributed tracing

#### Scenario: Stream message structure
**Given** a stream message is created  
**When** the message is serialized  
**Then** the message MUST include `version` field  
**And** the message MUST include `type` field  
**And** the message MUST include `payload` field  
**And** the message MAY include `_sentryTrace` field (NEW)  
**And** the message MAY include `_sentryBaggage` field (NEW)
