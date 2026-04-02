# Spec: Push Notification Configuration

**Capability**: `push-notification-config`  
**Related Change**: `refine-telegram-service-infrastructure`

## Overview

This spec defines the documentation and configuration requirements for push notifications using the PushSafer service.

## ADDED Requirements

### Requirement: Push Notification Parameter Documentation
The system MUST provide comprehensive documentation for all PushSafer notification parameters.

#### Scenario: Documentation includes all parameters
**Given** the push notification documentation exists  
**When** the documentation is reviewed  
**Then** it MUST document all required parameters (`k`, `m`)  
**And** it MUST document all optional parameters (`d`, `t`, `s`, `v`, `i`, `c`, `u`, `ut`, `p`, `p2`, `p3`, `is`, `l`, `pr`, `re`, `ex`, `a`, `ao`, `af`, `cr`, `g`)  
**And** each parameter MUST have a description  
**And** each parameter MUST have an example  
**And** the documentation MUST be accessible from the main README

#### Scenario: Documentation provides usage examples
**Given** the push notification documentation exists  
**When** a developer wants to send a notification  
**Then** the documentation MUST provide examples for:
  - Sending to all devices
  - Sending to a specific device
  - Sending with an image
  - Sending with a URL
  - Sending with custom priority
  - Sending with vibration

### Requirement: Extended PushNotificationSendOptions Interface
The `PushNotificationSendOptions` interface MUST support all documented PushSafer parameters.

#### Scenario: Interface includes all parameters
**Given** the `PushNotificationSendOptions` interface is imported  
**Then** it MUST include all required parameters (`k` via constructor, `m`)  
**And** it MUST include all optional parameters as optional fields  
**And** each field MUST have JSDoc comments describing its purpose  
**And** each field MUST specify valid values or types

## Documentation Content

### Required Parameters

| Parameter | Type   | Description                                              |
| --------- | ------ | -------------------------------------------------------- |
| `k`       | string | Private or Alias Key (configured in service constructor) |
| `m`       | string | Message text                                             |

### Optional Parameters

| Parameter    | Type   | Description                                                                                                     | Example                       |
| ------------ | ------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `d`          | string | Device ID or group ID. `a` = all devices, `gs23` = group, `52` = single device, `52\|65\|78` = multiple devices | `"a"`                         |
| `t`          | string | Title of the notification                                                                                       | `"Alert"`                     |
| `s`          | string | Sound. Empty = device default, or number 0-62                                                                   | `"5"`                         |
| `v`          | string | Vibration. Empty = device default, or 1-3                                                                       | `"1"`                         |
| `i`          | string | Icon. 1 = standard, or number 1-181                                                                             | `"10"`                        |
| `c`          | string | Icon color. Empty = standard, or hex color code                                                                 | `"#FF0000"`                   |
| `u`          | string | URL/Link to open                                                                                                | `"https://example.com"`       |
| `ut`         | string | URL title                                                                                                       | `"Open Link"`                 |
| `p`          | string | Picture 1 data URL (Base64-encoded)                                                                             | `"data:image/png;base64,..."` |
| `p2`         | string | Picture 2 data URL (Base64-encoded)                                                                             | `"data:image/png;base64,..."` |
| `p3`         | string | Picture 3 data URL (Base64-encoded)                                                                             | `"data:image/png;base64,..."` |
| `is`         | string | Image size. 0=1024px, 1=768px, 2=512px, 3=256px                                                                 | `"2"`                         |
| `l`          | string | Time to Live in minutes (0-43200)                                                                               | `"60"`                        |
| `pr`         | string | Priority. -2=lowest, -1=lower, 0=normal, 1=high, 2=highest                                                      | `"1"`                         |
| `re`         | string | Retry/resend time in seconds (60-10800, 60s steps)                                                              | `"300"`                       |
| `ex`         | string | Expire time in seconds (60-10800)                                                                               | `"3600"`                      |
| `a`          | string | Answer possible. 1=yes, 0=no                                                                                    | `"1"`                         |
| `ao`         | string | Answer options (pipe-separated)                                                                                 | `"Yes\|No\|Maybe"`            |
| `af`         | string | Force answer. 1=yes, 0=no                                                                                       | `"1"`                         |
| `cr`         | string | Confirm/resend time in seconds (10-10800, 10s steps)                                                            | `"30"`                        |
| `g`          | string | GIPHY GIF code                                                                                                  | `"8dMU9pN4pGwEfVpdY4"`        |
| `traceToken` | string | Trace token for request tracking (custom field)                                                                 | `"12345-100..."`              |

### Usage Examples

#### Example 1: Simple notification to all devices
```typescript
await pushNotificationService.send({
  m: "Trading signal detected",
  t: "Alert",
  d: "a",
  traceToken: "12345-1003409608482",
});
```

