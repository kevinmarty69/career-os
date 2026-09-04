# Milestone: local Career Memory import is now a real product flow

The approved import direction now runs as a functional Next.js flow at
`/memory/import`. It uses the existing browser-side importer and the existing
Career Memory save port instead of displaying a simulated parsing screen.

## What is represented

- PDF, DOCX and TXT import through a local Web Worker;
- guided pasted text for a CV, LinkedIn profile or career notes;
- honest indeterminate progress without invented percentages or ETAs;
- editable claims, types, statuses, sensitivity and allowed uses;
- mandatory selection and human confirmation before the save request;
- a session-scoped review draft that survives an accidental reload;
- duplicate merging through the shared Career Memory domain helper.

## Visual proof

- `cv-import-first-screen-desktop.png`: source choice at 1440 × 900;
- `cv-import-first-screen-mobile.png`: real extracted-claim review on iPhone 13.

## Brand assets used

- `public/brand/symbol/careeros-symbol-ink.svg`: application symbol;
- `public/brand/favicon/favicon.svg`: browser favicon;
- `public/brand/favicon/apple-touch-icon.svg`: Apple touch icon.

The assets remain unchanged from the supplied Career OS brand pack.

## Design boundary

The page follows the approved Career OS shell and tokens. The file itself never
leaves the browser. Only the structured selection is sent to the existing
profile endpoint, and only after the explicit validation action.
