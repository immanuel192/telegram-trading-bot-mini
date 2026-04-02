# Design: Refine Telegram Message Processing Logic

## Problem Statement
The current telegram-service implementation has evolved organically and now contains unnecessary complexity around channel resolution and incomplete message data capture. A tested reference implementation exists in `testing/telegram-fetcher` that demonstrates the correct field mappings from mtcute's Message objects.

## Goals
1. Simplify channel management by removing runtime URL resolution
2. Capture complete message data including media, hashtags, and raw message structure
3. Align service implementation with tested message-fetcher logic
4. Improve query performance by indexing on actual lookup fields
5. Enable better reply chain tracking with `replyToTopId`

## Non-Goals
- Changing the overall message processing pipeline (telegram-service → interpret-service → trade-manager)
- Modifying the Redis Streams architecture
- Adding new services or major architectural changes

## Design Decisions

### 1. Remove URL Resolution Logic
**Decision**: Require users to provide `channelId` and `accessHash` directly instead of resolving from URLs.

**Rationale**:
- URL resolution adds complexity and failure points
- The `channelId` and `accessHash` are stable identifiers that don't change
- Users can obtain these values once using the telegram-fetcher tool
- Removes dependency on URL parsing logic and mtcute's `resolvePeer` API
- Simplifies the TelegramChannel model

**Trade-offs**:
- ✅ Simpler, more reliable code
- ✅ Fewer runtime failures
- ❌ Users must manually obtain channelId and accessHash (one-time setup)

### 2. Add channelId to TelegramMessage
**Decision**: Store `channelId` directly on each message document and index by `{channelId, messageId}`.

**Rationale**:
- All message lookups and filtering are done by `channelId`, not `channelCode`
- `channelCode` is an internal identifier, while `channelId` is Telegram's identifier
- Indexing on actual query fields improves performance
- Aligns with how mtcute identifies channels

**Trade-offs**:
- ✅ Better query performance
- ✅ Clearer data model
- ❌ Requires database migration to add field and rebuild index

### 3. Capture Complete Message Data
**Decision**: Add `hashTags`, `hasMedia`, `mediaType`, and `raw` fields to TelegramMessage.

**Rationale**:
- Hashtags are critical for signal interpretation (e.g., `#btc`, `#eth`)
- Media presence affects how messages should be processed
- Raw message data enables debugging and future feature development
- The tested message-fetcher already validates these field extractions

**Implementation Details**:
```typescript
// Hashtag extraction
function extractHashTags(text: string): string[] {
  const hashtagRegex = /#[a-zA-Z0-9_]+/g;
  return (text.match(hashtagRegex) || []).map(tag => tag.toLowerCase());
}

// Media detection
function extractMediaInfo(message: Message): {
  hasMedia: boolean;
  mediaType?: 'photo' | 'video' | 'document' | 'audio' | 'voice' | 'sticker' | 'animation' | 'other';
} {
  if (!message.media) return { hasMedia: false };
  
  // Map mtcute media types to our simplified types
  const type = message.media.type;
  // ... (see message-fetcher.ts for full implementation)
}

// Raw message serialization
function serializeRawMessage(message: Message): Record<string, any> {
  // mtcute objects have special properties that don't serialize well
  // Create a plain object copy that can be stored in MongoDB
  // ... (see message-fetcher.ts for full implementation)
}
```

### 4. Track Reply Chains
**Decision**: Add `replyToTopId` and `replyToTopMessage` to the `quotedMessage` structure.

**Rationale**:
- Telegram supports threaded replies where messages can reply to a "top" message
- Tracking the top of the reply chain helps understand message context
- This data is available in `message.raw.replyTo.replyToTopId`
- Useful for grouping related messages in signal interpretation

### 5. Include channelId in Event Payload
**Decision**: Add `channelId` to `NewMessagePayload`.

**Rationale**:
- Downstream services (interpret-service) need to know which channel a message came from
- Currently they must query the database to get this information
- Including it in the payload reduces database queries
- Aligns with the principle of including all necessary context in events

### 6. Push Notification for Media Detection
**Decision**: Add optional push notification when media is detected in messages.

**Rationale**:
- Media messages (photos, videos) often require immediate attention
- Push notifications enable real-time alerts for important signals
- Configurable via `NOTIFICATION_ALERT_WHEN_TELEGRAM_MESSAGE_HAS_MEDIA` (default: false)
- Leverages existing `PushNotificationService` infrastructure

