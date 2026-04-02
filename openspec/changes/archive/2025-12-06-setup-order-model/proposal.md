# Proposal: Setup Order Model

## Change ID
`setup-order-model`

## Overview
This change introduces the Order model to manage virtual trading orders within the system. Orders represent trading intentions derived from Telegram messages and are used by the trade-manager to coordinate with the executor-service. These are virtual orders - the actual order management is handled by the executor-service (tvbot), which maintains its own order state.

## Why
The system currently processes Telegram messages through the interpret-service, which translates them into structured trading commands. However, there is no data model to track these commands as orders before they are sent to the executor-service. This gap creates several issues:

1. **No Audit Trail:** Cannot track which Telegram messages resulted in which trading orders
2. **No Multi-Order Support:** Cannot handle scenarios where one message generates multiple orders (e.g., multiple accounts trading the same signal)
3. **No Order Tracking:** Cannot query or report on orders before they reach the executor-service
4. **No History:** Cannot maintain a record of order lifecycle events for debugging and compliance

The Order model fills this gap by providing a virtual order tracking layer that bridges message interpretation and order execution, enabling the trade-manager to coordinate order flow effectively.

## Problem Statement
Currently, the system lacks a data model to track virtual orders that bridge the gap between interpreted trading commands and executor-service requests. We need a way to:
- Track orders associated with specific Telegram messages and channels
- Support multiple orders per message (one message can trigger multiple orders)
- Link orders to specific accounts for execution
- Maintain order history for audit and debugging purposes
- Query orders efficiently by various criteria (messageId, channelId, accountId, orderId)

## Proposed Solution
Create a new Order model in the DAL layer with:
- Core fields to track order identity, type, and execution details
- Relationship to Telegram messages via messageId and channelId
- Account association for executor-service coordination
- Symbol information (both interpreted and actual)
- Order execution parameters (lot size, price, type)
- History tracking capability (structure defined, initially empty)
- Appropriate database indexes for efficient querying

The Order model will be a foundational data structure used by trade-manager to manage the order lifecycle before delegating execution to the executor-service.

## What Changes

### New Files
- `libs/dal/src/models/order.model.ts` - Order model with OrderType and OrderExecutionType enums
- `libs/dal/src/repositories/order.repository.ts` - OrderRepository class
- `libs/dal/test/integration/order.repository.spec.ts` - Integration tests

### Modified Files
- `libs/dal/src/infra/db.ts` - Add ORDERS to COLLECTIONS enum, create indexes in initSchemas
- `libs/dal/src/models/index.ts` - Export Order, OrderType, OrderExecutionType
- `libs/dal/src/index.ts` - Export OrderRepository

### Database Changes
- New collection: `orders`
- New indexes:
  - Compound index on (messageId, channelId)
  - Index on accountId
  - Unique index on orderId

## Scope
**In Scope:**
- Order model definition in `libs/dal`
- OrderRepository with basic CRUD operations
- Database indexes for efficient querying
- Integration tests for OrderRepository
- Export of Order model from DAL package

**Out of Scope:**
- Order lifecycle management logic (belongs in trade-manager services)
- Integration with executor-service (future work)
- Order history population logic (future work)
- Order state machine or status transitions

## Dependencies
- Existing DAL infrastructure (BaseRepository, database connection)
- `short-unique-id` package (already installed)
- MongoDB database

## Risks and Mitigations
**Risk:** Order model fields may need adjustment based on executor-service integration requirements
**Mitigation:** Start with minimal required fields based on current understanding; iterate as integration progresses

**Risk:** Index strategy may need optimization for production scale
**Mitigation:** Start with logical indexes based on expected query patterns; monitor and adjust based on actual usage

## Success Criteria
- Order model is defined with all specified fields and enums
- OrderRepository provides basic CRUD operations
- All specified indexes are created in the database
- Integration tests verify repository functionality
- Order model is properly exported and accessible from other packages
- OpenSpec validation passes with --strict flag
