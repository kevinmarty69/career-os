import assert from 'node:assert/strict';
import test from 'node:test';
import { syntheticProfile } from '../../lib/fixture';
import { buildPageSpec, buildStrategy, runReviews } from '../../lib/workflow';
import {
  createDemoDossier,
  createEmptyDossier,
  createEmptyWorkspace,
  dossierNextView,
  dossierStage,
  dossierStatus,
  invalidateDossiersAfterProfileChange,
  mergePersistedApplications,
  opportunityReady,
  restoreWorkspace,
  selectDossier,
  updateDossier,
  visibleShareUrl,
  type ApplicationDossier,
  type SavedWorkspaceV2,
} from '../../lib/workspace-state';

const DOSSIER_A = '00000000-0000-4000-8000-000000000001';
const DOSSIER_B = '00000000-0000-4000-8000-000000000002';
const RUN_ID = '00000000-0000-4000-8000-000000000003';
const PUBLICATION_ID = '00000000-0000-4000-8000-000000000004';
const REVIEW_ID = '00000000-0000-4000-8000-000000000005';
const APPLICATION_ID = '00000000-0000-4000-8000-000000000006';

test('creates empty and demo dossiers without shared mutable state', () => {
  const empty = createEmptyDossier({ id: DOSSIER_A, now: 10 });
  const demo = createDemoDossier({ id: DOSSIER_B, now: 20 });

  assert.equal(empty.opportunity.company, '');
  assert.equal(empty.createdAt, 10);
  assert.equal(demo.opportunity.company, 'Northstar Labs');
  assert.equal(demo.opportunity.role, 'Senior Product Engineer');
  assert.equal(demo.createdAt, 20);
  empty.opportunity.company = 'Changed locally';
  assert.equal(createEmptyDossier({ id: DOSSIER_A }).opportunity.company, '');
});

test('restores V2 safely and normalizes a stale selection', () => {
  const first = createDemoDossier({ id: DOSSIER_A, now: 10 });
  const second = {
    ...createEmptyDossier({ id: DOSSIER_B, now: 20 }),
    applicationId: APPLICATION_ID,
    applicationRevision: 2,
  };
  const stored: SavedWorkspaceV2 = {
    version: 2,
    profile: syntheticProfile,
    profileOrigin: 'demo',
    dossiers: [first, second],
    selectedDossierId: RUN_ID,
  };

  const restored = restoreWorkspace(JSON.stringify(stored));
  assert.equal(restored.dossiers.length, 2);
  assert.equal(restored.selectedDossierId, DOSSIER_A);
  assert.equal(restored.dossiers[1].applicationId, APPLICATION_ID);
  assert.equal(restored.dossiers[1].applicationRevision, 2);

  const malformed = restoreWorkspace('{not json');
  assert.deepEqual(malformed, createEmptyWorkspace());
  const duplicated = restoreWorkspace(
    JSON.stringify({
      ...stored,
      dossiers: [first, { ...second, id: first.id }],
    }),
  );
  assert.deepEqual(duplicated, createEmptyWorkspace());
  const incompleteServerIdentity = restoreWorkspace(
    JSON.stringify({
      ...stored,
      dossiers: [first, { ...second, applicationRevision: undefined }],
    }),
  );
  assert.deepEqual(incompleteServerIdentity, createEmptyWorkspace());
});

