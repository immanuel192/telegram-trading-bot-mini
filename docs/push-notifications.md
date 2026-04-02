# Push Notifications

This document describes the push notification system used in the telegram-trading-bot-mini application. We use [PushSafer](https://www.pushsafer.com/) for sending push notifications to mobile devices.

## Table of Contents

- [Overview](#overview)
- [Setup](#setup)
- [Configuration](#configuration)
- [API Parameters](#api-parameters)
- [Usage Examples](#usage-examples)
- [Best Practices](#best-practices)

## Overview

The application uses PushSafer to send real-time notifications for:
- Messages containing media (images, videos, documents)
- Message edits
- System alerts and errors

All notifications include trace tokens for tracking and debugging.

## Setup

1. **Get API Key**
   - Sign up at [https://www.pushsafer.com/](https://www.pushsafer.com/)
   - Navigate to your dashboard
   - Copy your Private or Alias Key

2. **Configure Environment**
   ```bash
   # Add to your .env or .env.local
   PUSHSAFER_API_KEY=your_api_key_here
   ```

3. **Install PushSafer App**
   - Download the PushSafer app on your device(s)
   - Log in with your account
   - Your devices will automatically receive notifications

## Configuration

### Environment Variables

| Variable                                             | Required | Description                   | Default |
| ---------------------------------------------------- | -------- | ----------------------------- | ------- |
| `PUSHSAFER_API_KEY`                                  | Yes      | Your PushSafer API key        | -       |
| `NOTIFICATION_ALERT_WHEN_TELEGRAM_MESSAGE_HAS_MEDIA` | No       | Enable media detection alerts | `yes`   |

### Service Configuration

The `PushNotificationService` is configured in each application's container:

```typescript
const pushNotificationService = new PushNotificationService({
  apiKey: config('PUSHSAFER_API_KEY'),
  concurrency: 5, // Max concurrent requests
  logger,
});
```

## API Parameters

### Required Parameters

| Parameter | Type   | Description                            |
| --------- | ------ | -------------------------------------- |
| `k`       | string | API Key (automatically set by service) |
| `m`       | string | Message text (max 10,000 characters)   |

### Optional Parameters

#### Basic Options

| Parameter | Type   | Description                                          | Example         |
| --------- | ------ | ---------------------------------------------------- | --------------- |
| `t`       | string | Title of notification                                | `"New Message"` |
| `d`       | string | Device or device group ID. Use `a` for all devices   | `"a"`           |
| `i`       | string | Icon number (1-176)                                  | `"1"`           |
| `c`       | string | Color in hex format                                  | `"#FF0000"`     |
| `s`       | string | Sound number (0-62) or empty for silent              | `"8"`           |
| `v`       | string | Vibration: `0`=off, `1`=on, `2`=pattern, `3`=pattern | `"1"`           |

#### Advanced Options

| Parameter | Type   | Description                                        | Example                 |
| --------- | ------ | -------------------------------------------------- | ----------------------- |
| `u`       | string | URL to open when notification is tapped            | `"https://example.com"` |
| `ut`      | string | URL title                                          | `"Open Dashboard"`      |
| `l`       | string | Time-to-live in minutes (0-43200)                  | `"60"`                  |
| `pr`      | string | Priority: `-2` to `2` (default: `0`)               | `"1"`                   |
| `re`      | string | Retry: How often to resend (in seconds, 60-10800)  | `"60"`                  |
| `ex`      | string | Expire: Stop retrying after (in seconds, 60-10800) | `"3600"`                |

#### Pictures

| Parameter | Type   | Description                                                | Example                            |
| --------- | ------ | ---------------------------------------------------------- | ---------------------------------- |
| `p`       | string | Picture URL (JPEG/PNG/GIF, max 5MB)                        | `"https://example.com/image.jpg"`  |
| `p2`      | string | Picture 2 URL                                              | `"https://example.com/image2.jpg"` |
| `p3`      | string | Picture 3 URL                                              | `"https://example.com/image3.jpg"` |
| `is`      | string | Image size: `0`=original, `1`=small, `2`=medium, `3`=large | `"2"`                              |

#### Interactive Features

| Parameter | Type   | Description                        | Example            |
| --------- | ------ | ---------------------------------- | ------------------ |
| `a`       | string | Answer: `1`=yes/no, `2`=text input | `"1"`              |
| `ao`      | string | Answer options (pipe-separated)    | `"Yes\|No\|Maybe"` |
| `af`      | string | Force answer: `1`=required         | `"1"`              |
| `cr`      | string | Confirm/Resend: `1`=enable         | `"1"`              |

#### Special Features

| Parameter | Type   | Description                        | Example       |
| --------- | ------ | ---------------------------------- | ------------- |
| `g`       | string | GIPHY search term for animated GIF | `"happy cat"` |

### Custom Parameters

The service also supports custom parameters:

| Parameter    | Type   | Description                                     |
| ------------ | ------ | ----------------------------------------------- |
| `traceToken` | string | Internal tracking token (not sent to PushSafer) |

## Usage Examples

### Basic Notification

```typescript
await pushNotificationService.send({
  m: 'Hello from telegram-trading-bot-mini!',
  t: 'Test Notification',
  d: 'a', // All devices
});
```

### Media Alert with Vibration

```typescript
await pushNotificationService.send({
  m: `${channelCode} - ${mediaType} detected in message`,
  t: 'Telegram Media Alert',
  d: 'a',
  v: '1', // Enable vibration
  i: '33', // Camera icon
  c: '#FF6B6B', // Red color
  traceToken: `telegram-${channelCode}-${messageId}`,
});
```

### Message Edit Notification

```typescript
await pushNotificationService.send({
  m: `Message edited in ${channelCode}\nOld: ${oldMessage}\n→ New: ${newMessage}`,
  t: `Message Edited - ${channelCode}`,
  d: 'a',
  v: '1',
  i: '18', // Edit icon
  c: '#FFA500', // Orange color
  traceToken,
});
```

### High Priority Alert with URL

```typescript
await pushNotificationService.send({
  m: 'Critical system error detected!',
  t: 'System Alert',
  d: 'a',
  pr: '2', // High priority
  s: '25', // Alarm sound
  v: '3', // Strong vibration
  c: '#FF0000', // Red
  u: 'https://dashboard.example.com/errors',
  ut: 'View Errors',
  traceToken: `error-${Date.now()}`,
});
```

### Notification with Image

```typescript
await pushNotificationService.send({
  m: 'New chart analysis available',
  t: 'Trading Signal',
  d: 'a',
  p: 'https://example.com/chart.png',
  is: '2', // Medium size
  i: '52', // Chart icon
  c: '#4CAF50', // Green
});
```

### Interactive Notification

```typescript
await pushNotificationService.send({
  m: 'Do you want to execute this trade?',
  t: 'Trade Confirmation',
  d: 'a',
  a: '1', // Yes/No answer
  ao: 'Execute|Cancel|Review',
  af: '1', // Force answer
  pr: '1', // High priority
  l: '5', // Expire in 5 minutes
});
```

### Silent Notification with Long TTL

```typescript
await pushNotificationService.send({
  m: 'Background sync completed',
  t: 'Sync Status',
  d: 'a',
  s: '', // Silent
  v: '0', // No vibration
  l: '1440', // Keep for 24 hours
  pr: '-1', // Low priority
});
```

## Best Practices

### 1. Use Trace Tokens

Always include trace tokens for debugging and tracking:

```typescript
const traceToken = generateTraceToken(messageId, channelId);
await pushNotificationService.send({
  m: 'Your message',
  t: 'Title',
  traceToken,
});
```

### 2. Handle Errors Gracefully

Don't let notification failures break your main flow:

```typescript
try {
  await pushNotificationService.send({ ... });
} catch (error) {
  logger.warn({ err: error }, 'Failed to send notification');
  // Continue with main logic
}
```

### 3. Set Appropriate Priorities

- `-2`, `-1`: Background updates, low priority
- `0`: Normal notifications (default)
- `1`, `2`: Important alerts, urgent actions

### 4. Use TTL for Time-Sensitive Notifications

```typescript
await pushNotificationService.send({
  m: 'Price alert: BTC reached $50,000',
  t: 'Price Alert',
  l: '15', // Expire after 15 minutes
});
```

### 5. Choose Appropriate Icons and Colors

Use consistent icons and colors for different notification types:

- 🔴 Red (`#FF0000`): Errors, critical alerts
- 🟠 Orange (`#FFA500`): Warnings, edits
- 🟢 Green (`#4CAF50`): Success, confirmations
- 🔵 Blue (`#2196F3`): Information, updates

### 6. Batch Notifications

The service uses a queue with configurable concurrency to prevent rate limiting:

```typescript
// Multiple sends are automatically queued
await Promise.all([
  pushNotificationService.send({ ... }),
  pushNotificationService.send({ ... }),
  pushNotificationService.send({ ... }),
]);
```

### 7. Clean Up Resources

When shutting down, drain the queue and kill the service:

```typescript
await pushNotificationService.drain();
pushNotificationService.kill();
```

## Testing

Use the test script to verify your configuration:

```bash
PUSHSAFER_API_KEY=your_key npx ts-node apps/telegram-service/src/scripts/test-push-notification.ts
```

## Troubleshooting

### Notifications Not Received

1. Check API key is correct
2. Verify PushSafer app is installed and logged in
3. Check device ID (use `a` for all devices)
4. Review PushSafer dashboard for delivery status

### Rate Limiting

- Default concurrency is 5 requests
- Adjust in service configuration if needed
- Use appropriate TTL and priority settings

### Silent Notifications

- Set `s: ''` for no sound
- Set `v: '0'` for no vibration
- Set `pr: '-1'` or `-2` for low priority

## Resources

- [PushSafer Official Documentation](https://www.pushsafer.com/en/pushapi)
- [PushSafer Icon List](https://www.pushsafer.com/en/pushapi_ext#API-I)
- [PushSafer Sound List](https://www.pushsafer.com/en/pushapi_ext#API-S)

## Related Files

- `libs/shared/utils/src/push-notification.ts` - Service implementation
- `apps/telegram-service/src/scripts/test-push-notification.ts` - Test script
- `apps/telegram-service/src/services/telegram-client.service.ts` - Usage examples
