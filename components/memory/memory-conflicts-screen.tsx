'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useI18n } from '@/components/i18n/i18n-provider';
import { AppShell } from '@/components/layout/app-shell';
import { Button, Icon, StatusChip } from '@/components/ui/controls';
import { Card, Panel } from '@/components/ui/surfaces';
import { SkeletonBlock, useDelayedPending } from '@/components/ui/feedback';
import { useCareerMemory } from './use-career-memory';
import { memoryConflicts, resolveMemoryConflict } from '@/lib/memory-conflicts';

export function MemoryConflictsScreen() {
  const memory = useCareerMemory();
  const fr = useI18n().locale === 'fr';
  const [index, setIndex] = useState(0);
  const [error, setError] = useState(false);
  const groups = memoryConflicts(memory.profile);
  const group = groups[index % Math.max(groups.length, 1)];
  const pending = useDelayedPending(memory.state === 'loading');
  return (
    <AppShell path="/memory">
      <div className="co-kit flex flex-col gap-[26px]">
        <h1 className="m-0 text-display">
          {fr ? 'Conflits entre sources' : 'Source conflicts'}
        </h1>
        {memory.message && (
          <p role={memory.loadError ? 'alert' : 'status'}>{memory.message}</p>
        )}
        {error && (
          <p role="alert">
            {fr
              ? 'Arbitrage non enregistré. Vérifiez les limites de votre mémoire et réessayez.'
              : 'Decision not saved. Check your memory limits and retry.'}
          </p>
        )}
        {memory.state === 'loading' ? (
          pending && <SkeletonBlock />
        ) : memory.loadError ? (
          <Link href="/memory">
            {fr ? 'Retour à la mémoire' : 'Back to memory'}
          </Link>
        ) : !group ? (
          <Panel>
            <Icon name="check_circle" />
            <h2 className="m-0 text-hero">
              {fr
                ? 'Aucun conflit chiffré détecté'
                : 'No numeric conflicts detected'}
            </h2>
            <p className="m-0 text-body-sm">
              {fr
                ? 'Les chiffres contradictoires d’une même formulation apparaissent ici. Cela ne certifie pas que toutes vos sources concordent.'
                : 'Contradictory numbers in the same wording appear here. This does not certify that all your sources agree.'}
            </p>
            <Link href="/memory">
              {fr ? 'Revenir aux preuves' : 'Back to evidence'}
            </Link>
          </Panel>
        ) : (
          <>
            <StatusChip
              status="conflicted"
              label={
                fr
                  ? `Conflit ${(index % groups.length) + 1} sur ${groups.length}`
                  : `Conflict ${(index % groups.length) + 1} of ${groups.length}`
              }
            />
            <h2 className="m-0 text-decision">
              {fr ? 'Quelle version fait foi ?' : 'Which version is accurate?'}
            </h2>
            <div className="grid gap-[18px] lg:grid-cols-2">
              {group.map((claim) => (
                <Card key={claim.id}>
                  <StatusChip status="conflicted" />
                  <p className="m-0 text-body-lg">{claim.statement}</p>
                  {claim.evidenceIds.map((id) => {
                    const evidence = memory.profile.evidence.find(
                      (item) => item.id === id,
                    );
                    const source = memory.profile.sources.find(
                      (item) => item.id === evidence?.sourceId,
                    );
                    return (
                      evidence && (
                        <div
                          key={id}
                          className="flex flex-col gap-2 rounded-control bg-panel p-4"
                        >
                          <strong className="text-label">
                            {source?.title} · {evidence.label}
                          </strong>
                          <blockquote className="m-0 text-body-sm">
                            {evidence.excerpt}
                          </blockquote>
                        </div>
                      )
                    );
                  })}
                  {!claim.evidenceIds.length && (
                    <span className="text-label">
                      {fr ? 'Aucune source rattachée' : 'No attached source'}
                    </span>
                  )}
                  <Button
                    disabled={
                      memory.state === 'saving' || !claim.evidenceIds.length
                    }
                    onClick={async () => {
                      setError(false);
                      try {
                        await memory.save(
                          resolveMemoryConflict(
                            memory.profile,
                            claim.id,
                            {
                              source: crypto.randomUUID(),
                              evidence: crypto.randomUUID(),
                            },
                            new Date().toISOString(),
                          ),
                        );
                      } catch {
                        setError(true);
                      }
                    }}
                  >
                    {fr ? 'Cette version fait foi' : 'Use this version'}
                  </Button>
                </Card>
              ))}
            </div>
            <Panel>
              <Icon name="shield" />
              <p className="m-0 text-body-sm">
                {fr
                  ? 'Aucune version n’est choisie automatiquement. L’arbitrage reste déclaré par vous ; l’autre formulation est conservée hors publication. Les pages déjà partagées ne sont pas modifiées.'
                  : 'Neither version is selected automatically. Your decision remains declared by you; the other wording is retained but blocked from publication. Previously shared pages are unchanged.'}
              </p>
            </Panel>
            <div className="flex flex-wrap gap-4">
              <Link href="/memory">{fr ? 'Reporter' : 'Later'}</Link>
              <Button onClick={() => setIndex(index + 1)}>
                {fr ? 'Conflit suivant' : 'Next conflict'}
              </Button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
