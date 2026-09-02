import {
  buildProfileImportResult,
  containsPdfEncryptionMarker,
  decodeUtf8Text,
  detectProfileFileType,
  guardDocxArchive,
  ProfileImportError,
  type ProfileImportErrorCode,
  type ProfileImportResult,
  validateProfileText,
} from './profile-import-core';

type WorkerRequest = {
  file: File;
};

type WorkerResponse =
  | { ok: true; result: ProfileImportResult }
  | {
      ok: false;
      error: { code: ProfileImportErrorCode; message: string };
    };

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
};

workerScope.onmessage = async ({ data }) => {
  try {
    if (!data || !(data.file instanceof File))
      throw new ProfileImportError('worker_failed', 'Invalid import request.');

    const bytes = new Uint8Array(await data.file.arrayBuffer());
    const type = detectProfileFileType(
      {
        displayName: data.file.name,
        mimeType: data.file.type,
        size: bytes.byteLength,
      },
      bytes,
    );
    const sha256 = await digestSha256(bytes);
    const sections = await extractSections(type, bytes);
    workerScope.postMessage({
      ok: true,
      result: buildProfileImportResult({
        displayName: data.file.name,
        type,
        sha256,
        sections,
      }),
    });
  } catch (error) {
    const safeError =
      error instanceof ProfileImportError
        ? error
        : new ProfileImportError(
            'worker_failed',
            'The profile file could not be imported.',
          );
    workerScope.postMessage({
      ok: false,
      error: { code: safeError.code, message: safeError.message },
    });
  }
};

async function extractSections(
  type: 'txt' | 'pdf' | 'docx',
  bytes: Uint8Array,
) {
  if (type === 'txt') return [{ text: decodeUtf8Text(bytes), locator: 'text' }];
  if (type === 'docx') {
    await guardDocxArchive(bytes);
    try {
      const mammoth = (await import('mammoth')).default;
      const result = await mammoth.extractRawText({
        arrayBuffer: bytes.slice().buffer,
      });
      return [{ text: validateProfileText(result.value), locator: 'document' }];
    } catch (error) {
      if (error instanceof ProfileImportError) throw error;
      throw new ProfileImportError(
        'invalid_docx',
        'The DOCX archive is corrupted.',
      );
    }
  }

  if (containsPdfEncryptionMarker(bytes))
    throw new ProfileImportError(
      'pdf_encrypted',
      'Encrypted PDF files are not supported.',
    );
  let pdf: Awaited<
    ReturnType<(typeof import('unpdf'))['getDocumentProxy']>
  > | null = null;
  try {
    const { extractText, getDocumentProxy } = await import('unpdf');
    pdf = await getDocumentProxy(bytes, {
      enableXfa: false,
      isEvalSupported: false,
      stopAtErrors: true,
    } as Parameters<typeof getDocumentProxy>[1]);
    if (pdf.numPages < 1)
      throw new ProfileImportError('invalid_pdf', 'The PDF file is corrupted.');
    if (pdf.numPages > 100)
      throw new ProfileImportError(
        'pdf_too_many_pages',
        'PDF files are limited to 100 pages.',
      );
    const [attachments, permissions] = await Promise.all([
      pdf.getAttachments(),
      pdf.getPermissions(),
    ]);
    if (attachmentCount(attachments) > 0)
      throw new ProfileImportError(
        'pdf_attachments',
        'PDF files with embedded attachments are not supported.',
      );
    if (permissions !== null)
      throw new ProfileImportError(
        'pdf_encrypted',
        'Encrypted PDF files are not supported.',
      );
    const result = await extractText(pdf);
    const pages = Array.isArray(result.text) ? result.text : [result.text];
    return pages.map((text, index) => ({
      text,
      locator: `page ${index + 1}`,
    }));
  } catch (error) {
    if (error instanceof ProfileImportError) throw error;
    if (error instanceof Error && /password/i.test(error.name))
      throw new ProfileImportError(
        'pdf_encrypted',
        'Encrypted PDF files are not supported.',
      );
    throw new ProfileImportError('invalid_pdf', 'The PDF file is corrupted.');
  } finally {
    await pdf?.loadingTask.destroy().catch(() => undefined);
  }
}

function attachmentCount(attachments: unknown): number {
  if (!attachments) return 0;
  if (attachments instanceof Map) return attachments.size;
  return typeof attachments === 'object' ? Object.keys(attachments).length : 0;
}

async function digestSha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
