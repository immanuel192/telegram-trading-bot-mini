# Implement Observability Metrics and Strengthen Trace Tokens

## Summary
This change implements the missing Sentry metrics and strengthens trace token propagation across all services to enable comprehensive monitoring of the Telegram Auto Trading Bot system. The implementation focuses on closing the gaps between the existing observability specification and current code implementation.

## Problem Statement
Based on codebase analysis, the observability monitoring specification exists but key components are not implemented:

1. **Missing Custom Metrics**: Despite detailed metric requirements in the spec, no `Sentry.metrics.increment/gauge` calls are implemented
2. **Incomplete Trace Token Propagation**: Trace tokens are only generated and used in `telegram-service`, missing in `trade-manager` and `interpret-service`
3. **Basic Health Checks**: Health check endpoints exist but don't validate service dependencies
4. **No Stream Lag Calculation**: Time difference tracking between `sentAt` and `receivedAt` is not implemented
5. **No Queue Depth Monitoring**: Queues exist but depth is not tracked via metrics

## Proposed Solution
Implement comprehensive observability by:

1. **Add Sentry Metrics Implementation**: Implement all specified custom metrics across services
2. **Extend Trace Token Propagation**: Ensure trace tokens flow through all services in the message pipeline
3. **Enhance Health Checks**: Add dependency validation for Redis, MongoDB, and Telegram connectivity
4. **Implement Stream Lag Calculation**: Add time difference tracking for message processing latency
5. **Add Queue Depth Monitoring**: Track and report queue lengths via metrics

## Impact Assessment
- **Positive**: Enables comprehensive monitoring via Sentry dashboard, improves debugging capabilities, provides visibility into system performance
- **Risk**: Minimal - adds non-blocking metric emission, no changes to core business logic
- **Dependencies**: Requires Sentry configuration (already exists), no new external dependencies

## Success Criteria
- All specified metrics are emitted to Sentry in production
- Trace tokens propagate end-to-end through all services
- Health checks validate all critical dependencies
- Stream lag and queue depth are accurately tracked
- Sentry dashboard displays all required metrics

## Alternatives Considered
- **Do Nothing**: Continue without metrics - unacceptable for production monitoring
- **Partial Implementation**: Only implement metrics in telegram-service - insufficient for end-to-end visibility
- **Alternative Monitoring**: Use different monitoring solution - unnecessary given existing Sentry integration

## Decision
Proceed with full implementation across all services to achieve comprehensive observability as specified in the existing requirements.