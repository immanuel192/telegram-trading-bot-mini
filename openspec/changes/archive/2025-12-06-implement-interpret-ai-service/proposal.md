# Change: Implement AI Service for Message Translation in interpret-service

## Why
The interpret-service currently has a placeholder `TranslateRequestHandler` that only logs messages without performing actual translation. We need to implement the AI service layer to translate Telegram messages into structured trading commands using Gemini AI, following the two-stage pipeline pattern (classification + extraction) proven in the gemini-stress-test application.

Additionally, we need to support multi-account scenarios where each account can have its own custom prompt rules, enabling flexible and account-specific message interpretation strategies.

## What Changes
- **New PromptRule Model**: Create a new DAL model to store custom AI prompts with fields for classification and extraction prompts
- **Account Model Enhancement**: Add `promptId` field to link accounts to their prompt rules
- **Message Payload Updates**: 
  - Add `promptId` field to `TRANSLATE_MESSAGE_REQUEST` payload
  - Add `promptId` field to `TRANSLATE_MESSAGE_RESULT` payload
- **TelegramMessageHistory Enhancement**: Add optional `notes` field for audit purposes
- **AI Service Layer**: Implement a unified AI service interface with Gemini as the first concrete implementation
  - Two-stage pipeline: classification → extraction
  - Configurable via environment variables with `AI_GEMINI_*` prefix
  - In-memory read-through caching for prompts with 30-minute TTL (**MVP**: single instance only)
- **trade-manager Updates**: 
  - Fetch active accounts for each channel
  - Send multiple `TRANSLATE_MESSAGE_REQUEST` messages (one per unique promptId)
  - Update message history with AI service notes
- **interpret-service Updates**:
  - Consume `TRANSLATE_MESSAGE_REQUEST` with validation
  - Fetch and cache prompt rules
  - Process messages through AI service
  - Publish `TRANSLATE_MESSAGE_RESULT` with structured commands
  - Add message history entries with AI response notes

## Impact
- **Affected specs**: 
  - `telegram-message-model` (add `notes` field to history)
  - `message-events` (update request/result payloads)
  - `account-management` (add `promptId` field)
  - New spec: `ai-translation-service` (AI service layer)
  - New spec: `prompt-rule-management` (PromptRule model and repository)
- **Affected code**:
  - `libs/dal/src/models/` (new `prompt-rule.model.ts`, update `account.model.ts`, `telegram-message.model.ts`)
  - `libs/dal/src/repositories/` (new `prompt-rule.repository.ts`, update `account.repository.ts`)
  - `libs/shared/utils/src/interfaces/messages/` (update `translate-message-request.ts`, `translate-message-result.ts`)
  - `apps/interpret-service/src/` (new `services/ai/`, update `config.ts`, `container.ts`, `events/consumers/translate-request-handler.ts`)
  - `apps/trade-manager/src/` (update `events/consumers/new-message-handler.ts`)
- **Breaking Changes**: None - all changes are additive
- **Dependencies**: 
  - `@google/generative-ai` package (already used in gemini-stress-test)
  - **Note**: No additional Redis dependency needed (using in-memory cache for MVP)