test('migrates the legacy singleton into one selected dossier', () => {
  const opportunity = createDemoDossier({ id: DOSSIER_A }).opportunity;
  const strategy = buildStrategy(syntheticProfile, opportunity);
  const spec = buildPageSpec(syntheticProfile, opportunity, strategy);
  const legacy = {
    profile: syntheticProfile,
    profileOrigin: 'demo',
    opportunity,
    strategy,
    spec,
    runId: RUN_ID,
    runProfile: syntheticProfile,
    reviews: runReviews(syntheticProfile, spec),
    reviewDecisions: [],
    publicationEligible: true,
    approved: true,
    capability: PUBLICATION_ID,
    events: [],
    paused: false,
  };

  const restored = restoreWorkspace(JSON.stringify(legacy), {
    createId: () => DOSSIER_B,
    now: () => 123,
  });
  assert.equal(restored.version, 2);
  assert.equal(restored.dossiers.length, 1);
  assert.equal(restored.selectedDossierId, DOSSIER_B);
  assert.equal(restored.dossiers[0].opportunity.company, 'Northstar Labs');
  assert.equal(restored.dossiers[0].runId, RUN_ID);
  assert.equal(restored.dossiers[0].capability, PUBLICATION_ID);
  assert.equal(restored.dossiers[0].applicationId, undefined);
  assert.equal(restored.dossiers[0].applicationRevision, undefined);
  assert.equal(restored.dossiers[0].createdAt, 123);
});

test('updates one dossier without changing sibling references', () => {
  const first = createDemoDossier({ id: DOSSIER_A, now: 10 });
  const second = createEmptyDossier({ id: DOSSIER_B, now: 20 });
  const workspace: SavedWorkspaceV2 = {
    version: 2,
    profile: syntheticProfile,
    profileOrigin: 'demo',
    dossiers: [first, second],
    selectedDossierId: DOSSIER_A,
  };

  const updated = updateDossier(
    workspace,
    DOSSIER_A,
    (dossier) => ({
      ...dossier,
      opportunity: { ...dossier.opportunity, role: 'Principal Engineer' },
    }),
    50,
  );
  assert.equal(updated.dossiers[0].opportunity.role, 'Principal Engineer');
  assert.equal(updated.dossiers[0].updatedAt, 50);
  assert.equal(updated.dossiers[1], second);
  assert.equal(
    updateDossier(workspace, RUN_ID, (item) => item),
    workspace,
  );
  assert.equal(
    selectDossier(workspace, DOSSIER_B).selectedDossierId,
    DOSSIER_B,
  );
  assert.equal(selectDossier(workspace, RUN_ID), workspace);
});

test('merges server applications without reviving stale generated state', () => {
  const localOnly = createEmptyDossier({ id: DOSSIER_B, now: 20 });
  const persisted = generatedDossier({
    id: DOSSIER_A,
    applicationId: APPLICATION_ID,
    applicationRevision: 2,
    capability: PUBLICATION_ID,
    runId: RUN_ID,
  });
  const workspace: SavedWorkspaceV2 = {
    version: 2,
    profile: syntheticProfile,
    profileOrigin: 'user',
    dossiers: [persisted, localOnly],
    selectedDossierId: DOSSIER_A,
  };
  const application = {
    applicationId: APPLICATION_ID,
    company: 'Updated Company',
    role: 'Principal Engineer',
    description: 'Updated brief',
    accent: '#5847e8',
    stage: 'draft' as const,
    revision: 3,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
  };

  const merged = mergePersistedApplications(workspace, [application]);
  assert.equal(merged.dossiers.length, 2);
  const refreshed = merged.dossiers.find(
    (dossier) => dossier.applicationId === APPLICATION_ID,
  )!;
  assert.equal(refreshed.opportunity.company, 'Updated Company');
  assert.equal(refreshed.applicationRevision, 3);
  assert.equal(refreshed.spec, undefined);
  assert.equal(refreshed.runId, undefined);
  assert.equal(refreshed.capability, PUBLICATION_ID);
  assert.equal(merged.dossiers[0], localOnly);

  const removedRemotely = mergePersistedApplications(merged, []);
  assert.deepEqual(removedRemotely.dossiers, [localOnly]);
  assert.equal(removedRemotely.selectedDossierId, DOSSIER_B);
});

