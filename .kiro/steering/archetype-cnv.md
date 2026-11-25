---
inclusion: fileMatch
fileMatchPattern: ["apps/seance/**"]
---
# CNV archetype (Séance)

- Pattern: `realtimeSplit` (HAR-09). `respond` answers inside the voice turn on the small tier and streams. `plan` runs in the background after each turn on the mid tier and writes the next move to task state. The candidate never waits on `plan`.
- `evaluate` scores the finished session on a different model from the interviewer (HAR-02).
- Latency budget: p95 from the end of candidate speech to first audio, with the target taken from the Phase 0 spike and recorded in `evals/thresholds.yaml` as a `{ max }` entry.
- Disclosure: the interviewer's first spoken line says it is an AI (UX-03, UX-08).
- Interruption: when the candidate speaks over the interviewer, it stops and listens (UX-08).
- Never ask about age, religion, ethnicity, marital or pregnancy status, or disability.
- Practice only: scores never go to an employer. Sharing them would make the code R3.
- Every model call, including the voice turn, goes through the gateway's OpenAI-compatible handler.

<!-- Phase 5 restores the product.yaml link here once apps/seance/product.yaml exists (D-04). -->
