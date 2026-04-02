# Proposal: Build Executor Service

## Overview

Build a dedicated `executor-service` within the `telegram-trading-bot-mini` monorepo to handle trade execution across multiple broker exchanges. The service will consume order execution events from `trade-manager`, execute trades via broker APIs (ccxt, Oanda, XM/Exness reverse-engineered APIs), and publish execution results and live price updates back to `trade-manager` via Redis Streams.

## Context

The system currently has three services:
- `telegram-service`: Ingests messages from Telegram
- `interpret-service`: Translates messages to structured trading signals using LLMs
- `trade-manager`: Manages trade flow and will publish order execution requests

Currently, there is an existing production service `trading-view-alert` (tvbot) that handles order execution for TradingView-triggered trades. This proposal evaluates different strategies for building the execution layer for the telegram trading bot.

## Problem Statement

The system needs an executor service to:

1. **Execute trades** across multiple broker exchanges (crypto via ccxt, Oanda, XM/Exness)
2. **Support multiple accounts** per exchange with proper order routing
3. **Fetch live prices** and order status updates
4. **Push real-time updates** to trade-manager for context-aware processing
5. **Abstract broker differences** behind a unified contract
6. **Scale independently** from other services
7. **Maintain decoupling** with event-driven architecture

## Options Analysis

### Option A: Use tvbot via HTTP from trade-manager

#### Description
- `trade-manager` makes HTTP requests directly to `tvbot` when consuming `TRANSLATE_MESSAGE_RESULT`
- Transaction flow: create transaction → HTTP request per order → persist → commit
- Minimal new development; reuse existing production service

#### Pros
- ✅ **Fastest to implement**: Reuse battle-tested production code
- ✅ **Known reliability**: tvbot is proven in production
- ✅ **Minimal risk**: No new moving parts
- ✅ **Leverage existing integrations**: Binance/Oanda already working

#### Cons
- ❌ **Tight coupling**: trade-manager depends on tvbot availability
- ❌ **HTTP overhead**: Synchronous blocking calls (500-2000ms per order)
- ❌ **Timeout risk**: Batch of 10 messages could take >20s, exceeding 10s message TTL
- ❌ **Single point of failure**: If tvbot down, both systems affected
- ❌ **Mixed architectures**: HTTP in an event-driven system
- ❌ **Contract mismatch**: tvbot API designed for TradingView, not our message format
- ❌ **Latency accumulation**: Serial HTTP calls in transaction block other processing

#### Impact
- **Build time**: 1-2 weeks (API contract adaptation, error handling)
- **Technical debt**: High (architectural inconsistency, coupling)
- **Scalability**: Poor (synchronous HTTP in critical path)
- **Maintainability**: Medium (separate codebase, different patterns)

#### Verdict
**NOT RECOMMENDED** - Violates event-driven architecture, introduces timeout risks, and creates tight coupling.

---

### Option B: Build executor-service HTTP wrapper around tvbot

#### Description
- New `executor-service` consumes account-specific streams (`stream:trade:account:{accountId}`)
- `executor-service` makes HTTP calls to tvbot
- Trade-manager publishes to per-account streams for ordering guarantees

#### Pros
- ✅ **Event-driven**: Preserves async architecture
- ✅ **Decoupling**: trade-manager not directly dependent on tvbot
- ✅ **Per-account ordering**: Redis streams guarantee message sequence per account
- ✅ **Parallel processing**: Multiple account streams processed independently
- ✅ **Reuse tvbot logic**: Leverage existing broker integrations
- ✅ **Faster than Option A**: Can be built in 2-3 weeks

#### Cons
- ❌ **Still HTTP**: Latency from tvbot calls (500-2000ms)
- ❌ **External dependency**: tvbot remains critical path dependency
- ❌ **Extra service**: Adds complexity (executor-service + tvbot)
- ❌ **Cross-repo coordination**: Changes require updating tvbot
- ❌ **Proxy overhead**: executor-service is essentially an HTTP-to-Stream adapter
- ❌ **Deployment complexity**: Two services to deploy for execution layer

