# Hang-Moon XAUUSD Exit Analysis

This document outlines all identified scenarios where a trade should be closed (exited) based on the system prompt, historical signal patterns, and sample data analysis for the Hang Moon trading channel.

## 1. Summary of Exit Strategy
In this channel, all trades are **Market Orders** (`entry: null`), and the channel frequently utilizes **multiple entries (DCA)**. Exits are categorized into manual commands, DCA management, and technical triggers.

---

## 2. Identified Close Scenarios

### 2.1 Manual Full Exit (Signal-Level)
Instructions to close all positions associated with a specific signal immediately.
- **Vietnamese Keywords:**
    - `Chốt lệnh này`: Close this order.
    - `Đóng lệnh này`: Close this order.
    - `Tạm đóng lệnh này`: Temporarily close (often used during high volatility).
    - `Đóng hòa lệnh này`: Close this order at breakeven.
- **English Keywords:**
    - `Close gold buy`
    - `Close gold sell`
- **Context:** Often used when the market reaches a target or the signal provider loses confidence in the setup.

### 2.2 Side-Specific Exit (Global Side Close)
Instructions to clear all active orders for a specific direction (Buy or Sell), potentially spanning multiple signals.
- **Keywords:**
    - `AE còn Buy đóng`: Everyone holding Buy, close now.
    - `AE còn Sell đóng`: Everyone holding Sell, close now.
- **Use Case:** Clearing the books before major news (e.g., CPI) or upon a trend reversal.

### 2.3 Partial DCA Exit (Selective Entry) — "Scalp & Run"
Management of multiple positions entered at different prices (Entry 1 and Entry 2).
- **Pattern:** `Close {price1} hold {price2}` (or common typos like `Cloze` / `holx`).
- **Mechanism:** Identify the position nearest to `price1` and close it, while maintaining the position at `price2`.
- **Purpose:** Lock in small profits (Scalp) on the "worse" entry while keeping the "better" entry for a larger move.

### 2.4 Breakeven / Neutral Exit
Exiting the market without profit or loss when a setup "stalls."
- **Keywords:** `Đóng hòa`, `Chốt hòa`, `Dongs hòa`.
- **Example from Data:** `Dongs hòa 2 entry tại 11` (Close both entries at the level 4xxx.11).

### 2.5 Verified Stop Loss (Forced Exit)
Manual confirmation that a technical stop loss has been reached.
- **Pattern:** `SL hit`, `Sl Hit`, `sl hit`.
- **Note:** Acts as a manual override/confirmation to ensure all positions are terminated.

### 2.6 Dynamic SL Updates (Trailing)
Modification of the exit condition for an active trade.
- **Move to Entry:** `Rời SL về entry`, `Move SL entry`. (Exit price = Entry price).
- **Hard Trailing:** `Rời SL 33` or `Move SL 4233`.

### 2.7 Close & Reverse (The Flip)
A sudden instruction to exit all orders of one side and enter the opposite.
- **Logic:** If a `SHORT` signal arrives while `LONG` positions are active (or vice versa), the system should **close all active positions of the opposite side** immediately.
- **Reasoning:** The provider switches trend bias and does not allow hedging.

---

## 3. Execution Logic: TP1 vs. TP2 Strategy
Analysis of the provider's behavior reveals a consistent 3-stage exit pattern:

1.  **The Scalp (TP1):** Price hits **+30 pips**. Provider sends `Close X hold Y` (or system reacts to `TP HIT 30` alert).
    - **Action:** Close the "Worse" entry (the one entered at the higher price for Buy).
2.  **The Safety (Breakeven):** Immediately after TP1, the provider instructs `Move SL Entry` for the remaining order.
    - **Action:** Update the remaining order's SL to ensure zero-risk.
3.  **The Swing (TP2):** The "Better" entry is held until **+200 pips** or until a contrary signal arrives.

---

## 4. Platform Verification (Oanda Examples)
Based on real transaction logs in `sample-list-trade.md`:

- **Manual Exit Identification:** 
    - Transaction ID `765`: Market order triggered as a manual close of trade `732`.
    - Transaction ID `737`: Market order used to manually close trade `734` (Part of Case 2.1).
- **Technical TP Hit:** 
    - Transaction ID `785`: Order Fill triggered by a `TAKE_PROFIT_ORDER` (ID `770`), automatically closing trade `762`.
    - This confirms that once TP/SL are set on the exchange, they act as the "Default" exit if a manual signal doesn't arrive first.

---

## 5. Technical Constants
- **Symbol:** Always `XAUUSD`.
- **Execution:** Always `Market`.
- **Reference:** Most manual exit commands reference a `quotedMessage` to identify which specific signal group is being closed.
