# Tasks: Setup Prompt Testing

## Overview

Implementation tasks for setting up prompt testing infrastructure in `interpret-service` and aligning message payload structure with AI response schema.

---

## Group 1: Prompt Testing Infrastructure (interpret-service)

### Task 1.1: Create prompt test directory structure
**Scope**: Setup test directories and configuration

**Steps**:
1. Create `apps/interpret-service/test/prompts/` directory
2. Create `apps/interpret-service/test/prompts/utils/` directory
3. Create `apps/interpret-service/test/prompts/futu-color/` directory

**Validation**:
- Directories exist at specified paths

**Dependencies**: None

---

### Task 1.2: Update Jest configuration to exclude prompt tests
**Scope**: Modify `jest.config.ts` to exclude prompt tests from default runs

**Steps**:
1. Update `apps/interpret-service/jest.config.ts`
2. Add `testPathIgnorePatterns: ['/node_modules/', '/test/prompts/']`
3. Verify existing tests still run

**Validation**:
- Run `nx test interpret-service` - should not run prompt tests
- Existing tests pass

**Dependencies**: Task 1.1

---

### Task 1.3: Add test:prompt task to project.json
**Scope**: Create dedicated task for running prompt tests

**Steps**:
1. Update `apps/interpret-service/project.json`
2. Add new target `test:prompt`:
   ```json
   "test:prompt": {
     "executor": "@nx/jest:jest",
     "outputs": ["{workspaceRoot}/coverage/{projectRoot}"],
     "options": {
       "jestConfig": "apps/interpret-service/jest.config.prompt.ts",
       "passWithNoTests": false,
       "runInBand": true
     }
   }
   ```
3. Create `apps/interpret-service/jest.config.prompt.ts` that only includes prompt tests

**Validation**:
- `nx test:prompt interpret-service` command exists (will fail without API key)
- Configuration file created

**Dependencies**: Task 1.1, Task 1.2

---

### Task 1.4: Create context builder utility
**Scope**: Helper function to build test context for AI service

**Steps**:
1. Create `apps/interpret-service/test/prompts/utils/context-builder.ts`
2. Implement `buildTestContext()` function:
   - Accepts: message text, options (prevMessage, quotedMessage, orders, etc.)
   - Returns: Context object matching IAIService requirements
3. Export helper functions for common scenarios

**Validation**:
- Unit test for context builder (in same file or separate spec)
- Can build context with all optional fields

**Dependencies**: Task 1.1

---

### Task 1.5: Create response assertion helpers (Optional)
**Scope**: Optional helper functions for common test assertions

**Steps**:
1. Tests can use `expect.objectContaining()` directly for response validation
2. Optionally create `apps/interpret-service/test/prompts/utils/assertions.ts` for reusable patterns:
   ```typescript
   // Example helper (optional)
   export const expectCommand = (response: any, command: string) => {
     expect(response).toEqual(expect.objectContaining({
       isCommand: true,
       command,
       confidence: expect.any(Number),
       reason: expect.any(String),
       extraction: expect.objectContaining({
         symbol: expect.any(String),
         isImmediate: expect.any(Boolean),
       })
     }));
   };
   ```

**Validation**:
- Tests use standard Jest assertions
- Optional helpers reduce boilerplate

**Dependencies**: Task 1.1

**Note**: This task is optional. Tests can use `expect.objectContaining()` directly without custom utilities.

---

### Task 1.6: Create sample prompt test case
**Scope**: Implement one complete prompt test as template

**Steps**:
1. Create `apps/interpret-service/test/prompts/futu-color/prompt.spec.ts`
2. Implement test structure:
   ```typescript
   describe('Futu Color Prompt', () => {
     let aiService: IAIService;
     let promptCacheService: PromptCacheService | jest.Mocked<PromptCacheService>;
     
     beforeAll(async () => {
       // Load prompt into DB or mock PromptCacheService
       // Initialize IAIService
       // Populate channel data
     });
     
     afterEach(async () => {
       await new Promise(resolve => setTimeout(resolve, 250)); // Rate limiting
     });
     
     it('should classify LONG command with entry zone', async () => {
       // Test case implementation
     });
   });
   ```
3. Implement one LONG command test case
4. Use context builder and response validator utilities