#### Impact
- **Build time**: 2-3 weeks (service scaffolding, stream consumers, HTTP client, error handling)
- **Technical debt**: Medium (proxy pattern, two-service dependency)
- **Scalability**: Good (event-driven, per-account streams)
- **Maintainability**: Medium (split across repos, coordination needed)

#### Verdict
**ACCEPTABLE BUT SUBOPTIMAL** - Improves architecture but retains HTTP latency and cross-repo complexity.

---

### Option C: Extend tvbot to consume events

#### Description
- Port event infrastructure (`RedisStreamConsumer`, message contracts) from telegram-trading-bot-mini to tvbot
- tvbot consumes events from `trade-manager`
- tvbot produces execution results back to Redis Streams

#### Pros
- ✅ **Event-driven**: Fully async, no HTTP overhead
- ✅ **Reuse broker logic**: All existing exchange code stays in tvbot
- ✅ **Single executor**: No proxy service
- ✅ **Proven codebase**: Leverage production-tested tvbot

#### Cons
- ❌ **Cross-repo changes**: Significant tvbot refactoring
- ❌ **Architectural inconsistency**: tvbot is Express/HTTP-based, adding streams is mixed pattern
- ❌ **Code split**: Execution logic in separate repo from domain logic
- ❌ **Different tech stack**: tvbot uses different libraries/patterns than monorepo
- ❌ **Testing complexity**: Integration tests require two codebases
- ❌ **Deployment coordination**: Changes across repos need synchronized releases
- ❌ **Divergent evolution**: Two architecture styles (HTTP vs event-driven) in one codebase
- ❌ **Context loss**: AI agents need to load both repos for changes

#### Impact
- **Build time**: 3-4 weeks (stream infrastructure port, refactoring, testing)
- **Technical debt**: High (mixed patterns in tvbot, cross-repo dependencies)
- **Scalability**: Good (event-driven)
- **Maintainability**: Poor (split codebase, different conventions)

#### Verdict
**NOT RECOMMENDED** - Violates separation of concerns and introduces cross-repo complexity that undermines monorepo benefits.

---

### Option D: Build executor-service in monorepo (RECOMMENDED)

#### Description
- New `executor-service` built in `apps/executor-service` following existing patterns
- Consumes from per-account streams (`stream:trade:account:{accountId}`)
- Uses existing event infrastructure (`RedisStreamConsumer`, message contracts)
- Implements broker abstractions:
  - **Crypto exchanges**: via ccxt (copy/adapt from tvbot)
  - **Oanda**: Direct port of tvbot's Oanda implementation
  - **XM/Exness**: New reverse-engineered API clients (to be built separately)
- Publishes execution results and price updates to `trade-manager`

#### Pros
- ✅ **Fully event-driven**: Consistent with system architecture
- ✅ **Monorepo benefits**: Shared libs, consistent patterns, single deployment
- ✅ **Independent scaling**: Executor runs separately from trade-manager
- ✅ **Per-account streams**: Strict ordering guarantees
- ✅ **Code locality**: All business logic in one repo
- ✅ **Testability**: Integration tests use same patterns/tools
- ✅ **AI-friendly**: Single codebase for context loading
- ✅ **Type safety**: Shared TypeScript types across services
- ✅ **No HTTP overhead**: Pure async messaging
- ✅ **Future-ready**: Easy to extend with new brokers
- ✅ **Clear ownership**: Execution logic owned by this project

#### Cons
- ❌ **Build time**: 4-6 weeks (longest initial development)
  - Week 1-2: Service scaffolding, base abstractions, message contracts
  - Week 3-4: Broker implementations (ccxt, Oanda port)
  - Week 5-6: Testing, integration, documentation
- ❌ **Code duplication**: Need to port/adapt tvbot broker logic
- ❌ **Learning curve**: Need to understand tvbot's exchange patterns

#### Impact
- **Build time**: 4-6 weeks (full implementation)
- **Technical debt**: Low (consistent patterns, single codebase)
- **Scalability**: Excellent (event-driven, per-account parallelization)
- **Maintainability**: Excellent (monorepo, consistent conventions)
- **Extensibility**: Excellent (easy to add new brokers, modify contracts)

