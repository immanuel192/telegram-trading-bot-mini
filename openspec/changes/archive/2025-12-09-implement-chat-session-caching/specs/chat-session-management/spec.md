# chat-session-management Specification

## Purpose
Manage AI chat session lifecycle to reduce prompt re-parsing overhead and improve translation performance.

## ADDED Requirements

### Requirement: Chat Session Caching
The system SHALL cache Gemini chat sessions keyed by (channelId, promptId) to avoid re-parsing system prompts.

#### Scenario: First message creates new session
- **WHEN** a message arrives for a (channelId, promptId) with no existing session
- **THEN** the system creates a new ChatSession with system prompts
- **AND** stores it in cache with metadata (createdAt, messageCount = 1)

#### Scenario: Subsequent messages reuse session
- **WHEN** a message arrives for a (channelId, promptId) with an existing valid session
- **THEN** the system retrieves the cached session
- **AND** increments messageCount
- **AND** sends the message via session.sendMessage() without re-sending system prompts

#### Scenario: Different channels get separate sessions
- **WHEN** messages arrive from different channelIds with the same promptId
- **THEN** each channel gets its own independent session

#### Scenario: Different prompts get separate sessions
- **WHEN** messages arrive from the same channelId with different promptIds
- **THEN** each promptId gets its own independent session

### Requirement: Session Expiration - Daily Reset
The system SHALL expire sessions at 8 AM Sydney time to align with gold trading gaps.

#### Scenario: Session expires after 8 AM Sydney time
- **WHEN** a session was created before 8 AM Sydney time
- **AND** current time is >= 8 AM Sydney time
- **THEN** the system expires the session and creates a new one

#### Scenario: Session created after 8 AM remains valid
- **WHEN** a session was created at 9 AM Sydney time
- **AND** current time is 10 AM Sydney time (same day)
- **THEN** the session remains valid (not expired)

#### Scenario: Timezone conversion handles DST correctly
- **WHEN** checking session expiration
- **THEN** the system uses date-fns-tz to convert to Australia/Sydney timezone
- **AND** correctly handles daylight saving time transitions

### Requirement: Session Expiration - Message Count Limit
The system SHALL expire sessions after 100 messages to prevent context bloat.

#### Scenario: Session expires at message count limit
- **WHEN** a session has processed 99 messages
- **AND** the 100th message arrives
- **THEN** the system expires the session after processing the 100th message
- **AND** the next message creates a new session

#### Scenario: Message count increments correctly
- **WHEN** each message is processed via a session
- **THEN** the session's messageCount increments by 1

### Requirement: Message Isolation
The system SHALL process each message independently despite using shared chat sessions.

#### Scenario: System prompt includes isolation instruction
- **WHEN** creating a new chat session
- **THEN** the system prompt includes explicit instruction to process each message independently
- **AND** the instruction tells the AI to ignore previous messages in the conversation

#### Scenario: Concurrent messages don't interfere
- **WHEN** two messages are processed concurrently using the same session
- **THEN** each message is processed independently
- **AND** neither message's context affects the other's result

### Requirement: ChatSessionManager Service
The system SHALL provide a ChatSessionManager service to manage session lifecycle.

#### Scenario: Get or create session
- **WHEN** getOrCreateSession is called with (channelId, promptId)
- **THEN** the system returns a ChatSession configured with the combined system prompt
- **AND** caches it with key `${channelId}:${promptId}:${promptHash}`

#### Scenario: Session creation loads prompts from cache
- **WHEN** creating a new session
- **THEN** the system fetches prompt via PromptCacheService.getPrompt(promptId)
- **AND** uses the systemPrompt for the session

#### Scenario: Session creation fails if prompt not found
- **WHEN** creating a session for a promptId that doesn't exist
- **THEN** the system throws an error with message "Prompt not found: {promptId}"

#### Scenario: Clear session cache for specific key
- **WHEN** clearSession is called with (channelId, promptId)
- **THEN** the system removes that specific session from cache

