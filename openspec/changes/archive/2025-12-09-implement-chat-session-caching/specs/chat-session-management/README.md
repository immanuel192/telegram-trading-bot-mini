# Chat Session Management

## Overview
This capability manages the lifecycle of Gemini AI chat sessions to optimize performance by caching sessions and avoiding repeated prompt parsing.

## Key Components

### ChatSessionManager
Service responsible for:
- Creating and caching chat sessions by (channelId, promptId, stage)
- Managing session expiration (8 AM Sydney time + 100 message limit)
- Loading prompts via PromptCacheService
- Providing thread-safe session access

### Session Key Structure
```
${channelId}:${promptId}:${stage}
```
Where:
- `channelId`: Telegram channel identifier
- `promptId`: Prompt rule identifier
- `stage`: 'classification' or 'extraction'

### Session Metadata
Each cached session includes:
- `session`: Gemini ChatSession instance
- `createdAt`: Session creation timestamp
- `messageCount`: Number of messages processed
- `channelId`, `promptId`, `stage`: For debugging
- `lastUsedAt`: Last usage timestamp

## Relationships

### Dependencies
- **PromptCacheService**: Loads prompt pairs for session initialization
- **@google/generative-ai**: Provides ChatSession API
- **date-fns-tz**: Handles Sydney timezone conversions

### Used By
- **GeminiAIService**: Uses ChatSessionManager to get/create sessions for classification and extraction
- **IAIService**: Interface updated to accept channelId and promptId

## Performance Impact
- **First message**: Same latency as before (~2.5s)
- **Subsequent messages**: 60-80% reduction (~0.7s)
- **Memory**: ~50KB per session, ~5MB for 100 sessions

## Testing Strategy
- Unit tests for session expiration logic (8 AM Sydney, message count)
- Integration tests for session reuse and isolation
- Integration tests for concurrent message processing
- Tests for timezone handling (DST transitions)
