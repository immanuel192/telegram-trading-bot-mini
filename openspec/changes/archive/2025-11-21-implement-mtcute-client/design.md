# Design: mtcute Integration

## Architecture

## Architecture

### Component: TelegramService
- **Entry Point (`main.ts`)**: Bootstraps the application, sets up Sentry, connects to DB, and starts the `TelegramClientService`.
- **Server (`server.ts`)**: Exposes a Koa-based health check endpoint (`/healthcheck`).
- **TelegramClientService**:
    - Wraps `mtcute` client.
    - Manages lifecycle (connect/disconnect).
    - Loads active channels into memory on startup.
    - Creates an in-memory `Queue` (from `@libs/shared/utils`) for *each* active channel to process messages sequentially without blocking the main event loop.

### Data Flow
1.  `TelegramService` starts, loads config/channels from DB, and initializes in-memory queues for each channel.
2.  `mtcute` receives a `NewMessage` update.
3.  **Filter**: Check if `chatId` is in the active channel list. If not, ignore.
4.  **Enqueue**: Push the raw message to the corresponding channel's in-memory `Queue`.
5.  **Process (Worker)**:
    -   Extract fields: `channelId`, `messageId`, `message`, `date`, `replyToMsgId`.
    -   **Populate `quotedMessage`**: If `replyToMsgId` exists, query `TelegramMessage` collection to find the original message text.
    -   **Populate `prevMessage`**: Query `TelegramMessage` collection for the latest message in this channel (before the current one).
    -   **Persist**: Save to `TelegramMessage` collection (`telegram-messages`).
    -   **Publish**: Push standardized event to `stream:telegram:raw` (Redis Stream).
6.  **Error Handling**: Any error during processing is captured by Sentry and logged.

## Database Schema

### Config Collection (`configs`)
Stores dynamic configuration.
- `key`: String (Indexed, Unique) - e.g., "telegram-session"
- `value`: String - The actual config value (e.g., session string)

### TelegramChannel Collection (`telegram-channels`)
Stores channels to monitor.
- `channelCode`: String (Unique) - Internal identifier.
- `url`: String - Public URL (e.g., "https://t.me/mychannel").
- `channelId`: String (Optional) - Resolved Telegram ID.
- `accessHash`: String (Optional) - Resolved Access Hash.
- `isActive`: Boolean (Indexed) - Whether to monitor this channel.
- `createdOn`: DateTime.

### TelegramMessage Collection (`telegram-messages`)
Stores raw messages for audit and context.
- `channelCode`: String (Indexed)
- `messageId`: Number (Indexed)
- `message`: String
- `quotedMessage`: Object (Optional)
    - `id`: Number
    - `message`: String
- `prevMessage`: Object (Optional)
    - `id`: Number
    - `message`: String
- `sentAt`: DateTime (Indexed) - Timestamp from Telegram message.
- `receivedAt`: DateTime (Indexed) - Timestamp when service received the message (`Date.now()`).
- `deletedAt`: DateTime (Optional, Indexed)
- `meta`: Object (Optional)
    - `parsed`: Object
    - `tradeOrder`: Object
- **Indexes**: `channelCode`, `messageId`, `channelCode`+`messageId`, `sentAt`, `receivedAt`, `deletedAt`.
- **TTL**: 30 days (based on `receivedAt`).

## Configuration
New environment variables required:
- `TELEGRAM_API_ID`: Integer
- `TELEGRAM_API_HASH`: String
- `TELEGRAM_SESSION`: (Optional) Can be used for local dev, but DB takes precedence.
- `SENTRY_DSN`: String (for error tracking)

## Considerations
- **Performance**: Active channels are cached in memory to avoid DB lookups on every message.
- **Concurrency**: Per-channel queues ensure message ordering is preserved while allowing parallel processing across different channels.
- **Reliability**: Sentry captures unhandled exceptions.
- **Audit**: Messages are persisted with context (`quotedMessage`, `prevMessage`) to aid interpretation.
