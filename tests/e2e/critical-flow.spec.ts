import { expect, test, type Page } from '@playwright/test';

async function openApplications(page: Page) {
  await openApplicationsBoard(page);
  const application = page.getByRole('button', {
    name: 'Ouvrir la candidature Northstar Labs',
  });
  await application.waitFor();
  await application.click();
}

async function openApplicationsBoard(page: Page) {
  await openPrimary(page, 'Candidatures');
}

async function openPrimary(page: Page, name: string) {
  const navigation = page.getByRole('button', { name, exact: true });
  await navigation.first().waitFor({ state: 'attached' });
  for (let index = 0; index < (await navigation.count()); index += 1) {
    const candidate = navigation.nth(index);
    if (await candidate.isVisible()) {
      await candidate.click();
      return;
    }
  }
  throw new Error(`No visible ${name} navigation.`);
}

async function useDemo(page: Page) {
  const button = page.getByRole('button', {
    name: 'Explorer avec des données fictives',
  });
  await button.waitFor();
  await button.click();
}

async function createPersistedApplication(page: Page) {
  await page.goto('/sign-in?next=/');
  await page
    .getByRole('button', { name: 'Create Account', exact: true })
    .first()
    .click();
  await page.getByLabel('Name').fill('Run Tester');
  await page
    .getByLabel('Email')
    .fill(`run-${crypto.randomUUID()}@example.test`);
  await page.getByLabel('Password').fill('safe-local-password');
  await page
    .locator('form')
    .getByRole('button', { name: 'Create Account' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Create your workspace' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Create Workspace' }).click();
  await page.getByRole('button', { name: /Coller le texte de mon CV/ }).click();
  await page
    .getByLabel('Contenu du CV')
    .fill(
      'Run Tester\nProduct Engineer\nBuilt and operated a production workflow.',
    );
  await page.getByRole('button', { name: 'Relire les informations' }).click();
  await page.getByLabel(/Je valide les .* affirmations sélectionnées/).check();
  await page.getByRole('button', { name: 'Enregistrer ma mémoire' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Mémoire professionnelle enregistrée dans cet espace.',
  );
  await expect(
    page.getByRole('heading', { name: 'Votre mémoire est prête.' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Créer ma première candidature' })
    .click();
  await page.getByLabel('Entreprise', { exact: true }).fill('Durable Labs');
  await page.getByLabel('Poste', { exact: true }).fill('Product Engineer');
  await page
    .getByLabel('Description du poste')
    .fill('Build a durable product workflow with evidence-backed outputs.');
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (
      location.pathname === '/' &&
      !sessionStorage.getItem('career-os-test-initialized')
    ) {
      localStorage.removeItem('career-os-demo');
      sessionStorage.removeItem('career-os-onboarding:anonymous');
      sessionStorage.setItem('career-os-test-initialized', '1');
    }
  });
  await page.goto('/');
});

test('starts honestly and restores a local CV review after reload', async ({
  page,
}) => {
  await expect(
    page.getByRole('heading', {
      name: 'Construisons votre mémoire professionnelle.',
    }),
  ).toBeVisible();
  await expect(page.getByText('Alex Morgan')).toHaveCount(0);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'kevin-cv.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      [
        'Kévin Marty',
        'Senior Product Engineer',
        'Produit shippé en solo, de l’idée à la production.',
      ].join('\n'),
    ),
  });
  await expect(
    page.getByRole('heading', {
      name: 'Gardez seulement ce qui vous ressemble.',
    }),
  ).toBeVisible();
  await expect(
    page
      .locator('.import-candidate-list article')
      .first()
      .getByRole('checkbox'),
  ).toBeChecked();
  await page
    .getByLabel('Affirmation 1')
    .fill('Produit shippé en solo, avec une revue humaine avant production.');
  await page.reload();
  await expect(page.getByLabel('Affirmation 1')).toHaveValue(
    'Produit shippé en solo, avec une revue humaine avant production.',
  );
});

