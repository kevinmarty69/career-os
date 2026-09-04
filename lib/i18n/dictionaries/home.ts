import type { MessageDictionary } from '../messages';

export const homeMessages = {
  'Mémoire pro': 'Career memory',
  'Options de la mémoire': 'Career memory options',
  '92 pour cent de la mémoire est sourcée':
    '92 percent of career memory is sourced',
  sourcé: 'sourced',
  'Documents importés': 'Imported documents',
  'Vérifiées par agent': 'Verified by an agent',
  'Sans source': 'Unsourced',
  'Réponses reçues': 'Responses received',
  '6 dernières sem.': 'Last 6 weeks',
  'Réponses reçues sur six semaines': 'Responses received over six weeks',
  'Liens privés actifs': 'Active private links',
  'Tout voir': 'View all',
  '4 vues · expire le 12 oct.': '4 views · expires Oct 12',
  'Jamais ouvert': 'Never opened',
  'Auto-hébergé': 'Self-hosted',
  'Vos preuves ne quittent pas votre instance.':
    'Your evidence never leaves your instance.',
  'Voir la config': 'View configuration',
  'Revue humaine · Nimbus Robotics': 'Human review · Nimbus Robotics',
  'Trois affirmations à trancher avant d’envoyer votre page privée.':
    'Three claims need your decision before you send your private page.',
  'Les agents ont terminé leur passe à 14:03. Un chiffre dépasse ce que votre preuve démontre.':
    'The agents completed their pass at 14:03. One figure exceeds what your evidence supports.',
  'Ouvrir la revue': 'Open review',
  'Voir le journal': 'View activity log',
  'Indicateurs principaux': 'Key metrics',
  '14 actives': '14 active',
  '118 / 128 sourcées': '118 / 128 sourced',
  Affirmations: 'Claims',
  '38 % de réponses': '38% response rate',
  Performance: 'Performance',
  'Décision précédente': 'Previous decision',
  'Décision suivante': 'Next decision',
  'Le chiffre dépasse la preuve': 'The figure exceeds the evidence',
  Ouverture: 'Opening',
  'L’agent a écrit « réduit de': 'The agent wrote “reduced',
  'le temps de build ». Votre post-mortem mesure 11 → 7 minutes, soit environ':
    'build time.” Your post-mortem measures 11 → 7 minutes, which is about',
  Ouvrir: 'Open',
  'Utiliser 11 → 7 min': 'Use 11 → 7 min',
  'Garder ma version': 'Keep my wording',
  'Affirmation sans preuve rattachée': 'Claim without attached evidence',
  '« Divisé les coûts d’infrastructure par deux » · section Preuves détaillées.':
    '“Halved infrastructure costs” · Detailed evidence section.',
  Rattacher: 'Attach evidence',
} as const satisfies MessageDictionary;
