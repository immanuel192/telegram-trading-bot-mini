# Design: Refine Telegram Service Infrastructure

**Change ID**: `refine-telegram-service-infrastructure`

## Architecture Overview

This change refines the `telegram-service` infrastructure across multiple dimensions: data modeling, observability, deployment, and functionality. The design maintains the existing n-tier architecture while improving data integrity, traceability, and operational visibility.

## Design Decisions

### Decision 1: Remove `raw` Field from TelegramMessage

**What**: Remove the `raw` field that stores the serialized mtcute message object.

**Why**:
- **Redundancy**: All relevant data from the raw message is already extracted into structured fields (`message`, `hasMedia`, `mediaType`, `quotedMessage`, `prevMessage`, etc.)
- **Storage Efficiency**: Raw field can be large and duplicates data
- **Maintenance**: Keeping raw data in sync with structured fields adds complexity
- **Query Performance**: Structured fields are indexed and queryable; raw JSON is not

**Alternatives Considered**:
- Keep raw field for debugging: Rejected because structured fields provide sufficient debugging information
- Store raw field in separate collection: Rejected as over-engineering for MVP

**Impact**:
- Reduces document size by ~30-50%
- Simplifies data model
- No breaking changes (field is not used by downstream services)

### Decision 2: Add MessageHistoryTypeEnum for History Event Types

**What**: Create an enum to distinguish between different types of history events (new message, edit message, etc.).

**Why**:
- **Clarity**: Distinguishes between history event types (new vs. edit) and stream message types (Redis)
- **Extensibility**: Easy to add new history types (delete, pin, etc.) in the future
- **Type Safety**: TypeScript enum provides compile-time checking
- **Audit Trail**: Clear categorization of events in message lifecycle

**Alternatives Considered**:
- Reuse `MessageType` enum: Rejected because it's for Redis stream events, not history events
- Use string literals: Rejected because enums provide better type safety

**Impact**:
- Improves code clarity
- Enables filtering history by event type
- No breaking changes (new field)

### Decision 3: Track Message Edits with `originalMessage` and `updatedAt`

**What**: Add fields to track when messages are edited and preserve original content.

**Why**:
- **Audit Trail**: Important to know when trading signals are modified
- **Debugging**: Helps understand if signal interpretation changed due to edit
- **Compliance**: May be required for regulatory purposes
- **User Transparency**: Push notifications can show what changed

**Alternatives Considered**:
- Store full edit history array: Rejected as over-engineering for MVP; single edit is sufficient
- Store only `updatedAt`: Rejected because knowing what changed is valuable
- Create separate `MessageEdit` collection: Rejected as over-engineering

**Impact**:
- Adds 2 optional fields to model
- Enables edit tracking and notifications
- No breaking changes

### Decision 4: Upgrade Sentry and Enable Production-Only Logging

**What**: Upgrade to latest Sentry version and configure to capture all logs only in production.

**Why**:
- **Security**: Latest version has security patches
- **Features**: New Sentry versions have better metrics and tracing
- **Cost Efficiency**: Only send logs in production (development uses local logging)
- **Observability**: Capturing all logs (not just errors) provides better debugging context

**Alternatives Considered**:
- Keep current version: Rejected due to missing features and potential security issues
- Enable in all environments: Rejected due to cost and noise in development
- Only capture errors: Rejected because context from info/debug logs is valuable

**Impact**:
- Better observability in production
- Reduced Sentry costs (no development logs)
- Requires testing after upgrade

### Decision 5: Implement Custom Metrics Dashboard

**What**: Create Sentry dashboard with custom metrics for service health monitoring.

**Why**:
- **Proactive Monitoring**: Detect issues before they become critical
- **Performance Tracking**: Understand message processing rates and bottlenecks
- **Capacity Planning**: Queue depth metrics help plan scaling
- **Business Insights**: Media detection frequency informs feature usage

**Key Metrics**:
1. **Message Processing Rate**: Messages processed per minute
2. **Queue Depth**: Number of pending messages per channel
3. **Error Rate**: Errors per minute by service
4. **Media Detection Frequency**: Percentage of messages with media
5. **Message Edit Frequency**: Edits per hour

**Alternatives Considered**:
- Use external monitoring tool (Datadog, Grafana): Rejected to minimize tool sprawl
- No custom metrics: Rejected because default metrics are insufficient

