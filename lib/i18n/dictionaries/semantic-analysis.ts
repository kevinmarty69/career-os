import type { MessageDictionary } from '../messages';

export const semanticAnalysisMessages = {
  'Analyser le matching': 'Analyze fit',
  Analyser: 'Analyze',
  'Fermer l’analyse': 'Close analysis',
  'Analyse sémantique de l’offre': 'Semantic job analysis',
  'Analyse explicable': 'Explainable analysis',
  'Comparer l’offre à votre mémoire': 'Compare the job with your memory',
  'Choisissez un profil. L’analyse ne démarre jamais sans votre action.':
    'Choose a profile. Analysis never starts without your action.',
  'Choisir un profil enregistré': 'Choose a saved profile',
  'Recherche…': 'Looking up…',
  'Voir la dernière analyse': 'View latest analysis',
  'Analyse en cours…': 'Analyzing…',
  'Lancer l’analyse': 'Run analysis',
  'Créez d’abord un profil de recherche.': 'Create a search profile first.',
  'Les contraintes et préférences du profil cadrent chaque analyse.':
    'The profile constraints and preferences frame every analysis.',
  'Créer un profil': 'Create profile',
  'Recherche de l’analyse enregistrée…': 'Looking up saved analysis…',
  'Analyse locale en cours…': 'Local analysis in progress…',
  'Cette étape peut prendre quelques instants.': 'This step may take a moment.',
  Réessayer: 'Try again',
  'Analyse arrêtée avant le modèle': 'Analysis stopped before the model',
  'Une contrainte dure bloque la recommandation.':
    'A hard constraint blocks the recommendation.',
  'Aucun modèle n’a été appelé. Corrigez le profil ou l’offre si cette qualification est inexacte.':
    'No model was called. Correct the profile or job if this qualification is inaccurate.',
  Attendu: 'Expected',
  Observé: 'Observed',
  'Non défini': 'Not set',
  'À vérifier': 'Needs verification',
  'Résultat enregistré': 'Saved result',
  'Score connu': 'Known score',
  Inconnu: 'Unknown',
  Couverture: 'Coverage',
  Confiance: 'Confidence',
  'Risques explicatifs': 'Explanatory risks',
  'Raisons fortes': 'Strong reasons',
  Transferts: 'Transfers',
  'Gaps réels': 'Real gaps',
  Inconnues: 'Unknowns',
  Risques: 'Risks',
  Offre: 'Job',
  'profil de recherche': 'search profile',
  mémoire: 'memory',
  'Références de preuve ·': 'Evidence references ·',
  'Aucune preuve candidat liée.': 'No candidate evidence linked.',
  'Aucun élément dans cette passe.': 'No item in this pass.',
  'Aucune analyse enregistrée': 'No saved analysis',
  'Aucun résultat n’existe encore pour ce profil et cette offre.':
    'No result exists yet for this profile and job.',
  'Preuves exactes indisponibles': 'Exact evidence unavailable',
  'L’offre ou la mémoire ne fournit pas encore les sources exactes nécessaires.':
    'The job or memory does not yet provide the exact required sources.',
  'Réponse du modèle invalide': 'Invalid model response',
  'Le résultat a été refusé car il ne respecte pas le contrat de preuve.':
    'The result was rejected because it did not satisfy the evidence contract.',
  'Modèle local indisponible': 'Local model unavailable',
  'Vérifiez la configuration du modèle local, puis relancez cette analyse.':
    'Check the local model configuration, then run the analysis again.',
  'Analyse indisponible': 'Analysis unavailable',
  'La demande n’a pas abouti. Vous pouvez la relancer.':
    'The request did not complete. You can try again.',
  Prioritaire: 'Priority',
  Intéressante: 'Interesting',
  Exploratoire: 'Exploratory',
  'À ignorer': 'Ignore',
  Faible: 'Low',
  Moyenne: 'Medium',
  Élevée: 'High',
  Fort: 'Strong',
  Partiel: 'Partial',
  Gap: 'Gap',
  Disponibilité: 'Availability',
  Rôle: 'Role',
  Séniorité: 'Seniority',
  Localisation: 'Location',
  'Mode de travail': 'Work mode',
  'Fuseau horaire': 'Time zone',
  Langue: 'Language',
  Contrat: 'Contract',
  Salaire: 'Salary',
  Entreprise: 'Company',
  Réseau: 'Network',
  'Cette offre est explicitement fermée.': 'This job is explicitly closed.',
  'Aucune séniorité structurée n’est disponible dans cette offre.':
    'No structured seniority is available in this job.',
  'Aucun fuseau horaire structuré n’est disponible dans cette offre.':
    'No structured time zone is available in this job.',
  'Aucune langue structurée n’est disponible dans cette offre.':
    'No structured language is available in this job.',
  'Aucun réseau d’entreprise structuré n’est disponible.':
    'No structured company network is available.',
  'Le format de travail publié ne permet pas de conclure sur la forme juridique du contrat.':
    'The published work format does not establish the legal contract type.',
  'Aucun minimum salarial n’est défini dans ce profil de recherche.':
    'No minimum salary is set in this search profile.',
  'Le salaire annuel comparable est absent ou sa période est inconnue.':
    'Comparable annual salary is missing or its period is unknown.',
  'La fourchette traverse le minimum demandé : le résultat doit être vérifié.':
    'The range crosses the requested minimum, so the result needs verification.',
  'Le mode de travail ne respecte pas les contraintes dures.':
    'The work mode does not satisfy the hard constraints.',
} as const satisfies MessageDictionary;
