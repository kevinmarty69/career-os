import {
  buildProfileImportResult,
  MAX_PROFILE_FILE_BYTES,
  ProfileImportError,
  profileImportResultSchema,
  validateProfileText,
  type ProfileImportErrorCode,
  type ProfileImportResult,
} from './profile-import-core';

export {
  MAX_PROFILE_CANDIDATES,
  MAX_PROFILE_FILE_BYTES,
  MAX_PROFILE_TEXT_CHARS,
  ProfileImportError,
  profileImportCandidateSchema,
  profileImportResultSchema,
  profileImportSourceSchema,
} from './profile-import-core';
export type {
  ProfileImportCandidate,
  ProfileImportErrorCode,
  ProfileImportFileType,
  ProfileImportResult,
  ProfileImportSource,
  ProfileImportSuggestion,
} from './profile-import-core';

const IMPORT_TIMEOUT_MS = 20_000;

type WorkerResponse =
  | { ok: true; result: ProfileImportResult }
  | {
      ok: false;
      error: { code: ProfileImportErrorCode; message: string };
    };

export async function importProfileFile(
  file: File,
  signal?: AbortSignal,
): Promise<ProfileImportResult> {
  if (signal?.aborted) throw abortError();
  if (file.size > MAX_PROFILE_FILE_BYTES)
    throw new ProfileImportError(
      'file_too_large',
      'The profile file must be 4 MiB or smaller.',
    );

  const worker = new Worker(
    new URL('./profile-import.worker.ts', import.meta.url),
    {
      type: 'module',
    },
  );
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  try {
    return await new Promise<ProfileImportResult>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        if (abortListener) signal?.removeEventListener('abort', abortListener);
        worker.terminate();
        callback();
      };
      abortListener = () => finish(() => reject(abortError()));
      signal?.addEventListener('abort', abortListener, { once: true });
      timeout = setTimeout(
        () =>
          finish(() =>
            reject(
              new ProfileImportError(
                'timeout',
                'The profile import exceeded 20 seconds.',
              ),
            ),
          ),
        IMPORT_TIMEOUT_MS,
      );
      worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
        if (
          !data ||
          typeof data !== 'object' ||
          !('ok' in data) ||
          typeof data.ok !== 'boolean'
        )
          return;
        finish(() => {
          if (data.ok) {
            const parsed = profileImportResultSchema.safeParse(data.result);
            if (!parsed.success)
              reject(
                new ProfileImportError(
                  'worker_failed',
                  'The profile importer returned an invalid result.',
                ),
              );
            else resolve(parsed.data);
          } else if (
            data.error &&
            typeof data.error.code === 'string' &&
            typeof data.error.message === 'string'
          )
            reject(new ProfileImportError(data.error.code, data.error.message));
          else
            reject(
              new ProfileImportError(
                'worker_failed',
                'The profile importer returned an invalid error.',
              ),
            );
        });
      };
      worker.onerror = () =>
        finish(() =>
          reject(
            new ProfileImportError(
              'worker_failed',
              'The profile file could not be imported.',
            ),
          ),
        );
      worker.onmessageerror = () =>
        finish(() =>
          reject(
            new ProfileImportError(
              'worker_failed',
              'The profile file could not be imported.',
            ),
          ),
        );
      worker.postMessage({ file });
    });
  } catch (error) {
    worker.terminate();
    throw error;
  }
}

export async function importProfileText(
  text: string,
  displayName = 'Pasted profile.txt',
): Promise<ProfileImportResult> {
  const normalized = validateProfileText(text);
  if (normalized.includes('\0'))
    throw new ProfileImportError(
      'binary_text',
      'The pasted profile contains binary data.',
    );
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return buildProfileImportResult({
    displayName,
    type: 'txt',
    sha256,
    sections: [{ text: normalized, locator: 'text' }],
  });
}

function abortError(): ProfileImportError {
  return new ProfileImportError('aborted', 'The profile import was cancelled.');
}
