# UI direction

Source of truth: the approved Claude Design artifact, "Career OS - Charte et concepts". The five product templates below define the information architecture and visual hierarchy; implementation details may adapt responsively without changing their meaning.

Career OS is a work application, not an AI dashboard. The interface must make the candidate's material and decisions easier to understand before it exposes automation.

## Product shell

- Warm white or very light grey canvas, white working surfaces, near-black text.
- Compact icon rail plus contextual navigation, not a wall of equal cards.
- Main content owns most of the width; an inspector appears only when evidence, changes or run details are requested.
- One vivid product color for selection and primary actions. Status colors remain semantic.
- Tight radii, quiet borders, restrained shadows, no decorative glass or ambient gradients.

## Screen mapping

- A1 Home: decisions first, then pipeline, interviews and Career Memory health.
- A2 Career Memory: sources on the left, statements in the centre, proof level always visible.
- A3 Applications: list, board or calendar; every application exposes its next action.
- A4 Application dossier: requirements versus evidence, strategy, deliverables and pre-send checklist.
- A5 Agent run and human review: run timeline on the left, human decisions on the right; steps, inputs, outputs and decisions are visible, never chain-of-thought.
- Recipient page: company-specific document with none of the authoring shell.

## Rejected patterns

- Generic AI chat as the primary product navigation.
- Gradients, glassmorphism and glow as a substitute for hierarchy.
- Identical cards for unrelated information.
- Oversized headings, weak grey body text and unexplained technical telemetry.
- A permanent node graph when the user only needs to read or approve a document.
