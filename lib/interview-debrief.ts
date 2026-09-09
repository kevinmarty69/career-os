import { z } from 'zod';

export const interviewDebriefSchema = z
  .object({
    version: z.literal(1),
    feeling: z.number().int().min(1).max(5),
    nextStep: z.string().max(100),
    questions: z
      .array(
        z
          .object({
            question: z.string().trim().min(1).max(100),
            answer: z.string().max(200),
            coverage: z.enum(['covered', 'gap', 'acknowledged']),
          })
          .strict(),
      )
      .min(1)
      .max(3),
    notes: z.string().max(300),
  })
  .strict();
export type InterviewDebrief = z.infer<typeof interviewDebriefSchema>;
export function serializeDebrief(input: InterviewDebrief) {
  const note = JSON.stringify(interviewDebriefSchema.parse(input));
  if (note.length > 2000) throw new Error('Debrief exceeds timeline limit.');
  return note;
}
export function readDebrief(note?: string) {
  try {
    return interviewDebriefSchema.safeParse(JSON.parse(note ?? '')).data;
  } catch {
    return undefined;
  }
}
