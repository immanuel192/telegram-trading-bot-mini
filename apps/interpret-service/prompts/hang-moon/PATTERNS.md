# Hang-Moon Trading Signal Patterns

## Overview
- **Symbol**: Always XAUUSD (Gold)
- **Order Type**: Always market orders (`isImmediate: true`)
- **Entry**: Always `null` (market execution)

## Message Structure Patterns

### 1. Entry Trade Pattern

#### Pattern 1.1: Initial Market Order Signal
**Format**: "Gold buy now" or "Gold sell now"

**Example**:
```
Message: "Gold buy now"
```

**Output**:
```json
{
  "command": "LONG",
  "entry": null,
  "stopLoss": null,
  "isLinkedWithPrevious": false
}
```

**Rules**:
- This is always the FIRST trade in a sequence
- `entry` is always `null` (market order)
- `stopLoss` is always `null` (will come in next message)
- `isLinkedWithPrevious` is always `false`
- Do NOT use `quotedMessage`, `quotedFirstMessage`, or `prevMessage`

#### Pattern 1.2: Detailed Trade Information (Linked)
**Format**: 
```
💥GOLD Buy {entry1}- {entry2}

✅TP  {tp1}
✅TP  {tp2}

💢SL  {sl}
```

**Example**:
```
Message: "💥GOLD Buy 4091- 4089\n\n✅TP  4094\n✅TP  4111\n\n💢SL  4086"
prevMessage: "Gold buy now"
```

**Output**:
```json
{
  "command": "LONG",
  "entry": null,
  "stopLoss": {"price": 4086},
  "takeProfits": [{"price": 4094}, {"price": 4111}],
  "isLinkedWithPrevious": true
}
```

**Rules**:
- This is the SECOND trade, linked to the previous "Gold buy now" message
- `entry` is still `null` (market order, ignore the range shown)
- Extract `stopLoss` from the SL line
- Extract `takeProfits` from all TP lines
- `isLinkedWithPrevious` is `true` (links to prevMessage)
- The entry range (e.g., "4091- 4089") is informational only

#### Pattern 1.3: Multiple Orders in Sequence
Sometimes they enter 2 orders with different prices. They use `quotedMessage` to reference which order.

**Example**:
```
Line 1: "Gold buy now"
Line 2: "💥GOLD Buy 4091- 4089\n\n✅TP  4094\n✅TP  4111\n\n💢SL  4086"
```

**Output**: 2 separate commands
1. First command (from "Gold buy now")
2. Second command (from detailed message, linked to first)

### 2. Close Order Patterns

#### Pattern 2.1: Close Specific Entry
**Format**: "Close {price1} hold {price2}"

**Example**:
```
Message: "Close 11.6 holx 09.6"
quotedMessage: "💥GOLD Buy 4111.6 - 4109.6\n\n✅TP  4114.6\n✅TP  4131.6\n\n💢SL  4106"
```

**Output**:
```json
{
  "command": "CLOSE_BAD_POSITION",
  "side": "BUY"
}
```

**Rules**:
- "Close X hold Y" means close position at price X, keep position at price Y
- Extract side from `quotedMessage`
- This is a partial close

#### Pattern 2.2: Close All (SL Hit)
**Format**: "SL hit" or "Sl Hit"

**Example**:
```
Message: "SL hit"
quotedMessage: "💥GOLD Sell 4039- 4041\n\n✅TP  4036\n✅TP  4019\n\n💢SL  4044"
```

**Output**:
```json
{
  "command": "CLOSE_ALL",
  "side": "SELL"
}
```

**Rules**:
- "SL hit" indicates stop loss was triggered
- Extract side from `quotedMessage`
- Close all positions for that side

#### Pattern 2.3: Manual Close All
**Format**: "Close gold buy" or "Close gold sell"

**Example**:
```
Message: "Close gold sell"
```

**Output**:
```json
{
  "command": "CLOSE_ALL",
  "side": "SELL"
}
```

### 3. Informational Messages (NONE)

#### Pattern 3.1: Progress Updates
**Format**: "@Gold +{pips} Pips running ✅🚀"

**Example**:
```
Message: "@Gold +150 Pips running ✅🚀"
```

**Output**:
```json
{
  "command": "NONE",
  "isCommand": false
}
```

#### Pattern 3.2: TP Hit Notifications
**Format**: "GOLD - TP HIT {pips} +Pips ✅✅"

**Example**:
```
Message: "GOLD - TP HIT 30 +Pips ✅✅"
```

**Output**:
```json
{
  "command": "NONE",
  "isCommand": false
}
```

#### Pattern 3.3: Ready Signal
**Format**: "ready signal"

**Example**:
```
Message: "ready signal"
```

**Output**:
```json
{
  "command": "NONE",
  "isCommand": false
}
```

#### Pattern 3.4: General Chat
**Examples**:
- "Lên 69 xuống 66 2 vòng rồi. Ae vào được ko"
- "Sập nào. Nhây mãi 😊"

**Output**:
```json
{
  "command": "NONE",
  "isCommand": false
}
```

## Key Observations

### Entry Price Handling
- The entry range shown (e.g., "4091- 4089") is **informational only**
- All orders are **market orders** with `entry: null`
- The range represents expected fill prices, not limit orders

### Linked Orders
- First message: "Gold buy now" → `isLinkedWithPrevious: false`
- Second message: Detailed info → `isLinkedWithPrevious: true`
- Use `prevMessage` to link the second message to the first

### Stop Loss & Take Profit
- SL and TP are only in the detailed message (second message)
- First message has `stopLoss: null`, `takeProfits: []`
- Second message has full SL and TP data

### Close Commands
- "Close X hold Y" → `CLOSE_BAD_POSITION`
- "SL hit" → `CLOSE_ALL`
- "Close gold buy/sell" → `CLOSE_ALL`

## Edge Cases

### Abbreviated Prices
Sometimes they use abbreviated prices like "11.6" instead of "4111.6":
- "Close 11.6 hold 09.6" refers to 4111.6 and 4109.6
- Infer from context (quotedMessage)

### Multiple Notifications
Progress updates may reference specific entry prices:
- "@Gold buy 09.6 +105 Pips running ✅🚀"
- This is informational (NONE), not a command

### Typos
- "holx" instead of "hold"
- "Sl" vs "SL" (case variations)
- Handle case-insensitively
