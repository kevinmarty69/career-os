import { ZodError } from 'zod';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import {
  isSameOrigin,
  readBoundedJson,
  PayloadTooLargeError,
} from '@/lib/server/http';
import {
  interviewModelSettings,
  InterviewQuestionError,
  selectInterviewQuestion,
} from '@/lib/server/interview-question';
export async function GET(request: Request) {
  try {
    if (!(await authenticatedPublicationSession(request)))
      return new Response('Unauthorized', { status: 401 });
    let available = false,
      maxCostMicros = 0;
    try {
      const settings = interviewModelSettings();
      available = true;
      maxCostMicros = settings.maxCostMicros;
    } catch {
      /* Manual questionnaire remains available. */
    }
    return Response.json(
      { available, maxCostMicros },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch {
    return new Response('Unavailable', { status: 503 });
  }
}
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  try {
    const session = await authenticatedPublicationSession(request);
    if (!session) return new Response('Unauthorized', { status: 401 });
    return Response.json(
      await selectInterviewQuestion(
        session,
        await readBoundedJson(request, 2048),
      ),
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    return new Response(
      'Question unavailable. Continue with the manual questionnaire.',
      {
        status:
          error instanceof PayloadTooLargeError
            ? 413
            : error instanceof ZodError
              ? 400
              : error instanceof InterviewQuestionError
                ? error.status
                : 503,
      },
    );
  }
}
