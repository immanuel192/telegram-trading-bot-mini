# Tasks: Refine Telegram Service Infrastructure

**Change ID**: `refine-telegram-service-infrastructure`

## Task Breakdown

### Phase 1: Data Model Updates

#### Task 1.1: Update TelegramMessage Model
**Validation**: Model exports new fields; tests pass

- [ ] Remove `raw` field from `TelegramMessage` interface
- [ ] Add `updatedAt?: Date` field
- [ ] Add `originalMessage?: string` field (placed right below `message: string`)
- [ ] Update JSDoc comments to explain new fields
- [ ] Update repository methods if needed

**Files**:
- `libs/dal/src/models/telegram-message.model.ts`

#### Task 1.2: Create MessageHistoryTypeEnum and Update TelegramMessageHistory
**Validation**: Enum exports correctly; history type is enforced

- [ ] Create `MessageHistoryTypeEnum` enum with values:
  - `NEW_MESSAGE = 'new-message'`
  - `EDIT_MESSAGE = 'edit-message'`
- [ ] Add `type: MessageHistoryTypeEnum` field to `TelegramMessageHistory` interface
- [ ] Update JSDoc to clarify this is history type, not message type (Redis stream)
- [ ] Export enum from dal models

**Files**:
- `libs/dal/src/models/telegram-message.model.ts`
- `libs/dal/src/index.ts` (export enum)

#### Task 1.3: Update Existing Code to Use MessageHistoryTypeEnum
**Validation**: All history entries include type field; tests pass

- [ ] Update `TelegramClientService.publishMessageEvent()` to set `type: MessageHistoryTypeEnum.NEW_MESSAGE`
- [ ] Update repository `addHistoryEntry()` to require type field
- [ ] Update all tests to include type field

**Files**:
- `apps/telegram-service/src/services/telegram-client.service.ts`
- `libs/dal/src/repositories/telegram-message.repository.ts`
- `libs/dal/test/repositories/telegram-message.repository.spec.ts`
- `apps/telegram-service/test/unit/services/telegram-client.service.spec.ts`

### Phase 2: Sentry Upgrade and Configuration

#### Task 2.1: Upgrade Sentry Packages
**Validation**: Packages upgraded; no breaking changes

- [ ] Check latest stable version of `@sentry/node`
- [ ] Identify additional packages needed for tracing (e.g., `@sentry/profiling-node`, instrumentation packages)
- [ ] Update `package.json` to use latest versions
- [ ] Run `npm install`
- [ ] Review Sentry migration guide for breaking changes
- [ ] Test Sentry initialization in development

**Files**:
- `package.json`

#### Task 2.2: Revise Sentry Configuration
**Validation**: Sentry only enabled in production; all logs captured

- [ ] Update `apps/telegram-service/src/sentry.ts`:
  - Enable Sentry **only in production** (`enabled: environment === 'production'`)
  - Configure to capture all log levels (not just errors)
  - Enable traces with appropriate sample rate
  - Enable metrics
- [ ] Apply same changes to `apps/interpret-service/src/sentry.ts`
- [ ] Apply same changes to `apps/trade-manager/src/sentry.ts`
- [ ] Update test setup files to mock Sentry in tests

**Files**:
- `apps/telegram-service/src/sentry.ts`
- `apps/interpret-service/src/sentry.ts`
- `apps/trade-manager/src/sentry.ts`
- `apps/*/test/setup.ts`

#### Task 2.3: Implement Custom Metrics Dashboard
**Validation**: Dashboard created in Sentry; metrics are being sent

- [ ] Research Sentry custom metrics API
- [ ] Implement metric instrumentation in code:
  - Stream lag (time between sentAt and receivedAt)
  - Processing rate (messages/minute)
  - Error rate by service
  - Queue depth per channel
  - Message edit count (per channel)
  - Message delete count (per channel)
  - Media detection frequency
- [ ] Create Sentry dashboard configuration
- [ ] Document dashboard setup in `docs/sentry-dashboard.md`