test('expires and discards a temporary CV review', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Covered by the desktop flow.');
  await page.getByRole('button', { name: /Coller le texte de mon CV/ }).click();
  await page
    .getByLabel('Contenu du CV')
    .fill(
      'Kévin Marty\nSenior Product Engineer\nBuilt and operated a production agent platform.',
    );
  await page.getByRole('button', { name: 'Relire les informations' }).click();
  await page.evaluate(() => {
    const key = 'career-os-onboarding:anonymous';
    const review = JSON.parse(sessionStorage.getItem(key)!);
    review.expiresAt = Date.now() + 50;
    sessionStorage.setItem(key, JSON.stringify(review));
  });
  await page.reload();
  await expect(page.locator('p[role="alert"]')).toContainText(
    'Cette revue a expiré après 30 minutes.',
  );
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('career-os-onboarding:anonymous'),
    ),
  ).toBeNull();

  await page.getByRole('button', { name: /Coller le texte de mon CV/ }).click();
  await page
    .getByLabel('Contenu du CV')
    .fill(
      'Kévin Marty\nSenior Product Engineer\nBuilt and operated a production agent platform.',
    );
  await page.getByRole('button', { name: 'Relire les informations' }).click();
  await page.getByRole('button', { name: 'Recommencer' }).click();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('career-os-onboarding:anonymous'),
    ),
  ).toBeNull();
});

test('restores an anonymous draft after reload', async ({ page }) => {
  await useDemo(page);
  await openApplications(page);
  await page.getByRole('button', { name: 'Générer la page' }).click();
  await expect(
    page.getByRole('button', { name: 'Ouvrir la revue' }),
  ).toBeVisible();

  await page.evaluate(() =>
    sessionStorage.setItem('preserve-career-os-demo', '1'),
  );
  await page.reload();

  await expect(
    page.getByRole('button', { name: 'Ouvrir la revue' }),
  ).toBeVisible();
});