#### Verdict
**STRONGLY RECOMMENDED** - Best aligns with MVP philosophy, event-driven architecture, and long-term maintainability.

---

## Architecture Comparison Matrix

| Aspect                       | Option A     | Option B     | Option C     | Option D    |
| ---------------------------- | ------------ | ------------ | ------------ | ----------- |
| **Architecture Consistency** | ❌ Poor       | ⚠️ Mixed      | ⚠️ Mixed      | ✅ Excellent |
| **Build Time**               | ✅ 1-2 weeks  | ⚠️ 2-3 weeks  | ⚠️ 3-4 weeks  | ❌ 4-6 weeks |
| **Technical Debt**           | ❌ High       | ⚠️ Medium     | ❌ High       | ✅ Low       |
| **Scalability**              | ❌ Poor       | ✅ Good       | ✅ Good       | ✅ Excellent |
| **Latency**                  | ❌ 500-2000ms | ❌ 500-2000ms | ✅ <100ms     | ✅ <100ms    |
| **Decoupling**               | ❌ Tight      | ⚠️ Partial    | ⚠️ Partial    | ✅ Full      |
| **Maintainability**          | ⚠️ Medium     | ⚠️ Medium     | ❌ Poor       | ✅ Excellent |
| **Testing**                  | ⚠️ Medium     | ⚠️ Medium     | ❌ Complex    | ✅ Simple    |
| **Future Extension**         | ❌ Hard       | ⚠️ Medium     | ⚠️ Medium     | ✅ Easy      |
| **MVP Alignment**            | ❌ Poor       | ⚠️ Acceptable | ⚠️ Acceptable | ✅ Perfect   |

---

## Recommended Approach: Option D

### Why Option D is Superior

1. **Architectural Purity**
   - Pure event-driven system with no HTTP in critical path
   - Consistent with existing services (telegram-service, interpret-service, trade-manager)
   - All services communicate via Redis Streams

2. **MVP Philosophy Alignment**
   - "Source code is documentation" - all logic in one place
   - "AI-friendly code structure" - single codebase for context
   - "Continuous AI-readiness" - easier refactoring in monorepo
   - "Decoupling" - services connected only via messages

3. **Event-Driven Maturity**
   - Leverages existing Redis Stream infrastructure
   - Per-account streams for ordering guarantees (critical for trading)
   - Async non-blocking processing
   - Natural back-pressure handling

4. **Scalability Path**
   - Multiple executor-service instances per account stream
   - Independent scaling from trade-manager
   - Parallel processing of different accounts
   - No synchronous bottlenecks

5. **Long-term Benefits**
   - Easy to add new broker integrations (XM, Exness, others)
   - Shared types/contracts across services
   - Single deployment unit
   - Unified testing strategy

### Proposed Architecture

```
trade-manager
    │
    ├─→ StreamTopic.TRADE_ACCOUNT_ORDERS (per-account)
    │   stream:trade:account:{accountId}
    │
    ▼
executor-service
    │ (consumes per-account streams)
    │ (maintains per-account broker clients)
    │
    ├─→ Broker Adapters
    │   ├─→ CryptoExchangeAdapter (ccxt)
    │   ├─→ OandaAdapter (ported from tvbot)
    │   └─→ WebTerminalAdapter (XM/Exness - future)
    │
    ├─→ StreamTopic.ORDER_EXECUTION_RESULTS
    │   (execution results back to trade-manager)
    │
    └─→ StreamTopic.PRICE_UPDATES
        (live price feeds for trade-manager context)
```

### Message Flow

```
1. trade-manager: Consume TRANSLATE_MESSAGE_RESULT
2. trade-manager: Create Order record in DB, publish EXECUTE_ORDER_REQUEST to stream:trade:account:{accountId}
3. executor-service: Consume from stream:trade:account:{accountId}
4. executor-service: Execute trade via broker adapter
5. executor-service: Publish EXECUTE_ORDER_RESULT to trade-manager
6. trade-manager: Consume result, update Order.history with execution details
```

**Note**: No database transactions are held open across service boundaries. Each step is independent:
- Step 2: Create Order document, emit event (fire and forget)
- Step 6: Update Order.history when result arrives (separate operation)

