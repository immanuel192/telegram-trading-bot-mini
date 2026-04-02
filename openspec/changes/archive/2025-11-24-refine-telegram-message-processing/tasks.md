# Tasks: Refine Telegram Message Processing Logic

## Phase 1: Update Data Models
- [ ] **Task 1.1**: Update `TelegramChannel` model
  - Remove `url` field
  - Make `channelId` and `accessHash` required (non-optional)
  - Update JSDoc comments
  - **Validation**: TypeScript compilation succeeds, no optional `?` on these fields

- [ ] **Task 1.2**: Update `TelegramMessage` model
  - Add `channelId: string` field
  - Add `hasMedia: boolean` field
  - Add `mediaType?: 'photo' | 'video' | 'document' | 'audio' | 'voice' | 'sticker' | 'animation' | 'other'` field
  - Add `hashTags: string[]` field with default `[]`
  - Move `raw` from `meta.raw` to top-level `raw: Record<string, any>` field
  - Add `replyToTopId?: number` to `quotedMessage` structure
  - Add `replyToTopMessage?: { id: number; message: string }` to `quotedMessage` structure
  - Add `hasMedia: boolean` to `quotedMessage` structure
  - Update JSDoc comments
  - **Validation**: TypeScript compilation succeeds, model exports correctly

- [ ] **Task 1.3**: Update `NewMessagePayload` interface
  - Add `channelId: string` field
  - Update JSDoc comments
  - **Validation**: TypeScript compilation succeeds, interface exports correctly

## Phase 2: Update Repository Layer
- [ ] **Task 2.1**: Update `TelegramChannelRepository`
  - Remove any URL resolution methods
  - Update `findActiveChannels` to ensure it returns channels with required fields
  - Add validation that `channelId` and `accessHash` are present
  - **Validation**: Unit tests pass, TypeScript compilation succeeds

- [ ] **Task 2.2**: Update `TelegramMessageRepository`
  - Update `create` method to handle new fields
  - Update `findByChannelAndMessageId` to use `channelId` instead of `channelCode` (or add new method)
  - Update `findLatestBefore` to use `channelId` instead of `channelCode` (or add new method)
  - Update `markAsDeleted` to use `channelId` instead of `channelCode` (or add new method)
  - **Validation**: Integration tests pass

## Phase 3: Update Service Logic
- [ ] **Task 3.1**: Add utility functions to `TelegramClientService`
  - Add `extractHashTags(text: string): string[]` method (reference: message-fetcher.ts lines 11-17)
  - Add `extractMediaInfo(message: Message)` method (reference: message-fetcher.ts lines 22-87)
  - Add `serializeRawMessage(message: Message)` method (reference: message-fetcher.ts lines 94-148)
  - **Validation**: Unit tests for each utility function

- [ ] **Task 3.2**: Remove URL resolution logic from `TelegramClientService`
  - Remove `parseChannelUrl` method
  - Remove `resolveChannelByUrl` method
  - Remove `resolveChannel` method
  - Update `resolveChannels` to skip resolution, just load channels with required fields
  - **Validation**: Code compiles, unused imports removed

- [ ] **Task 3.3**: Update `processMessage` method in `TelegramClientService`
  - Extract `channelId` from message and add to `TelegramMessage` document
  - Call `extractHashTags` and populate `hashTags` field
  - Call `extractMediaInfo` and populate `hasMedia` and `mediaType` fields
  - Call `serializeRawMessage` and populate `raw` field (not `meta.raw`)
  - Extract `replyToTopId` from `message.raw.replyTo.replyToTopId`
  - Populate `replyToTopMessage` if `replyToTopId` exists (lookup from repository)
  - Update `quotedMessage` to include `hasMedia` field
  - **Validation**: Integration tests verify all fields are populated correctly

- [ ] **Task 3.4**: Update `publishMessageEvent` method in `TelegramClientService`
  - Add `channelId` to `NewMessagePayload`
  - **Validation**: Integration test verifies payload structure

## Phase 4: Push Notification Support
- [ ] **Task 4.1**: Add config option for media alerts
  - Add `NOTIFICATION_ALERT_WHEN_TELEGRAM_MESSAGE_HAS_MEDIA` to `apps/telegram-service/src/config.ts`
  - Default value: `false`
  - Type: boolean (string 'true'/'false' from env)
  - Add JSDoc comment explaining the feature
  - **Validation**: Config loads correctly, TypeScript compilation succeeds

- [ ] **Task 4.2**: Inject PushNotificationService into TelegramClientService
  - Add `PushNotificationService` to constructor dependencies
  - Initialize service with API key from config
  - Make it optional (only initialize if API key is present)
  - **Validation**: Service initializes correctly, no errors if API key missing

- [ ] **Task 4.3**: Add media alert logic to processMessage
  - After media detection, check if `NOTIFICATION_ALERT_WHEN_TELEGRAM_MESSAGE_HAS_MEDIA` is enabled
  - If enabled and `hasMedia` is true, send push notification
  - Notification message: `{channelCode} - {mediaType} detected in message`
  - Notification title: `Telegram Media Alert`
  - Send to all devices (`d: 'a'`)
  - Enable vibration (`v: '1'`)
  - Use trace token: `telegram-{channelCode}-{messageId}`
  - Handle errors gracefully (log but don't fail message processing)
  - **Validation**: Integration test verifies notification is sent when enabled

- [ ] **Task 4.4**: Add unit tests for push notification
  - Test notification sent when config enabled and media detected
  - Test notification NOT sent when config disabled
  - Test notification NOT sent when no media
  - Test error handling when notification fails
  - **Validation**: All unit tests pass

## Phase 5: Update Tests
- [ ] **Task 5.1**: Update `TelegramClientService` unit tests
  - Update mocks for new model structure
  - Add tests for `extractHashTags` utility
  - Add tests for `extractMediaInfo` utility
  - Add tests for `serializeRawMessage` utility
  - Update `processMessage` tests to verify new fields
  - Update `publishMessageEvent` tests to verify `channelId` in payload
  - **Validation**: All unit tests pass

- [ ] **Task 5.2**: Update integration tests
  - Update test fixtures with new model structure
  - Add test for message with hashtags
  - Add test for message with media
  - Add test for message with reply chain (replyToTopId)
  - Verify field mappings match message-fetcher reference implementation
  - **Validation**: All integration tests pass

- [ ] **Task 5.3**: Update repository tests
  - Update test fixtures with new model structure
  - Add tests for new query methods (if any)
  - **Validation**: All repository tests pass

## Phase 6: Documentation
- [ ] **Task 6.1**: Update spec documentation
  - Update `telegram-client` spec with new data model
  - Document migration process
  - **Validation**: Spec is clear and complete

- [ ] **Task 6.2**: Update README files
  - Update `apps/telegram-service/README.md` with new channel setup process
  - Document how to obtain `channelId` and `accessHash` using telegram-fetcher
  - **Validation**: README is clear and accurate

## Dependencies
- Task 2.x depends on Task 1.x (models must be updated first)
- Task 3.x depends on Task 1.x and 2.x (models and repositories must be updated first)
- Task 4.x depends on Task 3.1 (media detection must be implemented first)
- Task 5.x depends on Task 3.x and 4.x (service logic and push notifications must be updated first)
- Task 6.x can be done in parallel with Task 5.x

## Parallelizable Work
- Task 3.1 (utility functions) can be done in parallel with Task 2.x
- Task 4.1 (config option) can be done in parallel with Task 3.x
- Task 6.x (documentation) can be done in parallel with Task 5.x
