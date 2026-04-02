# ai-translation-service Specification

## Purpose
TBD - created by archiving change implement-interpret-ai-service. Update Purpose after archive.
## Requirements
### Requirement: AI Service Interface
The system SHALL provide a unified interface for AI-powered message translation.

#### Scenario: Translate message with classification and extraction
- **WHEN** translateMessage is called with messageText, context, and prompts
- **THEN** the system returns a TranslationResult containing classification and extraction results

#### Scenario: Handle classification-only results
- **WHEN** a message is classified as NONE or non-command
- **THEN** the system returns classification result with null extraction

### Requirement: Two-Stage Translation Pipeline
The system SHALL process messages through a two-stage pipeline: classification followed by extraction.

#### Scenario: Classify message as trading command
- **WHEN** a message contains trading signal keywords and price information
- **THEN** the classification stage returns isCommand=true with command type (LONG, SHORT, TP, SL, CANCEL)

#### Scenario: Classify message as noise
- **WHEN** a message does not contain trading signal information
- **THEN** the classification stage returns isCommand=false with command=NONE

#### Scenario: Extract structured data from classified command
- **WHEN** a message is classified as LONG or SHORT command
- **THEN** the extraction stage returns structured data including symbol, entry, stop_loss, take_profits

#### Scenario: Skip extraction for non-commands
- **WHEN** a message is classified as NONE
- **THEN** the extraction stage is skipped and extraction result is null

### Requirement: Gemini AI Implementation
The system SHALL implement the AI service interface using Google Gemini API.

#### Scenario: Initialize Gemini client with API key
- **WHEN** GeminiAIService is instantiated with API key and model name
- **THEN** the service creates a configured Gemini client ready for requests

#### Scenario: Process classification prompt with Gemini
- **WHEN** classification is requested with custom prompt
- **THEN** the service sends the prompt to Gemini and parses JSON response

#### Scenario: Process extraction prompt with Gemini
- **WHEN** extraction is requested for a classified command
- **THEN** the service sends the extraction prompt to Gemini and parses structured JSON response

#### Scenario: Handle Gemini API errors gracefully
- **WHEN** Gemini API returns an error or rate limit
- **THEN** the service logs the error, captures to Sentry, and throws a descriptive error

### Requirement: Data Type Processing
The system SHALL process and validate AI response data types to ensure correctness.

#### Scenario: Convert string numbers to numeric types
- **WHEN** AI returns numeric fields as strings (e.g., "2445.0")
- **THEN** the service converts them to proper number types

#### Scenario: Validate entry zone as number array
- **WHEN** AI returns entry_zone field
- **THEN** the service ensures it is an array of exactly 2 numbers or null

#### Scenario: Validate take profit allocations
- **WHEN** AI returns take_profits array
- **THEN** the service ensures each allocation is a number between 0-100

### Requirement: Prompt Caching
The system SHALL cache prompt rules in memory to reduce database load (MVP: single instance deployment).

#### Scenario: Cache miss - fetch from database
- **WHEN** a prompt is requested for the first time
- **THEN** the system fetches from database and stores in memory with TTL

#### Scenario: Cache hit - return from memory
- **WHEN** a prompt is requested and exists in cache
- **THEN** the system returns the cached prompt without database query

#### Scenario: Cache expiration after TTL
- **WHEN** cached prompt TTL expires (default 30 minutes)
- **THEN** the next request fetches fresh data from database and re-caches

#### Scenario: Manual cache invalidation for single prompt
- **WHEN** clearCache is called with a promptId
- **THEN** the system removes that specific prompt from memory cache

#### Scenario: Manual cache invalidation for all prompts
- **WHEN** clearCache is called without arguments
- **THEN** the system clears all prompts from memory cache

#### Scenario: MVP single instance constraint
- **WHEN** interpret-service runs as a single instance
- **THEN** in-memory caching is sufficient and performant
- **AND** service restart clears all cached prompts

### Requirement: AI Service Configuration
The system SHALL support configuration of AI service parameters via environment variables.

#### Scenario: Configure Gemini API key
- **WHEN** AI_GEMINI_API_KEY is set in environment
- **THEN** the service uses this key for Gemini API authentication

#### Scenario: Configure Gemini model
- **WHEN** AI_GEMINI_MODEL is set in environment
- **THEN** the service uses the specified model (default: gemini-2.5-flash-lite)

#### Scenario: Configure prompt cache TTL
- **WHEN** AI_PROMPT_CACHE_TTL_SECONDS is set in environment
- **THEN** the service uses this TTL for Redis cache (default: 1800 seconds)

