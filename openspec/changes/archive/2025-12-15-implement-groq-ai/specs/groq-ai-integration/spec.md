# groq-ai-integration Specification Delta

## Purpose
Integrate Groq AI as a stateless alternative LLM provider for message translation with structured JSON output support.

## ADDED Requirements

### Requirement: Groq AI Service Implementation
The system SHALL implement the IAIService interface using Groq API as a stateless provider.

#### Scenario: Initialize Groq client with API key
- **WHEN** GroqAIService is instantiated with Groq API key, model name, prompt cache service, and logger
- **THEN** the service creates a configured Groq client ready for requests
- **AND** the client is configured for JSON structured output
- **AND** no session manager is created (stateless design)

#### Scenario: Process translation with Groq (stateless)
- **WHEN** translateMessage is called on GroqAIService
- **THEN** the service fetches system prompt from PromptCacheService
- **AND** builds context-aware user message
- **AND** sends stateless request to Groq with system + user messages
- **AND** parses the JSON response into TranslationResult
- **AND** returns the result to the caller

#### Scenario: Fetch system prompt on every request
- **WHEN** translateMessage is called
- **THEN** the service fetches prompt from PromptCacheService using promptId
- **AND** uses the system prompt directly (no isolation instruction)
- **AND** sends prompt as `role: 'system'` message
- **AND** prompt is cached by PromptCacheService (not by AI service)

#### Scenario: Handle Groq API errors gracefully
- **WHEN** Groq API returns an error or rate limit
- **THEN** the service logs the error and captures to Sentry
- **AND** returns a safe fallback response with isCommand=false
- **AND** includes error message in reason field
- **AND** no session cleanup is needed (stateless)

### Requirement: Groq Stateless Request Format
The system SHALL send independent requests to Groq without maintaining conversation history.

#### Scenario: Build stateless message array
- **WHEN** sending a request to Groq
- **THEN** the messages array contains exactly 2 messages
- **AND** first message has `role: 'system'` with system prompt content
- **AND** second message has `role: 'user'` with contextualized message
- **AND** no previous conversation history is included

#### Scenario: No isolation instruction needed
- **WHEN** system prompt is sent to Groq
- **THEN** the prompt contains only the actual prompt content
- **AND** no isolation instruction is prepended
- **AND** each request is independent (no context bleeding risk)

#### Scenario: Context building matches Gemini format
- **WHEN** building user message for Groq
- **THEN** the format matches Gemini's context format
- **AND** includes `Context: {JSON}` with prevMessage, quotedMessage, orders
- **AND** includes `Message to translate: "{messageText}"`
- **AND** downstream processing remains compatible

### Requirement: Groq JSON Schema Structured Output
The system SHALL use Groq's JSON Schema mode for structured responses.

#### Scenario: Configure JSON schema response format
- **WHEN** Groq API request is made
- **THEN** request includes `response_format` parameter
- **AND** format type is `json_schema`
- **AND** schema name is `translation_result`
- **AND** schema matches TranslationResult structure

