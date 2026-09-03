import type { Profile, Review } from '@/lib/schemas';
import type { WorkflowEvent } from '@/lib/workflow';
import type { AllowedUse } from './use-career-workspace';

export function levelLabel(level: Profile['claims'][number]['level']) {
  if (level === 'verified') return 'Vérifiée';
  if (level === 'declared') return 'Déclarée';
  return 'Inférée';
}

export function allowedUseLabel(use: AllowedUse) {
  if (use === 'application') return 'Candidatures';
  if (use === 'resume') return 'CV';
  if (use === 'linkedin') return 'LinkedIn';
  return 'Entretiens';
}

export function reviewerLabel(reviewer: Review['reviewer']) {
  if (reviewer === 'hiring-manager') return 'Pertinence pour le poste';
  if (reviewer === 'factuality') return 'Vérification des preuves';
  return 'Clarté de la candidature';
}

export function sectionLabel(section: string) {
  if (section === 'hero.thesis') return 'Ouverture de la page';
  if (section.startsWith('blocks.evidence')) return 'Preuves détaillées';
  return section ? `Section ${section}` : 'Ancienne revue';
}

export function deliverableLabel(event: WorkflowEvent) {
  if (event.artifact?.includes('research'))
    return 'Analyse de l’offre terminée';
  if (event.artifact?.includes('strategy'))
    return 'Appariement des preuves terminé';
  if (
    event.artifact?.includes('page-spec') ||
    event.artifact?.includes('page_spec')
  )
    return 'Brouillon terminé';
  if (event.artifact?.includes('review')) return 'Revue terminée';
  return 'Run mis à jour';
}
