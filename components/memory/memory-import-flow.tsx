'use client';

import { useMemoryImport } from './use-memory-import';
import { MemoryImportChrome } from './memory-import-chrome';
import { SourceStep, ReadingStep } from './memory-import-source';
import { ReviewStep } from './memory-import-review';
import { SavedStep } from './memory-import-saved';

export function MemoryImportFlow() {
  const controller = useMemoryImport();
  return (
    <MemoryImportChrome stage={controller.stage}>
      {controller.stage === 'source' ? (
        <SourceStep controller={controller} />
      ) : null}
      {controller.stage === 'reading' ? (
        <ReadingStep controller={controller} />
      ) : null}
      {controller.stage === 'review' || controller.stage === 'saving' ? (
        <ReviewStep controller={controller} />
      ) : null}
      {controller.stage === 'saved' ? (
        <SavedStep controller={controller} />
      ) : null}
    </MemoryImportChrome>
  );
}