#### Scenario: Manual schema conversion from Gemini format
- **WHEN** Groq response schema is defined
- **THEN** schema uses standard JSON Schema format (not Gemini's SchemaType)
- **AND** schema structure matches Gemini's GEMINI_RESPONSE_SCHEMA
- **AND** all fields, types, enums, and descriptions are preserved
- **AND** nullable fields are marked with `nullable: true`
- **AND** schema is manually defined for code readability

#### Scenario: Parse JSON response
- **WHEN** Groq returns a response
- **THEN** response content is valid JSON
- **AND** JSON conforms to the provided schema
- **AND** service parses JSON into TranslationResult
- **AND** no additional validation is needed (schema enforced by Groq)

### Requirement: Provider Selection Configuration
The system SHALL support runtime provider selection via environment variables.

#### Scenario: Configure Groq as provider
- **WHEN** AI_PROVIDER environment variable is set to 'groq'
- **THEN** the container creates GroqAIService
- **AND** service uses AI_GROQ_API_KEY for authentication
- **AND** service uses AI_GROQ_MODEL for model selection
- **AND** service receives PromptCacheService instance

#### Scenario: Configure Gemini as provider
- **WHEN** AI_PROVIDER environment variable is set to 'gemini'
- **THEN** the container creates GeminiAIService
- **AND** service uses AI_GEMINI_API_KEY for authentication
- **AND** service uses AI_GEMINI_MODEL for model selection
- **AND** service uses GeminiSessionManager for session management

#### Scenario: Default provider selection
- **WHEN** AI_PROVIDER is not set or is 'groq'
- **THEN** the system defaults to Groq provider
- **AND** Groq configuration is validated

#### Scenario: Provider factory pattern
- **WHEN** container is created
- **THEN** factory function selects provider based on AI_PROVIDER config
- **AND** factory creates appropriate AI service
- **AND** Groq service is stateless (no session manager)
- **AND** Gemini service uses session manager
- **AND** both providers share PromptCacheService instance

### Requirement: Groq Model Configuration
The system SHALL support configuration of Groq model selection.

#### Scenario: Configure Groq model
- **WHEN** AI_GROQ_MODEL environment variable is set
- **THEN** the service uses the specified model
- **AND** model is passed to Groq API requests

#### Scenario: Default Groq model
- **WHEN** AI_GROQ_MODEL is not set
- **THEN** the system defaults to 'mixtral-8x7b-32768'
- **AND** model is validated as supported by Groq

#### Scenario: Supported Groq models
- **WHEN** selecting a Groq model
- **THEN** supported models include:
  - `mixtral-8x7b-32768` (default - balanced speed/accuracy)
  - `llama-3.3-70b-versatile` (higher accuracy)
  - `llama-3.1-8b-instant` (fastest)
- **AND** other Groq models can be configured if needed

### Requirement: Groq Response Compatibility
The system SHALL ensure Groq responses are compatible with existing TranslationResult consumers.

#### Scenario: Response format matches Gemini
- **WHEN** Groq returns a translation result
- **THEN** result structure matches Gemini's TranslationResult
- **AND** all required fields are present (isCommand, command, confidence, reason, extraction)
- **AND** extraction structure matches AIExtraction interface
- **AND** downstream consumers work without modification

#### Scenario: Error response format
- **WHEN** Groq service encounters an error
- **THEN** fallback response matches Gemini's error format
- **AND** isCommand is false
- **AND** command is 'NONE'
- **AND** confidence is 0
- **AND** reason contains error message
- **AND** extraction is null

### Requirement: Provider Folder Organization
The system SHALL organize provider-specific code in dedicated folders.

#### Scenario: Gemini provider isolation
- **WHEN** Gemini-specific code is needed
- **THEN** all code is located in `ai/providers/gemini/` folder
- **AND** folder contains service, session manager, managed session, and schema
- **AND** session management is Gemini-specific (not abstracted)

#### Scenario: Groq provider isolation
- **WHEN** Groq-specific code is needed
- **THEN** all code is located in `ai/providers/groq/` folder
- **AND** folder contains service and schema only (no session management)
- **AND** Groq service is stateless

#### Scenario: Shared code location
- **WHEN** code is shared across providers
- **THEN** PromptCacheService is shared
- **AND** IAIService interface is shared
- **AND** TranslationResult types are shared
- **AND** no generic session abstraction exists (Gemini-specific)

## MODIFIED Requirements

### Requirement: AI Service Configuration
The system SHALL support configuration of AI service parameters via environment variables for both Gemini and Groq providers.

#### Scenario: Configure Groq API key
- **WHEN** AI_GROQ_API_KEY is set in environment
- **THEN** the service uses this key for Groq API authentication
- **AND** key is validated on service initialization

#### Scenario: Configure Groq model
- **WHEN** AI_GROQ_MODEL is set in environment
- **THEN** the service uses the specified model (default: mixtral-8x7b-32768)
- **AND** model is used in all Groq API requests

#### Scenario: Configure provider selection
- **WHEN** AI_PROVIDER is set in environment
- **THEN** the system creates the appropriate provider service
- **AND** validates required configuration for selected provider

#### Scenario: Maintain Gemini configuration
- **WHEN** Gemini provider is selected
- **THEN** existing Gemini configuration still works
- **AND** AI_GEMINI_API_KEY and AI_GEMINI_MODEL are used
- **AND** no breaking changes to Gemini setup
