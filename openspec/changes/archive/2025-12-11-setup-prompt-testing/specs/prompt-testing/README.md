# Prompt Testing Infrastructure

## Overview

Dedicated testing infrastructure for AI prompt engineering and validation in `interpret-service`.

## Scope

- Separate test suite for prompt testing (`test/prompts/`)
- Test utilities for context building and response validation
- Rate limiting for API calls
- Sample test template
- GitHub Actions workflow for CI automation

## Key Components

- **Test Directory**: `apps/interpret-service/test/prompts/`
- **Jest Config**: `jest.config.prompt.ts` (separate from main config)
- **Utilities**: `context-builder.ts`, `response-validator.ts`
- **Sample Test**: `futu-color/prompt.spec.ts`
- **CI Workflow**: `.github/workflows/prompt-testing.yml`

## Dependencies

- Requires `AI_GEMINI_API_KEY` environment variable
- Uses real Gemini AI service (not mocked)
- Can mock `PromptCacheService` or use real database

## Usage

```bash
# Run prompt tests locally
AI_GEMINI_API_KEY=your_key npx nx test:prompt interpret-service

# Run from GitHub Actions (manual trigger)
# Uses AI_GEMINI_API_KEY from repository secrets
```

## Related Specs

- `ai-translation-service`: AI service being tested
- `ci-pipeline`: CI automation integration
