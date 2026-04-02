# Proposal: Refine Telegram Service Infrastructure

**Change ID**: `refine-telegram-service-infrastructure`  
**Status**: Draft  
**Created**: 2025-11-25

## Overview

This proposal refines the `telegram-service` infrastructure by improving data models, upgrading observability tooling, fixing deployment scripts, enhancing message editing support, implementing trace tokens, and documenting push notification configuration.

## Problem Statement

The current `telegram-service` implementation has several gaps:

1. **Data Model Issues**:
   - `TelegramMessage.raw` field stores redundant data that's already captured in structured fields
   - `TelegramMessageHistory` lacks a `type` field to distinguish between different history event types (new message vs. edit message)
   - No support for tracking message edits (when users edit Telegram messages)
   - Missing `updatedAt` and `originalMessage` fields to track message modifications

2. **Observability Gaps**:
   - Sentry is on an older version (v10.27.0) while latest is v10.x+
   - Sentry configuration is inconsistent: logs are enabled in production but should capture all logs
   - No custom metrics or dashboard setup for monitoring service health
   - Missing trace tokens for tracking message lifecycle across services

3. **Deployment Issues**:
   - Build script in `package.json` may fail (needs verification)
   - `.env.local` templates don't match actual app configurations
   - Setup script references incorrect build command

4. **Message Edit Support**:
   - No handling for Telegram's edit message events
   - Cannot track when messages are modified after initial receipt

5. **Documentation Gaps**:
   - Push notification configuration parameters are not documented
   - Developers don't know how to configure PushSafer parameters

## Proposed Solution

### 1. Data Model Refinements

#### TelegramMessage Model
- **Remove** `raw` field (redundant, already have structured fields)
- **Add** `updatedAt?: Date` to track when message was last edited
- **Add** `originalMessage?: string` to preserve original text when message is edited

#### TelegramMessageHistory Model
- **Add** `MessageHistoryTypeEnum` with values:
  - `NEW_MESSAGE = 'new-message'` - Initial message receipt
  - `EDIT_MESSAGE = 'edit-message'` - Message was edited
  - (Extensible for future types)
- **Add** `type: MessageHistoryTypeEnum` field to distinguish event types

### 2. Sentry Upgrades

- **Upgrade** `@sentry/node` to latest stable version
- **Install** additional packages for tracing support (e.g., `@sentry/profiling-node`, instrumentation packages)
- **Revise** Sentry configuration:
  - Enable Sentry **only in production** (not development)
  - Capture **all logs** (not just errors)
  - Configure traces and metrics
- **Implement** custom metrics dashboard:
  - Stream lag (time between message sent and processed)
  - Processing rates (messages/minute)
  - Error rates by service
  - Message edit count (per channel)
  - Message delete count (per channel)
  - Media detection frequency

### 3. Deployment Script Fixes

- **Verify** and fix `npm run build` command in `package.json`
- **Review** all `.env.local` templates to match app configurations
- **Update** `infra/scripts/setup-server.sh` to use correct build command

### 4. Message Edit Support

- **Listen** for Telegram edit message events via mtcute
- **Handle** edit events:
  - Find existing message by `channelId` and `messageId`
  - Update `message` field with new text
  - Store original text in `originalMessage` field
  - Set `updatedAt` timestamp
  - Add history entry with type `EDIT_MESSAGE`
- **Send** push notification indicating old and new message content

### 5. Trace Token Implementation

- **Format**: `{messageId}{channelId}` (e.g., `12345-1003409608482`)
- **Usage**: Include in all log statements for message processing
- **Propagation**: Pass through Redis Stream events for end-to-end tracing

### 6. Push Notification Documentation

- **Create** comprehensive documentation for PushSafer parameters
- **Document** all available configuration options (from user's specification)
- **Include** examples for common use cases

## Scope

### In Scope
- Data model changes (TelegramMessage, TelegramMessageHistory)
- Sentry version upgrade and configuration
- Custom metrics and dashboard setup
- Build script verification and fixes
- `.env.local` template updates
- Message edit event handling
- Trace token implementation
- Push notification documentation

### Out of Scope
- Changes to other services (interpret-service, trade-manager)
- Database migrations (MongoDB is schemaless)
- Performance optimization beyond trace tokens
- UI/dashboard implementation (Sentry dashboard only)

## Dependencies

- Requires latest `@sentry/node` package
- Requires mtcute library support for edit events (already available)
- No breaking changes to downstream services

## Risks and Mitigations

| Risk                                       | Impact | Mitigation                                                    |
| ------------------------------------------ | ------ | ------------------------------------------------------------- |
| Sentry upgrade breaks existing integration | High   | Test thoroughly in development; review Sentry migration guide |
| Removing `raw` field loses data            | Medium | Verify all needed data is in structured fields before removal |
| Edit event handling adds complexity        | Low    | Keep logic simple; reuse existing message processing patterns |
| Trace token format conflicts               | Low    | Use simple, collision-resistant format                        |

## Success Criteria

1. All data model changes implemented and tested
2. Sentry upgraded and configured correctly
3. Custom metrics dashboard created in Sentry
4. Build script works correctly
5. `.env.local` templates match app configurations
6. Message edits are tracked and notified
7. Trace tokens appear in all relevant logs
8. Push notification documentation is complete and accurate

## Timeline

- **Proposal Review**: 1 day
- **Implementation**: 3-4 days
- **Testing**: 1-2 days
- **Documentation**: 1 day
- **Total**: ~1 week

## Open Questions

1. ~~Should we migrate existing messages to remove `raw` field, or just stop populating it for new messages?~~
   - **Answered**: No migration needed; just stop populating for new messages
2. ~~What custom metrics are most valuable for the Sentry dashboard?~~
   - **Answered**: Stream lag, processing rates, error rates, message edit/delete counts per channel, media detection
3. ~~Should trace tokens be included in push notifications?~~
   - **Answered**: Already included in push notifications
4. ~~Do we need to support reverting message edits (tracking full edit history)?~~
   - **Answered**: No, just track the last edit
