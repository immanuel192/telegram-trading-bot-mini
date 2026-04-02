# Proposal: Setup TRANSLATE_MESSAGE_RESULT Consumer

## Summary
Setup the mechanism to process `TRANSLATE_MESSAGE_RESULT` events in `trade-manager` by adding a new consumer for the `StreamTopic.TRANSLATE_RESULTS` stream. This completes the message translation flow by allowing `trade-manager` to receive and process translation results from `interpret-service`.

## Why
The message translation flow is currently incomplete. While `interpret-service` successfully translates Telegram messages and publishes results to `StreamTopic.TRANSLATE_RESULTS`, the `trade-manager` service cannot receive these results because it lacks the necessary consumer infrastructure. This creates a broken message flow where translation results are published but never consumed.

This change is essential because:
1. **Completes the translation flow**: Establishes the missing link between `interpret-service` and `trade-manager`
2. **Enables observability**: Allows monitoring of translation results in trade-manager logs
3. **Foundation for trade execution**: Sets up the infrastructure needed for future trade execution logic
4. **Follows established patterns**: Uses the same consumer pattern as the existing `NEW_MESSAGE` consumer

Without this change, translation results are lost, and the system cannot progress to trade execution.

## Motivation
Currently, `interpret-service` successfully translates messages and publishes `TRANSLATE_MESSAGE_RESULT` events to `StreamTopic.TRANSLATE_RESULTS`. However, `trade-manager` does not yet consume these results. This change establishes the consumer infrastructure needed to receive translation results, laying the foundation for future trade execution logic.

## Scope

### In Scope
- **Verify `interpret-service` emission**: Confirm that `interpret-service` correctly emits `TRANSLATE_MESSAGE_RESULT` to `StreamTopic.TRANSLATE_RESULTS`
- **Consumer configuration**: Add `STREAM_CONSUMER_MODE_TRANSLATE_RESULTS` config variable to `trade-manager`
- **Consumer setup**: Create consumer group and consumer instance for `StreamTopic.TRANSLATE_RESULTS`
- **Result handler**: Implement `TranslateResultHandler` that logs received results (no business logic yet)
- **Testing**: Add integration tests for the new consumer

### Out of Scope
- Processing translation results (trade execution logic)
- Error handling for failed translations
- Retry mechanisms for result processing
- Performance optimization

## Changes

### trade-manager
1. **Configuration**: Add `STREAM_CONSUMER_MODE_TRANSLATE_RESULTS` to support separate consumer mode for translation results
2. **Consumer Infrastructure**: Setup consumer group and consumer instance for `TRANSLATE_RESULTS` stream
3. **Handler**: Create `TranslateResultHandler` to consume and log `TRANSLATE_MESSAGE_RESULT` events
4. **Integration Tests**: Verify consumer receives and processes translation results

### interpret-service
1. **Verification**: Confirm existing `TRANSLATE_MESSAGE_RESULT` emission to `StreamTopic.TRANSLATE_RESULTS` is working correctly

## Dependencies
- Existing `TRANSLATE_MESSAGE_RESULT` message type and payload schema
- Existing `StreamTopic.TRANSLATE_RESULTS` stream topic
- Existing `interpret-service` translation flow

## Risks
- **None identified**: This is a straightforward consumer setup following established patterns

## Acceptance Criteria
- [ ] `interpret-service` verified to emit `TRANSLATE_MESSAGE_RESULT` to `StreamTopic.TRANSLATE_RESULTS`
- [ ] `trade-manager` config includes `STREAM_CONSUMER_MODE_TRANSLATE_RESULTS`
- [ ] Consumer group created for `TRANSLATE_RESULTS` stream
- [ ] `TranslateResultHandler` logs received translation results
- [ ] Integration tests verify consumer receives and processes results
- [ ] All tests pass