#### Scenario: Clear all sessions for channel
- **WHEN** clearChannelSessions is called with channelId
- **THEN** the system removes all sessions for that channel

### Requirement: Updated IAIService Interface
The system SHALL update the IAIService interface to accept channelId and promptId instead of prompts.

#### Scenario: Translate message with channelId and promptId
- **WHEN** translateMessage is called with (messageText, context, channelId, promptId)
- **THEN** the system uses ChatSessionManager to get/create sessions
- **AND** processes the message using cached sessions
- **AND** returns TranslationResult

#### Scenario: Backward compatibility removed
- **WHEN** the interface is updated
- **THEN** the old signature with PromptPair parameter is removed
- **AND** all callers must be updated to pass channelId and promptId

### Requirement: Updated TranslateRequestHandler
The system SHALL update TranslateRequestHandler to pass channelId and promptId to AI service.

#### Scenario: Handler passes channelId and promptId
- **WHEN** handling TRANSLATE_MESSAGE_REQUEST
- **THEN** the handler extracts channelId and promptId from payload
- **AND** calls aiService.translateMessage(messageText, context, channelId, promptId)
- **AND** does NOT fetch prompts via PromptCacheService (handled internally by GeminiAIService)

#### Scenario: Handler removes prompt fetching logic
- **WHEN** the handler is updated
- **THEN** the fetchPromptFromCache method is removed
- **AND** prompt fetching is delegated to ChatSessionManager

### Requirement: Session Monitoring and Logging
The system SHALL log session lifecycle events for debugging and monitoring.

#### Scenario: Log session creation
- **WHEN** a new session is created
- **THEN** the system logs with level INFO
- **AND** includes channelId, promptId, promptHash, and createdAt

#### Scenario: Log session reuse
- **WHEN** an existing session is reused
- **THEN** the system logs with level DEBUG
- **AND** includes channelId, promptId, promptHash, messageCount, and age

#### Scenario: Log session expiration
- **WHEN** a session is expired (daily reset or message limit)
- **THEN** the system logs with level INFO
- **AND** includes channelId, promptId, promptHash, reason (daily_reset or message_limit), messageCount, and age

### Requirement: Eager Session Loading on Startup
The system SHALL preload and warm up chat sessions for all active (channelId, promptId) pairs on service startup.

#### Scenario: Load all active accounts and prompts on startup
- **WHEN** the interpret-service starts up
- **THEN** the system fetches all accounts from the database
- **AND** groups them by (channelId, promptId) pairs
- **AND** creates a list of unique (channelId, promptId) combinations

#### Scenario: Create sessions for all active pairs
- **WHEN** the list of (channelId, promptId) pairs is ready
- **THEN** for each pair, the system calls chatSessionManager.getOrCreateSession(channelId, promptId)
- **AND** waits for all sessions to be created (parallel creation)
- **AND** logs the total number of sessions created

#### Scenario: First message after startup uses pre-warmed session
- **WHEN** the first message arrives after startup for a (channelId, promptId)
- **THEN** the session already exists in cache (cache hit)
- **AND** the message is processed immediately without session creation delay
- **AND** latency is <0.5s instead of ~1.2s

#### Scenario: Startup continues even if some sessions fail
- **WHEN** eager loading fails for some (channelId, promptId) pairs
- **THEN** the system logs the errors
- **AND** continues loading other sessions
- **AND** the service starts successfully
- **AND** failed sessions will be created on-demand when messages arrive

### Requirement: Prompt Hash in Session Key
The system SHALL include a hash of the prompt content in the session key to automatically invalidate sessions when prompts change.

#### Scenario: Generate prompt hash from content
- **WHEN** creating a session key
- **THEN** the system computes a hash of the prompt content using SHA-256
- **AND** takes the first 8 characters of the hash
- **AND** includes it in the session key: `${channelId}:${promptId}:${promptHash}`

#### Scenario: Prompt change creates new session automatically
- **WHEN** a prompt is updated in the database
- **AND** the service is restarted (or prompt cache expires)
- **AND** a message arrives for that promptId
- **THEN** the system computes a new prompt hash
- **AND** the session key is different from the old session
- **AND** a new session is created with the updated prompt
- **AND** the old session is orphaned and eventually garbage collected

