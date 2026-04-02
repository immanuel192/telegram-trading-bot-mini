---
trigger: always_on
description: Specification-driven development guidelines
---

# Spec Rules

## 2. Spec-Driven Development Rules

* All features *must* have a corresponding spec inside `/specs`.
* No implementation may begin until the spec is written, reviewed, and approved.
* Specs define the truth for:
  * business rules
  * flows
  * acceptance criteria
  * API contracts
  * domain concepts
* Specs must be updated anytime behavior, rules, or APIs change.
* Tests must be generated from acceptance criteria found in the spec.

## 4.3 Spec Integration

* For new features, ask for the spec before coding.
* Use acceptance criteria as the source for test cases.
* If the spec is incomplete or ambiguous, ask before proceeding.
