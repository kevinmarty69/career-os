import type { MessageDictionary } from '../messages';

export const memoryOverviewMessages = {
  'memory.overview.copy': {
    fr: 'Chaque affirmation reste reliée à sa source et à ses preuves.',
    en: 'Every claim stays connected to its source and evidence.',
  },
  'memory.overview.import': {
    fr: 'Importer une source',
    en: 'Import a source',
  },
  'memory.overview.graph': { fr: 'Graphe', en: 'Graph' },
  'memory.overview.claims': { fr: 'Affirmations', en: 'Claims' },
  'memory.overview.documents': { fr: 'Documents', en: 'Documents' },
  'memory.overview.skills': { fr: 'Compétences', en: 'Skills' },
  'memory.overview.privacy': { fr: 'Confidentialité', en: 'Privacy' },
  'memory.overview.sources': { fr: 'Sources', en: 'Sources' },
  'memory.overview.evidence': { fr: 'Preuves reliées', en: 'Linked evidence' },
  'memory.overview.no.source': {
    fr: 'Aucune source importée.',
    en: 'No imported source.',
  },
  'memory.overview.no.claim': {
    fr: 'Aucune affirmation dans cette vue.',
    en: 'No claim in this view.',
  },
  'memory.overview.no.evidence': {
    fr: 'Sélectionnez une affirmation pour inspecter ses preuves.',
    en: 'Select a claim to inspect its evidence.',
  },
  'memory.overview.verified': { fr: 'Vérifiée', en: 'Verified' },
  'memory.overview.declared': { fr: 'Déclarée', en: 'Declared' },
  'memory.overview.inferred': { fr: 'Inférée', en: 'Inferred' },
  'memory.overview.unsupported': { fr: 'Sans source', en: 'Unsourced' },
  'memory.overview.private': { fr: 'Privée', en: 'Private' },
  'memory.overview.restricted': { fr: 'Restreinte', en: 'Restricted' },
  'memory.overview.public': { fr: 'Publique', en: 'Public' },
  'memory.overview.open.full.editor': {
    fr: 'Ouvrir l’éditeur complet',
    en: 'Open full editor',
  },
} as const satisfies MessageDictionary;
