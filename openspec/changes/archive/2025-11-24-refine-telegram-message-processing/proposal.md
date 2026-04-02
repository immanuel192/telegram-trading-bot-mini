# Change: Refine Telegram Message Processing Logic

## Why
The current telegram-service implementation has several misalignments with the tested message-fetcher logic:
1. **Channel resolution complexity**: The service attempts to resolve `channelId` and `accessHash` from URLs at runtime, adding unnecessary complexity and potential failure points
2. **Incomplete message data**: Missing critical fields like `channelId`, `hashTags`, `hasMedia`, `mediaType`, and `raw` message data
3. **Index inefficiency**: Current index uses `{channelCode, messageId}` but the actual filtering and lookups are done by `channelId`
4. **Reply chain tracking**: Missing `replyToTopId` and `replyToTopMessage` for tracking the first message in reply chains
5. **Field mapping gaps**: The tested message-fetcher script (in `testing/telegram-fetcher`) has validated field mappings that differ from the current service implementation

These issues make debugging difficult, reduce data completeness, and create maintenance burden.

## What Changes
- **TelegramChannel model**:
  - Remove `url` field (no longer needed)
  - Make `channelId` and `accessHash` mandatory fields
  - Remove URL resolution logic - users will provide `channelId` and `accessHash` directly
  
- **TelegramMessage model**:
  - Add `channelId` field (string, format: `-1003409608482`)
  - Change index from `{channelCode, messageId}` to `{channelId, messageId}`
  - Add `replyToTopId` and `replyToTopMessage` to `quotedMessage` structure
  - Add `hashTags` field (array of strings, default empty) with extraction logic
  - Add `hasMedia` and `mediaType` fields
  - Add `raw` field to capture raw mtcute message data
  
- **NewMessagePayload interface**:
  - Add `channelId` field (string)
  
- **TelegramClientService**:
  - Update message processing to align with tested message-fetcher field mappings
  - Add hashtag extraction logic
  - Add media detection and type classification
  - Update raw message serialization to handle mtcute object structure
  - Remove URL parsing and resolution logic
  - Update event publishing to include `channelId`
  - Add push notification support for media detection
  
- **Push Notification for Media Detection**:
  - Add config `NOTIFICATION_ALERT_WHEN_TELEGRAM_MESSAGE_HAS_MEDIA` (default: false)
  - When enabled and media is detected, send push notification via PushSafer
  - Notification message format: `{channelCode} - {mediaType} detected in message`
  - Use existing `PushNotificationService` from `libs/shared/utils`

## Impact
- **Affected specs**: `telegram-client`
- **Affected code**:
  - `libs/dal/src/models/telegram-channel.model.ts`
  - `libs/dal/src/models/telegram-message.model.ts`
  - `libs/dal/src/repositories/telegram-channel.repository.ts`
  - `libs/dal/src/repositories/telegram-message.repository.ts`
  - `libs/shared/utils/src/interfaces/messages/new-message.ts`
  - `apps/telegram-service/src/services/telegram-client.service.ts`
  - `apps/telegram-service/src/config.ts` (add new config option)
- **Breaking changes**: 
  - `TelegramChannel` model structure changes (remove `url`, make `channelId` and `accessHash` required)
  - Index on `TelegramMessage` will change from `{channelCode, messageId}` to `{channelId, messageId}`
  - `NewMessagePayload` consumers must handle the new `channelId` field
- **Dependencies**: None - this is a refinement of existing functionality
- **Migration required**: No - application has not been deployed yet, can start fresh with new schema
