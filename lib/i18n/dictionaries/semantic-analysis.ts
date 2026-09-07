import type { MessageDictionary } from '../messages';
export const semanticAnalysisMessages = {
  'semantic-analysis.analyze.fit': {
    fr: 'Analyser le matching',
    en: 'Analyze fit',
  },
  'semantic-analysis.analyze': {
    fr: 'Analyser',
    en: 'Analyze',
  },
  'semantic-analysis.close.analysis': {
    fr: 'Fermer l’analyse',
    en: 'Close analysis',
  },
  'semantic-analysis.semantic.job.analysis': {
    fr: 'Analyse sémantique de l’offre',
    en: 'Semantic job analysis',
  },
  'semantic-analysis.explainable.analysis': {
    fr: 'Analyse explicable',
    en: 'Explainable analysis',
  },
  'semantic-analysis.compare.the.job.with.your.memory': {
    fr: 'Comparer l’offre à votre mémoire',
    en: 'Compare the job with your memory',
  },
  'semantic-analysis.choose.a.profile.analysis.never.starts.without.your.action':
    {
      fr: 'Choisissez un profil. L’analyse ne démarre jamais sans votre action.',
      en: 'Choose a profile. Analysis never starts without your action.',
    },
  'semantic-analysis.choose.a.saved.profile': {
    fr: 'Choisir un profil enregistré',
    en: 'Choose a saved profile',
  },
  'semantic-analysis.looking.up': {
    fr: 'Recherche…',
    en: 'Looking up…',
  },
  'semantic-analysis.view.latest.analysis': {
    fr: 'Voir la dernière analyse',
    en: 'View latest analysis',
  },
  'semantic-analysis.analyzing': {
    fr: 'Analyse en cours…',
    en: 'Analyzing…',
  },
  'semantic-analysis.run.analysis': {
    fr: 'Lancer l’analyse',
    en: 'Run analysis',
  },
  'semantic-analysis.create.a.search.profile.first': {
    fr: 'Créez d’abord un profil de recherche.',
    en: 'Create a search profile first.',
  },
  'semantic-analysis.the.profile.constraints.and.preferences.frame.every.analysis':
    {
      fr: 'Les contraintes et préférences du profil cadrent chaque analyse.',
      en: 'The profile constraints and preferences frame every analysis.',
    },
  'semantic-analysis.create.profile': {
    fr: 'Créer un profil',
    en: 'Create profile',
  },
  'semantic-analysis.looking.up.saved.analysis': {
    fr: 'Recherche de l’analyse enregistrée…',
    en: 'Looking up saved analysis…',
  },
  'semantic-analysis.local.analysis.in.progress': {
    fr: 'Analyse locale en cours…',
    en: 'Local analysis in progress…',
  },
  'semantic-analysis.this.step.may.take.a.moment': {
    fr: 'Cette étape peut prendre quelques instants.',
    en: 'This step may take a moment.',
  },
  'semantic-analysis.analysis.stopped.before.the.model': {
    fr: 'Analyse arrêtée avant le modèle',
    en: 'Analysis stopped before the model',
  },
  'semantic-analysis.a.hard.constraint.blocks.the.recommendation': {
    fr: 'Une contrainte dure bloque la recommandation.',
    en: 'A hard constraint blocks the recommendation.',
  },
  'semantic-analysis.no.model.was.called.correct.the.profile.or.job': {
    fr: 'Aucun modèle n’a été appelé. Corrigez le profil ou l’offre si cette qualification est inexacte.',
    en: 'No model was called. Correct the profile or job if this qualification is inaccurate.',
  },
  'semantic-analysis.expected': {
    fr: 'Attendu',
    en: 'Expected',
  },
  'semantic-analysis.observed': {
    fr: 'Observé',
    en: 'Observed',
  },
  'semantic-analysis.not.set': {
    fr: 'Non défini',
    en: 'Not set',
  },
  'semantic-analysis.needs.verification': {
    fr: 'À vérifier',
    en: 'Needs verification',
  },
  'semantic-analysis.saved.result': {
    fr: 'Résultat enregistré',
    en: 'Saved result',
  },
  'semantic-analysis.known.score': {
    fr: 'Score connu',
    en: 'Known score',
  },
  'semantic-analysis.unknown': {
    fr: 'Inconnu',
    en: 'Unknown',
  },
  'semantic-analysis.coverage': {
    fr: 'Couverture',
    en: 'Coverage',
  },
  'semantic-analysis.confidence': {
    fr: 'Confiance',
    en: 'Confidence',
  },
  'semantic-analysis.explanatory.risks': {
    fr: 'Risques explicatifs',
    en: 'Explanatory risks',
  },
  'semantic-analysis.strong.reasons': {
    fr: 'Raisons fortes',
    en: 'Strong reasons',
  },
  'semantic-analysis.transfers': {
    fr: 'Transferts',
    en: 'Transfers',
  },
  'semantic-analysis.real.gaps': {
    fr: 'Gaps réels',
    en: 'Real gaps',
  },
  'semantic-analysis.unknowns': {
    fr: 'Inconnues',
    en: 'Unknowns',
  },
  'semantic-analysis.risks': {
    fr: 'Risques',
    en: 'Risks',
  },
  'semantic-analysis.evidence.references': {
    fr: 'Références de preuve ·',
    en: 'Evidence references ·',
  },
  'semantic-analysis.no.candidate.evidence.linked': {
    fr: 'Aucune preuve candidat liée.',
    en: 'No candidate evidence linked.',
  },
  'semantic-analysis.no.item.in.this.pass': {
    fr: 'Aucun élément dans cette passe.',
    en: 'No item in this pass.',
  },
  'semantic-analysis.no.saved.analysis': {
    fr: 'Aucune analyse enregistrée',
    en: 'No saved analysis',
  },
  'semantic-analysis.no.result.exists.yet.for.this.profile.and.job': {
    fr: 'Aucun résultat n’existe encore pour ce profil et cette offre.',
    en: 'No result exists yet for this profile and job.',
  },
  'semantic-analysis.exact.evidence.unavailable': {
    fr: 'Preuves exactes indisponibles',
    en: 'Exact evidence unavailable',
  },
  'semantic-analysis.the.job.or.memory.does.not.yet.provide.the': {
    fr: 'L’offre ou la mémoire ne fournit pas encore les sources exactes nécessaires.',
    en: 'The job or memory does not yet provide the exact required sources.',
  },
  'semantic-analysis.invalid.model.response': {
    fr: 'Réponse du modèle invalide',
    en: 'Invalid model response',
  },
  'semantic-analysis.the.result.was.rejected.because.it.did.not.satisfy': {
    fr: 'Le résultat a été refusé car il ne respecte pas le contrat de preuve.',
    en: 'The result was rejected because it did not satisfy the evidence contract.',
  },
  'semantic-analysis.local.model.unavailable': {
    fr: 'Modèle local indisponible',
    en: 'Local model unavailable',
  },
  'semantic-analysis.check.the.local.model.configuration.then.run.the.analysis':
    {
      fr: 'Vérifiez la configuration du modèle local, puis relancez cette analyse.',
      en: 'Check the local model configuration, then run the analysis again.',
    },
  'semantic-analysis.analysis.unavailable': {
    fr: 'Analyse indisponible',
    en: 'Analysis unavailable',
  },
  'semantic-analysis.the.request.did.not.complete.you.can.try.again': {
    fr: 'La demande n’a pas abouti. Vous pouvez la relancer.',
    en: 'The request did not complete. You can try again.',
  },
  'semantic-analysis.priority': {
    fr: 'Prioritaire',
    en: 'Priority',
  },
  'semantic-analysis.interesting': {
    fr: 'Intéressante',
    en: 'Interesting',
  },
  'semantic-analysis.exploratory': {
    fr: 'Exploratoire',
    en: 'Exploratory',
  },
  'semantic-analysis.ignore': {
    fr: 'À ignorer',
    en: 'Ignore',
  },
  'semantic-analysis.low': {
    fr: 'Faible',
    en: 'Low',
  },
  'semantic-analysis.medium': {
    fr: 'Moyenne',
    en: 'Medium',
  },
  'semantic-analysis.high': {
    fr: 'Élevée',
    en: 'High',
  },
  'semantic-analysis.strong': {
    fr: 'Fort',
    en: 'Strong',
  },
  'semantic-analysis.partial': {
    fr: 'Partiel',
    en: 'Partial',
  },
  'semantic-analysis.gap': {
    fr: 'Gap',
    en: 'Gap',
  },
  'semantic-analysis.availability': {
    fr: 'Disponibilité',
    en: 'Availability',
  },
  'semantic-analysis.role': {
    fr: 'Rôle',
    en: 'Role',
  },
  'semantic-analysis.seniority': {
    fr: 'Séniorité',
    en: 'Seniority',
  },
  'semantic-analysis.location': {
    fr: 'Localisation',
    en: 'Location',
  },
  'semantic-analysis.work.mode': {
    fr: 'Mode de travail',
    en: 'Work mode',
  },
  'semantic-analysis.time.zone': {
    fr: 'Fuseau horaire',
    en: 'Time zone',
  },
  'semantic-analysis.language': {
    fr: 'Langue',
    en: 'Language',
  },
  'semantic-analysis.contract': {
    fr: 'Contrat',
    en: 'Contract',
  },
  'semantic-analysis.salary': {
    fr: 'Salaire',
    en: 'Salary',
  },
  'semantic-analysis.company': {
    fr: 'Entreprise',
    en: 'Company',
  },
  'semantic-analysis.network': {
    fr: 'Réseau',
    en: 'Network',
  },
  'semantic-analysis.outcome.unknown.title': {
    fr: 'Résultat de l’analyse inconnu',
    en: 'Analysis outcome unknown',
  },
  'semantic-analysis.outcome.unknown.copy': {
    fr: 'La requête a été transmise au modèle, mais aucun résultat fiable n’a pu être enregistré. Une nouvelle tentative identique est bloquée pour éviter une double exécution. Vérifiez le service du modèle ; une nouvelle révision du profil ou des sources permet une nouvelle analyse.',
    en: 'The request reached the model, but no reliable result could be saved. Repeating the same request is blocked to prevent duplicate execution. Check the model service; a new profile or source revision allows a new analysis.',
  },
} as const satisfies MessageDictionary;
