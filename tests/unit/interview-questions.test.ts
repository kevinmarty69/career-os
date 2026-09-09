import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adaptInterviewQuestions,
  defaultInterviewQuestions,
  validateInterviewSelection,
} from '../../lib/interview-questions';
import { interviewDraftSchema } from '../../lib/guided-interview';

test('adaptive questions cannot invent prompts, suggest numbers or change previous questions', () => {
  assert.throws(() =>
    validateInterviewSelection({ questionId: 'Suggest a 50% improvement' }, []),
  );
  assert.throws(() =>
    validateInterviewSelection(
      { questionId: 'ownership', suggestedAnswer: '42%' },
      [],
    ),
  );
  assert.throws(() =>
    validateInterviewSelection({ questionId: 'change' }, ['change']),
  );
  const questionIds = adaptInterviewQuestions(defaultInterviewQuestions, 1, {
    questionId: 'source',
  });
  assert.equal(questionIds[0], 'change');
  assert.equal(questionIds[1], 'source');
  assert.equal(new Set(questionIds).size, 5);
  assert.doesNotThrow(() =>
    interviewDraftSchema.parse({
      version: 1,
      step: 1,
      answers: ['', '', '', '', ''],
      statement: '',
      questionIds,
    }),
  );
});