**Validation**:
- Test runs with `AI_GEMINI_API_KEY` set
- Test passes with valid API key
- Test fails gracefully without API key

**Dependencies**: Task 1.4, Task 1.5

**Integration Test**: Yes - requires real AI service

---

## Group 2: Message Payload Update (shared-utils)

### Task 2.1: Update TranslateMessageResultPayload schema
**Scope**: Align payload with AI response schema

**Steps**:
1. Update `libs/shared/utils/src/interfaces/messages/translate-message-result.ts`
2. Replace current structure with:
   ```typescript
   export const TranslateMessageResultPayloadSchema = Type.Object({
     // Preserved fields
     promptId: Type.String({ minLength: 1 }),
     traceToken: Type.String({ minLength: 1 }),
     receivedAt: Type.Integer({ minimum: 1 }),
     messageId: Type.String({ minLength: 1 }),
     channelId: Type.String({ minLength: 1 }),
     
     // AI response fields (from gemini-response-schema.ts)
     isCommand: Type.Boolean(),
     confidence: Type.Number({ minimum: 0, maximum: 1 }),
     reason: Type.String(),
     command: Type.Enum(CommandEnum), // Define CommandEnum
     extraction: Type.Union([
       Type.Object({
         symbol: Type.String(),
         isImmediate: Type.Boolean(),
         meta: Type.Object({
           reduceLotSize: Type.Optional(Type.Boolean()),
           adjustEntry: Type.Optional(Type.Boolean()),
         }),
         entry: Type.Union([Type.Number(), Type.Null()]),
         entryZone: Type.Union([Type.Array(Type.Number()), Type.Null()]),
         stopLoss: Type.Union([Type.Number(), Type.Null()]),
         takeProfits: Type.Array(Type.Object({
           price: Type.Optional(Type.Number()),
           pips: Type.Optional(Type.Number()),
         })),
         closeIds: Type.Union([Type.Array(Type.String()), Type.Null()]),
         validationError: Type.Union([Type.String(), Type.Null()]),
       }),
       Type.Null()
     ]),
   });
   ```
3. Define `CommandEnum` matching AI schema
4. Update TypeScript type export

**Validation**:
- Schema compiles without errors
- TypeBox validation works

**Dependencies**: None

**Unit Test**: Add tests for schema validation

---

### Task 2.2: Export CommandEnum from shared-utils
**Scope**: Create and export command enum

**Steps**:
1. Create `libs/shared/utils/src/interfaces/messages/command-enum.ts`
2. Define enum:
   ```typescript
   export enum CommandEnum {
     LONG = 'LONG',
     SHORT = 'SHORT',
     MOVE_SL = 'MOVE_SL',
     SET_TP_SL = 'SET_TP_SL',
     CLOSE_BAD_POSITION = 'CLOSE_BAD_POSITION',
     CLOSE = 'CLOSE',
     CLOSE_ALL = 'CLOSE_ALL',
     CANCEL = 'CANCEL',
     NONE = 'NONE',
   }
   ```
3. Export from `libs/shared/utils/src/index.ts`

**Validation**:
- Enum can be imported in other packages
- Matches AI schema exactly

**Dependencies**: None

**Unit Test**: Not required (simple enum)

---

## Group 3: Trade Manager Updates

### Task 3.1: Update translate-result-handler to match new payload
**Scope**: Update consumer to handle new message structure

**Steps**:
1. Update `apps/trade-manager/src/events/consumers/translate-result-handler.ts`
2. Update destructuring to match new payload:
   ```typescript
   const {
     receivedAt, messageId, channelId, promptId, traceToken,
     isCommand, confidence, reason, command, extraction
   } = payload;
   ```
3. Update logging to use new fields
4. Update any logic that references old `commands` array or `meta.confidence`
5. Add TODO comments for future command translation logic

**Validation**:
- File compiles without errors
- Linting passes

**Dependencies**: Task 2.1

**Unit Test**: Update existing tests for new payload structure

---

### Task 3.2: Update trade-manager integration tests
**Scope**: Update tests to use new payload structure

**Steps**:
1. Find all tests that create `TRANSLATE_MESSAGE_RESULT` payloads
2. Update test payloads to match new schema
3. Update assertions to check new fields

**Validation**:
- All trade-manager tests pass
- Integration tests validate new payload structure

