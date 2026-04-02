## ADDED Requirements

### Requirement: Order History Command Tracking
The system SHALL track which command triggered each order history entry to provide better audit trail and debugging capability.

#### Scenario: Command field in history entry
- **WHEN** an order history entry is created
- **THEN** it SHALL include a `command` field of type `CommandEnum`
- **AND** the field SHALL indicate which command (LONG, SHORT, MOVE_SL, SET_TP_SL, CLOSE_BAD_POSITION, CLOSE_ALL, CANCEL, LIMIT_EXECUTED, NONE) triggered this history entry

#### Scenario: INTEND history with command
- **WHEN** an order is created from a LONG or SHORT command
- **THEN** the initial INTEND history entry SHALL include the `command` field set to the creating command (LONG or SHORT)
- **AND** the command SHALL be passed from `TranslateResultHandler` through `OrderService.createOrder()`

#### Scenario: Cleanup history with NONE command
- **WHEN** an automated cleanup job creates a history entry
- **THEN** the `command` field SHALL be set to `CommandEnum.NONE`
- **AND** this indicates the action was not triggered by a user command

### Requirement: Stale Pending Order Cleanup
The system SHALL automatically clean up orders that remain in PENDING status beyond a configured timeout to prevent orphaned orders from accumulating.

#### Scenario: Cleanup job execution
- **WHEN** the pending order cleanup job runs
- **THEN** it SHALL query all orders with `status = PENDING`
- **AND** it SHALL filter orders where `createdAt` is older than the configured timeout (default 1 minute)
- **AND** it SHALL process each stale order within a MongoDB transaction

#### Scenario: Order closure on cleanup
- **WHEN** a stale pending order is identified
- **THEN** the system SHALL:
  - Set `closedAt` to current timestamp
  - Update `status` to `OrderStatus.CLOSED`
  - Add a history entry with:
    - `status = OrderHistoryStatus.CANCELED`
    - `service = ServiceName.PENDING_ORDER_CLEANUP_JOB`
    - `traceToken = ''` (empty, as this is automated)
    - `messageId` and `channelId` copied from the order
    - `command = CommandEnum.NONE`
    - `info.reason` explaining the cleanup reason
- **AND** all updates SHALL be committed atomically in a single transaction

#### Scenario: Cleanup notification
- **WHEN** a stale order is cleaned up
- **AND** the order's `accountId` is in the job's notification whitelist
- **THEN** a push notification SHALL be sent with:
  - Title indicating stale order cleanup
  - Message containing: `orderId`, `symbol`, and `accountId`

#### Scenario: Notification whitelist control
- **WHEN** the cleanup job is configured
- **THEN** the job meta SHALL include a `notificationAccountIds` array
- **AND** only orders belonging to accounts in this array SHALL trigger notifications
- **AND** if the array is empty, no notifications SHALL be sent

#### Scenario: Configurable timeout
- **WHEN** the cleanup job is configured
- **THEN** the job meta SHALL include a `timeoutMinutes` field (default: 1)
- **AND** orders with `createdAt` older than `Date.now() - (timeoutMinutes * 60 * 1000)` SHALL be considered stale

#### Scenario: Query performance for MVP
- **WHEN** querying for pending orders
- **THEN** the system SHALL use the existing `status` index for the initial query
- **AND** the system SHALL filter by `createdAt` in-memory
- **AND** the code SHALL include a comment documenting the MVP assumption of few PENDING orders (\u003c100)
- **AND** the code SHALL include a TODO to consider a compound index `{status: 1, createdAt: 1}` if PENDING orders exceed 100