**Impact**:
- Requires instrumenting code with Sentry metrics API
- Provides actionable insights
- One-time dashboard setup effort

### Decision 6: Trace Token Format `{messageId}{channelId}`

**What**: Use concatenated messageId and channelId as trace token.

**Why**:
- **Uniqueness**: Combination is unique per message
- **Simplicity**: Easy to generate and parse
- **Readability**: Human-readable in logs
- **Consistency**: Same format used in push notifications

**Format**: `{messageId}{channelId}`
- Example: `12345-1003409608482`

**Alternatives Considered**:
- UUID: Rejected because less meaningful and harder to correlate
- Hash of messageId+channelId: Rejected because less readable
- Separate fields: Rejected because single token is easier to propagate

**Impact**:
- Enables end-to-end tracing across services
- Improves debugging efficiency
- Minimal implementation effort

### Decision 7: Handle Edit Events with mtcute

**What**: Listen for mtcute edit message events and update existing messages.

**Why**:
- **Completeness**: Telegram supports message editing; we should track it
- **Accuracy**: Ensures our data reflects current state of messages
- **Notifications**: Users should know when signals are modified

**Flow**:
```
1. mtcute emits edit event
2. Extract channelId and messageId
3. Find existing message in DB
4. If found:
   a. Store current message in originalMessage
   b. Update message with new text
   c. Set updatedAt timestamp
   d. Add history entry (type: EDIT_MESSAGE)
   e. Send push notification
5. If not found: log warning (message not in our DB)
```

**Alternatives Considered**:
- Ignore edits: Rejected because data would be stale
- Create new message record: Rejected because loses connection to original
- Store full edit history: Rejected as over-engineering for MVP

**Impact**:
- Adds edit event handling logic
- Requires new repository method
- Improves data accuracy

### Decision 8: Comprehensive Push Notification Documentation

**What**: Document all PushSafer parameters with examples.

**Why**:
- **Usability**: Developers need to know how to configure notifications
- **Discoverability**: Parameters are not obvious from code alone
- **Examples**: Real-world examples speed up implementation
- **Maintenance**: Centralized documentation is easier to update

**Content**:
- All parameters from PushSafer API (k, m, d, t, s, v, i, c, u, ut, p, is, l, pr, re, ex, a, ao, af, cr, g)
- Description of each parameter
- Examples for common scenarios (all devices, specific device, with image, with URL)
- Link from main README

**Alternatives Considered**:
- Link to PushSafer docs: Rejected because we want project-specific context
- Inline code comments only: Rejected because less discoverable

**Impact**:
- Improves developer experience
- Reduces support questions
- One-time documentation effort

## Data Flow

### New Message Flow (Updated)
```
┌─────────────────┐
│ Telegram Server │
└────────┬────────┘
         │ New Message Event
         ▼
┌─────────────────────────┐
│ TelegramClientService   │
│ - handleNewMessage()    │
│ - Generate trace token  │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Process Message Queue   │
│ - Extract fields        │
│ - Populate context      │
│ - Log with trace token  │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ TelegramMessageRepo     │
│ - create()              │
│ - Save to MongoDB       │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ publishMessageEvent()   │
│ - Publish to Redis      │
│ - Add history entry     │
│   (type: NEW_MESSAGE)   │
│ - Log with trace token  │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Send Metrics to Sentry  │
│ - Message count         │
│ - Processing time       │
│ - Queue depth           │
└─────────────────────────┘
```

### Edit Message Flow (New)
```
┌─────────────────┐
│ Telegram Server │
└────────┬────────┘
         │ Edit Message Event
         ▼
┌─────────────────────────┐
│ TelegramClientService   │
│ - handleEditMessage()   │
│ - Generate trace token  │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Find Existing Message   │
│ - findByChannelAndId()  │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Update Message          │
│ - originalMessage = old │
│ - message = new         │
│ - updatedAt = now       │
│ - Add history entry     │
│   (type: EDIT_MESSAGE)  │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Send Push Notification  │
│ - Include old & new     │
│ - Include trace token   │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Send Metrics to Sentry  │
│ - Edit count            │
└─────────────────────────┘
```

## Database Schema Changes

