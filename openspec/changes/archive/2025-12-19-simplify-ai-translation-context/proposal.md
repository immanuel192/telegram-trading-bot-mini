# Change: Simplify AI Translation Context

## Why
The AI service is struggling with complex conditional logic when validating orders context (checking `executed` status, symbol matching, etc.). This complexity leads to:
- Unreliable validation even with larger models (Maverick)
- Overly long prompts (~1000 lines) that dilute attention
- Hallucinations when checking order state
- Tight coupling between interpret-service and order state

By removing order context from AI translation, we:
- Simplify AI task to pure pattern recognition and extraction
- Move deterministic validation logic to code (trade-manager)
- Reduce prompt size by ~50%
- Improve reliability and maintainability

## What Changes
- **interpret-service**: Remove `OrderRepository` dependency and order fetching logic
- **interpret-service**: Update `MessageContext` interface to remove `orders` field
- **interpret-service**: Simplify AI prompts to focus on intent detection and data extraction only
- **interpret-service**: Update all AI providers (Groq, Gemini) to not pass orders to context
- **interpret-service**: Update tests to reflect stateless message translation
- **trade-manager**: (Out of scope) Will handle order validation and command decision logic

## Impact
- **Affected specs**: `ai-translation-service`
- **Affected code**:
  - `apps/interpret-service/src/events/consumers/translate-request-handler.ts`
  - `apps/interpret-service/src/services/ai/ai-service.interface.ts`
  - `apps/interpret-service/src/services/ai/providers/groq/groq-ai.service.ts`
  - `apps/interpret-service/src/services/ai/providers/gemini/gemini-ai.service.ts`
  - `apps/interpret-service/prompts/futu-color/*.txt`
  - `apps/interpret-service/test/**/*.spec.ts`
- **Breaking change**: YES - Changes `MessageContext` interface contract
- **Migration**: trade-manager will need to implement validation logic (separate change)