test('resumes a durable run and separates polling loss from run failure', async ({
  page,
}) => {
  await createPersistedApplication(page);
  const profile = await page.evaluate(async () => {
    const response = await fetch('/api/profile');
    return ((await response.json()) as { profile: unknown }).profile;
  });
  const runId = crypto.randomUUID();
  const pausedRunId = crypto.randomUUID();
  let runStarts = 0;
  let runRead: 'unavailable' | 'running' | 'failed' = 'unavailable';
  const runningRun = {
    runId,
    status: 'running',
    stage: 'research',
    revision: 0,
    usedTokens: 0,
    usedCostMicros: 0,
    profile,
    steps: [
      {
        stage: 'company-researcher',
        status: 'completed',
        attempt: 1,
      },
      {
        stage: 'evidence-archivist',
        status: 'completed',
        attempt: 1,
      },
      {
        stage: 'recruiter-strategist',
        status: 'in_flight',
        attempt: 1,
      },
    ],
    reviews: [],
    events: [],
  };
  await page.route('**/api/runs', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    runStarts += 1;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({
        ...runningRun,
        ...(runStarts > 1
          ? {
              runId: pausedRunId,
              status: 'paused',
              stage: 'evidence_archive',
            }
          : {}),
        steps: [
          {
            stage: 'company-researcher',
            status: runStarts > 1 ? 'completed' : 'in_flight',
            attempt: 1,
          },
        ],
      }),
    });
  });
  await page.route(`**/api/runs/${runId}`, async (route) => {
    if (runRead === 'unavailable') {
      await route.fulfill({ status: 503, body: 'Run unavailable.' });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        runRead === 'failed'
          ? {
              ...runningRun,
              status: 'failed',
              stage: 'invalid_output',
              steps: [
                ...runningRun.steps.slice(0, 2),
                {
                  stage: 'recruiter-strategist',
                  status: 'failed',
                  attempt: 1,
                  failureCode: 'invalid_output',
                },
              ],
            }
          : runningRun,
      ),
    });
  });

  await page.getByRole('button', { name: 'Générer la page' }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Analyse de l’offre en cours',
    }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByText('L’analyse peut continuer')).toBeVisible();

  runRead = 'running';
  await page.getByRole('button', { name: 'Réessayer maintenant' }).click();
  const progress = page.getByRole('list', { name: 'Progression enregistrée' });
  await expect(
    progress
      .getByRole('listitem')
      .filter({ hasText: 'Analyse de l’offre' })
      .getByText('Terminé'),
  ).toBeVisible();
  await expect(
    progress
      .getByRole('listitem')
      .filter({ hasText: 'Stratégie de candidature' })
      .getByText('En cours'),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: 'Stratégie de candidature en cours',
    }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Offre', exact: true }).click();
  await expect(page.getByLabel('Entreprise', { exact: true })).toBeDisabled();
  await expect(page.getByText('Ce brief reste consultable')).toBeVisible();
  await page.getByRole('button', { name: 'Parcours', exact: true }).click();

  await page.reload();
  await expect(
    page.getByRole('heading', {
      name: 'Stratégie de candidature en cours',
    }),
  ).toBeVisible();
  runRead = 'failed';
  await expect(
    page.getByRole('heading', { name: 'La génération s’est arrêtée.' }),
  ).toBeVisible({ timeout: 7_000 });
  await expect(page.getByText('Le brief est intact')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Relancer la génération' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Relancer la génération' }).click();
  await expect(
    page.getByRole('heading', { name: 'Analyse de l’offre terminée' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Le premier agent a enregistré ses résultats. La sélection des preuves n’est pas encore activée dans cette version.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Modifier le brief' }),
  ).toBeVisible();
  await expect(progress.getByText('En cours', { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
});

test('keeps the human research checkpoint explicit and retry-safe', async ({
  page,
}) => {
  await createPersistedApplication(page);
  const profile = await page.evaluate(async () => {
    const response = await fetch('/api/profile');
    return ((await response.json()) as { profile: unknown }).profile;
  });
  const runId = crypto.randomUUID();
  const researchArtifactId = crypto.randomUUID();
  const research = {
    artifactId: researchArtifactId,
    artifactHash: 'a'.repeat(64),
    company: 'Northstar Labs',
    role: 'Senior Product Engineer',
    source: {
      kind: 'job-posting',
      url: 'https://jobs.example.test/product-engineer',
      trust: 'untrusted-data',
    },
    signals: [
      {
        signalId: 'signal-1',
        statement: 'Piloter un produit de la découverte à la production.',
        excerpt: 'Own a product from discovery to production.',
        category: 'responsibility',
        priority: 'high',
      },
      {
        signalId: 'signal-2',
        statement: 'Construire des systèmes fiables.',
        excerpt: 'Build reliable systems.',
        category: 'requirement',
        priority: 'medium',
      },
    ],
  };
  const pausedRun = {
    runId,
    status: 'paused',
    stage: 'evidence_archive',
    revision: 0,
    usedTokens: 24,
    usedCostMicros: 0,
    profile,
    research,
    steps: [{ stage: 'company-researcher', status: 'completed', attempt: 1 }],
    reviews: [],
    events: [],
  };
  await page.route('**/api/runs', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify(pausedRun),
    });
  });
  let selections = 0;
  const keys: string[] = [];
  let releaseFirstSelection!: () => void;
  let markFirstSelectionStarted!: () => void;
  const firstSelectionStarted = new Promise<void>((resolve) => {
    markFirstSelectionStarted = resolve;
  });
  const firstSelectionCanFinish = new Promise<void>((resolve) => {
    releaseFirstSelection = resolve;
  });
  await page.route(`**/api/runs/${runId}/evidence-selection`, async (route) => {
    selections += 1;
    keys.push(route.request().headers()['idempotency-key'] ?? '');
    expect(route.request().postDataJSON()).toEqual({
      researchArtifactId,
      selectedSignalIds: ['signal-1'],
    });
    if (selections === 1) {
      markFirstSelectionStarted();
      await firstSelectionCanFinish;
      await route.fulfill({ status: 503, body: 'Unavailable' });
      return;
    }
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({
        ...pausedRun,
        status: 'running',
        steps: [
          ...pausedRun.steps,
          { stage: 'evidence-archivist', status: 'pending', attempt: 1 },
        ],
      }),
    });
  });

  await page.getByRole('button', { name: 'Générer la page' }).click();
  await expect(
    page.getByRole('heading', { name: 'Analyse de l’offre à vérifier' }),
  ).toBeVisible();
  const checkboxes = page.getByRole('checkbox');
  await expect(checkboxes).toHaveCount(2);
  await expect(checkboxes.nth(0)).toBeChecked();
  await expect(checkboxes.nth(1)).toBeChecked();
  await checkboxes.nth(1).uncheck();
  await page.getByRole('button', { name: 'Confirmer 1 critère' }).click();
  await firstSelectionStarted;
  await expect(checkboxes.nth(0)).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Corriger l’offre' }),
  ).toBeDisabled();
  await expect(page.locator('form.research-checkpoint')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  releaseFirstSelection();
  await expect(
    page.getByText('Vous pouvez réessayer sans perdre vos choix.'),
  ).toBeVisible();
  await expect(checkboxes.nth(0)).toBeChecked();
  await expect(checkboxes.nth(1)).not.toBeChecked();
  await page.getByRole('button', { name: 'Corriger l’offre' }).click();
  await page
    .getByLabel('Description du poste')
    .fill('Brief corrigé sans perdre l’analyse précédente.');
  await page.getByRole('button', { name: 'Parcours', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Analyse de l’offre à vérifier' }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Analyse de l’offre à vérifier' }),
  ).toBeVisible();
  await expect(page.getByRole('checkbox').nth(0)).toBeChecked();
  await expect(page.getByRole('checkbox').nth(1)).not.toBeChecked();
  await page.getByRole('button', { name: 'Confirmer 1 critère' }).click();
  await expect(
    page.getByRole('heading', { name: 'Sélection des preuves en cours' }),
  ).toBeVisible();
  expect(selections).toBe(2);
  expect(keys[0]).toBe(keys[1]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
});

