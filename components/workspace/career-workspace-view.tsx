'use client';

import Link from 'next/link';
import { reviewGateReady, reviewsComplete } from '@/lib/workspace-state';
import type { useCareerWorkspace } from './use-career-workspace';
import { dossierViews, primaryViews } from './use-career-workspace';
import { OnboardingView } from './onboarding-view';
import { ApplicationsView, HomeView } from './overview-views';
import {
  BriefView,
  CompanyView,
  DraftView,
  EvidenceInspector,
  JourneyView,
  ReviewView,
  RunProgressView,
  ShareView,
} from './application-views';
import {
  ActivityView,
  CareerMemoryView,
  SettingsView,
} from './workspace-admin-views';
import { NavIcon } from './workspace-nav-icon';

export function CareerWorkspaceView({
  controller,
}: {
  controller: ReturnType<typeof useCareerWorkspace>;
}) {
  const {
    activeOrganization,
    activeTenantId,
    acceptImport,
    acceptManualProfile,
    addMemory,
    applyJobImport,
    approveRecruiterStrategy,
    cancelPendingJobImport,
    changeProfile,
    changeOpportunity,
    changeRequiredOpportunityField,
    closeBriefImport,
    closeEvidenceInspector,
    confirmResearchSignals,
    copyLink,
    createApplication,
    currentReviewState,
    decideReviewIssue,
    decisionError,
    decisionMessage,
    decisionPending,
    discardImportReview,
    dossierView,
    exportData,
    generate,
    generateError,
    generating,
    importError,
    importBriefJobPosting,
    importFile,
    importPastedText,
    importReview,
    importing,
    inspectorOpen,
    instanceCheckSuggested,
    instanceStatus,
    instanceStatusError,
    instanceStatusLoading,
    jobImportError,
    jobImportMessage,
    jobImportMissingFields,
    jobImporting,
    manualConfirmed,
    memoryDraft,
    memoryError,
    memoryRevision,
    memorySyncing,
    memorySyncMessage,
    onboardingMode,
    openApplication,
    openApplications,
    openEvidenceInspector,
    openInstanceSettings,
    pasteText,
    pendingJobImport,
    primaryView,
    profileDirty,
    publish,
    publishError,
    publishing,
    refreshInstanceStatus,
    resetLocalCache,
    returnToInstanceError,
    review,
    revoke,
    runPollingErrors,
    saveCareerMemory,
    selectionError,
    selectionPending,
    selectedClaimId,
    session,
    setDossierView,
    setImportError,
    setManualConfirmed,
    setMemoryDraft,
    setOnboardingMode,
    setPasteText,
    setPrimaryView,
    setRunRefreshVersion,
    setShowMemoryHandoff,
    setWorkspace,
    shareMessage,
    shareUrl,
    showMemoryHandoff,
    signOut,
    startRecruiterStrategy,
    startReviews,
    state,
    status,
    totalDecisionCount,
    toggleResearchSignal,
    updateApplicationDossier,
    updateImportReview,
    useDemo,
    workspace,
    workspaceReady,
  } = controller;

  if (!workspaceReady)
    return (
      <main className="workspace-loading" aria-busy="true">
        <span className="brand-mark light" aria-hidden="true">
          C
        </span>
        <p role="status">Chargement de l’espace…</p>
      </main>
    );

  if (workspace.profileOrigin === 'empty')
    return (
      <OnboardingView
        error={importError}
        importing={importing}
        manualConfirmed={manualConfirmed}
        memoryDraft={memoryDraft}
        mode={onboardingMode}
        pasteText={pasteText}
        profile={workspace.profile}
        review={importReview}
        signedIn={Boolean(activeTenantId)}
        onAcceptImport={() => void acceptImport()}
        onAcceptManual={() => void acceptManualProfile()}
        onCancel={() => discardImportReview()}
        onFile={(file) => void importFile(file)}
        onManualConfirmed={setManualConfirmed}
        onMemoryDraftChange={setMemoryDraft}
        onModeChange={(mode) => {
          setImportError('');
          setOnboardingMode(mode);
        }}
        onPasteTextChange={setPasteText}
        onProfileChange={(profile) =>
          setWorkspace((current) => ({ ...current, profile }))
        }
        onReviewChange={updateImportReview}
        onSubmitPaste={() => void importPastedText()}
        onUseDemo={useDemo}
      />
    );

  return (
    <main
      className={`app-shell ${primaryView === 'applications' && dossierView !== 'board' ? 'dossier-mode' : ''}`}
    >
      <a className="skip-link" href="#main-content">
        Aller au contenu
      </a>
      <aside className="sidebar" aria-label="Career OS navigation">
        <div className="tool-rail">
          <button
            className="brand-mark"
            aria-label="Ouvrir les candidatures"
            onClick={() => openApplications()}
            type="button"
          >
            <span aria-hidden="true">C</span>
          </button>
          <nav className="primary-nav" aria-label="Primary">
            {primaryViews.map(([id, label]) => (
              <button
                aria-current={primaryView === id ? 'page' : undefined}
                aria-label={label}
                className={primaryView === id ? 'active' : ''}
                data-label={label}
                key={id}
                onClick={() =>
                  id === 'applications'
                    ? openApplications()
                    : id === 'settings'
                      ? openInstanceSettings()
                      : setPrimaryView(id)
                }
                title={label}
              >
                <NavIcon name={id} />
                <small>
                  {label === 'Candidatures'
                    ? 'Dossiers'
                    : label === 'Mémoire pro'
                      ? 'Mémoire'
                      : label === 'À trancher'
                        ? 'Revue'
                        : label}
                </small>
              </button>
            ))}
          </nav>
          <span className="rail-avatar" aria-hidden="true">
            {session.data?.user.name.charAt(0).toUpperCase() ?? 'K'}
          </span>
        </div>
        <div className="sidebar-panel">
          <div className="brand">
            <span className="brand-mark light" aria-hidden="true">
              C
            </span>
            <span>
              <strong>Career OS</strong>
              <small>
                {activeOrganization.data?.name ?? 'Espace personnel'}
              </small>
            </span>
          </div>
          <p className="sidebar-label">Espace</p>
          <nav className="workspace-nav" aria-label="Espace">
            {primaryViews.map(([id, label]) => (
              <button
                aria-current={primaryView === id ? 'page' : undefined}
                className={primaryView === id ? 'active' : ''}
                key={id}
                onClick={() =>
                  id === 'applications'
                    ? openApplications()
                    : setPrimaryView(id)
                }
              >
                <NavIcon name={id} />
                <span>{label}</span>
                {id === 'activity' && totalDecisionCount ? (
                  <small>{totalDecisionCount}</small>
                ) : null}
              </button>
            ))}
          </nav>
          <p className="sidebar-label">En cours</p>
          <div className="application-list">
            {[...workspace.dossiers]
              .sort((left, right) => right.updatedAt - left.updatedAt)
              .slice(0, 5)
              .map((dossier) => (
                <button
                  aria-current={
                    primaryView === 'applications' &&
                    workspace.selectedDossierId === dossier.id
                      ? 'page'
                      : undefined
                  }
                  className="application-row"
                  key={dossier.id}
                  onClick={() => openApplication(dossier.id)}
                >
                  <span className="company-mark compact" aria-hidden="true">
                    {dossier.opportunity.company.charAt(0) || '+'}
                  </span>
                  <span>
                    <strong>
                      {dossier.opportunity.company || 'Nouvelle offre'}
                    </strong>
                    <small>
                      {dossier.opportunity.role || 'Brief à compléter'}
                    </small>
                  </span>
                </button>
              ))}
            <button className="application-row new" onClick={createApplication}>
              <span className="company-mark compact" aria-hidden="true">
                +
              </span>
              <span>
                <strong>Nouvelle candidature</strong>
                <small>Coller une offre</small>
              </span>
            </button>
          </div>

          <p className="demo-label">
            {activeTenantId
              ? memoryRevision
                ? 'Espace synchronisé'
                : 'Données de départ non enregistrées'
              : workspace.profileOrigin === 'demo'
                ? 'Données de démonstration'
                : 'Stocké dans ce navigateur'}
          </p>
          <section className="hosting-card" aria-label="État de l’instance">
            <strong>Services de l’instance</strong>
            <span>Vérifiez que les workers de traitement répondent.</span>
            <button onClick={openInstanceSettings} type="button">
              Voir la config
            </button>
          </section>
          <div className="account-control">
            {session.isPending ? (
              <small>Vérification du compte…</small>
            ) : session.data ? (
              <>
                <span aria-hidden="true">
                  {session.data.user.name.charAt(0).toUpperCase()}
                </span>
                <div>
                  <strong>{session.data.user.name}</strong>
                  <small>
                    {activeOrganization.data?.name ?? 'Choisir un espace'}
                  </small>
                  <button onClick={() => void signOut()} type="button">
                    Se déconnecter
                  </button>
                </div>
              </>
            ) : (
              <Link href="/sign-in?next=/">Se connecter pour partager</Link>
            )}
          </div>
        </div>
      </aside>

      <section className="shell-content" id="main-content">
        {primaryView !== 'applications' || dossierView === 'board' ? (
          <nav className="mobile-primary-nav" aria-label="Espace sur mobile">
            {primaryViews.map(([id, label]) => (
              <button
                aria-current={primaryView === id ? 'page' : undefined}
                aria-label={label}
                className={primaryView === id ? 'active' : ''}
                key={id}
                onClick={() =>
                  id === 'applications'
                    ? openApplications()
                    : setPrimaryView(id)
                }
                title={label}
              >
                <NavIcon name={id} />
                <small>
                  {label === 'Candidatures'
                    ? 'Dossiers'
                    : label === 'Mémoire pro'
                      ? 'Mémoire'
                      : label === 'À trancher'
                        ? 'Revue'
                        : label}
                </small>
              </button>
            ))}
          </nav>
        ) : null}
        {primaryView === 'home' ? (
          <HomeView
            dossiers={workspace.dossiers}
            profile={workspace.profile}
            onCreateApplication={createApplication}
            onOpenApplication={(dossierId, view) =>
              openApplication(dossierId, view)
            }
            onOpenMemory={() => setPrimaryView('memory')}
          />
        ) : null}
        {primaryView === 'applications' && dossierView === 'board' ? (
          <ApplicationsView
            dossiers={workspace.dossiers}
            profile={workspace.profile}
            onCreate={createApplication}
            onOpen={(dossierId, view) => openApplication(dossierId, view)}
          />
        ) : null}
        {primaryView === 'applications' &&
        dossierView !== 'board' &&
        workspace.selectedDossierId ? (
          <>
            <header className="application-topbar">
              <button
                aria-label="Retour aux candidatures"
                className="round-action quiet"
                onClick={() => openApplications('board')}
                type="button"
              >
                ←
              </button>
              <div className="object-identity">
                <span className="company-mark" aria-hidden="true">
                  {state.opportunity.company.charAt(0)}
                </span>
                <div>
                  <p>
                    {state.opportunity.company} · {state.opportunity.role}
                  </p>
                  <h1>Parcours de candidature</h1>
                </div>
              </div>
              <nav className="dossier-tabs" aria-label="Vues de la candidature">
                {dossierViews.map(([id, label]) => (
                  <button
                    aria-current={
                      dossierView === id ||
                      (dossierView === 'review' && id === 'journey')
                        ? 'page'
                        : undefined
                    }
                    className={
                      dossierView === id ||
                      (dossierView === 'review' && id === 'journey')
                        ? 'active'
                        : ''
                    }
                    disabled={
                      (id === 'draft' && !state.spec) ||
                      (id === 'share' && !state.approved && !state.capability)
                    }
                    key={id}
                    onClick={() => setDossierView(id)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <div className="status-block">
                {state.spec ? (
                  <button
                    className="round-action inspector-toggle quiet"
                    aria-label="Voir les preuves"
                    aria-controls="evidence-inspector"
                    aria-expanded={inspectorOpen}
                    onClick={() => openEvidenceInspector()}
                  >
                    ⌕
                  </button>
                ) : null}
                {state.approved ? (
                  <button onClick={() => setDossierView('share')}>
                    Valider et publier
                  </button>
                ) : (
                  <span className="application-status" role="status">
                    {status}
                  </span>
                )}
              </div>
            </header>
            <div className="application-layout">
              <div className="document-area">
                {dossierView === 'brief' ? (
                  <BriefView
                    key={state.id}
                    canImportUrl={Boolean(activeTenantId)}
                    error={generateError}
                    generating={generating}
                    hasDraft={Boolean(state.spec)}
                    importError={jobImportError}
                    importMessage={jobImportMessage}
                    importing={jobImporting}
                    instanceCheckSuggested={instanceCheckSuggested}
                    locked={
                      Boolean(state.runId) &&
                      !state.spec &&
                      state.runStatus === 'running'
                    }
                    missingFields={jobImportMissingFields}
                    opportunity={state.opportunity}
                    pendingImport={pendingJobImport}
                    onApplyImport={applyJobImport}
                    onCancelPendingImport={cancelPendingJobImport}
                    onGenerate={generate}
                    onImport={importBriefJobPosting}
                    onImportClose={closeBriefImport}
                    onCheckInstance={openInstanceSettings}
                    onOpportunityChange={changeOpportunity}
                    onRequiredFieldChange={changeRequiredOpportunityField}
                  />
                ) : null}
                {dossierView === 'company' ? (
                  <CompanyView opportunity={state.opportunity} />
                ) : null}
                {dossierView === 'journey' ? (
                  state.runId && !state.spec ? (
                    <RunProgressView
                      dossier={state}
                      pollingError={runPollingErrors[state.id]}
                      onBack={() => openApplications('board')}
                      onOpenBrief={() => setDossierView('brief')}
                      onRefresh={() =>
                        setRunRefreshVersion((current) => current + 1)
                      }
                      onRetry={() => void generate(true)}
                      selectionError={selectionError}
                      selectionPending={selectionPending}
                      onConfirmResearch={() => void confirmResearchSignals()}
                      onStartStrategy={() => void startRecruiterStrategy()}
                      onApproveStrategy={() => void approveRecruiterStrategy()}
                      onToggleSignal={toggleResearchSignal}
                      onOpenEvidence={openEvidenceInspector}
                    />
                  ) : (
                    <JourneyView
                      approved={state.approved}
                      opportunity={state.opportunity}
                      profile={state.runProfile ?? workspace.profile}
                      pollingError={runPollingErrors[state.id] ?? ''}
                      workerAvailability={state.workerAvailability}
                      retryError={generateError}
                      retryPending={generating}
                      reviewState={currentReviewState}
                      reviews={state.reviews}
                      spec={state.spec}
                      onGenerate={generate}
                      onOpenBrief={() => setDossierView('brief')}
                      onOpenDraft={() => setDossierView('draft')}
                      onOpenEvidence={openEvidenceInspector}
                      onRefresh={() =>
                        setRunRefreshVersion((current) => current + 1)
                      }
                      onRetry={() => void generate(true)}
                      onReview={() => {
                        if (!state.runId) review();
                        setDossierView('review');
                      }}
                    />
                  )
                ) : null}
                {dossierView === 'draft' && state.spec ? (
                  <DraftView
                    profile={state.runProfile ?? workspace.profile}
                    reviewError={selectionError}
                    reviewPending={selectionPending}
                    retryError={generateError}
                    retryPending={generating}
                    reviewsAvailable={reviewsComplete(state.reviews)}
                    reviewState={currentReviewState}
                    spec={state.spec}
                    workerAvailability={state.workerAvailability}
                    onOpenEvidence={openEvidenceInspector}
                    onOpenReview={() => setDossierView('review')}
                    onRefresh={() =>
                      setRunRefreshVersion((current) => current + 1)
                    }
                    onRetry={() => void generate(true)}
                    onStartReviews={() => void startReviews()}
                  />
                ) : null}
                {dossierView === 'review' && state.spec ? (
                  <ReviewView
                    approved={state.approved}
                    paused={state.paused}
                    reviews={state.reviews}
                    decisions={state.reviewDecisions}
                    decisionError={decisionError}
                    decisionMessage={decisionMessage}
                    decisionPending={decisionPending}
                    publicationEligible={reviewGateReady(state)}
                    canRerun={!state.runId}
                    onApprove={(approved) =>
                      updateApplicationDossier(state.id, (current) => ({
                        ...current,
                        approved,
                      }))
                    }
                    onContinue={() => setDossierView('share')}
                    onReturnToBrief={() => setDossierView('brief')}
                    onDecide={(review, issueIndex, decision) =>
                      void decideReviewIssue(review, issueIndex, decision)
                    }
                    onReview={review}
                  />
                ) : null}
                {dossierView === 'share' && (state.spec || state.capability) ? (
                  <ShareView
                    canPublish={
                      memoryRevision > 0 &&
                      Boolean(state.runId) &&
                      state.approved &&
                      reviewGateReady(state)
                    }
                    error={publishError}
                    publishing={publishing}
                    shareMessage={shareMessage}
                    shareUrl={shareUrl}
                    publicationExists={Boolean(state.capability)}
                    hasPersistedRun={Boolean(state.runId)}
                    signedIn={Boolean(
                      session.data?.session.activeOrganizationId,
                    )}
                    onCopy={copyLink}
                    onPublish={publish}
                    onRevoke={revoke}
                  />
                ) : null}
              </div>
              {state.spec || inspectorOpen ? (
                <EvidenceInspector
                  open={inspectorOpen}
                  profile={state.runProfile ?? workspace.profile}
                  selectedClaimId={selectedClaimId}
                  spec={state.spec}
                  onClose={closeEvidenceInspector}
                />
              ) : dossierView === 'brief' ? (
                <aside className="brief-context" aria-label="Prochaine étape">
                  <p className="section-label">Prochaine action</p>
                  <h2>Générer la première page</h2>
                  <p>
                    Seules les affirmations appuyées par une preuve admissible
                    peuvent apparaître dans la page.
                  </p>
                </aside>
              ) : null}
            </div>
          </>
        ) : null}

        {primaryView === 'memory' ? (
          <CareerMemoryView
            error={memoryError}
            memoryDraft={memoryDraft}
            dirty={profileDirty}
            signedIn={Boolean(activeTenantId)}
            syncing={memorySyncing}
            syncMessage={memorySyncMessage}
            showHandoff={showMemoryHandoff}
            profile={workspace.profile}
            onAdd={addMemory}
            onDraftChange={setMemoryDraft}
            onSave={() => void saveCareerMemory()}
            onCreateApplication={() => {
              setShowMemoryHandoff(false);
              createApplication();
            }}
            onDismissHandoff={() => setShowMemoryHandoff(false)}
            onProfileChange={changeProfile}
          />
        ) : null}
        {primaryView === 'activity' ? (
          <ActivityView
            dossiers={workspace.dossiers}
            onOpenReview={(dossierId) => openApplication(dossierId, 'review')}
          />
        ) : null}
        {primaryView === 'settings' ? (
          <SettingsView
            instanceStatus={instanceStatus}
            onReturnToApplication={
              instanceCheckSuggested ? returnToInstanceError : undefined
            }
            signedIn={Boolean(activeTenantId)}
            onExport={exportData}
            onRefreshStatus={refreshInstanceStatus}
            onReset={resetLocalCache}
            statusError={instanceStatusError}
            statusLoading={instanceStatusLoading}
          />
        ) : null}
      </section>
    </main>
  );
}