**Implementation Details**:
```typescript
// In TelegramClientService.processMessage()
if (config('NOTIFICATION_ALERT_WHEN_TELEGRAM_MESSAGE_HAS_MEDIA') === 'true' && hasMedia) {
  await this.pushNotificationService.send({
    m: `${channel.channelCode} - ${mediaType} detected in message`,
    t: 'Telegram Media Alert',
    d: 'a', // Send to all devices
    v: '1', // Vibrate
    traceToken: `telegram-${channel.channelCode}-${messageId}`,
  });
}
```

**Trade-offs**:
- ✅ Real-time awareness of media messages
- ✅ Configurable (opt-in via config)
- ✅ Uses existing notification infrastructure
- ❌ Additional API calls to PushSafer (minimal cost)

## Data Model Changes

### TelegramChannel (Before)
```typescript
interface TelegramChannel {
  channelCode: string;
  url: string;              // Being removed
  channelId?: string;       // Making mandatory
  accessHash?: string;      // Making mandatory
  isActive: boolean;
  createdOn: Date;
}
```

### TelegramChannel (After)
```typescript
interface TelegramChannel {
  channelCode: string;
  channelId: string;        // Now mandatory
  accessHash: string;       // Now mandatory
  isActive: boolean;
  createdOn: Date;
}
```

### TelegramMessage (Before)
```typescript
interface TelegramMessage {
  channelCode: string;
  messageId: number;
  message: string;
  quotedMessage?: {
    id: number;
    message: string;
  };
  prevMessage?: {
    id: number;
    message: string;
  };
  sentAt: Date;
  receivedAt: Date;
  deletedAt?: Date;
  meta?: {
    parsed?: any;
    tradeOrder?: any;
    raw?: any;
  };
  history: TelegramMessageHistory[];
}
```

### TelegramMessage (After)
```typescript
interface TelegramMessage {
  channelCode: string;
  channelId: string;        // NEW
  messageId: number;
  message: string;
  hasMedia: boolean;        // NEW
  mediaType?: 'photo' | 'video' | 'document' | 'audio' | 'voice' | 'sticker' | 'animation' | 'other'; // NEW
  hashTags: string[];       // NEW
  quotedMessage?: {
    id: number;
    message: string;
    hasMedia: boolean;
    replyToTopId?: number;  // NEW
    replyToTopMessage?: {   // NEW
      id: number;
      message: string;
    };
  };
  prevMessage?: {
    id: number;
    message: string;
  };
  sentAt: Date;
  receivedAt: Date;
  deletedAt?: Date;
  raw: Record<string, any>; // NEW - moved from meta, now mandatory
  meta?: {
    parsed?: any;
    tradeOrder?: any;
  };
  history: TelegramMessageHistory[];
}
```

### NewMessagePayload (Before)
```typescript
interface NewMessagePayload {
  messageId: number;
  exp: number;
}
```

### NewMessagePayload (After)
```typescript
interface NewMessagePayload {
  channelId: string;  // NEW
  messageId: number;
  exp: number;
}
```

## Implementation Strategy

Since the application has not been deployed yet, no data migration is required. The implementation follows a straightforward approach:

### Phase 1: Update Models and Repositories
1. Update `TelegramChannel` model to make `channelId` and `accessHash` required, remove `url`
2. Update `TelegramMessage` model with new fields
3. Update repository methods to handle new fields and indexes
4. Update `NewMessagePayload` interface

### Phase 2: Update Service Logic
1. Remove URL parsing and resolution logic from `TelegramClientService`
2. Add hashtag extraction logic
3. Add media detection logic
4. Update raw message serialization
5. Update event publishing to include `channelId`
6. Add push notification support for media detection
7. Add `NOTIFICATION_ALERT_WHEN_TELEGRAM_MESSAGE_HAS_MEDIA` config option

### Phase 3: Testing
1. Update unit tests for `TelegramClientService`
2. Update integration tests for message processing
3. Verify field mappings match message-fetcher reference implementation
4. Test push notification functionality

### Phase 4: Documentation
1. Update spec documentation
2. Update README files with new channel setup process
3. Document how to obtain `channelId` and `accessHash` using telegram-fetcher

## Alternative Approaches Considered

### Alternative 1: Keep URL Resolution as Fallback
**Rejected**: Adds complexity without clear benefit. If users can provide `channelId` and `accessHash` directly, URL resolution is unnecessary.

### Alternative 2: Store Raw Message in Separate Collection
**Rejected**: Adds complexity of managing two collections. MongoDB can handle the document size, and having all message data in one place simplifies queries.

### Alternative 3: Use channelCode for Indexing
**Rejected**: All actual queries use `channelId`, not `channelCode`. Indexing on `channelCode` would not improve performance.

### Alternative 4: Always Send Push Notifications for Media
**Rejected**: Not all media messages require immediate attention. Making it configurable allows users to opt-in based on their needs.
