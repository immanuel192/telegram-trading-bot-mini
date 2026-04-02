# Prompt Testing Infrastructure

## Purpose

This capability provides dedicated testing infrastructure for AI prompt engineering and validation in `interpret-service`, enabling systematic prompt iteration and validation separate from regular application tests.

## ADDED Requirements

### Requirement: Dedicated Prompt Test Suite
The system SHALL provide a separate test suite for prompt testing that is excluded from regular test runs.

#### Scenario: Exclude prompt tests from default test runs
- **WHEN** `nx test interpret-service` is executed
- **THEN** tests in `test/prompts/` directory are not executed
- **AND** only regular unit and integration tests run

#### Scenario: Run prompt tests explicitly
- **WHEN** `nx test:prompt interpret-service` is executed with `AI_GEMINI_API_KEY` environment variable
- **THEN** only tests in `test/prompts/` directory are executed
- **AND** tests can interact with real Gemini AI service

#### Scenario: Fail gracefully without API key
- **WHEN** `nx test:prompt interpret-service` is executed without `AI_GEMINI_API_KEY`
- **THEN** tests fail with clear error message indicating missing API key
- **AND** error message explains how to set the environment variable

### Requirement: Test Context Builder Utility
The system SHALL provide utility function for building test context for AI service.

#### Scenario: Build test context for AI service
- **WHEN** test needs to create context for AI translation
- **THEN** `buildTestContext()` utility creates context object with message, prevMessage, quotedMessage, orders, and other optional fields
- **AND** context matches IAIService interface requirements

### Requirement: Response Assertion Utilities
The system SHALL provide utilities for asserting AI response structure in tests.

#### Scenario: Validate response structure with Jest matchers
- **WHEN** test receives AI response
- **THEN** test uses `expect.objectContaining()` to validate response structure
- **AND** test validates required fields: `isCommand`, `command`, `confidence`, `reason`
- **AND** test validates extraction structure when `isCommand=true`

#### Scenario: Optional assertion helpers for common patterns
- **WHEN** multiple tests need similar assertions
- **THEN** optional helper functions can be created to reduce boilerplate
- **AND** helpers use standard Jest `expect.objectContaining()` internally

### Requirement: Rate Limiting for API Calls
The system SHALL implement rate limiting between prompt tests to avoid API throttling.

#### Scenario: Delay between test cases
- **WHEN** each prompt test case completes
- **THEN** system waits 250ms before executing next test
- **AND** delay prevents hitting Gemini API rate limits

### Requirement: Prompt Loading for Tests
The system SHALL support loading prompts from database or mocking PromptCacheService for tests.

#### Scenario: Load prompt from database for integration test
- **WHEN** prompt test runs with database connection
- **THEN** test loads actual prompt from PromptRule collection
- **AND** prompt is used to initialize AI service

#### Scenario: Mock PromptCacheService for isolated test
- **WHEN** prompt test runs without database
- **THEN** test mocks PromptCacheService to return test prompt
- **AND** test can run independently of database state

### Requirement: Sample Test Template
The system SHALL provide a sample prompt test case as template for additional tests.

#### Scenario: Sample LONG command test
- **WHEN** sample test executes with message "GOLD Buy 4237.6-4235.6 TP 4238.5 TP 4255.5 SL 4230"
- **THEN** AI classifies as LONG command
- **AND** extraction includes symbol=XAUUSD, entryZone=[4237.6, 4235.6], stopLoss=4230
- **AND** extraction includes takeProfits with two price levels

### Requirement: CI Automation for Prompt Testing
The system SHALL provide GitHub Actions workflow for manual prompt test execution.

#### Scenario: Manual workflow trigger
- **WHEN** developer triggers "Prompt Testing" workflow from GitHub UI
- **THEN** workflow runs `nx test:prompt interpret-service` with `AI_GEMINI_API_KEY` from secrets
- **AND** workflow uploads test results as artifacts

#### Scenario: Workflow timeout protection
- **WHEN** prompt tests run in CI
- **THEN** workflow has 15-minute timeout to prevent runaway costs
- **AND** workflow fails if tests exceed timeout

## Related Capabilities

- **ai-translation-service**: Prompt tests validate AI service behavior
- **ci-pipeline**: Extends CI with manual prompt testing workflow