### TelegramMessage (Updated)
```typescript
interface TelegramMessage {
  _id?: ObjectId;
  channelCode: string;
  channelId: string;
  messageId: number;
  message: string;
  originalMessage?: string;      // NEW: Original text before edit
  hasMedia: boolean;
  mediaType?: string;
  hashTags: string[];
  quotedMessage?: {...};
  prevMessage?: {...};
  sentAt: Date;
  receivedAt: Date;
  updatedAt?: Date;              // NEW: When message was last edited
  deletedAt?: Date;
  // raw: Record<string, any>;   // REMOVED
  meta?: {...};
  history: TelegramMessageHistory[];
}
```

### TelegramMessageHistory (Updated)
```typescript
enum MessageHistoryTypeEnum {
  NEW_MESSAGE = 'new-message',
  EDIT_MESSAGE = 'edit-message',
}

interface TelegramMessageHistory {
  type: MessageHistoryTypeEnum;  // NEW: History event type
  createdAt: Date;
  fromService: string;
  targetService: string;
  errorMessage?: string;
  streamEvent?: {
    messageEventType: string;
    messageId: string;
  };
}
```

## Sentry Configuration

### Updated Configuration
```typescript
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: config('NODE_ENV'),
  
  // Only enable in production
  enabled: environment === 'production',
  
  // Capture all logs in production
  integrations: [
    Sentry.consoleLoggingIntegration({
      levels: ['log', 'info', 'warn', 'error'],
    }),
  ],
  
  // Traces
  tracesSampleRate: 0.1, // 10% sampling in production
  
  // Metrics (new)
  enableMetrics: true,
});
```

### Custom Metrics
```typescript
// Message processing
Sentry.metrics.increment('telegram.message.processed', {
  tags: { channel: channelCode }
});

// Queue depth
Sentry.metrics.gauge('telegram.queue.depth', queueLength, {
  tags: { channel: channelCode }
});

// Media detection
Sentry.metrics.increment('telegram.media.detected', {
  tags: { type: mediaType }
});

// Message edits
Sentry.metrics.increment('telegram.message.edited', {
  tags: { channel: channelCode }
});
```

## Deployment Script Updates

### Build Command Verification
Current: `"build": "nx run-many -t build"`

This is correct for Nx monorepo. Verification steps:
1. Run `npm run build` in clean environment
2. Verify all apps and libs build successfully
3. Check dist/ output

### .env.local Template Updates
Add missing variables to each app's `.env.local`:

```bash
# Telegram Service
STREAM_MESSAGE_TTL_IN_SEC=3600
NOTIFICATION_ALERT_WHEN_TELEGRAM_MESSAGE_HAS_MEDIA=yes
PUSHSAFER_API_KEY=your-api-key

# (Similar for other apps)
```

## Testing Strategy

### Unit Tests
- TelegramMessage model changes
- MessageHistoryTypeEnum usage
- Edit message handling logic
- Trace token generation
- Sentry metric calls (mocked)

### Integration Tests
- Full new message flow with trace token
- Full edit message flow
- Push notification for edits
- Sentry integration (development only)

### Manual Testing
- Deploy to staging with Sentry enabled
- Verify metrics appear in Sentry dashboard
- Test message edit notifications
- Verify trace tokens in logs

## Rollout Plan

1. **Phase 1**: Data model changes (non-breaking)
2. **Phase 2**: Sentry upgrade and configuration
3. **Phase 3**: Deployment script fixes
4. **Phase 4**: Message edit support
5. **Phase 5**: Trace token implementation
6. **Phase 6**: Documentation

Each phase can be deployed independently.

## Monitoring and Validation

### Success Metrics
- Sentry dashboard shows metrics
- Edit events are captured and notified
- Trace tokens appear in logs
- Build script succeeds
- No increase in error rates

### Alerts
- High error rate (>5% of messages)
- Queue depth exceeds threshold (>100 messages)
- Sentry integration failure

## Open Questions

1. **Raw field migration**: Should we remove `raw` from existing documents or just stop populating it?
   - **Recommendation**: Stop populating for new messages; optionally run migration script later

2. **Sentry dashboard metrics**: Which metrics are most valuable?
   - **Recommendation**: Start with the 5 listed; add more based on operational needs

3. **Trace token in notifications**: Should we include trace token in push notifications?
   - **Recommendation**: Yes, for debugging; users can ignore it

4. **Edit history depth**: Should we track multiple edits or just the last one?
   - **Recommendation**: Just last edit for MVP; can extend later if needed
