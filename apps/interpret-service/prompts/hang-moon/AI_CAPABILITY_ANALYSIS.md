# AI Capability Analysis - Problematic Cases
**Analysis Date**: 2025-12-25  
**Sample Size**: First 500 lines of sample-data.json  
**Model**: llama-3.1-8b-instant (MMLU 69%)

This document lists ONLY cases where the AI might fail, get confused, or misunderstand the input.

---

## Case 1: Empty Messages

### Input (Line 6):
```json
{"sentAt":"2025-11-19T16:21:18+11:00","message":"","quotedMessage":"","quotedFirstMessage":"","prevMessage":"GOLD - TP HIT 200 +Pips ✅✅"}
```

### Why AI Might Fail:
1. **No explicit rule for empty messages**: The prompt doesn't say what to do when `message` is an empty string
2. **Ambiguous classification**: AI might try to infer from `prevMessage` instead of treating it as standalone
3. **JSON generation risk**: AI might return invalid JSON or skip the response entirely
4. **Confidence uncertainty**: AI might set low confidence and provide unclear reasoning

### Expected Behavior:
```json
[{
  "isCommand": false,
  "command": "NONE",
  "confidence": 1.0,
  "reason": "empty message",
  "extraction": {
    "symbol": "XAUUSD",
    "isImmediate": true,
    "validationError": "empty message"
  }
}]
```

### Frequency: ~20 occurrences in first 500 lines

---

## Case 2: Standalone Price Messages

### Input (Line 143):
```json
{"sentAt":"2025-11-20T20:16:39+11:00","message":"71.6","quotedMessage":"","quotedFirstMessage":"","prevMessage":"Gold sell now"}
```

### Why AI Might Fail:
1. **Looks like a number extraction task**: AI might think this is an entry price to extract
2. **Missing context**: The number "71.6" is abbreviated (4071.6) but AI doesn't know this
3. **No matching rule**: None of the command rules match a standalone number
4. **Confusion with entry field**: AI might try to create a LONG/SHORT command with entry=71.6
5. **Pattern ambiguity**: Coming after "Gold sell now", AI might think this is part of a command sequence

### Expected Behavior:
```json
[{
  "isCommand": false,
  "command": "NONE",
  "confidence": 1.0,
  "reason": "standalone price announcement, not a trading command",
  "extraction": {
    "symbol": "XAUUSD",
    "isImmediate": true,
    "validationError": "informational message - price announcement"
  }
}]
```

### Similar Cases:
- Line 283: `"message":"55.4"`
- Line 318: `"message":"58.5"`
- Line 351: `"message":"89.8"`
- Line 449: `"message":"21.6"`
- Line 477: `"message":"64.5"`

### Frequency: ~10 occurrences

---

## Case 3: Multi-Command Messages

### Input (Line 317):
```json
{"sentAt":"2025-11-24T18:40:39+11:00","message":"Close gold sell\nGold buy now","quotedMessage":"","quotedFirstMessage":"","prevMessage":"@Gold Sell 56.8 +50 Pips running ✅🚀"}
```

### Why AI Might Fail:
1. **Two commands in one message**: Contains both "Close gold sell" AND "Gold buy now"
2. **Prompt says "INDEPENDENT"**: The prompt states "Each user message is INDEPENDENT" but doesn't explain how to handle multiple commands
3. **Priority confusion**: AI might only detect the first command and ignore the second
4. **Array structure uncertainty**: AI might not know it should return TWO objects in the array
5. **Keyword overlap**: Both commands have strong keywords, AI might get confused which to prioritize

### Expected Behavior:
```json
[
  {
    "isCommand": true,
    "command": "CLOSE_ALL",
    "confidence": 1.0,
    "reason": "detected 'Close gold sell' keyword",
    "extraction": {
      "symbol": "XAUUSD",
      "side": "SELL",
      "isImmediate": true,
      "entry": null,
      "entryZone": [],
      "stopLoss": null,
      "takeProfits": [],
      "meta": {"adjustEntry": false, "reduceLotSize": false},
      "isLinkedWithPrevious": false,
      "validationError": ""
    }
  },
  {
    "isCommand": true,
    "command": "LONG",
    "confidence": 1.0,
    "reason": "detected 'Gold buy now' keyword. This is the first signal, detailed info will come in next message",
    "extraction": {
      "symbol": "XAUUSD",
      "side": "BUY",
      "isImmediate": true,
      "entry": null,
      "entryZone": [],
      "stopLoss": null,
      "takeProfits": [],
      "meta": {"adjustEntry": false, "reduceLotSize": false},
      "isLinkedWithPrevious": false,
      "validationError": ""
    }
  }
]
```