**Files**:
- `apps/telegram-service/src/services/telegram-client.service.ts` (add metrics)
- `docs/sentry-dashboard.md` (new file)

### Phase 3: Deployment Script Fixes

#### Task 3.1: Verify and Fix Build Script
**Validation**: `npm run build` completes successfully

- [ ] Run `npm run build` to verify current behavior
- [ ] If it fails, identify the issue
- [ ] Verify `nx run-many -t build` is the correct command
- [ ] Update `package.json` if needed
- [ ] Test build on clean checkout

**Files**:
- `package.json`

#### Task 3.2: Review and Update .env.local Templates
**Validation**: All .env.local files match app configurations

- [ ] Review `apps/telegram-service/src/config.ts` for all required env vars
- [ ] Update `apps/telegram-service/.env.local` to include all vars
- [ ] Add missing vars:
  - `STREAM_MESSAGE_TTL_IN_SEC`
  - `NOTIFICATION_ALERT_WHEN_TELEGRAM_MESSAGE_HAS_MEDIA`
  - `PUSHSAFER_API_KEY`
- [ ] Repeat for `apps/interpret-service/.env.local`
- [ ] Repeat for `apps/trade-manager/.env.local`
- [ ] Add comments explaining each variable

**Files**:
- `apps/telegram-service/.env.local`
- `apps/interpret-service/.env.local`
- `apps/trade-manager/.env.local`

#### Task 3.3: Update Setup Server Script
**Validation**: Script references correct build command

- [ ] Update `infra/scripts/setup-server.sh` to use verified build command
- [ ] Ensure script copies .env.local templates correctly
- [ ] Test script in clean environment (if possible)

**Files**:
- `infra/scripts/setup-server.sh`

### Phase 4: Message Edit Support

#### Task 4.1: Add Edit Message Event Listener
**Validation**: Service listens for edit events; handler is called

- [ ] Research mtcute edit message event API
- [ ] Add event listener in `TelegramClientService.setupMessageListeners()`
- [ ] Create `handleEditMessage()` method
- [ ] Log edit events for debugging

**Files**:
- `apps/telegram-service/src/services/telegram-client.service.ts`

#### Task 4.2: Implement Edit Message Processing
**Validation**: Edited messages are updated in DB; history is tracked

- [ ] In `handleEditMessage()`:
  - Extract channelId and messageId from edit event
  - Find existing message using `telegramMessageRepository.findByChannelAndMessageId()`
  - If not found, log warning and return
  - Store current `message` field value in `originalMessage`
  - Update `message` field with new text
  - Set `updatedAt` to current timestamp
  - Call repository update method
- [ ] Create `TelegramMessageRepository.updateMessageEdit()` method
- [ ] Add history entry with type `EDIT_MESSAGE`

**Files**:
- `apps/telegram-service/src/services/telegram-client.service.ts`
- `libs/dal/src/repositories/telegram-message.repository.ts`

#### Task 4.3: Send Push Notification for Edits
**Validation**: Notification sent when message is edited

- [ ] After updating message, send push notification
- [ ] Include both old and new message text in notification
- [ ] Use format: "Message edited in {channel}: Old: {old} → New: {new}"
- [ ] Include trace token

**Files**:
- `apps/telegram-service/src/services/telegram-client.service.ts`

#### Task 4.4: Add Tests for Edit Message Handling
**Validation**: All tests pass

- [ ] Unit test for `handleEditMessage()`
- [ ] Unit test for repository `updateMessageEdit()`
- [ ] Integration test for full edit flow
- [ ] Test edge cases (message not found, edit event for unmonitored channel)

**Files**:
- `apps/telegram-service/test/unit/services/telegram-client.service.spec.ts`
- `libs/dal/test/repositories/telegram-message.repository.spec.ts`
- `apps/telegram-service/test/integration/edit-message.spec.ts` (new)

### Phase 5: Trace Token Implementation

