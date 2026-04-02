# order-update Specification

## Purpose
TBD - created by archiving change auto-update-order-status. Update Purpose after archive.
## Requirements
### Requirement: Enhanced Transaction Data
The system SHALL capture the execution price in transaction items to allow accurate PNL and exit tracking.

#### Scenario: TransactionItem price field
- **WHEN** a `TransactionItem` is returned from a broker adapter
- **THEN** it SHALL include a `closedPrice?` field (number)
- **AND** for `CLOSED` transactions, this field SHALL represent the actual exit price.

### Requirement: Broker Adapter Synchronization
Broker adapters SHALL accurately map exchange-specific transaction data to the normalized `TransactionItem` format.

#### Scenario: Oanda price mapping
- **WHEN** Oanda adapter fetches closed trades
- **THEN** it SHALL map the `price` from the `tradesClosed` array in the `ORDER_FILL` transaction to the `TransactionItem.closedPrice` field.

### Requirement: Order Lifecycle Management
The system SHALL proactively monitor and update the status of OPEN orders by synchronizing with broker transaction data.

#### Scenario: Auto update order status job
- **GIVEN** one or more Orders are in `OPEN` status
- **WHEN** the `AutoUpdateOrderStatusJob` runs
- **THEN** it SHALL fetch transaction history from the respective broker adapters
- **AND** it SHALL update any `OPEN` orders that have been closed on the broker to `CLOSED` status in the system
- **AND** it SHALL record the closure details (exit price, PNL, timestamp) and history entries.

#### Scenario: Transaction ID matching for Oanda
- **GIVEN** an Oanda account
- **WHEN** fetching transactions via `getTransactions`
- **THEN** the system SHALL use the `entryOrderId` of the oldest `OPEN` order in the current batch for that account as the `fromId`.

#### Scenario: Order status transition consistency
- **GIVEN** a `TransactionItem` with status `CLOSED`
- **WHEN** updating the corresponding Order
- **THEN** the Order `status` SHALL be updated to `CLOSED`
- **AND** a history entry SHALL be added with the appropriate status (`TAKE_PROFIT`, `STOP_LOSS`, or `CLOSED`) based on the broker's close reason.
- **AND** the history info SHALL include a `message` field set to: `Auto closed due to {closeReason}`.
- **AND** the update SHALL be performed within a database transaction.

