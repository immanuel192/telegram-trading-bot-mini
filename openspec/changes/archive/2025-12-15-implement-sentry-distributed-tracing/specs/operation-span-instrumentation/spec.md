# operation-span-instrumentation Specification

## Purpose
Provide granular performance visibility by instrumenting key operations (database queries, AI inference, message publishing) with Sentry spans, enabling bottleneck identification and performance optimization.

## ADDED Requirements

### Requirement: Database Operation Spans
Database operations MUST be wrapped in Sentry spans to track query performance.

#### Scenario: MongoDB query span
**Given** a database query is being executed  
**When** the query operation runs  
**Then** the operation MUST be wrapped in a Sentry span  
**And** the span name MUST describe the operation (e.g., `fetch-message`, `fetch-orders`)  
**And** the span operation type MUST be `db.query` for read operations  
**And** the span operation type MUST be `db.mutation` for write operations

#### Scenario: Database span attributes
**Given** a database operation is wrapped in a span  
**When** the span is created  
**Then** the span MUST include attribute `db.system` with value `mongodb`  
**And** the span MUST include relevant query parameters (e.g., `channelId`, `messageId`, `accountId`)  
**And** the span MUST include result metadata (e.g., `found`, `count`, `ordersCount`)  
**And** the span MUST NOT include sensitive data (e.g., passwords, API keys)

#### Scenario: Common database operations
**Given** various database operations are performed  
**When** instrumenting these operations  
**Then** `findByChannelAndMessageId` MUST be wrapped in span named `fetch-message`  
**And** `findAll` for orders MUST be wrapped in span named `fetch-orders`  
**And** `addHistoryEntry` MUST be wrapped in span named `add-history-entry`  
**And** `findActiveByChannelCode` MUST be wrapped in span named `fetch-active-accounts`

### Requirement: AI Inference Spans
AI/LLM API calls MUST be wrapped in Sentry spans to track inference performance.

#### Scenario: AI translation span
**Given** an AI translation is being performed  
**When** the AI service is called  
**Then** the operation MUST be wrapped in a Sentry span  
**And** the span name MUST be `ai-translate`  
**And** the span operation type MUST be `ai.inference`

#### Scenario: AI span attributes
**Given** an AI inference operation is wrapped in a span  
**When** the span is created  
**Then** the span MUST include attribute `ai.provider` with the provider name (`gemini` or `groq`)  
**And** the span MUST include attribute `promptId` with the prompt rule ID  
**And** the span MUST include attribute `channelId` with the channel ID  
**And** the span MUST include attribute `accountId` with the account ID  
**And** after completion, the span MUST include `isCommand` with the result value  
**And** after completion, the span MUST include `confidence` with the confidence score

#### Scenario: AI provider identification
**Given** multiple AI providers are supported (Gemini, Groq)  
**When** an AI inference span is created  
**Then** the span MUST identify which provider is being used  
**And** the `ai.provider` attribute MUST be set correctly  
**And** provider-specific attributes MAY be added (e.g., `ai.model` for model name)

### Requirement: Message Publishing Spans
Message publishing operations MUST be wrapped in Sentry spans to track publishing performance.

#### Scenario: Publish operation span
**Given** a message is being published to a Redis Stream  
**When** the publish operation executes  
**Then** the operation MUST be wrapped in a Sentry span  
**And** the span name MUST describe the publish operation (e.g., `publish-translate-request`)  
**And** the span operation type MUST be `queue.publish`

#### Scenario: Publish span attributes
**Given** a message publishing operation is wrapped in a span  
**When** the span is created  
**Then** the span MUST include relevant message metadata (e.g., `accountId`, `promptId`, `channelId`)  
**And** after completion, the span MUST include `streamMessageId` with the Redis Stream message ID  
**And** the span MUST include `topic` with the stream topic name

### Requirement: Nested Span Hierarchy
Spans MUST be properly nested to show operation hierarchy and dependencies.

#### Scenario: Parent-child span relationships
**Given** a message handler processes a message with multiple operations  
**When** the operations are executed  
**Then** the consume span MUST be the parent of all operation spans  
**And** database spans MUST be children of the consume span  
**And** AI inference spans MUST be children of the consume span  
**And** publish spans MUST be children of the consume span  
**And** the Sentry UI MUST show proper indentation for nested spans

#### Scenario: Sequential operation spans
**Given** a message handler performs operations sequentially  
**When** viewing the trace in Sentry UI  
**Then** spans MUST appear in chronological order  
**And** non-overlapping spans MUST be displayed sequentially  
**And** the total handler duration MUST equal the sum of all child span durations plus overhead

### Requirement: Span Naming Conventions
Span names MUST follow consistent conventions for easy identification and filtering.