test('profile changes invalidate generated state but preserve opportunities and publications', () => {
  const dossier = generatedDossier({
    id: DOSSIER_A,
    applicationId: APPLICATION_ID,
    applicationRevision: 2,
    capability: PUBLICATION_ID,
    approved: true,
    runId: RUN_ID,
  });
  const workspace: SavedWorkspaceV2 = {
    version: 2,
    profile: syntheticProfile,
    profileOrigin: 'demo',
    dossiers: [dossier],
    selectedDossierId: DOSSIER_A,
  };
  const profile = structuredClone(syntheticProfile);
  profile.headline = 'Updated positioning';

  const invalidated = invalidateDossiersAfterProfileChange(
    workspace,
    profile,
    'user',
    99,
  );
  const result = invalidated.dossiers[0];
  assert.equal(invalidated.profile.headline, 'Updated positioning');
  assert.equal(invalidated.profileOrigin, 'user');
  assert.equal(result.opportunity, dossier.opportunity);
  assert.equal(result.applicationId, APPLICATION_ID);
  assert.equal(result.applicationRevision, 2);
  assert.equal(result.capability, PUBLICATION_ID);
  assert.equal(result.spec, undefined);
  assert.equal(result.runId, undefined);
  assert.deepEqual(result.reviews, []);
  assert.equal(result.approved, false);
  assert.equal(result.updatedAt, 99);
});

test('derives status, stage and next view from each dossier only', () => {
  const incomplete = createEmptyDossier({ id: DOSSIER_B });
  assert.equal(dossierStatus(incomplete), 'À compléter');
  assert.equal(opportunityReady(incomplete.opportunity), false);

  const draft = createDemoDossier({ id: DOSSIER_A });
  assert.equal(opportunityReady(draft.opportunity), true);
  assert.deepEqual(presentation(draft), ['Offre prête', 'Brouillon', 'brief']);

  const generated = generatedDossier({
    id: DOSSIER_A,
    reviews: [],
    publicationEligible: undefined,
  });
  assert.deepEqual(presentation(generated), [
    'Brouillon prêt',
    'Brouillon',
    'journey',
  ]);

  const blocked = generatedDossier({
    id: DOSSIER_A,
    reviews: [
      {
        reviewer: 'factuality',
        passed: false,
        findings: ['Unsupported claim'],
        reviewId: REVIEW_ID,
        issues: [
          { section: 'hero.thesis', message: 'Unsupported', blocking: true },
        ],
      },
    ],
  });
  assert.deepEqual(presentation(blocked), [
    'Revue requise',
    'À valider',
    'review',
  ]);

  const ready = generatedDossier({ id: DOSSIER_A });
  assert.deepEqual(presentation(ready), [
    'Prête à valider',
    'À valider',
    'review',
  ]);
  assert.equal(dossierStatus({ ...ready, approved: true }), 'Validée');
  assert.equal(dossierNextView({ ...ready, approved: true }), 'share');
  assert.deepEqual(presentation({ ...ready, capability: PUBLICATION_ID }), [
    'Partagée',
    'Envoyée',
    'share',
  ]);
});

test('never exposes an ephemeral share token in another dossier or workspace', () => {
  const link = {
    scope: 'workspace-a',
    dossierId: DOSSIER_A,
    url: `/p/${PUBLICATION_ID}#raw-secret`,
  };
  assert.equal(visibleShareUrl(link, 'workspace-a', DOSSIER_A), link.url);
  assert.equal(visibleShareUrl(link, 'workspace-a', DOSSIER_B), '');
  assert.equal(visibleShareUrl(link, 'workspace-b', DOSSIER_A), '');
});

function generatedDossier(
  overrides: Partial<ApplicationDossier>,
): ApplicationDossier {
  const dossier = createDemoDossier({ id: DOSSIER_A, now: 10 });
  const strategy = buildStrategy(syntheticProfile, dossier.opportunity);
  const spec = buildPageSpec(syntheticProfile, dossier.opportunity, strategy);
  return {
    ...dossier,
    strategy,
    spec,
    reviews: runReviews(syntheticProfile, spec),
    publicationEligible: true,
    ...overrides,
  };
}

function presentation(dossier: ApplicationDossier) {
  return [
    dossierStatus(dossier),
    dossierStage(dossier),
    dossierNextView(dossier),
  ];
}