#### Task 5.1: Define Trace Token Format
**Validation**: Format is documented and consistent

- [ ] Document trace token format: `{messageId}{channelId}`
- [ ] Create utility function `generateTraceToken(messageId: number, channelId: string): string`
- [ ] Add to shared utils

**Files**:
- `libs/shared/utils/src/trace-token.ts` (new)
- `libs/shared/utils/src/index.ts` (export)

#### Task 5.2: Add Trace Tokens to Logging
**Validation**: All message-related logs include traceToken

- [ ] Update `TelegramClientService.processMessage()` to generate trace token
- [ ] Add `traceToken` to all log statements in message processing flow
- [ ] Update `publishMessageEvent()` to include trace token in logs
- [ ] Update `handleEditMessage()` to include trace token in logs

**Files**:
- `apps/telegram-service/src/services/telegram-client.service.ts`

#### Task 5.3: Propagate Trace Tokens Through Redis Streams
**Validation**: Trace tokens appear in stream messages

- [ ] Add `traceToken` field to stream message payload
- [ ] Update stream message interface to include traceToken
- [ ] Ensure downstream services can access trace token

**Files**:
- `apps/telegram-service/src/services/telegram-client.service.ts`
- `libs/shared/utils/src/interfaces/messages/*.ts` (update interfaces)

### Phase 6: Push Notification Documentation

#### Task 6.1: Create Push Notification Configuration Guide
**Validation**: Documentation is complete and accurate

- [ ] Create `docs/push-notifications.md`
- [ ] Document all PushSafer parameters from user specification:
  - Required: `k` (API key), `m` (message)
  - Optional: `d` (device), `t` (title), `s` (sound), `v` (vibration), `i` (icon), `c` (color), `u` (URL), `ut` (URL title), `p/p2/p3` (pictures), `is` (image size), `l` (TTL), `pr` (priority), `re` (retry), `ex` (expire), `a` (answer), `ao` (answer options), `af` (force answer), `cr` (confirm/resend), `g` (GIPHY)
- [ ] Provide examples for common scenarios
- [ ] Link from main README.md

**Files**:
- `docs/push-notifications.md` (new)
- `README.md` (add link)

#### Task 6.2: Update PushNotificationSendOptions Interface
**Validation**: Interface supports all documented parameters

- [ ] Review current `PushNotificationSendOptions` interface
- [ ] Add missing optional parameters from documentation
- [ ] Add JSDoc comments for each parameter
- [ ] Update tests if needed

**Files**:
- `libs/shared/utils/src/interfaces/push-notification.interface.ts`

## Dependencies

- Task 1.3 depends on Task 1.1 and 1.2 (model changes must be complete)
- Task 2.2 depends on Task 2.1 (package must be upgraded first)
- Task 2.3 depends on Task 2.2 (Sentry must be configured)
- Task 3.3 depends on Task 3.1 (build command must be verified)
- Task 4.2 depends on Task 1.1 and 1.2 (model changes must be complete)
- Task 4.3 depends on Task 4.2 (edit processing must work)
- Task 4.4 depends on Task 4.2 and 4.3 (implementation must be complete)
- Task 5.2 depends on Task 5.1 (utility must exist)
- Task 5.3 depends on Task 5.2 (logging must be updated)
- Task 6.2 depends on Task 6.1 (documentation defines requirements)

## Parallelizable Work

- Phase 1, 3, and 6 can be worked on in parallel
- Phase 2 can start independently
- Phase 4 depends on Phase 1
- Phase 5 can start after Phase 1

## Validation Strategy

Each task includes specific validation criteria. Overall validation:

1. **Unit Tests**: All existing tests pass; new tests added for new functionality
2. **Integration Tests**: Full message flow works (new message, edit message)
3. **Build Verification**: `npm run build` succeeds
4. **Deployment Verification**: Setup script runs successfully
5. **Observability**: Sentry captures logs and metrics in production
6. **Documentation**: All new features are documented