### Frequency: ~2 occurrences

---

## Case 4: "Chốt lệnh này" (Close This Order)

### Input (Line 280):
```json
{"sentAt":"2025-11-24T12:11:41+11:00","message":"Chốt lệnh này","quotedMessage":"@Gold Buy 56 +23 Pips running ✅🚀","quotedFirstMessage":"💥GOLD Buy 4058- 4056\n\n✅TP  4061\n✅TP  4078\n\n💢SL  4053","prevMessage":"@Gold Buy 56 +23 Pips running ✅🚀"}
```

### Why AI Might Fail:
1. **No matching rule**: The prompt has "Close gold buy/sell" and "Close X hold Y" but NOT "Chốt lệnh này"
2. **Vietnamese keyword**: "Chốt lệnh này" means "Close this order" but it's not in the prompt
3. **Side extraction complexity**: AI needs to look at `quotedMessage` or `quotedFirstMessage` to find "Buy"
4. **Multiple context sources**: Has both `quotedMessage` and `quotedFirstMessage` with different content
5. **Fallback to NONE**: AI will likely classify as NONE instead of CLOSE_ALL

### Expected Behavior:
```json
[{
  "isCommand": true,
  "command": "CLOSE_ALL",
  "confidence": 0.8,
  "reason": "detected 'Chốt lệnh' (close order) keyword. Extracted side BUY from quotedFirstMessage",
  "extraction": {
    "symbol": "XAUUSD",
    "side": "BUY",
    "isImmediate": true,
    "entry": null,
    "entryZone": [],
    "stopLoss": null,
    "takeProfits": [],
    "meta": {"adjustEntry": false, "reduceLotSize": false},
    "isLinkedWithPrevious": false,
    "validationError": ""
  }
}]
```

### Similar Cases:
- Line 187: `"message":"Đóng lệnh này"`

### Frequency: ~2 occurrences

---

## Case 5: "Lot small" Indicator (Separate Message)

### Input (Lines 385-387):
```json
Line 385: {"sentAt":"2025-11-25T13:42:01+11:00","message":"Gold buy now","quotedMessage":"","quotedFirstMessage":"","prevMessage":"GOLD - TP HIT 200 +Pips ✅✅"}

Line 386: {"sentAt":"2025-11-25T13:42:06+11:00","message":"Lot small","quotedMessage":"","quotedFirstMessage":"","prevMessage":"Gold buy now"}

Line 387: {"sentAt":"2025-11-25T13:42:51+11:00","message":"💥GOLD Buy 4146.5- 4144.5\n\n✅TP  4149.5\n✅TP  4166.5\n\n💢SL  4141","quotedMessage":"","quotedFirstMessage":"","prevMessage":"Lot small"}
```

### Why AI Might Fail (Line 387):
1. **"Lot small" is in prevMessage**: The indicator is in a separate message, not in the current message
2. **Prompt checks current message only**: RULE 4.6 doesn't say to check `prevMessage` for "nhỏ" or "lot small"
3. **Three-message pattern**: This is a three-message sequence instead of the standard two-message pattern
4. **Meta field will be wrong**: AI will set `meta.reduceLotSize = false` instead of `true`

### Expected Behavior (Line 387):
```json
[{
  "isCommand": true,
  "command": "LONG",
  "confidence": 1.0,
  "reason": "detected '💥GOLD Buy' keyword. Linked to previous 'Gold buy now'. Entry is null (market order). Extracted SL 4141 and TPs 4149.5, 4166.5. Detected 'Lot small' in prevMessage",
  "extraction": {
    "symbol": "XAUUSD",
    "side": "BUY",
    "isImmediate": true,
    "entry": null,
    "entryZone": [],
    "stopLoss": {"price": 4141},
    "takeProfits": [{"price": 4149.5}, {"price": 4166.5}],
    "meta": {"adjustEntry": false, "reduceLotSize": true},  // Should be true!
    "isLinkedWithPrevious": true,
    "validationError": ""
  }
}]
```

### Actual AI Behavior (Line 387):
```json
{
  "meta": {"adjustEntry": false, "reduceLotSize": false}  // WRONG! Should be true
}
```

### Frequency: ~1 occurrence

---

## Case 6: Wrong quotedMessage Context

