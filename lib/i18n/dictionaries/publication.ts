import type { MessageDictionary } from '../messages';

export const publicationMessages = {
  'Vérification du lien privé…': 'Checking private link…',
  'Page privée': 'Private page',
  'Ce lien n’est plus actif.': 'This link is no longer active.',
  'Le candidat a révoqué l’accès ou la date d’expiration est passée.':
    'The candidate revoked access or the link has expired.',
  'Aucune information n’est conservée sur cette page.':
    'No information is stored on this page.',
  'Demander un nouvel accès': 'Request new access',
  'Career OS · les pages privées ne sont jamais indexées':
    'Career OS · private pages are never indexed',
  'Lien privé · non indexable': 'Private link · not indexed',
  'Candidature indépendante préparée et validée par':
    'Independent application prepared and approved by',
  Candidature: 'Application',
  'Voir les preuves principales': 'View key evidence',
  Sourcé: 'Sourced',
  Déclaré: 'Declared',
  'Sans source': 'Unsourced',
  preuve: 'evidence item',
  preuves: 'evidence items',
  rattachée: 'attached',
  rattachées: 'attached',
  'aucune preuve indépendante rattachée': 'no independent evidence attached',
  'Extrait partagé volontairement par le candidat. Le document complet n’est pas accessible.':
    'Excerpt voluntarily shared by the candidate. The full document is not accessible.',
  'Liens du candidat': 'Candidate links',
  'Preuves inspectables': 'Inspectable evidence',
  CV: 'Resume',
  LinkedIn: 'LinkedIn',
  GitHub: 'GitHub',
  Portfolio: 'Portfolio',
  'Proposer un échange': 'Start a conversation',
  'Page privée générée avec Career OS. Contenu validé par le candidat.':
    'Private page generated with Career OS. Content approved by the candidate.',
} as const satisfies MessageDictionary;
