# Project Context

## Purpose
The **Telegram Auto Trading Bot** is an automated trading system designed to ingest trading signals from Telegram channels, interpret them using LLMs (Large Language Models), and execute trades based on risk management rules. The goal is to automate the trading workflow from signal reception to execution.

## Tech Stack
- **Runtime**: Node.js (v18+)
- **Language**: TypeScript
- **Monorepo Tool**: Nx
- **Database**: MongoDB
- **Process Management**: PM2, Docker & Docker Compose
- **Testing**: Jest
- **Linting/Formatting**: ESLint, Prettier
- **LLM Integration**: Gemini (via `interpret-service`)
- **Notifications**: Pushsafer
- **Messaging/Queue**: Redis Streams (Pull-based model, native Redis with ioredis)

## Project Conventions

### Code Style
- **Linting**: Enforced via ESLint with Nx presets.
- **Formatting**: Prettier is used for consistent code formatting.
- **Strict Mode**: TypeScript strict mode is enabled.

### Architecture Patterns
- **Monorepo Structure**:
  - `apps/`: Contains deployable services (`telegram-service`, `interpret-service`, `trade-manager`).
  - `libs/`: Contains shared code (`shared`, `dal`).
- **Service Responsibilities**:
  - `telegram-service`: Ingests messages from Telegram.
  - `interpret-service`: Parses messages into structured signals using LLMs.
  - `trade-manager`: Manages trade execution and risk.
- **Shared Libraries**:
  - `libs/dal`: Data Access Layer for database interactions (Repositories, Models).
  - `libs/shared`: Common utilities, types, config, and logging.
- **Messaging Architecture (Redis Streams)**:
  - **Pull Model**: Services actively pull messages from Redis Streams using consumer groups.
  - **Consumer Groups**: Used to distribute message processing across multiple instances of a service.
  - **Streams**:
    - `stream:telegram:raw`: High-throughput stream for raw Telegram messages (`telegram-service` -> `interpret-service`).
    - `stream:trade:account:{accountId}`: Per-account streams for strict ordering of trade execution (`trade-manager` -> `executor`).
  - **Reliability**: Redis Streams support acknowledgments (XACK) to ensure at-least-once delivery.
- **Configuration**:
  - Uses a typed configuration pattern.
  - Base config in `libs/shared`.
  - App-specific config extends base.
  - Environment variables loaded via `dotenv` (supports `.env.local`).
- **Logging**:
  - Centralized logger factory in `libs/shared`.
  - Consistent log levels and formatting across services.

### Testing Strategy
- **Unit & Integration Tests**: Run via Jest (`nx test <project>`).
- **Scope**: Each app and lib has its own test suite.
- Prefer integration over unit test. Integration test with docker for dependencies.

### Git Workflow
- Standard feature branch workflow.
- Pull Requests for code review.
- CI checks for linting, testing, and building.

## Domain Context
- **Trading Signals**: Structured data derived from unstructured Telegram messages.
- **Risk Management**: Rules for position sizing (`RISK_FRACTION`) and loss limits (`MAX_DAILY_LOSS_PCT`).
- **Telegram Integration**: Uses MTProto to listen to specific channels.

## Important Constraints
- **Dependencies**:
  - Requires MongoDB for state persistence.
  - Requires valid Telegram API credentials (`API_ID`, `API_HASH`).
  - Requires LLM API Key for interpretation.
  - Requires Redis instance (native Redis).
- **Performance**: Real-time processing of signals is critical.

## External Dependencies
- **Telegram**: Source of trading signals.
- **LLM Provider (Gemini)**: Used for text interpretation.
- **MongoDB**: Primary data store.
- **Pushsafer**: Notification service.
- **Redis**: Native Redis for messaging (Streams) and caching.