### Input (Line 120):
```json
{"sentAt":"2025-11-20T18:48:39+11:00","message":"💥GOLD Sell 4061- 4063\n\n✅TP  4058\n✅TP  4041\n\n💢SL  4066","quotedMessage":"💥GOLD Sell 4058.5- 4056.5\n\n✅TP  4061.5\n✅TP  4078.5\n\n💢SL  4053","quotedFirstMessage":"","prevMessage":"💥GOLD Sell 4058.5- 4056.5\n\n✅TP  4061.5\n✅TP  4078.5\n\n💢SL  4053"}
```

### Why AI Might Fail:
1. **quotedMessage has different trade**: The `quotedMessage` contains a DIFFERENT trade (4058.5-4056.5) not the linked "Gold sell now"
2. **Data quality issue**: This is actually a data quality problem, but AI needs to handle it
3. **Confusion about which to use**: AI might try to use `quotedMessage` for linking instead of `prevMessage`
4. **SL/TP extraction risk**: AI might accidentally extract SL/TP from `quotedMessage` instead of current message

### Expected Behavior:
```json
[{
  "isCommand": true,
  "command": "SHORT",
  "confidence": 1.0,
  "reason": "detected '💥GOLD Sell' keyword. Linked to previous 'Gold sell now'. Entry is null (market order). Extracted SL 4066 and TPs 4058, 4041 from CURRENT message",
  "extraction": {
    "symbol": "XAUUSD",
    "side": "SELL",
    "isImmediate": true,
    "entry": null,
    "entryZone": [],
    "stopLoss": {"price": 4066},  // From CURRENT message, not quotedMessage
    "takeProfits": [{"price": 4058}, {"price": 4041}],  // From CURRENT message
    "meta": {"adjustEntry": false, "reduceLotSize": false},
    "isLinkedWithPrevious": true,
    "validationError": ""
  }
}]
```

### Risk:
AI might extract:
- `stopLoss: {price: 4053}` (from quotedMessage - WRONG!)
- `takeProfits: [{price: 4061.5}, {price: 4078.5}]` (from quotedMessage - WRONG!)

### Similar Cases:
- Line 220: Similar wrong quotedMessage
- Line 319: Similar wrong quotedMessage

### Frequency: ~3 occurrences

---

## Case 7: "Rời SL về entry" (Move SL to Entry)

### Input (Line 425):
```json
{"sentAt":"2025-11-25T19:27:27+11:00","message":"Rời SL về entry lệnh này\nMove SL entry","quotedMessage":"💥GOLD Buy 4137.4- 4135.4\n\n✅TP  4140.4\n✅TP  4157.4\n\n💢SL  4132","quotedFirstMessage":"","prevMessage":"@Gold Buy 35.4 +20 Pips running ✅🚀"}
```

### Why AI Might Fail:
1. **MOVE_SL not in prompt**: The prompt doesn't have any MOVE_SL rules for hang-moon
2. **Keyword not recognized**: "Rời SL" and "Move SL" are not in any command rules
3. **Will classify as NONE**: AI will correctly classify this as NONE since it's not supported
4. **User expectation mismatch**: User might expect this to be a MOVE_SL command

### Expected Behavior:
```json
[{
  "isCommand": false,
  "command": "NONE",
  "confidence": 1.0,
  "reason": "message contains 'Move SL' which is not a supported command for this channel. Symbol is always XAUUSD",
  "extraction": {
    "symbol": "XAUUSD",
    "isImmediate": true,
    "validationError": "informational message - move SL not supported"
  }
}]
```

### Note:
This is actually CORRECT behavior since MOVE_SL is not supported. However, if we want to support it, we need to add rules.

### Frequency: ~1 occurrence

---

## Case 8: Typo in "Close X hold Y"

### Input (Line 31):
```json
{"sentAt":"2025-11-19T22:20:52+11:00","message":"Close 11.6 holx 09.6","quotedMessage":"💥GOLD Buy 4111.6 - 4109.6\n\n✅TP  4114.6\n✅TP  4131.6\n\n💢SL  4106","quotedFirstMessage":"","prevMessage":"@Gold +25 Pips running ✅🚀"}
```

### Why AI Might Fail:
1. **Typo "holx" instead of "hold"**: The prompt says to look for "hold" but message has "holx"
2. **Case-insensitive not enough**: Even with case-insensitive matching, "holx" ≠ "hold"
3. **Might miss the pattern**: AI might not recognize this as "Close X hold Y" pattern
4. **Could classify as NONE**: AI might fall back to NONE instead of CLOSE_BAD_POSITION