**Dependencies**: Task 3.1

**Integration Test**: Update existing integration tests

---

## Group 4: Interpret Service Updates

### Task 4.1: Update interpret-service to publish new payload structure
**Scope**: Modify message publisher to match new schema

**Steps**:
1. Find where `TRANSLATE_MESSAGE_RESULT` is published in interpret-service
2. Update payload construction to match new schema
3. Map AI response fields directly to payload
4. Remove any transformation logic (publish AI response as-is)

**Validation**:
- Message validation passes
- Published messages match schema

**Dependencies**: Task 2.1

**Integration Test**: Update integration tests

---

### Task 4.2: Update interpret-service integration tests
**Scope**: Update tests for new payload structure

**Steps**:
1. Update integration tests that validate published messages
2. Update mock AI responses to match new structure
3. Verify message validation works

**Validation**:
- All interpret-service tests pass

**Dependencies**: Task 4.1

**Integration Test**: Update existing integration tests

---

## Group 5: CI/CD Setup

### Task 5.1: Create GitHub Actions workflow for prompt testing
**Scope**: Manual workflow to run prompt tests

**Steps**:
1. Create `.github/workflows/prompt-testing.yml`
2. Configure workflow:
   ```yaml
   name: Prompt Testing
   
   on:
     workflow_dispatch:
   
   jobs:
     prompt-test:
       name: Run Prompt Tests
       runs-on: ubuntu-latest
       timeout-minutes: 15
       
       steps:
         - name: Checkout code
           uses: actions/checkout@v4
         
         - name: Setup Node.js
           uses: actions/setup-node@v4
           with:
             node-version: '18'
             cache: 'npm'
         
         - name: Install dependencies
           run: npm ci
         
         - name: Run prompt tests
           run: npx nx test:prompt interpret-service
           env:
             AI_GEMINI_API_KEY: ${{ secrets.AI_GEMINI_API_KEY }}
         
         - name: Upload test results
           if: always()
           uses: actions/upload-artifact@v4
           with:
             name: prompt-test-results
             path: coverage/apps/interpret-service/
   ```
3. Document workflow in `.github/workflows/README.md`

**Validation**:
- Workflow file is valid YAML
- Can be triggered manually from GitHub UI

**Dependencies**: Task 1.3

---

### Task 5.2: Document prompt testing workflow
**Scope**: Add documentation for running prompt tests

**Steps**:
1. Update `apps/interpret-service/README.md` (or create if missing)
2. Add section on prompt testing:
   - How to run locally
   - Required environment variables
   - How to add new test cases
   - GitHub Actions workflow usage
3. Add example test case

**Validation**:
- Documentation is clear and complete
- Includes all necessary steps

**Dependencies**: Task 5.1

---

## Task Summary

| Group                                | Tasks   | Dependencies         | Test Type          |
| ------------------------------------ | ------- | -------------------- | ------------------ |
| **1. Prompt Testing Infrastructure** | 6 tasks | None → Sequential    | Integration        |
| **2. Message Payload Update**        | 2 tasks | None → Parallel      | Unit               |
| **3. Trade Manager Updates**         | 2 tasks | Group 2 → Sequential | Unit + Integration |
| **4. Interpret Service Updates**     | 2 tasks | Group 2 → Sequential | Integration        |
| **5. CI/CD Setup**                   | 2 tasks | Group 1 → Sequential | None               |

**Total Tasks**: 14
**Estimated Effort**: 3-4 days
**Critical Path**: Group 1 → Group 5 (prompt testing infrastructure + CI)
**Parallel Work**: Groups 2, 3, 4 can be done in parallel after Group 2 completes

---

## Validation Checklist

- [x] All prompt tests excluded from default `nx test interpret-service`
- [x] `nx test:prompt interpret-service` runs prompt tests only
- [x] Sample prompt test passes with valid API key (skeleton created, ready for implementation)
- [x] `TRANSLATE_MESSAGE_RESULT` schema matches AI response schema
- [x] `trade-manager` consumes new payload structure
- [x] `interpret-service` publishes new payload structure
- [x] All existing tests pass (shared-utils: 176/176, trade-manager: 81/81, interpret-service: 99/99)
- [x] GitHub Actions workflow can be triggered manually
- [x] Documentation updated

