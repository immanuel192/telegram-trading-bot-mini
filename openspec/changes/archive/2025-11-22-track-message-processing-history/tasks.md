## 1. Create ServiceName Enum
- [x] 1.1 Create `libs/shared/utils/src/constants/service-names.ts` with enum of all service names
- [x] 1.2 Export from `libs/shared/utils/src/index.ts`

## 2. Update DAL Repository
- [x] 2.1 Add `addHistoryEntry` method to `TelegramMessageRepository` for atomic history updates
- [x] 2.2 Method should use MongoDB `$push` operator to atomically append to history array
- [x] 2.3 Add integration test for atomic history updates

## 3. Update Telegram Service
- [x] 3.1 Initialize `history` field as empty array when creating new `TelegramMessage` documents
- [x] 3.2 Extract stream publishing logic into private `publishMessageEvent` method
- [x] 3.3 Update `publishMessageEvent` to atomically add history entry when publishing to stream
- [x] 3.4 Ensure history entry is persisted even if stream publishing fails (with errorMessage)
- [x] 3.5 Populate `fromService`, `targetService`, and `streamEvent` fields correctly
- [x] 3.6 Update unit tests to verify history tracking

## 4. Documentation
- [x] 4.1 Add inline comments explaining the history tracking pattern
- [x] 4.2 Document the philosophy: services add new history entries, never update old ones

## 5. Validation
- [x] 5.1 Run integration tests to verify history is populated correctly
- [x] 5.2 Verify history persists even when stream publishing fails
- [x] 5.3 Confirm atomic updates work correctly under concurrent operations
