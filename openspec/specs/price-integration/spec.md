# price-integration Specification

## Purpose
TBD - created by archiving change fetch-realtime-price-and-balance. Update Purpose after archive.
## Requirements
### Requirement: OrderHistoryStatus.INFO enum value

The `OrderHistoryStatus` enum SHALL include an `INFO` value for informational events.

**Related**: This adds to `libs/dal/src/models/order.model.ts`.

#### Scenario: Define INFO status

**Given** the `OrderHistoryStatus` enum  
**When** defining status values  
**Then** it SHALL include `INFO = 'info'`  
**And** the JSDoc SHALL describe it as: "Informational event - Used for non-critical informational events in order processing"  
**And** examples SHALL include: "using cached live price, automatic adjustments, system decisions"

---