### Per-Account Stream Rationale

- **Ordering guarantee**: Redis Streams maintain order within a stream
- **Parallel execution**: Different accounts processed independently
- **Isolation**: One account's issues don't block others
- **Scalability**: Can scale executor instances per account
- **MVP simplification**: Single executor instance, multiple account streams

---

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1-2)
- Scaffold `executor-service` app following trade-manager pattern
- Define message contracts:
  - `EXECUTE_ORDER_REQUEST`
  - `EXECUTE_ORDER_RESULT`
  - `FETCH_LIVE_PRICE`
  - `LIVE_PRICE_UPDATE`
- Implement base abstractions:
  - `BaseBrokerAdapter` interface
  - `BrokerAdapterFactory`
- Per-account stream consumer setup
- Integration tests for message flow

### Phase 2: Broker Implementations (Week 3-4)
- **CryptoExchangeAdapter**: Port ccxt logic from tvbot
  - Binance Future support
  - Generic ccxt adapter pattern
- **OandaAdapter**: Port Oanda implementation from tvbot
  - Direct API client
  - Order management
- Unit + integration tests per adapter
- Mock/sandbox testing

### Phase 3: Trade-Manager Integration (Week 5)
- Update `trade-manager` to publish to per-account streams
- Create stream topics for execution results
- Update `TranslateResultHandler` to publish orders
- End-to-end integration tests
- Error handling and retry logic

### Phase 4: Live Price Feeds (Week 6)
- Implement price fetching per broker
- Periodic price update publisher
- Price cache mechanism
- Integration with trade-manager context

---

## Risk Assessment

### Technical Risks

| Risk                              | Mitigation                                             |
| --------------------------------- | ------------------------------------------------------ |
| **Broker API changes**            | Abstract adapters; adapter pattern limits blast radius |
| **ccxt compatibility**            | Port proven tvbot logic; use same ccxt version         |
| **Per-account stream complexity** | Extensive integration tests; start with single account |
| **Price feed latency**            | Implement caching; use broker-specific optimizations   |

### Operational Risks

| Risk                            | Mitigation                                                  |
| ------------------------------- | ----------------------------------------------------------- |
| **Executor service failure**    | Event-based retry; trade-manager monitors execution results |
| **Message loss**                | Redis Stream persistence; consumer group acknowledgments    |
| **Account credential rotation** | Configuration hot-reload (future); graceful degradation     |

---

## Success Criteria

1. **Functional**
   - ✅ Execute orders across crypto (ccxt) and Oanda
   - ✅ Support multiple accounts per exchange
   - ✅ Publish live price updates
   - ✅ Handle order lifecycle (open, update SL/TP, close)

2. **Non-Functional**
   - ✅ <100ms message processing latency (vs 500-2000ms HTTP)
   - ✅ Event-driven architecture maintained
   - ✅ Independent service scaling
   - ✅ >95% test coverage (unit + integration)

3. **Maintainability**
   - ✅ All code in monorepo
   - ✅ Shared types and contracts
   - ✅ AI-friendly code structure (<250 lines per file)
   - ✅ Comprehensive documentation

---

## Future Extensions

1. **XM/Exness Integration**: Add `WebTerminalAdapter` using reverse-engineered APIs
2. **Multi-instance Scaling**: Run multiple executor instances per account stream
3. **Advanced Order Types**: Support limit orders, trailing stops
4. **Position Management**: Track open positions, margin levels
5. **Risk Monitoring**: Real-time risk metrics back to trade-manager

---

## Conclusion

**Recommendation: Proceed with Option D** - Build a dedicated `executor-service` in the monorepo.

### Final Rationale
- **Aligns perfectly** with event-driven architecture and MVP philosophy
- **4-6 week investment** pays off in maintainability, scalability, and extensibility
- **Low technical debt** ensures sustainable development
- **Monorepo benefits** accelerate future development
- **Independent scaling** supports production growth

While Option A/B offer faster short-term delivery, they introduce architectural compromises that will compound over time. The 2-4 week time difference is negligible compared to the long-term benefits of a properly architected solution.

