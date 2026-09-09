import { z } from 'zod';

export const interviewQuestionIds = [
  'change',
  'context',
  'before',
  'after',
  'source',
  'ownership',
  'scope',
  'constraints',
  'measurement',
  'learning',
] as const;
export const interviewQuestionIdSchema = z.enum(interviewQuestionIds);
export const defaultInterviewQuestions = [
  'change',
  'context',
  'before',
  'after',
  'source',
] as const;
export const interviewQuestions = {
  change: ['Qu’avez-vous changé exactement ?', 'What exactly did you change?'],
  context: [
    'Sur quelle période et dans quel contexte ?',
    'Over what period and in what context?',
  ],
  before: [
    'Quel était le résultat avant votre intervention ?',
    'What was the outcome before your work?',
  ],
  after: [
    'Qu’avez-vous mesuré après votre intervention ?',
    'What did you measure after your work?',
  ],
  source: [
    'Quel document ou quelle personne pourrait le confirmer ?',
    'Which document or person could confirm it?',
  ],
  ownership: [
    'Quelle partie avez-vous réalisée personnellement et quelle partie revient à l’équipe ?',
    'Which part did you personally deliver, and which part belongs to the team?',
  ],
  scope: [
    'Sur quel périmètre ce résultat est-il valable ?',
    'What scope does this result apply to?',
  ],
  constraints: [
    'Quelles contraintes ont influencé votre décision ?',
    'Which constraints shaped your decision?',
  ],
  measurement: [
    'Comment le résultat a-t-il été mesuré, et quelles sont les limites de cette mesure ?',
    'How was the result measured, and what are the limits of that measurement?',
  ],
  learning: [
    'Qu’avez-vous appris ou changé après cette expérience ?',
    'What did you learn or change after this experience?',
  ],
} satisfies Record<(typeof interviewQuestionIds)[number], [string, string]>;

export const interviewSelectionSchema = z
  .object({ questionId: interviewQuestionIdSchema })
  .strict();
export function validateInterviewSelection(
  value: unknown,
  previous: readonly string[],
) {
  const selected = interviewSelectionSchema.parse(value);
  if (previous.includes(selected.questionId))
    throw new Error('Repeated question');
  return selected.questionId;
}

export function adaptInterviewQuestions(
  current: readonly (typeof interviewQuestionIds)[number][],
  step: number,
  selection: unknown,
) {
  if (!Number.isInteger(step) || step < 1 || step > 4)
    throw new Error('Invalid step');
  const previous = current.slice(0, step);
  const chosen = validateInterviewSelection(selection, previous);
  return [
    ...new Set([
      ...previous,
      chosen,
      ...current.slice(step + 1),
      ...interviewQuestionIds,
    ]),
  ].slice(0, 5);
}
