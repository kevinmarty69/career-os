import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readDebrief,
  serializeDebrief,
  type InterviewDebrief,
} from '../../lib/interview-debrief';

test('a bounded debrief round-trips through the existing private timeline, without accepting a verification verdict', () => {
  const input: InterviewDebrief = {
    version: 1,
    feeling: 3,
    nextStep: 'Technical discussion',
    notes: 'Ask about on-call.',
    questions: [
      {
        question: 'How did you measure build time?',
        answer: 'Using p50.',
        coverage: 'covered',
      },
    ],
  };
  assert.deepEqual(readDebrief(serializeDebrief(input)), input);
  assert.equal(readDebrief('An ordinary timeline note'), undefined);
  assert.throws(() => serializeDebrief({ ...input, feeling: 6 }));
  assert.equal(
    readDebrief(JSON.stringify({ ...input, verified: true })),
    undefined,
  );
});
