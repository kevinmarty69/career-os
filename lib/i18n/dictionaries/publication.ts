import type { MessageDictionary } from '../messages';
export const publicationMessages = {
  'publication.checking.private.link': {
    fr: 'Vérification du lien privé…',
    en: 'Checking private link…',
  },
  'publication.private.page': {
    fr: 'Page privée',
    en: 'Private page',
  },
  'publication.this.link.is.no.longer.active': {
    fr: 'Ce lien n’est plus actif.',
    en: 'This link is no longer active.',
  },
  'publication.the.candidate.revoked.access.or.the.link.has.expired': {
    fr: 'Le candidat a révoqué l’accès ou la date d’expiration est passée.',
    en: 'The candidate revoked access or the link has expired.',
  },
  'publication.no.information.is.stored.on.this.page': {
    fr: 'Aucune information n’est conservée sur cette page.',
    en: 'No information is stored on this page.',
  },
  'publication.request.new.access': {
    fr: 'Demander un nouvel accès',
    en: 'Request new access',
  },
  'publication.career.os.private.pages.are.never.indexed': {
    fr: 'Career OS · les pages privées ne sont jamais indexées',
    en: 'Career OS · private pages are never indexed',
  },
  'publication.private.link.not.indexed': {
    fr: 'Lien privé · non indexable',
    en: 'Private link · not indexed',
  },
  'publication.independent.application.prepared.and.approved.by': {
    fr: 'Candidature indépendante préparée et validée par',
    en: 'Independent application prepared and approved by',
  },
  'publication.application': {
    fr: 'Candidature',
    en: 'Application',
  },
  'publication.view.key.evidence': {
    fr: 'Voir les preuves principales',
    en: 'View key evidence',
  },
  'publication.sourced': {
    fr: 'Sourcé',
    en: 'Sourced',
  },
  'publication.declared': {
    fr: 'Déclaré',
    en: 'Declared',
  },
  'publication.unsourced': {
    fr: 'Sans source',
    en: 'Unsourced',
  },
  'publication.excerpt.voluntarily.shared.by.the.candidate.the.full.document': {
    fr: 'Extrait partagé volontairement par le candidat. Le document complet n’est pas accessible.',
    en: 'Excerpt voluntarily shared by the candidate. The full document is not accessible.',
  },
  'publication.candidate.links': {
    fr: 'Liens du candidat',
    en: 'Candidate links',
  },
  'publication.inspectable.evidence': {
    fr: 'Preuves inspectables',
    en: 'Inspectable evidence',
  },
  'publication.resume': {
    fr: 'CV',
    en: 'Resume',
  },
  'publication.linkedin': {
    fr: 'LinkedIn',
    en: 'LinkedIn',
  },
  'publication.github': {
    fr: 'GitHub',
    en: 'GitHub',
  },
  'publication.portfolio': {
    fr: 'Portfolio',
    en: 'Portfolio',
  },
  'publication.start.a.conversation': {
    fr: 'Proposer un échange',
    en: 'Start a conversation',
  },
  'publication.private.page.generated.with.career.os.content.approved.by': {
    fr: 'Page privée générée avec Career OS. Contenu validé par le candidat.',
    en: 'Private page generated with Career OS. Content approved by the candidate.',
  },
} as const satisfies MessageDictionary;
