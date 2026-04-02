# Change: Track Telegram Message Processing History

## Why
Currently, when messages flow through the system (telegram-service → interpret-service → trade-manager), there is no audit trail of how each service processes them. This makes debugging and investigating issues difficult, as we cannot trace the complete lifecycle of a message through the processing pipeline.

## What Changes
- Add `TelegramMessageHistory` interface to track processing events in the `telegram-messages` collection
- Create a `ServiceName` enum in `libs/shared/utils` to standardize service identifiers
- Update `telegram-service` to populate the `history` field when publishing messages to Redis streams
- Establish a pattern where services atomically update message history when emitting events to the next service
- Services record history entries even when event publishing fails (with error details)

## Impact
- **Affected specs**: `telegram-client`
- **Affected code**: 
  - `libs/dal/src/models/telegram-message.model.ts` (already updated by user)
  - `libs/shared/utils/src/` (new ServiceName enum)
  - `apps/telegram-service/src/services/telegram-client.service.ts`
  - `libs/dal/src/repositories/telegram-message.repository.ts` (new method for atomic history updates)
- **Breaking changes**: None - this is additive functionality
- **Dependencies**: Requires atomic update operations in MongoDB to ensure history is persisted even if stream publishing fails