test('reviews and approves a durable recruiter strategy', async ({ page }) => {
  await createPersistedApplication(page);
  const profile = await page.evaluate(async () => {
    const response = await fetch('/api/profile');
    return (
      (await response.json()) as {
        profile: {
          name: string;
          claims: Array<{
            id: string;
            statement: string;
            evidenceIds: string[];
          }>;
          evidence: Array<{
            id: string;
            sourceId: string;
            excerpt: string;
          }>;
          sources: Array<{ id: string; title: string }>;
        };
      }
    ).profile;
  });
  const claim = profile.claims.find((candidate) => candidate.evidenceIds[0]);
  expect(claim).toBeTruthy();
  const evidence = profile.evidence.find(
    (candidate) => candidate.id === claim!.evidenceIds[0],
  );
  const source = profile.sources.find(
    (candidate) => candidate.id === evidence?.sourceId,
  );
  expect(evidence).toBeTruthy();
  expect(source).toBeTruthy();
  const runId = crypto.randomUUID();
  const researchArtifactId = crypto.randomUUID();
  const evidenceArtifactId = crypto.randomUUID();
  const strategyArtifactId = crypto.randomUUID();
  const pageSpecId = crypto.randomUUID();
  const pageSpecArtifactId = crypto.randomUUID();
  const research = {
    artifactId: researchArtifactId,
    artifactHash: 'a'.repeat(64),
    company: 'Durable Labs',
    role: 'Product Engineer',
    source: { kind: 'job-posting', trust: 'untrusted-data' },
    signals: [
      {
        signalId: 'signal-1',
        statement: 'Construire un workflow produit durable.',
        excerpt: 'Build a durable product workflow',
        category: 'responsibility',
        priority: 'high',
      },
    ],
  };
  const evidenceArchive = {
    artifactId: evidenceArtifactId,
    artifactHash: 'b'.repeat(64),
    schemaVersion: 1,
    purpose: 'application',
    profileSnapshotId: crypto.randomUUID(),
    researchArtifactId,
    researchArtifactHash: research.artifactHash,
    signals: [
      {
        signalId: 'signal-1',
        coverage: 'declared_candidate',
        matches: [
          {
            claimId: claim!.id,
            evidenceIds: [claim!.evidenceIds[0]],
            provenance: 'declared',
            relevanceScore: 80,
          },
        ],
      },
    ],
  };
  const strategy = {
    artifactId: strategyArtifactId,
    artifactHash: 'c'.repeat(64),
    schemaVersion: 1,
    purpose: 'application',
    profileSnapshotId: evidenceArchive.profileSnapshotId,
    researchArtifactId,
    researchArtifactHash: research.artifactHash,
    evidenceArchiveArtifactId: evidenceArtifactId,
    evidenceArchiveArtifactHash: evidenceArchive.artifactHash,
    copyPolicy: 'internal-editorial-direction',
    positioning: {
      message:
        'Montrer une ownership produit concrète, de la décision à la production.',
      sourceSignalIds: ['signal-1'],
    },
    lead: {
      signalId: 'signal-1',
      claimId: claim!.id,
      evidenceIds: [claim!.evidenceIds[0]],
      rationale: 'Preuve directe de livraison produit.',
    },
    supports: [],
    gaps: [],
    omittedSignalIds: [],
  };
  const spec = {
    version: 1,
    company: {
      name: 'Durable Labs',
      role: 'Product Engineer',
      accent: '#5b45e8',
    },
    hero: {
      eyebrow: 'Private application',
      title: `${profile.name} × Durable Labs`,
      thesis: claim!.statement,
    },
    blocks: [
      {
        type: 'fit',
        title: 'Relevant experience',
        claimIds: [claim!.id],
      },
    ],
  };
  const baseRun = {
    runId,
    revision: 0,
    usedTokens: 24,
    usedCostMicros: 0,
    profile,
    research,
    evidenceArchive,
    reviews: [],
    events: [],
  };
  await page.route('**/api/runs', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({
        ...baseRun,
        status: 'paused',
        stage: 'strategy',
        steps: [
          { stage: 'company-researcher', status: 'completed', attempt: 1 },
          { stage: 'evidence-archivist', status: 'completed', attempt: 1 },
        ],
      }),
    });
  });
  await page.route(`**/api/runs/${runId}/strategy`, async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      evidenceArtifactId,
      evidenceArtifactHash: evidenceArchive.artifactHash,
    });
    expect(route.request().headers()['idempotency-key']).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({
        ...baseRun,
        strategy,
        status: 'paused',
        stage: 'strategy_review',
        steps: [
          { stage: 'company-researcher', status: 'completed', attempt: 1 },
          { stage: 'evidence-archivist', status: 'completed', attempt: 1 },
          { stage: 'recruiter-strategist', status: 'completed', attempt: 1 },
        ],
      }),
    });
  });
  await page.route(`**/api/runs/${runId}/strategy/approval`, async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      strategyArtifactId,
      strategyArtifactHash: strategy.artifactHash,
    });
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({
        ...baseRun,
        strategy,
        status: 'running',
        stage: 'page_spec',
        steps: [
          { stage: 'company-researcher', status: 'completed', attempt: 1 },
          { stage: 'evidence-archivist', status: 'completed', attempt: 1 },
          {
            stage: 'recruiter-strategist',
            status: 'completed',
            attempt: 1,
          },
          { stage: 'page-composer', status: 'in_flight', attempt: 1 },
        ],
      }),
    });
  });
  await page.route(`**/api/runs/${runId}`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...baseRun,
        strategy,
        spec,
        pageSpecId,
        pageSpecHash: 'd'.repeat(64),
        pageSpecArtifactId,
        status: 'paused',
        stage: 'page_spec_review',
        steps: [
          { stage: 'company-researcher', status: 'completed', attempt: 1 },
          { stage: 'evidence-archivist', status: 'completed', attempt: 1 },
          {
            stage: 'recruiter-strategist',
            status: 'completed',
            attempt: 1,
          },
          { stage: 'page-composer', status: 'completed', attempt: 1 },
        ],
      }),
    });
  });

  await page.getByRole('button', { name: 'Générer la page' }).click();
  await expect(
    page.getByRole('heading', { name: 'Preuves candidates sélectionnées' }),
  ).toBeVisible();
  const archiveProof = page
    .locator('.evidence-selection-result button')
    .filter({ hasText: claim!.statement })
    .first();
  await archiveProof.click();
  const inspector = page.locator('#evidence-inspector');
  const closeInspector = inspector.getByRole('button', {
    name: 'Fermer l’inspecteur de preuves',
  });
  await expect(inspector).toBeVisible();
  await expect(closeInspector).toBeFocused();
  if ((page.viewportSize()?.width ?? 0) <= 1023) {
    await expect(page.locator('.document-area')).toHaveAttribute('inert', '');
    await page.keyboard.press('Shift+Tab');
    await expect(closeInspector).toBeFocused();
  }
  await expect(inspector.getByText(source!.title)).toBeVisible();
  await expect(
    inspector.getByText(`“${evidence!.excerpt}”`, { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(inspector).toBeHidden();
  await expect(archiveProof).toBeFocused();
  await page.getByRole('button', { name: 'Construire la stratégie' }).click();
  await expect(
    page.getByRole('heading', { name: 'Angle de candidature à valider' }),
  ).toBeVisible();
  await expect(page.getByText(strategy.positioning.message)).toBeVisible();
  const strategyProof = page
    .getByRole('button', { name: 'Vérifier la source' })
    .first();
  await strategyProof.click();
  await expect(inspector).toBeVisible();
  await expect(closeInspector).toBeFocused();
  await expect(inspector.getByText(source!.title)).toBeVisible();
  await closeInspector.click();
  await expect(strategyProof).toBeFocused();
  await page.getByRole('button', { name: 'Valider la stratégie' }).click();
  await expect(
    page.getByRole('heading', { name: spec.hero.title }),
  ).toBeVisible();
  await expect(
    page.getByText('Relisez exactement ce que l’entreprise verra.'),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Brouillon prêt. Les vérifications durables ne sont pas encore disponibles.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Partager' })).toBeDisabled();
  await expect(page.locator('.draft-thesis')).toHaveText(claim!.statement);
  await page.getByRole('button', { name: 'Parcours' }).click();
  await expect(
    page.getByText('Brouillon composé · vérifications non disponibles'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Ouvrir la revue' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Accueil' }).first().click();
  await expect(
    page.getByRole('heading', { name: 'Votre brouillon est prêt à relire.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Relire la page privée/ }).click();
  await expect(
    page.getByRole('heading', { name: spec.hero.title }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
});

test('protects the durable strategy HTTP boundary', async ({ page }) => {
  const runId = crypto.randomUUID();
  const startBody = {
    evidenceArtifactId: crypto.randomUUID(),
    evidenceArtifactHash: 'a'.repeat(64),
  };
  const headers = {
    Origin: 'http://localhost:3117',
    'Idempotency-Key': crypto.randomUUID(),
  };
  expect(
    (
      await page.request.post(`/api/runs/${runId}/strategy`, {
        data: startBody,
        headers,
      })
    ).status(),
  ).toBe(401);

  await createPersistedApplication(page);
  expect(
    (
      await page.request.post(`/api/runs/${runId}/strategy`, {
        data: startBody,
        headers: { ...headers, Origin: 'https://attacker.example' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post(`/api/runs/${runId}/strategy`, {
        data: startBody,
        headers,
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post(`/api/runs/${runId}/strategy/approval`, {
        data: {
          strategyArtifactId: crypto.randomUUID(),
          strategyArtifactHash: 'b'.repeat(64),
        },
        headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
      })
    ).status(),
  ).toBe(400);
});

test('keeps two local application dossiers isolated across reloads', async ({
  page,
}) => {
  await useDemo(page);
  await openApplications(page);
  await page.getByRole('button', { name: 'Générer la page' }).click();
  await page.getByRole('button', { name: 'Retour aux candidatures' }).click();
  await page
    .getByRole('button', { name: 'Coller une offre', exact: true })
    .click();
  await expect(page.getByText('À compléter', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Générer la page' }),
  ).toBeDisabled();
  await page.getByLabel('Entreprise', { exact: true }).fill('Atlas Health');
  await page.getByLabel('Poste', { exact: true }).fill('Founding Engineer');
  await page
    .getByLabel('Description du poste')
    .fill('Build a reliable patient-facing workflow with a small team.');
  await expect(
    page.getByRole('button', { name: 'Générer la page' }),
  ).toBeEnabled();
  await page.evaluate(() =>
    sessionStorage.setItem('preserve-career-os-demo', '1'),
  );
  await expect(page).toHaveURL(/view=applications/);
  await expect(page).toHaveURL(/tab=brief/);
  await page.reload();
  await expect(page.getByLabel('Entreprise', { exact: true })).toHaveValue(
    'Atlas Health',
  );
  await expect(
    page.getByRole('button', { name: 'Retour aux candidatures' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retour aux candidatures' }).click();
  await expect(
    page.getByRole('button', {
      name: 'Ouvrir la candidature Northstar Labs',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Ouvrir la candidature Atlas Health' }),
  ).toBeVisible();

  await page
    .getByRole('button', { name: 'Ouvrir la candidature Atlas Health' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Générer la page' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retour aux candidatures' }).click();
  await page
    .getByRole('button', {
      name: 'Ouvrir la candidature Northstar Labs',
    })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Confirmer la pertinence et les preuves',
    }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Retour aux candidatures' }).click();
  await expect(page.locator('.application-card')).toHaveCount(2);
});

test('persists onboarding and starts one durable application run', async ({
  page,
}) => {
  await page.goto('/sign-in?next=/');
  await page
    .getByRole('button', { name: 'Create Account', exact: true })
    .first()
    .click();
  await page.getByLabel('Name').fill('Alex Morgan');
  await page
    .getByLabel('Email')
    .fill(`alex-${crypto.randomUUID()}@example.test`);
  await page.getByLabel('Password').fill('safe-local-password');
  await page
    .locator('form')
    .getByRole('button', { name: 'Create Account' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Create your workspace' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Create Workspace' }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Construisons votre mémoire professionnelle.',
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Coller le texte de mon CV/ }).click();
  await page
    .getByLabel('Contenu du CV')
    .fill(
      [
        'Alex Morgan',
        'Evidence-backed Product Engineer',
        'Reduced a fictional deployment workflow from 40 to 12 minutes.',
        'Enjoys turning ambiguous requirements into small, operated product slices.',
        'Publishes a monthly reading list for friends and former colleagues.',
      ].join('\n'),
    );
  await page.getByRole('button', { name: 'Relire les informations' }).click();
  await expect(page.getByLabel('Affirmation 2')).toBeEnabled();
  await expect(page.getByLabel('Affirmation 2')).toHaveAttribute(
    'readonly',
    '',
  );
  const excluded = page
    .locator('.import-candidate-list article')
    .filter({ has: page.getByRole('textbox', { name: 'Affirmation 3' }) });
  await excluded.getByRole('checkbox').first().uncheck();
  await page.getByLabel(/Je valide les .* affirmations sélectionnées/).check();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole('button', { name: 'Enregistrer ma mémoire' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Mémoire professionnelle enregistrée dans cet espace.',
  );
  await expect(
    page.getByRole('heading', { name: 'Votre mémoire est prête.' }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page
    .getByRole('button', { name: 'Créer ma première candidature' })
    .click();
  await expect(page.getByLabel('Entreprise', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Poste', { exact: true })).toHaveValue('');
  await page.route('**/api/applications/import-url', async (route) => {
    const input = route.request().postDataJSON() as { url: string };
    const atlas = input.url.includes('atlas');
    const partial = input.url.includes('partial');
    if (input.url.includes('delayed'))
      await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        company: partial
          ? 'Partial Systems'
          : atlas
            ? 'Atlas Health'
            : 'Northstar Labs',
        ...(partial
          ? {}
          : {
              role: atlas ? 'Founding Engineer' : 'Senior Product Engineer',
              description: atlas
                ? 'Build a reliable patient-facing workflow.'
                : 'Build dependable customer-facing workflows with a small product team.',
            }),
        sourceUrl: input.url,
        provenance: {
          requestedUrl: input.url,
          finalUrl: input.url,
          fetchedAt: new Date().toISOString(),
          contentType: 'text/html',
          bytes: 1_024,
          trust: 'untrusted-data',
        },
      }),
    });
  });
  await page
    .getByLabel('URL publique de l’offre')
    .fill('https://jobs.example.com/partial');
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  await expect(page.locator('.import-feedback[role="status"]')).toContainText(
    'Import partiel.',
  );
  await expect(page.getByLabel('Poste', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByLabel('Description du poste')).toHaveAttribute(
    'aria-invalid',
    'true',
  );

  await page
    .getByLabel('URL publique de l’offre')
    .fill('https://jobs.example.com/delayed');
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  await page.getByLabel('Entreprise', { exact: true }).fill('Typed live');
  await page.getByLabel('Poste', { exact: true }).fill('Live role');
  await page
    .getByLabel('Description du poste')
    .fill('Description typed while the import was still loading.');
  await expect(
    page.getByRole('heading', {
      name: 'L’offre contient des informations différentes',
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByLabel('Entreprise', { exact: true })).toHaveValue(
    'Typed live',
  );
  await expect(
    page.getByRole('button', { name: 'Importer', exact: true }),
  ).toBeFocused();

  await page.getByLabel('Entreprise', { exact: true }).fill('');
  await page.getByLabel('Poste', { exact: true }).fill('');
  await page.getByLabel('Description du poste').fill('');
  await page
    .getByLabel('URL publique de l’offre')
    .fill('https://jobs.example.com/northstar');
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  await expect(page.getByLabel('Entreprise', { exact: true })).toHaveValue(
    'Northstar Labs',
  );
  await expect(page.getByLabel('Poste', { exact: true })).toHaveValue(
    'Senior Product Engineer',
  );
  await expect(page.locator('.import-feedback[role="status"]')).toContainText(
    'Offre importée.',
  );

  await page
    .getByLabel('URL publique de l’offre')
    .fill('https://jobs.example.com/atlas');
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: 'L’offre contient des informations différentes',
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Compléter sans remplacer' }).click();
  await expect(page.getByLabel('Entreprise', { exact: true })).toHaveValue(
    'Northstar Labs',
  );
  await page
    .getByLabel('URL publique de l’offre')
    .fill('https://jobs.example.com/northstar');
  await page.reload();
  await openPrimary(page, 'Mémoire pro');
  await expect(page.getByLabel('Positionnement')).toHaveValue(
    'Evidence-backed Product Engineer',
  );
  await openApplications(page);
  await page.getByRole('button', { name: 'Générer la page' }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Analyse de l’offre en cours',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Progression enregistrée' }),
  ).toContainText('Analyse de l’offre');
  await expect(
    page.getByRole('list', { name: 'Progression enregistrée' }),
  ).toContainText('À venir');
  await page.reload();
  await expect(
    page.getByRole('heading', {
      name: 'Analyse de l’offre en cours',
    }),
  ).toBeVisible();
});

test('requires an explicit workspace choice when several are available', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Covered by the desktop flow.');
  await page.context().setExtraHTTPHeaders({
    'x-forwarded-for': '198.51.100.42',
  });
  const email = `multi-${crypto.randomUUID()}@example.test`;
  await page.goto('/sign-in');
  await page
    .getByRole('button', { name: 'Create Account', exact: true })
    .first()
    .click();
  await page.getByLabel('Name').fill('Multi Workspace');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('safe-local-password');
  await page
    .locator('form')
    .getByRole('button', { name: 'Create Account' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Create your workspace' }),
  ).toBeVisible();

  const secondOrganizationId = await page.evaluate(async () => {
    const create = (name: string, slug: string) =>
      fetch('/api/auth/organization/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, slug }),
      }).then((response) => response.json());
    await create('Workspace One', `workspace-one-${crypto.randomUUID()}`);
    const second = await create(
      'Workspace Two',
      `workspace-two-${crypto.randomUUID()}`,
    );
    await fetch('/api/auth/sign-out', { method: 'POST' });
    return second.id as string;
  });

  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('safe-local-password');
  await page.locator('form').getByRole('button', { name: 'Sign In' }).click();
  await expect(
    page.getByRole('heading', { name: 'Choose a workspace' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Use Workspace Two' }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Construisons votre mémoire professionnelle.',
    }),
  ).toBeVisible();
  const activeOrganizationId = await page.evaluate(async () => {
    const session = await fetch('/api/auth/get-session').then((response) =>
      response.json(),
    );
    return session.session.activeOrganizationId as string;
  });
  expect(activeOrganizationId).toBe(secondOrganizationId);
});

test('records a declared claim and exposes provenance progressively', async ({
  page,
}) => {
  await useDemo(page);
  await page.getByRole('button', { name: 'Ouvrir la mémoire pro' }).click();
  await page.getByText('Ajouter une affirmation').click();
  await page.getByLabel('Titre de la source').fill('Synthetic interview notes');
  await page
    .getByLabel('Affirmation', { exact: true })
    .fill('Built a fictional customer feedback loop.');
  await page.getByRole('button', { name: 'Ajouter' }).click();
  await expect(page.getByText('3 affirmations')).toBeVisible();
  await expect(
    page.getByText('Built a fictional customer feedback loop.'),
  ).toBeVisible();
  await expect(page.getByText('Aucune preuve rattachée').last()).toBeVisible();
});

test('fits 375, 768, and 1440 widths without horizontal overflow', async ({
  page,
}) => {
  await useDemo(page);
  await openApplications(page);
  await page.getByRole('button', { name: 'Retour aux candidatures' }).click();
  await expect(
    page.getByRole('heading', { name: 'Candidatures' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Ouvrir la candidature Northstar Labs' })
    .click();
  await page.getByRole('button', { name: 'Générer la page' }).click();
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow, `${width}px viewport`).toBe(false);
  }
});

test('preserves the opportunity and offers retry when evidence does not match', async ({
  page,
}) => {
  await useDemo(page);
  await openApplications(page);
  await page.getByLabel('Poste', { exact: true }).fill('Astrophysicist');
  await page
    .getByLabel('Description du poste')
    .fill('Calibrate telescope optics and model stellar spectra.');
  await page.getByRole('button', { name: 'Générer la page' }).click();
  await expect(page.locator('.inline-error')).toContainText(
    'Aucune preuve ne correspond à ce poste.',
  );
  await expect(page.getByLabel('Poste', { exact: true })).toHaveValue(
    'Astrophysicist',
  );
  await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
});

test('keeps run mechanics in Activity details', async ({ page }) => {
  await useDemo(page);
  await openApplications(page);
  await page.getByRole('button', { name: 'Générer la page' }).click();
  await page.getByRole('button', { name: 'À trancher' }).click();
  await expect(
    page.getByRole('heading', { name: 'Revue avant publication' }),
  ).toBeVisible();
  await expect(page.getByText('Brouillon terminé').first()).toBeVisible();
  const rawLog = page.getByText(/^01 · company-researcher ·/);
  await expect(rawLog).toBeHidden();
  await page.getByText('Métadonnées techniques').first().click();
  await expect(rawLog).toBeVisible();
});
