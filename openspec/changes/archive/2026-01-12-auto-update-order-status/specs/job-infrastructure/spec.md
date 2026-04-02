# Spec Delta: Job Infrastructure Requirements

## ADDED Requirements
### Requirement: Auto Update Order Status Job Configuration
The system SHALL provide a background job to synchronize order statuses.

#### Scenario: Job execution schedule
- **WHEN** the `AutoUpdateOrderStatusJob` is registered
- **THEN** it SHALL be recommended to run every 1 minute at the 30th second (`30 * * * * *`).

#### Scenario: Job batching and sorting
- **WHEN** the job runs
- **THEN** it SHALL fetch orders with `status = OPEN`
- **AND** it SHALL sort them by `_id` ascending
- **AND** it SHALL limit each batch to 50 orders (configurable via job meta).

#### Scenario: Error handling and observability
- **WHEN** an error occurs during order status synchronization for a specific account or order
- **THEN** the system SHALL log the error
- **AND** it SHALL capture the exception in Sentry
- **AND** it SHALL continue processing the remaining orders/accounts in the batch.