#### Scenario: Same prompt content reuses session
- **WHEN** a prompt is fetched from cache
- **AND** the content hasn't changed
- **THEN** the prompt hash is the same
- **AND** the existing session is reused

#### Scenario: Prompt hash is logged for debugging
- **WHEN** a session is created or reused
- **THEN** the system logs the promptHash value
- **AND** includes it in session metadata for troubleshooting

#### Scenario: Cache prompt hash map in memory
- **WHEN** a prompt is loaded for the first time
- **THEN** the system computes the hash of the prompt content
- **AND** stores the mapping `promptId -> promptHash` in an in-memory cache
- **AND** subsequent calls for the same promptId return the cached hash without re-hashing

#### Scenario: Retrieve cached prompt hash
- **WHEN** getOrCreateSession is called with a promptId
- **AND** the promptId exists in the hash cache
- **THEN** the system retrieves the cached promptHash
- **AND** does NOT recompute the hash

#### Scenario: Compute and cache hash on first access
- **WHEN** getOrCreateSession is called with a new promptId
- **AND** the promptId does NOT exist in the hash cache
- **THEN** the system fetches the prompt via PromptCacheService
- **AND** computes the SHA-256 hash
- **AND** caches the `promptId -> promptHash` mapping
- **AND** uses the hash for the session key

#### Scenario: Eager loading populates hash cache
- **WHEN** eager session loading runs on startup
- **THEN** for each unique promptId, the system computes and caches the prompt hash
- **AND** the hash cache is fully populated before processing any messages
- **AND** all subsequent getOrCreateSession calls use cached hashes

#### Scenario: Hash cache invalidation on prompt update
- **WHEN** a prompt is updated in the database
- **AND** the PromptCacheService cache expires or is cleared
- **THEN** the next getOrCreateSession call fetches the new prompt content
- **AND** compares the new prompt content hash with the cached hash
- **AND** if different, updates the hash cache with the new value
- **AND** creates a new session with the new hash (old session is orphaned)

#### Scenario: Hash recomputation on every prompt fetch
- **WHEN** getPromptHash is called for a promptId
- **AND** the promptId exists in hash cache
- **THEN** the system returns the cached hash WITHOUT fetching the prompt
- **NOTE:** Hash is only recomputed when PromptCacheService returns new content

#### Scenario: Synchronize hash cache with prompt cache
- **WHEN** PromptCacheService.getPrompt() returns a prompt
- **THEN** the system computes the hash of the returned prompt content
- **AND** compares it with the cached hash (if exists)
- **AND** if hashes differ, updates the hash cache
- **AND** logs a warning about prompt content change

#### Scenario: Clear hash cache when prompt cache is cleared
- **WHEN** PromptCacheService.clearCache(promptId) is called
- **THEN** the system also clears the corresponding hash from the hash cache
- **AND** the next getOrCreateSession will recompute the hash from fresh prompt content

## MODIFIED Requirements

### Requirement: PromptRule Model - Single Combined Prompt
The system SHALL update the PromptRule model to store a single combined prompt instead of separate classification and extraction prompts.

#### Scenario: PromptRule has single systemPrompt field
- **WHEN** the PromptRule model is updated
- **THEN** it has a `systemPrompt: string` field
- **AND** the `classificationPrompt` field is removed
- **AND** the `extractionPrompt` field is removed

#### Scenario: System prompt includes both classification and extraction logic
- **WHEN** a PromptRule is created or updated
- **THEN** the systemPrompt contains instructions for both classification and extraction
- **AND** uses the single-step format with STEP 1 (classify) and STEP 2 (extract)
- **AND** includes the message isolation protocol at the top

#### Scenario: Existing prompts are migrated
- **WHEN** the model change is deployed
- **THEN** a migration script combines existing classificationPrompt and extractionPrompt
- **AND** creates a new systemPrompt field with the combined content
- **AND** preserves the original prompts for rollback (optional)

