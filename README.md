# 🚀 Telegram Auto Trading Bot

> [!CAUTION]
> **LEGAL & EDUCATIONAL DISCLAIMER**
> This repository is provided strictly for **educational and research purposes**. It is a demonstration of high-level software architecture, AI integration, and distributed systems. The author does not provide any financial advice and bears no responsibility for any financial losses or damages resulting from the use of this software in live trading environments. **Use a Simulator for all experiments.**

## 🌟 Overview

This project is a professional-grade **Telegram Auto Trading Bot** built as a high-performance **Nx Monorepo**. It serves as a showcase for modern backend engineering, specifically focusing on how to bridge real-time Telegram signal ingestion with AI-powered interpretation and automated execution.

### Key Architectural Highlights
- **Nx Monorepo Architecture**: Strict module boundaries and efficient build/test pipelines.
- **Polyglot-Ready AI Integration**: Multi-provider support (Gemini, Groq) with sophisticated **Chat Session Caching** for sub-second latency.
- **Distributed Tracing**: End-to-end observability using **Redis Streams** and **Sentry**, allowing you to track a single Telegram message through interpretation to execution.
- **Clean Architecture (N-Tier)**: Clear separation between `apps` (orchestration), `libs/dal` (data access), and `libs/shared` (utilities).
- **Educational Simulator**: A built-in **Mock Exchange Adapter** that allows for risk-free research and architectural validation.

## 🏗 System Structure

- `apps/`
  - `telegram-service`: High-performance ingestion using **MTCute**.
  - `interpret-service`: AI-powered signal extraction with session persistence.
  - `trade-manager`: The brain of the system, managing trade state and multi-account orchestration.
  - `executor-service`: Pluggable broker integration layer (Default: **Simulator**).
- `libs/`
  - `dal`: MongoDB-backed Data Access Layer with Repository patterns.
  - `shared`: Common types, loggers (Pino), and configuration utilities.

## 🛠 Tech Stack

- **Runtime**: Node.js 18+ (TypeScript 5.x)
- **Frameworks**: Fastify (Web), Nx (Monorepo)
- **Database**: MongoDB (Storage), Redis (Streaming/Caching)
- **AI**: Google Generative AI (Gemini), Groq SDK
- **Observability**: Sentry (Tracing/Errors), New Relic (Performance), Pino (Logging)

## 🚦 Getting Started

### Prerequisites
- Node.js 18.x
- Docker & Docker Compose
- LLM API Keys (Gemini or Groq)

### Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Initialize Infrastructure**:
   ```bash
   npm run stack:up # Starts MongoDB & Redis
   ```

3. **Configure Environment**:
   Copy `.env.example` to `.env.local` and fill in your keys:
   ```bash
   cp .env.example .env.local
   export DOTENV=.env.local
   ```

4. **Build & Run (Simulator Mode)**:
   ```bash
   nx build all
   nx dev trade-manager
   ```

## 🔍 Engineering Excellence

### Distributed Tracing with Redis Streams
The system implements a custom trace propagation logic over Redis Streams. Every message carries a `traceToken`, enabling developers to visualize the entire lifecycle of a signal in Sentry's Trace Waterfall view.

### AI Inference Performance
By implementing **Chat Session Caching** in the `interpret-service`, the bot maintains context across multiple messages while avoiding the "cold start" latency of new LLM sessions, reducing extraction time by up to 60%.

### Position Sizing & Risk Management
The `LotSizeCalculatorService` implements professional risk-based sizing, considering:
- Account Equity (vs. Balance)
- Maximum Risk Percentage
- Margin Allocation (DCA-aware)
- Exchange-specific Lot Step Clamping

## 📜 Documentation

- [Architecture Deep Dive](docs/architecture.md)
- [Risk Management Logic](docs/lot-size-calculation.md)
- [Symbol Mapping Framework](apps/executor-service/docs/SYMBOL_MAPPING.md)
- [Caching Strategy](docs/caching-architecture.md)