#### Example 2: Notification with vibration and custom icon
```typescript
await pushNotificationService.send({
  m: "High priority signal",
  t: "Urgent",
  d: "a",
  v: "3", // Strong vibration
  i: "50", // Custom icon
  c: "#FF0000", // Red color
  pr: "2", // Highest priority
  traceToken: "12345-1003409608482",
});
```

#### Example 3: Notification with URL
```typescript
await pushNotificationService.send({
  m: "Check this signal",
  t: "New Signal",
  d: "a",
  u: "https://example.com/signal/12345",
  ut: "View Signal",
  traceToken: "12345-1003409608482",
});
```

#### Example 4: Notification with image
```typescript
await pushNotificationService.send({
  m: "Chart analysis",
  t: "Technical Analysis",
  d: "a",
  p: "data:image/png;base64,iVBORw0KG...",
  is: "2", // 512px
  traceToken: "12345-1003409608482",
});
```

#### Example 5: Notification with answer options
```typescript
await pushNotificationService.send({
  m: "Execute this trade?",
  t: "Trade Confirmation",
  d: "a",
  a: "1", // Answer enabled
  ao: "Yes|No|Later",
  af: "1", // Force answer
  traceToken: "12345-1003409608482",
});
```

## Interface Definition

```typescript
export interface PushNotificationSendOptions {
  /** Message text (required) */
  m: string;
  
  /** Title of the notification */
  t?: string;
  
  /** Device ID(s). Use 'a' for all devices, 'gs23' for group, '52' for single device, '52|65|78' for multiple */
  d: string;
  
  /** Sound. Empty = device default, or number 0-62 */
  s?: string;
  
  /** Vibration. Empty = device default, or 1-3 */
  v?: "0" | "1" | "2" | "3";
  
  /** Icon. 1 = standard, or number 1-181 */
  i?: string;
  
  /** Icon color. Empty = standard, or hex color code (e.g., #FF0000) */
  c?: string;
  
  /** URL/Link to open */
  u?: string;
  
  /** URL title */
  ut?: string;
  
  /** Picture 1 data URL (Base64-encoded) */
  p?: string;
  
  /** Picture 2 data URL (Base64-encoded) */
  p2?: string;
  
  /** Picture 3 data URL (Base64-encoded) */
  p3?: string;
  
  /** Image size. 0=1024px, 1=768px, 2=512px, 3=256px */
  is?: "0" | "1" | "2" | "3";
  
  /** Time to Live in minutes (0-43200) */
  l?: string;
  
  /** Priority. -2=lowest, -1=lower, 0=normal, 1=high, 2=highest */
  pr?: "-2" | "-1" | "0" | "1" | "2";
  
  /** Retry/resend time in seconds (60-10800, 60s steps) */
  re?: string;
  
  /** Expire time in seconds (60-10800) */
  ex?: string;
  
  /** Answer possible. 1=yes, 0=no */
  a?: "0" | "1";
  
  /** Answer options (pipe-separated, e.g., "Yes|No|Maybe") */
  ao?: string;
  
  /** Force answer. 1=yes, 0=no */
  af?: "0" | "1";
  
  /** Confirm/resend time in seconds (10-10800, 10s steps) */
  cr?: string;
  
  /** GIPHY GIF code */
  g?: string;
  
  /** Trace token for request tracking */
  traceToken: string;
}
```

## Documentation Location

- Primary: `docs/push-notifications.md`
- Reference from: `README.md` (in "Features" or "Configuration" section)
- Code reference: JSDoc comments in `libs/shared/utils/src/interfaces/push-notification.interface.ts`

## Validation Rules

1. `m` (message) MUST NOT be empty
2. `d` (device) MUST NOT be empty
3. `traceToken` MUST NOT be empty
4. `v` (vibration) MUST be one of: "0", "1", "2", "3"
5. `is` (image size) MUST be one of: "0", "1", "2", "3"
6. `pr` (priority) MUST be one of: "-2", "-1", "0", "1", "2"
7. `a` (answer) MUST be one of: "0", "1"
8. `af` (force answer) MUST be one of: "0", "1"
9. Picture data URLs MUST start with `data:image/`
10. Hex color codes MUST start with `#` and be 7 characters (e.g., `#FF0000`)

## Testing Requirements

### Documentation Tests
- Verify all parameters are documented
- Verify all examples are valid
- Verify documentation is linked from README

### Interface Tests
- Verify interface compiles with TypeScript
- Verify all optional fields are truly optional
- Verify required fields are enforced

### Integration Tests
- Send notification with minimal parameters
- Send notification with all parameters
- Verify notifications are received (manual test)

## Notes

- Maximum size of all POST parameters: 8192kb
- Base64-encoded images can be large; consider image size limits
- Some parameters (LED color, vibration) are Android-only
- Priority levels 1 and 2 may require special permissions on iOS