### Expected Behavior:
```json
[{
  "isCommand": true,
  "command": "CLOSE_BAD_POSITION",
  "confidence": 0.9,
  "reason": "detected 'Close' and 'holx' (typo for 'hold') keywords. Extracted side BUY from quotedMessage",
  "extraction": {
    "symbol": "XAUUSD",
    "side": "BUY",
    "isImmediate": true,
    "entry": null,
    "entryZone": [],
    "stopLoss": null,
    "takeProfits": [],
    "meta": {"adjustEntry": false, "reduceLotSize": false},
    "isLinkedWithPrevious": false,
    "validationError": ""
  }
}]
```

### Risk:
The instant model (MMLU 69%) might not be smart enough to handle typos. It might classify as NONE.

### Frequency: ~1 occurrence (but typos could be common)

---

## Case 9: Duplicate Empty Messages

### Input (Lines 252-254):
```json
Line 252: {"sentAt":"2025-11-22T11:43:25+11:00","message":"","quotedMessage":"","quotedFirstMessage":"","prevMessage":""}

Line 253: {"sentAt":"2025-11-22T11:43:25+11:00","message":"","quotedMessage":"","quotedFirstMessage":"","prevMessage":""}

Line 254: {"sentAt":"2025-11-22T11:43:25+11:00","message":"","quotedMessage":"","quotedFirstMessage":"","prevMessage":"✅Dù trong tài khoản chỉ còn hơn 10m..."}
```

### Why AI Might Fail:
1. **Same as Case 1**: Empty message handling issue
2. **Multiple in a row**: Three empty messages in sequence might confuse the AI
3. **Same timestamp**: All have the same timestamp which is unusual
4. **Inconsistent prevMessage**: Line 254 has prevMessage but 252-253 don't

### Expected Behavior:
Each should return NONE with "empty message" validation error.

### Frequency: ~3 consecutive occurrences

---

## Case 10: Message with Only Emoji/Stickers

### Input (Line 321):
```json
{"sentAt":"2025-11-24T18:57:00+11:00","message":"","quotedMessage":"","quotedFirstMessage":"","prevMessage":"GOLD - TP HIT 30 +Pips ✅✅"}
```

### Why AI Might Fail:
Same as Case 1 - empty message handling.

---

## Case 11: "Tạm đóng lệnh này" (Temporarily Close This Order)

### Input (Line 503):
```json
{"sentAt":"2025-11-26T15:34:59+11:00","message":"Tạm đóng lệnh này âm tí ae","quotedMessage":"💥GOLD Sell 4158- 4160\n\n✅TP  4155\n✅TP  4138\n\n💢SL  4163","quotedFirstMessage":"","prevMessage":"Close 58 hold 60"}
```

### Why AI Might Fail:
1. **Vietnamese phrase not in prompt**: "Tạm đóng lệnh này" means "Temporarily close this order"
2. **Similar to "Chốt lệnh này"**: But uses different wording ("Tạm đóng" vs "Chốt")
3. **Additional context**: "âm tí ae" means "slightly negative" - informational detail
4. **No matching rule**: Prompt doesn't have rules for "Tạm đóng" or "Đóng lệnh"
5. **Will classify as NONE**: AI will likely miss this close command

### Expected Behavior:
```json
[{
  "isCommand": true,
  "command": "CLOSE_ALL",
  "confidence": 0.8,
  "reason": "detected 'Tạm đóng lệnh này' (temporarily close this order) keyword. Extracted side SELL from quotedMessage",
  "extraction": {
    "symbol": "XAUUSD",
    "side": "SELL",
    "isImmediate": true,
    "entry": null,
    "entryZone": [],
    "stopLoss": null,
    "takeProfits": [],
    "meta": {"adjustEntry": false, "reduceLotSize": false},
    "isLinkedWithPrevious": false,
    "validationError": ""
  }
}]
```

### Frequency: ~1 occurrence

---

## Case 12: "Cloze" Typo (instead of "Close")

### Input (Line 537):
```json
{"sentAt":"2025-11-26T20:58:49+11:00","message":"Cloze 59.5 hold 61.5","quotedMessage":"💥GOLD Sell 4159.5- 4161.5\n\n✅TP  4156.5\n✅TP  4139.5\n\n💢SL  4165","quotedFirstMessage":"","prevMessage":"@Gold +15 Pips running ✅🚀"}
```

### Why AI Might Fail:
1. **Typo "Cloze" instead of "Close"**: The prompt looks for "Close" but message has "Cloze"
2. **Pattern still matches**: "Cloze X hold Y" should match "Close X hold Y" pattern
3. **Instant model limitations**: MMLU 69% model might not handle typos well
4. **Might classify as NONE**: AI might not recognize this as CLOSE_BAD_POSITION
5. **Similar to "holx" case**: Another typo that tests model's tolerance

