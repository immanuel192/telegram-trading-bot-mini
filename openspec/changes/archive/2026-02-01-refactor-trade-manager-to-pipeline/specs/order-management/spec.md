# Capability: order-management

## ADDED Requirements

### Requirement: Atomic Order Creation and Linking
The system SHALL support creating orders and linking them to related orders (e.g., orphan orders) using atomic database operations, ensuring data consistency without requiring a global wrapping transaction.

#### Scenario: Create and Link to Orphan
- **WHEN** creating a new order (e.g., from a TAKE_PROFIT command)
- **AND** an "orphan" order exists (an order awaiting this specific link)
- **THEN** the system SHALL create the new order
- **AND** the system SHALL atomically receive the new order's ID
- **AND** the system SHALL atomically update the orphan order to reference the new order ID (e.g. using `$push`)

#### Scenario: Independent Commit
- **WHEN** the order creation process completes
- **THEN** the order data SHALL be visible to other services (eventual consistency)
- **AND** the operation SHALL NOT depend on the commit of a parent transaction loop
