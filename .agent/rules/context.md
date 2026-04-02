---
trigger: always_on
description: Context engineering and memory bank usage
---

# Context Rules

## 4. Context Engineering Rules

### 4.1 Context Usage

* Only use information from files explicitly provided.
* Do not infer missing architecture or business logic.
* Always load the minimum necessary context.
* For code generation, load only:
  * the relevant spec 
  * the specific app folder
  * directly affected libs

### 4.2 File & Folder Structure Compliance

* Match the workspace structure exactly as scaffolded.
* Never introduce new abstractions unless defined in the spec.
* Use TypeScript strict mode.
* Follow Nx’s dependency & folder rules.

## 6. Memory-Bank Rules

* Memory-bank stores only reusable *guidelines*, never feature specs.
* Never store implementation details or status markers.
* Avoid writing notebooks or excessive detail.
* Memory-bank content must:
  * be concise
  * contain rules/patterns
  * assist decision-making
  * provide context for future work
