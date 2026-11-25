---
inclusion: fileMatch
fileMatchPattern: ["apps/exhume/**"]
---
# EXT archetype (Exhume)

- Pattern: fixed pipeline on the small tier. Every model step that reads a document runs inside `quarantine()` with no tools.
- Validation is code, not prompt (HAR-06): amounts in kobo as integers; line items sum to the subtotal; subtotal plus VAT equals the total within ₦1; no future dates; non-NGN currency is flagged.
- Grader: field comparison against `evals/tasks/core`, exact for vendor, date and category, with ₦1 tolerance on amounts.
- Metrics: field accuracy against the human baseline, throughput, cost per successful document.
- The release bar comes from the resolved policy, never from this file.

<!-- Phase 4 restores the product.yaml link here once apps/exhume/product.yaml exists (D-04). -->
