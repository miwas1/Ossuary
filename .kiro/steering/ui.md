---
inclusion: fileMatch
fileMatchPattern: ["**/*.tsx"]
---
# UI

- Use the skeleton's UI kit first (`@ossuary/skeleton` ui exports): AI badge, approval card, action preview with undo, diff view, citations, progress, one-click feedback, stop button (UX-01). Build a new component only when the kit has none, and then add it to the kit.
- Style through costume tokens (`crypt` for Exhume, `seance` for Séance), never hard-coded colours. The spooky look lives in one place.
- Show results as reviewable artifacts, diffs or final-state summaries, never a bare "done" (UX-02).
- Mark AI output and say when the user is dealing with AI (UX-03).
- Always give a way out: undo for reversible actions, stop for running work (UX-05).
- Stream output and show progress for anything longer than a few seconds (UX-07).
- Capture feedback in one action on every surface (UX-09).

## Accessibility

- WCAG AA contrast for text and controls in every costume.
- Every action reachable by keyboard, with a visible focus ring and a logical tab order.
- Respect `prefers-reduced-motion`: no pulsing, sliding or parallax when it's set.
- Captions large and readable; label every control and icon button.
