# Proposal: Implement Sentry Distributed Tracing

## Problem Statement

Currently, the system uses a custom `traceToken` field propagated through Redis Stream messages to correlate logs across services. While this enables manual trace correlation via log searches, it lacks:

1. **Visual trace representation**: No waterfall view showing end-to-end message flow across services
2. **Automatic parent-child relationships**: Cannot see which operations are nested within others
3. **Performance bottleneck identification**: Difficult to identify which service/operation is slow
4. **Unified error-trace correlation**: Errors are tracked separately from performance traces

The system already uses Sentry v10.27.0 for error tracking and custom metrics. Sentry's distributed tracing capabilities (via OpenTelemetry) can provide automatic trace propagation across Redis Streams, creating a unified observability platform.

## Proposed Solution

Implement Sentry distributed tracing by:

1. **Extending stream message schema** to include Sentry trace context (`_sentryTrace`, `_sentryBaggage`)
2. **Instrumenting stream publishers** to inject trace context when publishing messages
3. **Instrumenting stream consumers** to continue traces when consuming messages
4. **Adding granular spans** for key operations (DB queries, AI inference, message publishing)
5. **Maintaining backward compatibility** with existing `traceToken` system

This creates automatic trace propagation across all 4 services (telegram-service, trade-manager, interpret-service, executor-service) while preserving the existing `traceToken` for log correlation.

## Benefits

1. **Visual Trace Waterfall**: See complete message flow from Telegram → AI → Trade Execution in Sentry UI
2. **Performance Insights**: Identify slow operations (e.g., AI translation taking 2s vs DB query 50ms)
3. **Error Context**: Errors automatically linked to their parent trace for full context
4. **Unified Platform**: Errors + Metrics + Traces in single Sentry dashboard
5. **Cost-Effective**: No additional vendor (already using Sentry)
6. **OpenTelemetry-Compatible**: Future-proof for migration to other APM tools

## Scope

### In Scope
- Stream message schema extension for Sentry trace context
- Publisher instrumentation (inject trace context)
- Consumer instrumentation (continue trace context)
- Base message handler tracing wrapper
- Granular spans for:
  - Message publishing/consuming
  - Database queries (MongoDB operations)
  - AI inference (Gemini/Groq API calls)
  - Redis Stream operations
- Integration tests for trace propagation
- Documentation updates

### Out of Scope
- Removing existing `traceToken` system (both will coexist)
- Sentry configuration changes (already configured)
- Custom Sentry dashboards (can be added later)
- Trace sampling rate changes (keeping 10%)
- HTTP/gRPC tracing (not applicable to this architecture)

## Dependencies

- **Existing**: `@sentry/node` v10.27.0 (already installed)
- **Existing**: `@sentry/profiling-node` v10.27.0 (already installed)
- **No new dependencies required**

## Risks & Mitigations

| Risk                                      | Impact | Mitigation                                                         |
| ----------------------------------------- | ------ | ------------------------------------------------------------------ |
| Performance overhead from span creation   | Low    | Already sampling at 10%, span creation is <5ms                     |
| Breaking changes to stream message schema | Medium | Make trace fields optional, maintain backward compatibility        |
| Increased Sentry costs                    | Low    | Already paying for Performance Monitoring, minimal additional cost |
| Complex testing requirements              | Medium | Focus on integration tests, use existing test infrastructure       |

## Success Criteria

1. ✅ End-to-end traces visible in Sentry UI for complete message flows
2. ✅ All 4 services participate in distributed traces
3. ✅ Errors automatically linked to their parent traces
4. ✅ Performance bottlenecks identifiable via span durations
5. ✅ Integration tests pass with trace propagation
6. ✅ No breaking changes to existing functionality
7. ✅ `traceToken` system continues to work alongside Sentry traces

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- Extend stream message schema
- Instrument publisher with trace injection
- Create base tracing handler for consumers
- Update one service (trade-manager) as POC

### Phase 2: Full Rollout (Week 2)
- Update all message handlers across all services
- Add granular spans for key operations
- Comprehensive integration tests

### Phase 3: Optimization (Week 3)
- Performance tuning
- Documentation
- Team training on Sentry trace UI

## Alternatives Considered

1. **New Relic Distributed Tracing**: Requires manual instrumentation for Redis Streams, additional vendor cost
2. **OpenTelemetry Direct**: More complex setup, requires separate collector/backend
3. **Custom Tracing Solution**: High development cost, reinventing the wheel
4. **Status Quo (traceToken only)**: No visual traces, manual correlation only

**Decision**: Sentry distributed tracing provides best ROI for this architecture.
