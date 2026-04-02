# Proposal: Translate Message Flow

## Change ID
`translate-message-flow`

## Summary
Implement the message translation flow where `trade-manager` receives `NEW_MESSAGE` events, creates a MongoDB transaction to add history tracking, and publishes `TRANSLATE_MESSAGE_REQUEST` events to `interpret-service` for LLM-based translation.

## Motivation
Currently, the `trade-manager` receives `NEW_MESSAGE` events but does not process them. To enable automated trading signal interpretation, we need to:
1. Track message processing history for audit and debugging purposes
2. Send messages to `interpret-service` for LLM-based translation
3. Ensure atomicity of database updates and event publishing using MongoDB transactions
4. Support configurable TTL for message history records

## Scope
This change focuses on:
- **Message History Tracking**: Add new history types (`TRANSLATE_MESSAGE`, `TRANSLATE_RESULT`) to track translation flow
- **Transaction Pattern**: Implement a reusable MongoDB transaction utility for atomic operations
- **Event Publishing**: Emit `TRANSLATE_MESSAGE_REQUEST` events from `trade-manager` to `interpret-service`
- **Configuration**: Add TTL configuration for message history records

## Out of Scope
- Processing `TRANSLATE_MESSAGE_RESULT` responses from `interpret-service` (future work)
- Actual LLM integration in `interpret-service` (already exists)
- Trade execution logic

## Dependencies
- Existing `telegram-message` model and repository
- Existing `TRANSLATE_MESSAGE_REQUEST` message type and payload schema
- Existing `interpret-service` consumer for translation requests
- MongoDB transaction support (requires replica set or sharded cluster)

## Risks & Mitigations
| Risk                                        | Impact | Mitigation                                                           |
| ------------------------------------------- | ------ | -------------------------------------------------------------------- |
| MongoDB transactions require replica set    | High   | Document requirement; local dev uses Docker Compose with replica set |
| Transaction overhead may impact performance | Medium | Keep transactions small and focused; monitor metrics                 |
| Message history array growth                | Medium | Use TTL index on parent document; consider archival strategy later   |

## Success Criteria
- [ ] `MessageHistoryTypeEnum` includes `TRANSLATE_MESSAGE` and `TRANSLATE_RESULT`
- [ ] Reusable transaction utility exists in `libs/dal`
- [ ] `trade-manager` processes `NEW_MESSAGE` events with transaction
- [ ] History entry created with `TRANSLATE_MESSAGE_REQUEST` event info
- [ ] `TRANSLATE_MESSAGE_REQUEST` published to `interpret-service`
- [ ] TTL configuration added to base config
- [ ] All tests pass (unit and integration)
- [ ] Validation passes with `openspec validate --strict`

## Related Changes
- Builds on `scaffold-trade-manager` (archived)
- Builds on `setup-interpret-events` (archived)
- Prepares for future `process-translation-results` change