### Expected Behavior:
```json
[{
  "isCommand": true,
  "command": "CLOSE_BAD_POSITION",
  "confidence": 0.8,
  "reason": "detected 'Cloze' (typo for 'Close') and 'hold' keywords. Extracted side SELL from quotedMessage",
  "extraction": {
    "symbol": "XAUUSD",
    "side": "SELL",
    "isImmediate": true,
    "entry": null,
    "entryZone": [],
    "stopLoss": null,
    "takeProfits": [],
    "meta": {"adjustEntry": false, "reduceLotSize": false},
    "isLinkedWithPrevious": false,
    "validationError": ""
  }
}]
```

### Risk:
The instant model might not be smart enough to handle "Cloze" → "Close" typo.

### Frequency: ~1 occurrence

---

## Case 13: "Đóng lệnh này" (Close This Order) - Variation

### Input (Line 538):
```json
{"sentAt":"2025-11-26T21:01:53+11:00","message":"Đóng lệnh này -10pips","quotedMessage":"💥GOLD Sell 4159.5- 4161.5\n\n✅TP  4156.5\n✅TP  4139.5\n\n💢SL  4165","quotedFirstMessage":"","prevMessage":"Cloze 59.5 hold 61.5"}
```

### Why AI Might Fail:
1. **Another Vietnamese close variant**: "Đóng lệnh này" means "Close this order"
2. **Different from "Chốt lệnh này"**: Uses "Đóng" instead of "Chốt"
3. **Additional info**: "-10pips" indicates closing at a loss (informational)
4. **Not in prompt**: No rule for "Đóng lệnh này"
5. **Will classify as NONE**: AI will likely miss this command

### Expected Behavior:
```json
[{
  "isCommand": true,
  "command": "CLOSE_ALL",
  "confidence": 0.8,
  "reason": "detected 'Đóng lệnh này' (close this order) keyword. Extracted side SELL from quotedMessage",
  "extraction": {
    "symbol": "XAUUSD",
    "side": "SELL",
    "isImmediate": true,
    "entry": null,
    "entryZone": [],
    "stopLoss": null,
    "takeProfits": [],
    "meta": {"adjustEntry": false, "reduceLotSize": false},
    "isLinkedWithPrevious": false,
    "validationError": ""
  }
}]
```

### Similar Cases:
- Line 755: `"message":"Đóng 38.3"` - Abbreviated "Đóng" command
- Line 782: `"message":"Đóng 31 hold 29"` - Vietnamese version of "Close X hold Y"

### Frequency: ~3 occurrences

---

## Case 14: "Đóng X giữ Y" (Vietnamese "Close X hold Y")

### Input (Line 714):
```json
{"sentAt":"2025-12-01T10:30:22+11:00","message":"Đóng 23 giữ 21","quotedMessage":"💥GOLD Buy 4223- 4221\n\n✅TP  4226\n✅TP  4243\n\n💢SL  4218","quotedFirstMessage":"","prevMessage":"@Gold +15 Pips running ✅🚀"}
```

### Why AI Might Fail:
1. **Vietnamese keywords**: "Đóng" = "Close", "giữ" = "hold"
2. **Pattern matches English version**: "Close X hold Y" but in Vietnamese
3. **Not in prompt**: Prompt only has English "Close" and "hold"
4. **Language barrier**: AI might not recognize Vietnamese keywords
5. **Will classify as NONE**: Unless AI can infer from pattern

### Expected Behavior:
```json
[{
  "isCommand": true,
  "command": "CLOSE_BAD_POSITION",
  "confidence": 0.7,
  "reason": "detected 'Đóng' (close) and 'giữ' (hold) keywords. Extracted side BUY from quotedMessage",
  "extraction": {
    "symbol": "XAUUSD",
    "side": "BUY",
    "isImmediate": true,
    "entry": null,
    "entryZone": [],
    "stopLoss": null,
    "takeProfits": [],
    "meta": {"adjustEntry": false, "reduceLotSize": false},
    "isLinkedWithPrevious": false,
    "validationError": ""
  }
}]
```

### Similar Cases:
- Line 929: `"message":"Đóng 17 giữ 15"`

### Frequency: ~2 occurrences

---

## Case 15: "Chốt hòa lệnh này" (Close This Order at Breakeven)

