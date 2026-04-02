## 1. Remove Order Repository Dependency
- [x] 1.1 Remove `OrderRepository` import from `translate-request-handler.ts`
- [x] 1.2 Remove `orderRepository` parameter from `TranslateRequestHandler` constructor
- [x] 1.3 Remove `orderRepository` injection in `container.ts`
- [x] 1.4 Update integration tests to not mock `OrderRepository`

## 2. Update Message Context Interface
- [x] 2.1 Update `MessageContext` interface in `ai-service.interface.ts` to remove `orders` field
- [x] 2.2 Update `buildMessageContext` method to not fetch orders from database
- [x] 2.3 Update `buildMessageContext` to only return `prevMessage`, `quotedMessage`, `quotedFirstMessage`
- [x] 2.4 Remove Sentry span for `fetch-orders` operation

## 3. Update AI Providers
- [x] 3.1 Update `groq-ai.service.ts` to not include orders in context formatting
- [x] 3.2 Update `gemini-ai.service.ts` to not include orders in context formatting
- [x] 3.3 Remove order-related context serialization logic
- [x] 3.4 Update provider unit tests to reflect simplified context

## 4. Simplify AI Prompts
- [x] 4.1 Create `prompt-v3-llama-3.1-8b.txt` without order validation logic
- [x] 4.2 Create `prompt-v3-llama-4-maverick.txt` without order validation logic
- [x] 4.3 Remove STEP 4 (VALIDATION) section from prompts
- [x] 4.4 Update STEP 2 (CLASSIFICATION) to focus on intent detection only
- [x] 4.5 Remove all examples that reference `context.orders`
- [x] 4.6 Add examples showing intent detection without validation

## 5. Update Tests
- [x] 5.1 Update `prompt-groq-llama-instant.spec.ts` to use new prompts
- [x] 5.2 Remove test cases that validate order matching (these move to trade-manager)
- [x] 5.3 Update test cases to expect intent detection instead of validated commands
- [x] 5.4 Add test cases for stateless translation (same message → same result)
- [x] 5.5 Update `translate-request-handler.spec.ts` integration tests
- [x] 5.6 Remove order repository mocking from integration tests

## 6. Update Documentation
- [x] 6.1 Update `ai-service.interface.ts` JSDoc comments
- [x] 6.2 Update `translate-request-handler.ts` file header comment
- [x] 6.3 Update prompt README files to reflect simplified approach
- [x] 6.4 Document that validation now happens in trade-manager

## 7. Verification
- [x] 7.1 Run all interpret-service unit tests
- [x] 7.2 Run all interpret-service integration tests
- [x] 7.3 Run prompt tests with both llama-3.1-8b and llama-4-maverick
- [x] 7.4 Verify prompt token count is reduced by ~50%
- [x] 7.5 Manual smoke test with sample messages
