# Change: Setup Redis Stream Publishers for Trade-Manager and Interpret-Service

## Why
Currently, `trade-manager` and `interpret-service` lack the infrastructure to publish messages to Redis Streams. The `telegram-service` already has a working publisher pattern that should be replicated. This change enables these services to publish events for downstream processing, completing the message flow architecture.

## What Changes
- Add `RedisStreamPublisher` to `trade-manager` container and interface
- Ensure `interpret-service` container properly exposes its existing `streamPublisher`
- Update container tests for both services to verify publisher initialization
- Add infrastructure code only - actual event publishing logic will be implemented separately
- **Document single-instance MVP constraint** for both trade-manager and interpret-service due to Redis Streams lacking partition-based grouping
- **Add Gemini-specific configuration** to interpret-service for LLM integration
- Create `.env.sample` for interpret-service with all required environment variables
- **Document accountId field** in Account model to clarify relationship with executor-service

## Impact
- Affected specs: `stream-publisher` (new capability), `account-management` (documentation update)
- Affected code:
  - `apps/trade-manager/src/container.ts`
  - `apps/trade-manager/src/interfaces/container.interface.ts`
  - `apps/trade-manager/test/unit/container.spec.ts`
  - `apps/interpret-service/src/container.ts` (MVP constraint comment)
  - `apps/interpret-service/src/config.ts` (Gemini configuration)
  - `apps/interpret-service/test/unit/container.spec.ts`
  - `apps/interpret-service/test/unit/config.spec.ts` (new tests for Gemini config)
  - `apps/interpret-service/.env.sample` (new file)
  - `infra/pm2/trade-manager.config.js` (documentation update)
  - `infra/pm2/interpret-service.config.js` (documentation update)
  - `libs/dal/src/models/account.model.ts` (documentation update)
- No breaking changes - purely additive infrastructure setup
- **Important**: Both trade-manager and interpret-service must run as single instances (MVP constraint)
