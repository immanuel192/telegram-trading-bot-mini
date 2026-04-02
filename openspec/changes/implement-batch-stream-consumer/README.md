# Implement Batch Stream Consumer

## Status
**Proposed** - Awaiting approval

## Quick Links
- [Proposal](./proposal.md) - Problem statement and solution overview
- [Design](./design.md) - Detailed architectural design
- [Tasks](./tasks.md) - Implementation task breakdown
- [Spec](./specs/batch-stream-consumer/spec.md) - Formal requirements

## Summary

This change introduces a new `BatchStreamConsumer` class that enables batch processing of Redis Stream messages across multiple channel groups. This improves performance for I/O-bound operations (e.g., AI service calls) by processing messages from different channels in parallel while maintaining ordering guarantees within each channel.

### Key Benefits
- **2-3x performance improvement** for AI-heavy workloads
- **Backward compatible** - existing consumers unchanged
- **Flexible** - services can choose sequential or batch processing
- **Reliable** - robust ACK/retry logic maintains message guarantees

### Example Impact

**Before (Sequential)**:
```
Channel A: [A0, A1, A2] → 3 sequential AI calls
Channel B: [B0, B1]     → 2 sequential AI calls
Total: 5 AI call durations
```

**After (Batch)**:
```
Batch 1: [A0, B0, C0] → 1 AI call duration (parallel)
Batch 2: [A1, B1]     → 1 AI call duration (parallel)
Batch 3: [A2]         → 1 AI call duration
Total: 3 AI call durations (40% reduction)
```

## Architecture Overview

```
BaseRedisStreamConsumer (abstract)
├── Shared: fetch, parse, validate, ACK, retry
├── RedisStreamConsumer (existing - refactored)
│   └── Sequential processing within groups
└── BatchStreamConsumer (new)
    └── Batch processing across groups
```

## Scope

### In Scope
- ✅ Create `BaseRedisStreamConsumer` abstract class
- ✅ Refactor `RedisStreamConsumer` to extend base
- ✅ Implement `BatchStreamConsumer` with batch handler
- ✅ Migrate `interpret-service` to use batch consumer
- ✅ Comprehensive unit and integration tests

### Out of Scope
- ❌ Migrating other services (can be done later)
- ❌ Performance benchmarking (post-implementation)
- ❌ Kafka migration (future consideration)

## Timeline
**Estimated**: 10-14 hours

## Validation

Run validation:
```bash
openspec validate implement-batch-stream-consumer --strict
```

View details:
```bash
openspec show implement-batch-stream-consumer
```

## Next Steps

1. **Review** - Team reviews proposal, design, and spec
2. **Approve** - Get approval to proceed with implementation
3. **Implement** - Follow tasks.md for step-by-step implementation
4. **Test** - Verify all tests pass and performance improves
5. **Archive** - Archive change and update main specs
