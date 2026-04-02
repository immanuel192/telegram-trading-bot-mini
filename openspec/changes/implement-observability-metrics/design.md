# Design for Observability Metrics Implementation

## Architecture Overview

This implementation enhances the existing observability specification by adding concrete metric emission and trace token propagation across all services in the Telegram Auto Trading Bot system.

## System Components

### 1. Metrics Collection Layer
- **Location**: Each service (`telegram-service`, `interpret-service`, `trade-manager`)
- **Technology**: Sentry Metrics API
- **Scope**: Custom metrics for message processing, queue depth, stream lag, error rates

### 2. Trace Token Propagation
- **Source**: `telegram-service` (existing generation)
- **Flow**: `telegram-service` → Redis Stream → `interpret-service` → `trade-manager`
- **Format**: `{messageId}{channelId}` (concatenated without separator)

### 3. Enhanced Health Checks
- **Current**: Basic `{ status: 'ok' }` responses
- **Enhanced**: Dependency validation (Redis, MongoDB, Telegram API)

## Implementation Strategy

### Phase 1: Core Metrics Implementation
1. **Telegram Service Metrics**
   - Message processing counters
   - Queue depth gauges
   - Stream lag calculation
   - Media detection metrics

2. **Interpret Service Metrics**
   - Signal processing counters
   - LLM request latency
   - Error rate tracking

3. **Trade Manager Metrics**
   - Trade execution counters
   - Risk management events
   - Account-specific metrics

### Phase 2: Trace Token Propagation
1. **Stream Message Enhancement**
   - Add trace token to all Redis Stream messages
   - Ensure downstream services extract and use trace tokens

2. **Log Correlation**
   - Include trace tokens in all log statements
   - Enable end-to-end request tracing

### Phase 3: Health Check Enhancement
1. **Dependency Validation**
   - Redis connectivity checks
   - MongoDB connection validation
   - Telegram API reachability (for telegram-service)

## Technical Considerations

### Performance Impact
- **Metric Emission**: Non-blocking, async operations
- **Trace Token Overhead**: Minimal string concatenation and propagation
- **Health Check Impact**: Lightweight dependency pings

### Error Handling
- **Metric Failures**: Graceful degradation, no impact on business logic
- **Trace Token Missing**: Services will use existing simple trace token utilities; tokens are passed through as-is without complex fallback logic
- **Health Check Failures**: Detailed error reporting without service interruption

### Configuration
- **Environment-based**: Metrics only enabled in production
- **Sampling**: Existing 10% trace sampling maintained
- **Rate Limiting**: Sentry client handles metric rate limiting

## Data Flow

```
Telegram Message → telegram-service
├── Generate trace token
├── Emit metrics (message.processed, queue.depth, stream.lag)
├── Publish to Redis Stream (with trace token)
└── Update health check status

Redis Stream → interpret-service
├── Extract trace token
├── Process with LLM
├── Emit metrics (signal.processed, llm.latency)
├── Publish to trade stream (with trace token)
└── Update health check status

Trade Stream → trade-manager
├── Extract trace token
├── Execute trades
├── Emit metrics (trade.executed, risk.events)
└── Update health check status
```

## Monitoring Dashboard

The Sentry dashboard will display:
- **Real-time Metrics**: Message processing rates, error rates, queue depths
- **Latency Tracking**: Stream lag, processing times, LLM response times
- **Service Health**: Dependency status, error patterns
- **Business Metrics**: Trade execution rates, signal interpretation success

## Testing Strategy

### Unit Tests
- Metric emission verification
- Trace token generation/parsing
- Health check dependency validation

### Integration Tests
- End-to-end trace token propagation
- Metric collection in Redis Stream environment
- Health check endpoint validation

### Load Testing
- Metric emission under high message volume
- Trace token performance impact
- Health check response times under load
