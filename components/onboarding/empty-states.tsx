'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/i18n/i18n-provider';
import {
  Button,
  Icon,
  Mono,
  Monogram,
  Overline,
  StatusChip,
} from '@/components/ui/controls';
import { Card, Panel } from '@/components/ui/surfaces';

export type EmptyKind = 'memory' | 'applications' | 'review' | 'links' | 'runs';

export function OnboardingEmptyState({
  kind,
  onAction,
}: {
  kind: EmptyKind;
  onAction?: () => void;
}) {
  const fr = useI18n().locale === 'fr';
  const router = useRouter();
  const memory = kind === 'memory';
  const application = kind === 'applications';
  const title = {
    memory: fr ? 'Commençons par vos preuves' : 'Start with your evidence',
    applications: fr
      ? 'Votre mémoire est prête. Il manque une offre à confronter.'
      : 'Your memory is ready. Now bring a job to compare.',
    review: fr
      ? 'Les agents préparent. Vous décidez.'
      : 'The agents prepare. You decide.',
    links: fr
      ? 'Chaque page envoyée sera révocable d’un clic.'
      : 'Every shared page can be revoked in one click.',
    runs: fr ? 'Aucun agent n’a encore tourné.' : 'No agent has run yet.',
  }[kind];
  const copy = {
    memory: fr
      ? 'Importez votre CV : il sera découpé en affirmations, chacune rattachée à sa page d’origine. C’est cette matière — vos preuves, pas des généralités — qui servira à chaque candidature.'
      : 'Import your CV. It becomes claims, each linked to its original page. This material — your evidence, not generalities — supports every application.',
    applications: fr
      ? 'Collez l’URL d’une annonce qui vous intéresse. Les agents la découperont en exigences, iront chercher ce qui est public sur l’entreprise, et vous diront quelles preuves vous avez déjà — et lesquelles vous manquent.'
      : 'Paste a job URL. The agents identify its requirements, research the company using public sources, and show which evidence you have — and what is missing.',
    review: fr
      ? 'Lorsqu’une candidature demande votre avis, elle apparaît ici avec la source et la correction proposée côte à côte.'
      : 'When an application needs your judgment, its source and proposed correction appear side by side.',
    links: fr
      ? 'Vous retrouverez ici les ouvertures de vos pages et pourrez couper l’accès à tout moment, même après l’envoi.'
      : 'Page visits will appear here. You can revoke access at any time, even after sharing.',
    runs: fr
      ? 'Chaque run laissera son journal complet ici : quelles sources ont été lues, quelles preuves ont été rattachées, ce qui a été écarté, la durée et le coût exact.'
      : 'Each run leaves its journal here: sources read, evidence linked, material excluded, duration and recorded cost.',
  }[kind];
  const action = memory
    ? fr
      ? 'Importer mon CV'
      : 'Import my CV'
    : application
      ? fr
        ? 'Coller une offre'
        : 'Paste a job'
      : fr
        ? 'Ouvrir mes candidatures'
        : 'Open my applications';
  return (
    <div
      data-onboarding={kind}
      className="co-kit flex min-w-0 flex-col gap-[18px]"
    >
      <Panel className="gap-[26px]" padding={26}>
        <div
          className={`grid min-w-0 gap-[34px] ${application ? '' : 'lg:grid-cols-2'}`}
        >
          <div className="flex min-w-0 flex-col items-start gap-[18px]">
            <h2 className="m-0 text-hero text-ink-900">{title}</h2>
            {memory && (
              <p className="m-0 text-body-lg text-ink-800">
                {fr
                  ? 'Career OS ne rédige rien qu’il ne puisse rattacher à une source.'
                  : 'Career OS writes from evidence it can trace to a source.'}
              </p>
            )}
            <p className="m-0 text-body-sm text-ink-700">{copy}</p>
            <Button
              variant="primary"
              icon={memory ? 'upload_file' : 'arrow_forward'}
              onClick={
                onAction ??
                (() =>
                  router.push(
                    memory
                      ? '/memory/import'
                      : application
                        ? '/applications/new'
                        : '/applications',
                  ))
              }
            >
              {action}
            </Button>
            {memory && (
              <>
                <Link
                  className="text-label text-ink-600"
                  href="/memory/import#profile-text"
                >
                  {fr
                    ? 'PDF, DOCX ou coller le texte'
                    : 'PDF, DOCX or paste text'}
                </Link>
                <p className="m-0 flex gap-[11px] text-label text-ink-600">
                  <Icon name="shield" size={18} />
                  {fr
                    ? 'Vos documents restent privés. Vous choisissez, source par source, ce qui peut être cité.'
                    : 'Your documents stay private. You choose, source by source, what may be cited.'}
                </p>
              </>
            )}
          </div>
          {!application && (
            <figure
              className="m-0 flex min-w-0 flex-col gap-[14px]"
              aria-label={fr ? 'Exemple fictif' : 'Illustrative example'}
            >
              <Overline>
                {fr
                  ? 'Ce que vous verrez · exemple'
                  : 'What you will see · example'}
              </Overline>
              <Card radius={20} padding={24}>
                {memory ? (
                  <>
                    <div className="flex flex-wrap items-center gap-[11px]">
                      <Icon name="verified" className="text-green" />
                      <strong className="text-body-sm">
                        {fr ? 'Une affirmation sourcée' : 'A sourced claim'}
                      </strong>
                      <StatusChip status="verified" />
                    </div>
                    <Mono size={11}>cv_2024.pdf · p.1 l.14</Mono>
                    <p className="m-0 border-l-[3px] border-green pl-4 text-body-lg text-ink-800">
                      {fr
                        ? '« Temps de build ramené de 11 à 7 minutes (p50) sur un monorepo de 340 services »'
                        : '“Build time reduced from 11 to 7 minutes (p50) in a monorepo of 340 services.”'}
                    </p>
                    <p className="m-0 flex gap-[11px] text-label text-ink-600">
                      <Icon name="hub" size={17} />
                      {fr
                        ? 'Réutilisable dans toutes vos candidatures, sans la ressaisir.'
                        : 'Reusable across your applications, without retyping.'}
                    </p>
                  </>
                ) : kind === 'links' ? (
                  <>
                    <div className="flex items-center gap-3">
                      <Monogram value="NR" />
                      <strong className="text-section">Nimbus Robotics</strong>
                    </div>
                    <Mono>/p/example-nimbus</Mono>
                    <p className="m-0 flex gap-3 text-label text-ink-600">
                      <Icon name="visibility" />
                      {fr
                        ? '4 ouvertures · expire dans 30 j'
                        : '4 visits · expires in 30 days'}
                    </p>
                  </>
                ) : kind === 'runs' ? (
                  <>
                    <Mono>14:03</Mono>
                    <p className="m-0 text-body-sm">
                      {fr
                        ? '11 preuves rattachées · 0,18 €'
                        : '11 evidence links · €0.18'}
                    </p>
                    <p className="m-0 text-label text-ink-600">
                      {fr
                        ? 'Exemple de journal — aucun run lancé.'
                        : 'Example journal — no run started.'}
                    </p>
                  </>
                ) : (
                  <>
                    <StatusChip status="unsourced" />
                    <p className="m-0 text-body-sm">
                      {fr
                        ? '« Divisé les coûts d’infrastructure par deux »'
                        : '“Halved infrastructure costs.”'}
                    </p>
                    <Mono>
                      {fr ? 'Aucune source rattachée' : 'No source linked'}
                    </Mono>
                    <p className="m-0 text-label text-ink-600">
                      {fr
                        ? 'La sourcer, l’affaiblir ou la retirer.'
                        : 'Source it, soften it or remove it.'}
                    </p>
                  </>
                )}
              </Card>
              <figcaption className="text-center text-caption text-ink-600">
                {fr
                  ? 'Exemple — vos propres preuves apparaîtront ici.'
                  : 'Example — your own evidence will appear here.'}
              </figcaption>
            </figure>
          )}
        </div>
      </Panel>
      {application ? (
        <div
          className="grid min-w-0 gap-[18px] md:grid-cols-2 xl:grid-cols-5"
          aria-label={fr ? 'Exemple de parcours' : 'Example workflow'}
        >
          {[
            [
              fr ? 'Brouillon' : 'Draft',
              fr
                ? 'Votre première offre arrive ici'
                : 'Your first job starts here',
              'add_link',
            ],
            [
              fr ? 'Run en cours' : 'Agents running',
              fr
                ? 'Recherche entreprise, preuves, rédaction, vérification.'
                : 'Company research, evidence, writing, verification.',
              'bolt',
            ],
            [
              fr ? 'À trancher' : 'To decide',
              fr
                ? 'Chaque affirmation trop forte vous est soumise, preuve sous les yeux.'
                : 'Review claims against their evidence.',
              'gpp_maybe',
            ],
            [
              fr ? 'Envoyée' : 'Sent',
              fr
                ? 'Un lien privé révocable, partagé par vous.'
                : 'A revocable private link, shared by you.',
              'lock',
            ],
            [
              fr ? 'Entretien' : 'Interview',
              fr
                ? 'Les questions difficiles deviennent des trous à combler.'
                : 'Difficult questions reveal gaps to fill.',
              'edit_note',
            ],
          ].map(([name, description, icon], i) => (
            <Panel key={name} padding={22}>
              <h3 className="m-0 text-section">{name}</h3>
              <div
                className={`flex min-w-0 flex-col gap-[14px] rounded-card p-4 ${i === 0 ? 'border-[1.5px] border-dashed border-ink-900' : 'bg-card'}`}
              >
                <Icon name={icon} />
                <p className="m-0 text-label text-ink-700">{description}</p>
              </div>
            </Panel>
          ))}
        </div>
      ) : memory ? (
        <div className="grid gap-[18px] md:grid-cols-3">
          {[
            [
              fr ? 'Vous importez' : 'You import',
              fr
                ? 'CV, profil, post-mortem, dépôts, évaluations. Chaque document est découpé en affirmations rattachées à leur page.'
                : 'CV, profile, post-mortems, repositories and reviews. Each claim stays linked to its document.',
            ],
            [
              fr ? 'Vous collez une offre' : 'You paste a job',
              fr
                ? 'Les agents confrontent l’offre à vos preuves et montrent vos points forts comme vos écarts.'
                : 'Agents compare the job to your evidence, showing strengths and gaps.',
            ],
            [
              fr ? 'Vous tranchez, puis envoyez' : 'You decide, then share',
              fr
                ? 'Vous relisez les affirmations et validez votre page privée avant de l’envoyer.'
                : 'Review the claims and approve your private page before sharing it.',
            ],
          ].map(([name, description], i) => (
            <Card key={name} padding={24}>
              <div className="flex items-center gap-3">
                <Monogram
                  size={26}
                  tone={i === 0 ? 'ink' : 'neutral'}
                  value={String(i + 1)}
                />
                <h3 className="m-0 text-section">{name}</h3>
              </div>
              <p className="m-0 text-body-sm text-ink-700">{description}</p>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