### Input (Line 861):
```json
{"sentAt":"2025-12-02T12:18:45+11:00","message":"Chốt hòa lệnh này","quotedMessage":"💥GOLD Sell 4210.5- 4212.5\n\n✅TP  4207.5\n✅TP  4190.5\n\n💢SL  4216","quotedFirstMessage":"","prevMessage":"@Gold +15 Pips running ✅🚀"}
```

### Why AI Might Fail:
1. **"Chốt hòa" means "close at breakeven"**: Specific trading instruction
2. **Variation of "Chốt lệnh này"**: But with additional "hòa" (breakeven) keyword
3. **Not in prompt**: No rule for "Chốt hòa"
4. **Semantic complexity**: "hòa" adds meaning but AI might not understand
5. **Will classify as NONE**: AI will likely miss this

### Expected Behavior:
```json
[{
  "isCommand": true,
  "command": "CLOSE_ALL",
  "confidence": 0.8,
  "reason": "detected 'Chốt hòa lệnh này' (close this order at breakeven) keyword. Extracted side SELL from quotedMessage",
  "extraction": {
    "symbol": "XAUUSD",
    "side": "SELL",
    "isImmediate": true,
    "entry": null,
    "entryZone": [],
    "stopLoss": null,
    "takeProfits": [],
    "meta": {"adjustEntry": false, "reduceLotSize": false},
    "isLinkedWithPrevious": false,
    "validationError": ""
  }
}]
```

### Frequency: ~1 occurrence

---

## Case 16: "Dongs hòa 2 entry tại X" (Close 2 Entries at Breakeven)

### Input (Line 862):
```json
{"sentAt":"2025-12-02T12:19:15+11:00","message":"Dongs hòa 2 entry tại 11","quotedMessage":"","quotedFirstMessage":"","prevMessage":"Chốt hòa lệnh này"}
```

### Why AI Might Fail:
1. **Typo "Dongs" instead of "Đóng"**: Misspelling of Vietnamese "close"
2. **Complex instruction**: "close 2 entries at breakeven at price 11"
3. **No quotedMessage**: Missing context to extract side
4. **Mixed language**: Vietnamese + English ("entry", "tại")
5. **Not in prompt**: No rule for this pattern
6. **Will classify as NONE**: Too complex for instant model

### Expected Behavior:
```json
[{
  "isCommand": true,
  "command": "CLOSE_ALL",
  "confidence": 0.6,
  "reason": "detected 'Dongs hòa' (typo for close at breakeven) keyword. Cannot extract side due to missing quotedMessage",
  "extraction": {
    "symbol": "XAUUSD",
    "side": null,
    "isImmediate": true,
    "entry": null,
    "entryZone": [],
    "stopLoss": null,
    "takeProfits": [],
    "meta": {"adjustEntry": false, "reduceLotSize": false},
    "isLinkedWithPrevious": false,
    "validationError": "cannot determine side - missing context"
  }
}]
```

### Frequency: ~1 occurrence

---

## Case 17: "AE còn Sell đóng" (Close Remaining Sell Orders)

### Input (Line 985):
```json
{"sentAt":"2025-12-03T22:18:40+11:00","message":"AE còn Sell đóng","quotedMessage":"","quotedFirstMessage":"","prevMessage":"Gold Buy now"}
```

### Why AI Might Fail:
1. **Informal instruction**: "AE còn Sell đóng" means "Everyone who still has Sell orders, close them"
2. **Contains "Sell" keyword**: But it's not a SHORT command
3. **"đóng" at the end**: Vietnamese for "close"
4. **Might confuse with SHORT**: AI might see "Sell" and think it's a SHORT command
5. **Not in prompt**: No rule for this pattern

### Expected Behavior:
```json
[{
  "isCommand": true,
  "command": "CLOSE_ALL",
  "confidence": 0.8,
  "reason": "detected 'đóng' (close) keyword with 'Sell' indicating close SELL positions",
  "extraction": {
    "symbol": "XAUUSD",
    "side": "SELL",
    "isImmediate": true,
    "entry": null,
    "entryZone": [],
    "stopLoss": null,
    "takeProfits": [],
    "meta": {"adjustEntry": false, "reduceLotSize": false},
    "isLinkedWithPrevious": false,
    "validationError": ""
  }
}]
```

### Risk:
AI might incorrectly classify this as SHORT instead of CLOSE_ALL.

### Frequency: ~1 occurrence

---

## Case 18: "Đóng hòa lệnh này" (Close This Order at Breakeven) - Variation