#### Scenario: PromptCacheService returns single prompt
- **WHEN** PromptCacheService.getPrompt(promptId) is called
- **THEN** it returns the systemPrompt string (not PromptPair)
- **AND** the PromptPair interface is deprecated/removed

### Requirement: ChatSessionManager - Single Session per (channelId, promptId)
The system SHALL manage one session per (channelId, promptId) pair instead of separate classification and extraction sessions.

#### Scenario: Session key has no stage parameter
- **WHEN** generating a session key
- **THEN** the format is `${channelId}:${promptId}:${promptHash}`
- **AND** there is NO stage parameter (no 'classification' or 'extraction' suffix)

#### Scenario: Single getOrCreateSession signature
- **WHEN** getOrCreateSession is called
- **THEN** it accepts (channelId, promptId) only (no stage parameter)
- **AND** returns a single ChatSession configured with the combined systemPrompt

#### Scenario: GeminiAIService uses single session
- **WHEN** translateMessage is called
- **THEN** GeminiAIService gets one session via chatSessionManager.getOrCreateSession(channelId, promptId)
- **AND** sends a single message to the session
- **AND** parses the response containing both classification and extraction

### Requirement: Google Gemini API Error Handling
The system SHALL handle Google Gemini API errors with appropriate retry logic and monitoring.

#### Scenario: Handle HTTP 429 rate limiting error
- **WHEN** session.sendMessage() throws an error with status code 429 (Too Many Requests)
- **THEN** the system logs the error with level ERROR
- **AND** captures the error to Sentry with tag "gemini_rate_limit"
- **AND** includes channelId, promptId, and promptHash in error context
- **AND** does NOT retry the request
- **AND** throws the error to the caller

#### Scenario: Handle HTTP 5xx server errors with retry
- **WHEN** session.sendMessage() throws an error with status code 5xx (500, 502, 503, 504)
- **THEN** the system retries the request up to 3 times
- **AND** waits 500ms between each retry attempt
- **AND** logs each retry attempt with level WARN
- **AND** includes retry attempt number and error details

#### Scenario: Successful retry after transient error
- **WHEN** session.sendMessage() fails with HTTP 503 on first attempt
- **AND** succeeds on second retry attempt
- **THEN** the system returns the successful response
- **AND** logs the recovery with level INFO
- **AND** includes total retry count and duration

#### Scenario: All retries exhausted
- **WHEN** session.sendMessage() fails with HTTP 500
- **AND** all 3 retry attempts also fail
- **THEN** the system logs the final error with level ERROR
- **AND** captures the error to Sentry with tag "gemini_server_error"
- **AND** includes all retry attempt details in error context
- **AND** throws the error to the caller

#### Scenario: Handle network timeout errors
- **WHEN** session.sendMessage() throws a timeout error
- **THEN** the system retries the request up to 3 times
- **AND** waits 500ms between each retry attempt
- **AND** logs the timeout with level WARN

#### Scenario: Handle non-retryable errors
- **WHEN** session.sendMessage() throws an error with status code 4xx (except 429)
- **THEN** the system logs the error with level ERROR
- **AND** captures the error to Sentry with tag "gemini_client_error"
- **AND** does NOT retry the request
- **AND** throws the error to the caller

#### Scenario: Retry backoff configuration
- **WHEN** implementing retry logic
- **THEN** the system uses exponential backoff starting at 500ms
- **AND** maximum retry attempts is 3
- **AND** backoff delays are: 500ms, 1000ms, 2000ms

#### Scenario: Error context includes session metadata
- **WHEN** any Gemini API error is logged or sent to Sentry
- **THEN** the error context includes channelId, promptId, promptHash
- **AND** includes messageCount and session age
- **AND** includes the original error message and stack trace

#### Scenario: Metrics for API errors
- **WHEN** a Gemini API error occurs
- **THEN** the system emits a Sentry metric for the error type
- **AND** includes error code (429, 5xx, timeout, etc.)
- **AND** includes retry count if applicable
