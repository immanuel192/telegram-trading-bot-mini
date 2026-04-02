# Build Executor Service

## Overview
This change proposes building a dedicated `executor-service` within the telegram-trading-bot-mini monorepo to handle trade execution across multiple broker exchanges using pure event-driven architecture.

## Problem
The system needs an execution layer to place orders from trade-manager to broker exchanges (crypto via ccxt, Oanda, future XM/Exness). Four options were evaluated with Option D (building executor-service in monorepo) selected as the best approach.

## Solution
Build `executor-service` as a new application in `apps/executor-service` that:
- Consumes order requests from per-account Redis Streams
- Executes trades via broker adapters (abstracted interface)
- Publishes execution results back to trade-manager
- Provides live price feeds for future trade context

## Capabilities

### 1. **executor-service-foundation** (Week 1-2)
Core infrastructure including:
- Service scaffolding following trade-manager pattern
- Configuration, logging, Sentry setup
- Message type contracts (EXECUTE_ORDER_REQUEST, EXECUTE_ORDER_RESULT, LIVE_PRICE_UPDATE)
- Stream topics (ORDER_EXECUTION_RESULTS, PRICE_UPDATES, per-account streams)
- Account model extension for broker configuration
- IoC container and server setup

### 2. **broker-adapter-system** (Week 2-4)
Broker abstraction layer including:
- `IBrokerAdapter` interface with lifecycle, order execution, market data methods
- `BaseBrokerAdapter` with retry logic
- **CCXT adapters**: `BaseCcxtAdapter`, `BinanceFutureAdapter` (ported from tvbot)
- **Oanda adapter**: `OandaClient`, `OandaAdapter` (ported from tvbot)
- `BrokerAdapterFactory` for creating and caching adapters per account
- Integration tests with sandbox/testnet accounts

### 3. **order-execution-flow** (Week 3-5)
End-to-end order execution including:
- `OrderExecutorService` orchestrating execution via adapters
- `OrderExecutionHandler` consuming from per-account streams
- Trade-manager publishing EXECUTE_ORDER_REQUEST from TranslateResultHandler
- Trade-manager consuming EXECUTE_ORDER_RESULT and updating Order entities
- Error classification and retry logic
- End-to-end integration tests

### 4. **price-feed-system** (Week 6)
Live price updates including:
- `PriceFeedService` fetching prices from broker adapters
- `PriceFeedJob` background job running on interval
- Publishing LIVE_PRICE_UPDATE to trade-manager
- Optional trade-manager consumption (MVP stub)
- Observability metrics

## Architecture Highlights

### Event-Driven Design
- **No HTTP in critical path**: All communication via Redis Streams
- **Per-account streams**: Maintains strict ordering per trading account
- **Async processing**: Non-blocking message consumption

### Message Flow
```
trade-manager → stream:trade:account:{accountId} → executor-service
executor-service → StreamTopic.ORDER_EXECUTION_RESULTS → trade-manager
executor-service → StreamTopic.PRICE_UPDATES → trade-manager (future)
```

### Broker Abstraction
```
IBrokerAdapter (interface)
├── BaseBrokerAdapter (abstract class)
│   ├── BaseCcxtAdapter (crypto exchanges)
│   │   └── BinanceFutureAdapter
│   └── OandaAdapter (forex)
└── WebTerminalAdapter (future: XM/Exness)
```

## Timeline
- **Week 1-2**: Foundation + Adapter infrastructure
- **Week 3-4**: Broker implementations (CCXT, Oanda)
- **Week 5**: Trade-manager integration + Testing
- **Week 6**: Price feed + Documentation + Deployment

**Total**: 4-6 weeks

## Why Option D (Recommended)

### Pros
- ✅ Fully event-driven, consistent with system architecture
- ✅ Monorepo benefits: shared libs, consistent patterns, single deployment
- ✅ Independent scaling from trade-manager
- ✅ Low technical debt, high maintainability
- ✅ AI-friendly: single codebase for context loading
- ✅ Type safety: shared TypeScript types
- ✅ No HTTP overhead: pure async messaging
- ✅ Future-ready: easy to extend with new brokers

### Cons (Mitigated)
- ❌ Longest build time (4-6 weeks) - **Worth it for long-term benefits**
- ❌ Code duplication from tvbot - **One-time port, then independent evolution**

### vs Other Options
| Aspect          | Option A (HTTP) | Option B (HTTP Wrapper) | Option C (Extend tvbot) | **Option D (Recommended)** |
| --------------- | --------------- | ----------------------- | ----------------------- | -------------------------- |
| Architecture    | ❌ Mixed         | ⚠️ Better                | ⚠️ Better                | ✅ **Pure event-driven**    |
| Build Time      | ✅ 1-2w          | ⚠️ 2-3w                  | ⚠️ 3-4w                  | ❌ 4-6w                     |
| Tech Debt       | ❌ High          | ⚠️ Medium                | ❌ High                  | ✅ **Low**                  |
| Maintainability | ⚠️ Medium        | ⚠️ Medium                | ❌ Poor                  | ✅ **Excellent**            |
| Latency         | ❌ 500-2000ms    | ❌ 500-2000ms            | ✅ <100ms                | ✅ **<100ms**               |

## Validation
Run: `openspec validate build-executor-service --strict`

## Related Changes
- **setup-order-model**: Provides Order entity for tracking orders
- **setup-translate-result-consumer**: trade-manager consumes TRANSLATE_MESSAGE_RESULT (starting point for order publishing)

## Next Steps
1. Review proposal, design, tasks, and specs
2. Approve or request modifications
3. Implement via `/feature-implementation build-executor-service`
4. Upon completion, archive via `/openspec-archive build-executor-service`