### Input (Line 1206):
```json
{"sentAt":"2025-12-08T21:51:14+11:00","message":"Đóng hòa lệnh này","quotedMessage":"💥GOLD Buy 4206.6- 4204.6\n\n✅TP  4209.6\n✅TP  4226.6\n\n💢SL  4201","quotedFirstMessage":"","prevMessage":"@Gold Buy 04.6 +15 Pips running ✅🚀"}
```

### Why AI Might Fail:
1. **Vietnamese "Đóng hòa"**: Uses "Đóng" (close) instead of "Chốt" (close)
2. **Similar to Case 15**: But with different Vietnamese word for "close"
3. **Not in prompt**: No rule for "Đóng hòa lệnh này"
4. **Semantic complexity**: "hòa" means breakeven, adding extra meaning
5. **Will classify as NONE**: AI will likely miss this close command

### Expected Behavior:
```json
[{
  "isCommand": true,
  "command": "CLOSE_ALL",
  "confidence": 0.8,
  "reason": "detected 'Đóng hòa lệnh này' (close this order at breakeven) keyword. Extracted side BUY from quotedMessage",
  "extraction": {
    "symbol": "XAUUSD",
    "side": "BUY",
    "isImmediate": true,
    "entry": null,
    "entryZone": [],
    "stopLoss": null,
    "takeProfits": [],
    "meta": {"adjustEntry": false, "reduceLotSize": false},
    "isLinkedWithPrevious": false,
    "validationError": ""
  }
}]
```

### Frequency: ~1 occurrence

---

## Case 19: "Gd buy now" Typo (instead of "Gold buy now")

### Input (Line 1452):
```json
{"sentAt":"2025-12-11T19:01:19+11:00","message":"Gd buy now","quotedMessage":"","quotedFirstMessage":"","prevMessage":"GOLD - TP HIT 30 +Pips ✅✅"}
```

### Why AI Might Fail:
1. **Typo "Gd" instead of "Gold"**: Missing "ol" letters
2. **Pattern still matches**: "buy now" is present
3. **Instant model limitations**: MMLU 69% model might not handle abbreviations well
4. **Might classify as NONE**: AI might not recognize "Gd" as "Gold"
5. **Common abbreviation**: Users might use "Gd" as shorthand for "Gold"

### Expected Behavior:
```json
[{
  "isCommand": true,
  "command": "LONG",
  "confidence": 0.9,
  "reason": "detected 'Gd buy now' (abbreviation for Gold buy now) keyword. This is the first signal, detailed info will come in next message",
  "extraction": {
    "symbol": "XAUUSD",
    "side": "BUY",
    "isImmediate": true,
    "entry": null,
    "entryZone": [],
    "stopLoss": null,
    "takeProfits": [],
    "meta": {"adjustEntry": false, "reduceLotSize": false},
    "isLinkedWithPrevious": false,
    "validationError": ""
  }
}]
```

