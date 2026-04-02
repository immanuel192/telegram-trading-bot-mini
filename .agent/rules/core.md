---
trigger: model_decision
description: Core principles, collaboration, and safety standards
---

# Core Rules

## 1. Core Principles (Non-Negotiable)

* Always stick strictly to facts and existing code or specs.
* Never make assumptions. If anything is unclear, ask.
* Verify context by inspecting actual files before giving answers.
* Perform framing/planning with the user and wait for approval before coding.
* Always clarify uncertainties before proposing architecture or implementation.
* Maintain production-quality standards: secure, type-safe, maintainable, observable.

## 5. Way of Working (Collaboration Rules) 

### 5.1 Planning

* Always conduct planning before coding.
* Planning must reference:
  * the relevant spec
  * affected modules
  * architectural constraints
* Update specs and related files during planning.

### 5.2 Evidence-Based Responses

* Inspect files before suggesting changes.
* Cross-check memory-bank info with real code.
* Admit uncertainty when applicable.
* Ask for missing context explicitly.

### 5.3 Production Expectations

* Code must be:
  * readable and consistent
  * testable
  * observable (logging/metrics)
  * validated and safe
  * strict typescript coding standard. Avoid using any
* Always provide run/verify instructions when delivering new code.

## 9. Safety & Quality

* Enforce validation, authorization, and error handling by default.
* Index database fields when required.
* Make observability first-class: logs, metrics, error tracking.
* Provide clear development and production instructions for all outputs.

## 13. Rules Are Not a Substitute for Clean Code

* Prefer cleaning and restructuring the codebase rather than adding more rules.
* If rules become too lengthy or rigid, this signals that code clarity must be improved.
* Enforce simplicity: better code reduces cognitive load for both humans and AI.

## 14. File Editing & Documentation Rules

* AI must **not modify or write into any file** unless the user explicitly instructs it.
* Clarification questions must be answered **in chat only**, never via file edits.
* When updating a markdown file:
  * Read and understand the full file context first.
  * Blend updates into the correct section, preserving existing structure and tone.
  * Do not dump raw answers or create unnecessary new sections.
  * Maintain formatting, headings, spacing, and style.
  * Modify only the minimal necessary lines (minimal-diff rule).
  * If uncertain where the update belongs, ask the user before editing.
* Avoid blind appendix: never append content without structural awareness.
* Preserve file integrity: do not rewrite or restructure files unless explicitly instructed.
* Prefer cleaning and restructuring the codebase rather than adding more rules.
* If rules become too lengthy or rigid, this signals that code clarity must be improved.
* Enforce simplicity: better code reduces cognitive load for both humans and AI.