#### Scenario: Naming pattern for database operations
**Given** a database operation is being instrumented  
**When** the span name is chosen  
**Then** the name MUST use kebab-case (e.g., `fetch-message`, `add-history-entry`)  
**And** the name MUST be descriptive of the operation  
**And** the name MUST NOT include variable data (e.g., IDs, tokens)

#### Scenario: Naming pattern for AI operations
**Given** an AI operation is being instrumented  
**When** the span name is chosen  
**Then** the name MUST use kebab-case (e.g., `ai-translate`)  
**And** the name MUST indicate it's an AI operation  
**And** the name MUST be consistent across all AI providers

#### Scenario: Naming pattern for publish operations
**Given** a publish operation is being instrumented  
**When** the span name is chosen  
**Then** the name MUST start with `publish-` prefix  
**And** the name MUST indicate the message type being published (e.g., `publish-translate-request`)  
**And** the name MUST use kebab-case

### Requirement: Operation Type Conventions
Span operation types MUST follow OpenTelemetry semantic conventions.

#### Scenario: Database operation types
**Given** a database operation is being instrumented  
**When** the span operation type is set  
**Then** read operations MUST use `db.query`  
**And** write operations MUST use `db.mutation`  
**And** the operation type MUST be consistent across all database spans

#### Scenario: Messaging operation types
**Given** a messaging operation is being instrumented  
**When** the span operation type is set  
**Then** publish operations MUST use `queue.publish`  
**And** consume operations MUST use `queue.process`  
**And** the operation type MUST follow OpenTelemetry conventions

#### Scenario: AI operation types
**Given** an AI operation is being instrumented  
**When** the span operation type is set  
**Then** inference operations MUST use `ai.inference`  
**And** the operation type MUST be consistent across all AI providers

### Requirement: Performance Overhead Minimization
Span instrumentation MUST have minimal performance impact on message processing.

#### Scenario: Span creation overhead
**Given** spans are being created for operations  
**When** measuring the overhead  
**Then** span creation MUST take less than 5ms per span  
**And** the total overhead for a typical message flow MUST be less than 50ms  
**And** the overhead MUST be negligible compared to actual operation durations

#### Scenario: Selective instrumentation
**Given** operations of varying durations exist  
**When** deciding which operations to instrument  
**Then** operations taking less than 10ms SHOULD NOT be instrumented  
**And** high-value operations (DB, AI, stream) MUST be instrumented  
**And** trivial operations (variable assignments, simple calculations) MUST NOT be instrumented

### Requirement: Error Handling in Spans
Errors occurring within spans MUST be automatically captured and linked to the span.

#### Scenario: Error captured in span
**Given** an error occurs during a span's operation  
**When** the error is thrown  
**Then** Sentry MUST automatically capture the error  
**And** the error MUST be linked to the span  
**And** the span status MUST be set to ERROR  
**And** the span MUST include the error message

#### Scenario: Error visibility in trace
**Given** an error occurred in a span within a trace  
**When** viewing the trace in Sentry UI  
**Then** the span with the error MUST be visually highlighted  
**And** clicking the span MUST show error details  
**And** the error MUST be linked to the full trace context  
**And** users MUST be able to navigate from error → trace → all spans

## ADDED Requirements (Service-Specific)

### Requirement: Trade-Manager Operation Spans
The trade-manager service MUST instrument its key operations with Sentry spans.

#### Scenario: NewMessageHandler spans
**Given** the `NewMessageHandler` is processing a NEW_MESSAGE  
**When** the handler executes  
**Then** fetching the message from DB MUST be wrapped in `fetch-message` span  
**And** fetching active accounts MUST be wrapped in `fetch-active-accounts` span  
**And** publishing translate requests MUST be wrapped in `publish-translate-request` span  
**And** adding history entries MUST be wrapped in `add-history-entry` span

#### Scenario: TranslateResultHandler spans
**Given** the `TranslateResultHandler` is processing a TRANSLATE_MESSAGE_RESULT  
**When** the handler executes  
**Then** calculating processing duration MUST be wrapped in a span  
**And** emitting metrics MUST be wrapped in a span (if significant duration)

### Requirement: Interpret-Service Operation Spans
The interpret-service MUST instrument its key operations with Sentry spans.

#### Scenario: TranslateRequestHandler spans
**Given** the `TranslateRequestHandler` is processing a TRANSLATE_MESSAGE_REQUEST  
**When** the handler executes  
**Then** fetching orders from DB MUST be wrapped in `fetch-orders` span  
**And** AI translation MUST be wrapped in `ai-translate` span  
**And** publishing result MUST be wrapped in `publish-result` span  
**And** adding history entry MUST be wrapped in `add-history-entry` span

#### Scenario: AI service spans
**Given** the AI service is translating a message  
**When** the translation executes  
**Then** the entire translation MUST be wrapped in `ai-translate` span  
**And** the span MUST include provider-specific attributes  
**And** the span MUST include result metadata after completion