### Risk:
The instant model might not be smart enough to recognize "Gd" as "Gold" abbreviation.
  "reason": "detected 'Gold buy noww' (typo for now) keyword. This is the first signal, detailed info will come in next message",
  "extraction": {
    "symbol": "XAUUSD",
    "side": "BUY",
    "isImmediate": true,
    "entry": null,
    "entryZone": [],
    "stopLoss": null,
    "takeProfits": [],
    "meta": {"adjustEntry": false, "reduceLotSize": false},
    "isLinkedWithPrevious": false,
    "validationError": ""
  }
}]
```

### Frequency: ~1 occurrence

---

## Case 22: Lowercase "đóng X giữ Y" Pattern

### Input (Line 1847):
```json
{"sentAt":"2025-12-18T12:41:41+11:00","message":"đóng 26 giữ 28","quotedMessage":"💥GOLD Sell 4326• 4328\n\n✅TP  4323\n✅TP  4306\n\n💢SL  4331","quotedFirstMessage":"","prevMessage":"@Gold +15 Pips running ✅🚀"}
```

### Why AI Might Fail:
1. **Lowercase Vietnamese**: "đóng" and "giữ" are lowercase
2. **Pattern matches Case 14**: But with lowercase letters
3. **Case sensitivity**: AI might be case-sensitive for Vietnamese keywords
4. **Not in prompt**: Prompt doesn't specify case variations
5. **Will classify as NONE**: AI might miss this due to case difference

### Expected Behavior:
```json
[{
  "isCommand": true,
  "command": "CLOSE_BAD_POSITION",
  "confidence": 0.7,
  "reason": "detected 'đóng' (close) and 'giữ' (hold) keywords. Extracted side SELL from quotedMessage",
  "extraction": {
    "symbol": "XAUUSD",
    "side": "SELL",
    "isImmediate": true,
    "entry": null,
    "entryZone": [],
    "stopLoss": null,
    "takeProfits": [],
    "meta": {"adjustEntry": false, "reduceLotSize": false},
    "isLinkedWithPrevious": false,
    "validationError": ""
  }
}]
```

### Similar Cases:
- Line 1853: `"message":"đóng 35.3 giữ 33.3"`
- Line 1860: `"message":"Đóng 33.3 hold 35.3"` (mixed case)

### Frequency: ~3 occurrences

---

## Summary Statistics

| Case                     | Frequency | Estimated Failure Rate | Impact |
| ------------------------ | --------- | ---------------------- | ------ |
| Empty Messages           | ~35       | 30%                    | Medium |
| Standalone Prices        | ~20       | 40%                    | Medium |
| Multi-Command            | ~3        | 60%                    | High   |
| "Chốt lệnh này"          | ~2        | 70%                    | High   |
| "Lot small"              | ~2        | 50%                    | Medium |
| Wrong quotedMessage      | ~3        | 20%                    | Low    |
| "Rời SL"                 | ~1        | 0% (correct)           | None   |
| Typo "holx"              | ~1        | 40%                    | Medium |
| Duplicate Empty          | ~6        | 30%                    | Low    |
| "Tạm đóng lệnh này"      | ~1        | 70%                    | High   |
| Typo "Cloze"             | ~1        | 40%                    | Medium |
| "Đóng lệnh này"          | ~7        | 70%                    | High   |
| "Đóng X giữ Y"           | ~25       | 60%                    | High   |
| "Chốt hòa lệnh này"      | ~1        | 70%                    | High   |
| "Dongs hòa 2 entry"      | ~1        | 80%                    | High   |
| "AE còn Sell đóng"       | ~1        | 60%                    | High   |
| "Đóng hòa lệnh này"      | ~2        | 70%                    | High   |
| Typo "Gd buy now"        | ~1        | 50%                    | Medium |
| Bullet Point Separator   | ~15       | 30%                    | Medium |
| Typo "Gold buy noww"     | ~1        | 50%                    | Medium |
| Lowercase "đóng X giữ Y" | ~3        | 60%                    | High   |

**Total Problematic Cases**: ~133 out of 1920 (6.9%)  
**Estimated Overall Success Rate**: 85-90%

---

## Key Findings

### Most Critical Issues (High Impact & High Frequency):
1. **Vietnamese "Đóng X giữ Y" pattern** (~25 occurrences)
   - Most frequent problematic pattern
   - Includes variations: "Đóng X giữ Y", "đóng X giữ Y", "Đóng X hold Y"
   - **Priority 1**: Must add to prompt

2. **Empty messages** (~35 occurrences)
   - Second most frequent issue
   - **Priority 1**: Must add explicit handling

3. **Standalone price messages** (~20 occurrences)
   - Third most frequent
   - **Priority 2**: Should add handling

4. **Bullet point separator "•"** (~15 occurrences)
   - Fourth most frequent
   - **Priority 2**: Should add to entry zone extraction rules

5. **Vietnamese close variations** (~13 occurrences total)
   - "Đóng lệnh này", "Đóng hòa lệnh này", "Tạm đóng lệnh này"
   - **Priority 1**: Must add all variations

### Pattern Distribution:
- **Standard patterns (working well)**: ~1787 messages (93.1%)
- **Problematic patterns**: ~133 messages (6.9%)
- **Most common problematic category**: Vietnamese close commands (38% of issues)
- **Second most common**: Empty/standalone messages (29% of issues)

### Recommended Actions:
1. **Immediate (Priority 1)**:
   - Add Vietnamese "Đóng/đóng X giữ/hold Y" pattern
   - Add all Vietnamese close command variations
   - Add empty message handling
   - Add multi-command message support

2. **Soon (Priority 2)**:
   - Add bullet point "•" separator support
   - Add standalone price message handling
   - Add typo tolerance for common patterns

3. **Nice to Have (Priority 3)**:
   - Add "Lot small" detection from prevMessage
   - Document wrong quotedMessage warning
   - Add case-insensitive Vietnamese keyword matching

---

## Recommended Fixes

### Priority 1 (Must Fix):
1. Add explicit empty message handling

### Priority 2 (Should Fix):
4. Add standalone price message handling (classify as NONE)
5. Add "Lot small" detection from prevMessage
6. Add typo tolerance for "hold" → "holx"

### Priority 3 (Nice to Have):
7. Add warning about wrong quotedMessage in prompt
8. Document MOVE_SL as not supported
