import type { MessageDictionary } from '../messages';

export const dossierMessages = {
  Brief: 'Brief',
  Entreprise: 'Company',
  'Exigences ↔ preuves': 'Requirements ↔ evidence',
  Stratégie: 'Strategy',
  Livrables: 'Deliverables',
  Contacts: 'Contacts',
  Versions: 'Versions',
  'Toutes les candidatures': 'All applications',
  Candidature: 'Application',
  'Chargement…': 'Loading…',
  'Chargement de la candidature…': 'Loading application…',
  'Connectez-vous pour ouvrir ce dossier.': 'Sign in to open this application.',
  'Cette candidature est introuvable.': 'This application could not be found.',
  'Impossible de charger cette candidature.':
    'Unable to load this application.',
  'Candidature réelle · données persistées':
    'Real application · persisted data',
  Étape: 'Stage',
  Révision: 'Revision',
  'Dernière mise à jour': 'Last updated',
  'Ouvrir la source': 'Open original job',
  'Aucune URL source enregistrée.': 'No source URL saved.',
  'Le dossier est prêt pour la recherche entreprise et le workflow agentique.':
    'This application is ready for company research and the agent workflow.',
  'Démarrage du workflow…': 'Starting workflow…',
  'Démarrer le workflow agentique': 'Start agent workflow',
  'Workflow agentique': 'Agent workflow',
  'Identité visuelle de la page privée': 'Private page visual identity',
  'Le logo et la couleur accompagnent cette candidature sans imiter le site de l’entreprise.':
    'The logo and color personalize this application without imitating the company website.',
  'Identité figée dans le snapshot de ce run.':
    'Identity locked in this run snapshot.',
  'Logo de l’entreprise': 'Company logo',
  'Couleur principale accessible': 'Accessible primary color',
  'Enregistrer l’identité': 'Save identity',
  'Identité enregistrée pour le prochain run.':
    'Identity saved for the next run.',
  'L’identité n’a pas été enregistrée. Vérifiez l’URL et réessayez.':
    'Identity could not be saved. Check the URL and try again.',
  'Recherche d’un run existant…': 'Looking for an existing run…',
  'Statut du run': 'Run status',
  'Étape active': 'Active stage',
  'Événements persistés': 'Persisted events',
  Progression: 'Progress',
  'Journal lisible': 'Readable log',
  'Le premier événement apparaîtra ici.': 'The first event will appear here.',
  'Décision humaine requise': 'Human decision required',
  'Quels signaux doivent cadrer la candidature ?':
    'Which signals should shape this application?',
  'L’agent a extrait ces éléments. Vérifiez-les avant qu’ils influencent la sélection des preuves et la stratégie.':
    'The agent extracted these signals. Review them before they influence evidence selection and strategy.',
  'Données web non fiables jusqu’à votre validation.':
    'Web data remains untrusted until you approve it.',
  'La validation n’a pas été enregistrée. Vos choix sont conservés.':
    'The decision was not saved. Your choices are preserved.',
  'Preuves candidates': 'Candidate evidence',
  'Ce que votre parcours démontre pour ce poste':
    'What your experience demonstrates for this role',
  'Le matching est limité aux affirmations autorisées pour une candidature. Vérifiez la sélection avant de lancer la stratégie.':
    'Matching is limited to claims authorized for applications. Review the selection before starting strategy.',
  'Aucune preuve éligible trouvée. Cet écart restera visible.':
    'No eligible evidence found. This gap will remain visible.',
  'La stratégie n’a pas démarré. Vous pouvez réessayer sans risque de doublon.':
    'Strategy did not start. You can retry without creating a duplicate.',
  'Vos faits restent inchangés. Seul leur ordre sera proposé.':
    'Your facts stay unchanged. Only their ordering will be proposed.',
  'Direction éditoriale interne': 'Internal editorial direction',
  'Validez l’angle avant la rédaction': 'Approve the angle before drafting',
  'Cet angle guide la future page. Il ne crée aucun nouveau fait et reste ancré aux preuves ci-dessous.':
    'This angle guides the future page. It creates no new facts and remains anchored to the evidence below.',
  'Preuve principale': 'Lead evidence',
  Appui: 'Supporting evidence',
  'Sujets à traiter honnêtement': 'Topics to address honestly',
  'La validation n’a pas été enregistrée. Vous pouvez réessayer sans risque de doublon.':
    'Approval was not saved. You can retry without creating a duplicate.',
  'La rédaction ne démarrera qu’après votre décision.':
    'Drafting will only start after your decision.',
  'Page structurée': 'Structured page',
  'Relisez le brouillon avant les reviews':
    'Review the draft before the checks',
  'Les trois reviewers vérifieront maintenant la lisibilité recruteur, la pertinence hiring manager et chaque affirmation factuelle.':
    'Three reviewers will now check recruiter readability, hiring-manager relevance, and every factual claim.',
  'Les reviews n’ont pas démarré. Vous pouvez réessayer sans créer de doublon.':
    'Reviews did not start. You can retry without creating a duplicate.',
  'La publication reste bloquée pendant les contrôles.':
    'Publishing remains blocked during the checks.',
  'Contrôles indépendants': 'Independent checks',
  'Trois regards avant publication': 'Three perspectives before publishing',
  'Chaque objection reste visible avec son auteur. Une correction crée une nouvelle version ciblée ; garder une formulation reste votre décision.':
    'Every objection remains visible with its author. A correction creates a targeted new version; keeping wording remains your decision.',
  Bloquante: 'Blocking',
  Suggestion: 'Suggestion',
  'Conservée par vous': 'Kept by you',
  'Correction lancée': 'Correction started',
  'Garder tel quel': 'Keep as written',
  'Corriger cette section': 'Correct this section',
  'Aucune objection.': 'No objections.',
  'La décision n’a pas été enregistrée. Vous pouvez réessayer sans risque de doublon.':
    'The decision was not saved. You can retry without creating a duplicate.',
  'Tous les contrôles sont résolus. Prêt pour votre validation finale.':
    'All checks are resolved. Ready for your final approval.',
  'La publication reste bloquée tant qu’une décision manque.':
    'Publishing remains blocked while a decision is missing.',
  'Validation humaine finale': 'Final human approval',
  'Le lien privé est prêt': 'The private link is ready',
  'Préparer une nouvelle version': 'Prepare a new version',
  'Le lien privé a été révoqué': 'The private link has been revoked',
  'Publiez uniquement ce que vous avez validé':
    'Publish only what you approved',
  Publié: 'Published',
  Révoqué: 'Revoked',
  'Non publié': 'Unpublished',
  'Le snapshot est immuable, non indexable et accessible pendant sept jours. Vous pouvez couper l’accès immédiatement.':
    'The snapshot is immutable, non-indexable, and available for seven days. You can revoke access immediately.',
  Ouvrir: 'Open',
  'Révoquer le lien': 'Revoke link',
  'Révocation…': 'Revoking…',
  'L’accès est coupé immédiatement, y compris pour un onglet déjà ouvert.':
    'Access is revoked immediately, including in a tab that is already open.',
  'Les trois reviews sont résolues. Cette action fige la page actuelle dans un snapshot privé ; aucune modification ultérieure de votre mémoire ne changera ce qui est partagé.':
    'All three reviews are resolved. This action freezes the current page in a private snapshot; later changes to your Career Memory will not alter what is shared.',
  'Snapshot immuable': 'Immutable snapshot',
  'Expiration automatique sous sept jours':
    'Automatic expiration after seven days',
  'Révocation immédiate': 'Immediate revocation',
  'Aucun lien n’est créé sans cette action.':
    'No link is created without this action.',
  'Création du lien…': 'Creating link…',
  'Valider et créer le lien privé': 'Approve and create private link',
  'L’action n’a pas abouti. Vérifiez votre session puis réessayez.':
    'The action failed. Check your session and try again.',
  'Aucun run. Le bouton démarre une exécution bornée et persistée à partir de cette candidature et de votre mémoire.':
    'No run yet. The button starts a bounded, persisted workflow from this application and your Career Memory.',
  'Compléter la mémoire professionnelle': 'Complete Career Memory',
  'Connectez-vous pour lancer ce workflow.': 'Sign in to start this workflow.',
  'Enregistrez d’abord votre mémoire professionnelle.':
    'Save your Career Memory before starting.',
  'La candidature ou la mémoire a changé. Rechargez ce dossier.':
    'The application or Career Memory changed. Reload this page.',
  'La limite de runs est atteinte. Réessayez dans une minute.':
    'The run limit has been reached. Try again in one minute.',
  'Le worker de recherche est indisponible. Vérifiez votre instance.':
    'The research worker is unavailable. Check your instance.',
  'Le workflow est momentanément indisponible.':
    'The workflow is temporarily unavailable.',
  'Historique de la page privée': 'Private page history',
  'Dossier de candidature': 'Application workspace',
  'À valider': 'Needs review',
  'Relancer les agents': 'Rerun agents',
  'Vue d’ensemble': 'Overview',
  'Offre d’origine': 'Original job',
  'Recherche entreprise': 'Company research',
  Runs: 'Runs',
  'Angle retenu': 'Selected angle',
  'agent stratégie · 14:02': 'strategy agent · 14:02',
  'L’opérabilité par une petite équipe, pas la performance brute.':
    'Operability for a small team, not raw performance.',
  'Nimbus a levé en juin et recrute quatre personnes sur Fleet Platform. On mène avec Corvid : outillage écrit puis transmis, pas une prouesse solo.':
    'Nimbus raised funding in June and is hiring four people for Fleet Platform. Lead with Corvid: tooling built and handed over, not a solo feat.',
  '6 sources consultées · 3 signaux de recrutement':
    '6 sources reviewed · 3 hiring signals',
  'Voir les 12': 'View all 12',
  Couvert: 'Covered',
  'Fiabilité du déploiement à grande échelle': 'Reliable deployment at scale',
  'Exigence critique · 2 preuves vérifiées':
    'Critical requirement · 2 verified evidence items',
  'Outillage pour équipes internes': 'Internal team tooling',
  'Exigence critique · 3 preuves vérifiées':
    'Critical requirement · 3 verified evidence items',
  Partiel: 'Partial',
  'Expérience robotique / ROS2': 'Robotics / ROS2 experience',
  'Secondaire · 1 preuve open source':
    'Secondary · 1 open-source evidence item',
  'Management d’une équipe de 5+': 'Managing a team of 5+',
  'Exigence critique · aucune preuve': 'Critical requirement · no evidence',
  'Publication bloquée': 'Publication blocked',
  '1 affirmation sans preuve · 3 modifications à trancher.':
    '1 unsupported claim · 3 changes need review.',
  'Page privée v4 · 4 sections': 'Private page v4 · 4 sections',
  'CV adapté · 1 page': 'Tailored resume · 1 page',
  'Email de candidature': 'Application email',
  'Message LinkedIn': 'LinkedIn message',
  'Avant envoi': 'Before sending',
  'Offre confirmée': 'Job confirmed',
  'Entreprise documentée': 'Company researched',
  'CV adapté relu': 'Tailored resume reviewed',
  'Trancher 3 modifications': 'Review 3 changes',
  'Créer le lien privé': 'Create private link',
  'Fathom · Berlin / remote · importée il y a 48 s':
    'Fathom · Berlin / remote · imported 48s ago',
  'Analyse en cours': 'Analysis in progress',
  'Voir l’offre d’origine': 'View original job',
  'Annuler le run': 'Cancel run',
  'Progression du run': 'Run progress',
  '≈ 50 s restantes': '≈ 50s remaining',
  'Offre récupérée et nettoyée': 'Job fetched and cleaned',
  '1 648 mots': '1,648 words',
  '14 exigences identifiées': '14 requirements identified',
  '5 critiques': '5 critical',
  '4 sources lues': '4 sources reviewed',
  'Appariement des preuves': 'Evidence matching',
  'Rédaction des livrables': 'Deliverable drafting',
  'Vérification factuelle': 'Factual review',
  'Déjà lisible': 'Already available',
  'confirmé pendant que ça tourne': 'confirmed while the run continues',
  'Exigences critiques': 'Critical requirements',
  'Kubernetes multi-cluster': 'Multi-cluster Kubernetes',
  'Observabilité end-to-end': 'End-to-end observability',
  'Réduction du coût cloud': 'Cloud cost reduction',
  'Astreinte partagée': 'Shared on-call',
  'Go ou Rust en production': 'Go or Rust in production',
  'À confirmer par vous': 'For you to confirm',
  'Fourchette 90–110 k€ détectée': '€90–110k range detected',
  Garder: 'Keep',
  'Contrat CDI plein temps': 'Full-time permanent contract',
  'Remote 100 % ambigu': '100% remote is ambiguous',
  Préciser: 'Clarify',
  'Vous pouvez déjà faire le tri en amont : les agents en tiendront compte à l’étape de rédaction.':
    'You can already refine the input; agents will use your decisions during drafting.',
  Cadrer: 'Refine',
  'Ce que l’agent a trouvé': 'What the agent found',
  'Série A de 18 M€ en mars 2026': '€18m Series A in March 2026',
  'Équipe technique de 23 personnes': 'Engineering team of 23',
  'Blog d’ingénierie : migration Go en cours':
    'Engineering blog: Go migration in progress',
  'Recherche des signaux de recrutement…': 'Searching for hiring signals…',
  'Prédiction d’adéquation': 'Fit estimate',
  'estimation provisoire': 'provisional estimate',
  'Basée sur les exigences seules. L’appariement des preuves n’a pas encore tourné.':
    'Based on requirements only. Evidence matching has not run yet.',
  'Vous prévenir': 'Notify you',
  'Une notification quand la revue est prête à être tranchée.':
    'Notify me when the review is ready for a decision.',
  'Email + notification navigateur': 'Email + browser notification',
  'Ouvrir une autre candidature': 'Open another application',
  'Le run continue en arrière-plan.': 'The run continues in the background.',
  'En attente de l’humain': 'Waiting for your decision',
  'Lecture de l’offre': 'Job analysis',
  'Composition des livrables': 'Deliverable composition',
  'Revue factuelle': 'Factual review',
  'Revue confidentialité': 'Privacy review',
  '3 problèmes · 1 bloquant': '3 issues · 1 blocking',
  'étape enregistrée': 'step saved',
  'Durée totale': 'Total duration',
  Coût: 'Cost',
  '3 modifications proposées': '3 suggested changes',
  '1 bloque la publication': '1 blocks publication',
  'Accepter les 2 sûres': 'Accept the 2 safe changes',
  'Tout refuser': 'Reject all',
  'Chiffre non soutenu par la preuve': 'Figure not supported by evidence',
  'page privée · Ouverture · claim #12': 'private page · Opening · claim #12',
  'Texte actuel': 'Current wording',
  'J’ai réduit de 42 % le temps de build sur un monorepo de 340 services.':
    'I reduced build time by 42% across a 340-service monorepo.',
  'Proposition sourcée': 'Evidence-backed wording',
  'Revue avant publication': 'Pre-publication review',
  'Version actuelle': 'Current wording',
  'J’ai ramené le temps de build de 11 à 7 minutes (p50) sur un monorepo de 340 services.':
    'I brought build time down from 11 to 7 minutes (p50) across a 340-service monorepo.',
  '« build p50 : 11m → 7m » · importé le 12/03/2024':
    '“build p50: 11m → 7m” · imported Mar 12, 2024',
  Accepter: 'Accept',
  Éditer: 'Edit',
  Ignorer: 'Ignore',
  Inspecter: 'Inspect',
  Refuser: 'Reject',
  Reformulation: 'Rewording',
  'Non sourcée': 'Unsupported',
  '« passionné par la robotique » → « trois ans sur des systèmes temps réel embarqués ».':
    '“passionate about robotics” → “three years working on embedded real-time systems.”',
  '« Divisé les coûts d’infrastructure par deux » — retirer ou rattacher un document.':
    '“Halved infrastructure costs” — remove it or attach a document.',
  'La publication reste bloquée': 'Publication remains blocked',
  'Career OS ne crée aucun lien avant votre validation explicite.':
    'Career OS creates no link without your explicit approval.',
  'Valider et créer le lien': 'Approve and create link',
  'Brouillon v4 · non publiée': 'Draft v4 · unpublished',
  'Preuves détaillées': 'Detailed evidence',
  'Pourquoi Nimbus': 'Why Nimbus',
  '30/60/90 jours': '30/60/90 days',
  '1 affirmation': '1 claim',
  '2 affirmations': '2 claims',
  '3 affirmations': '3 claims',
  '6 affirmations': '6 claims',
  Sourcées: 'Sourced',
  'Temps de lecture': 'Reading time',
  'Pour Nimbus Robotics · équipe Fleet Platform':
    'For Nimbus Robotics · Fleet Platform team',
  'Faire tenir une flotte de 12 000 robots sur une plateforme opérable par trois personnes.':
    'Keep a fleet of 12,000 robots running on a platform three people can operate.',
  'Votre annonce insiste sur la fiabilité du déploiement à grande échelle et sur une équipe volontairement petite. C’est le problème que j’ai porté chez Corvid pendant trois ans.':
    'Your job description emphasizes reliable deployment at scale and an intentionally small team. That is the problem I owned at Corvid for three years.',
  'Le chiffre dépasse la preuve rattachée.':
    'The figure exceeds the attached evidence.',
  'Le point commun avec Fleet Platform : la contrainte n’était pas la technique mais la charge cognitive des équipes clientes. J’ai écrit l’outillage, formé l’équipe SRE, puis je l’ai retiré de mes mains.':
    'The common thread with Fleet Platform: the constraint was not the technology but the cognitive load on customer teams. I built the tooling, trained the SRE team, then handed it over.',
  'Ajouter un paragraphe': 'Add paragraph',
  'Affirmation sélectionnée': 'Selected claim',
  'Remplacer par « 11 → 7 min »': 'Replace with “11 → 7 min”',
  'Rattacher une autre preuve': 'Attach different evidence',
  'Retirer la phrase': 'Remove sentence',
  'Autoriser l’inspection des preuves': 'Allow evidence inspection',
  Actions: 'Actions',
  'confiance 0,41': 'confidence 0.41',
  '« réduit de 42 % le temps de build »': '“reduced build time by 42%”',
  '« build p50 : 11 min → 7 min, sur 7 mois »':
    '“build p50: 11 min → 7 min, over 7 months”',
  'J’ai réduit de 42 % le temps de build sur un monorepo de 340 services, et ramené le déploiement d’un cycle hebdomadaire à quatre fois par jour.':
    'I reduced build time by 42% across a 340-service monorepo and moved deployment from a weekly cycle to four times a day.',
  'J’ai': 'I',
  'réduit de 42 % le temps de build sur un monorepo de 340 services':
    'reduced build time by 42% across a 340-service monorepo',
  ', et ramené le déploiement d’un cycle hebdomadaire à quatre fois par jour.':
    ', and moved deployment from a weekly cycle to four times a day.',
  Corriger: 'Fix',
  Candidatures: 'Applications',
  'Publié à 14:22': 'Published at 14:22',
  'Votre page privée est en ligne pour Nimbus Robotics.':
    'Your private page for Nimbus Robotics is live.',
  'Douze affirmations, toutes sourcées. Le lien n’est accessible qu’aux personnes à qui vous l’envoyez, et vous pouvez le couper à tout instant.':
    'Twelve claims, all sourced. Only people you send the link to can access it, and you can revoke it at any time.',
  'Lien privé': 'Private link',
  Copier: 'Copy',
  'Expire le 12 oct.': 'Expires Oct 12',
  'Preuves inspectables': 'Inspectable evidence',
  'Envoyer l’email préparé': 'Send prepared email',
  'Ce qui part': 'What is shared',
  'Page privée · 4 sections': 'Private page · 4 sections',
  '12 preuves': '12 evidence items',
  téléchargeable: 'downloadable',
  'Extraits de preuves': 'Evidence excerpts',
  '6 sur 12': '6 of 12',
  exclu: 'excluded',
  'Les documents « interne » n’ont pas été utilisés, même en reformulation.':
    'Internal documents were not used, even as paraphrases.',
  'Deux affirmations ont été renforcées au passage':
    'Two claims were strengthened along the way',
  '« 11 → 7 minutes » et « équipe de 3 » sont désormais sourcées dans votre mémoire : elles serviront à toutes vos prochaines candidatures.':
    '“11 → 7 minutes” and “team of 3” are now sourced in your career memory and can support future applications.',
  'Voir la mémoire': 'View career memory',
  'Marquer comme envoyée': 'Mark as sent',
  'Programmer une relance à J+8': 'Schedule a follow-up for day 8',
  'Retour aux candidatures': 'Back to applications',
  'v4 · publiée': 'v4 · published',
  Vous: 'You',
  'Agent rédaction': 'Writing agent',
  actuelle: 'current',
  'Comparaison v3 → v4': 'Compare v3 → v4',
  '3 modifications · 1 section ajoutée': '3 changes · 1 section added',
  'Restaurer v3': 'Restore v3',
  'Exporter le diff': 'Export diff',
  '+ 1 section': '+ 1 section',
  '2 phrases': '2 sentences',
  '− 1 affirmation': '− 1 claim',
  '11 → 12 sourcées': '11 → 12 sourced',
  'Section « Ouverture » · affirmation #12 modifiée par vous':
    '“Opening” section · claim #12 edited by you',
  'v3 · Agent': 'v3 · Agent',
  'v4 · Vous': 'v4 · You',
  'Nouvelle section « 30/60/90 jours » proposée par l’agent, acceptée':
    'New “30/60/90 days” section suggested by the agent and accepted',
  'J+30 · Cartographier les points de rupture.': 'Day 30 · Map failure points.',
  'J+60 · Livrer un pipeline de release unifié.':
    'Day 60 · Ship a unified release pipeline.',
  'J+90 · Transférer l’exploitation à l’équipe.':
    'Day 90 · Hand operations over to the team.',
  'Restaurer une version ne supprime rien : les affirmations et leurs preuves restent dans votre mémoire.':
    'Restoring a version deletes nothing: claims and evidence remain in your career memory.',
  'Dossier entreprise': 'Company brief',
  'Robotique logistique · Paris, Berlin · 68 personnes · fondée en 2021':
    'Logistics robotics · Paris, Berlin · 68 people · founded in 2021',
  'Rafraîchir la recherche': 'Refresh research',
  'En une phrase reformulable': 'In one reusable sentence',
  'Nimbus déploie des flottes de robots chez des logisticiens tiers ; leur difficulté n’est plus la robotique mais l’exploitation logicielle à grande échelle avec une équipe réduite.':
    'Nimbus deploys robot fleets for logistics operators; the challenge is no longer robotics but operating software at scale with a small team.',
  'Signaux datés et sourcés': 'Dated, sourced signals',
  'Série B de 40 M€ en juin 2026': '€40m Series B in June 2026',
  'Communiqué officiel + presse spécialisée · 2 sources concordantes':
    'Official announcement + trade press · 2 corroborating sources',
  '4 postes ouverts sur Fleet Platform': '4 open roles on Fleet Platform',
  'Page carrières · relevé aujourd’hui': 'Careers page · checked today',
  'Offres + dépôts publics + talk du CTO':
    'Jobs + public repositories + CTO talk',
  Hypothèse: 'Hypothesis',
  'L’équipe Fleet serait de 3 personnes': 'Fleet may be a 3-person team',
  'Déduit d’un post LinkedIn, à vérifier en entretien':
    'Inferred from a LinkedIn post, to verify in interview',
  'Ce qu’ils disent publiquement': 'What they say publicly',
  '« Nous voulons rester une petite équipe très outillée. » · CTO, podcast août 2026':
    '“We want to remain a small, highly tooled team.” · CTO, podcast, August 2026',
  '« La fiabilité du déploiement est notre principal risque. » · blog ingénierie':
    '“Deployment reliability is our primary risk.” · engineering blog',
  'Points de vigilance': 'Points to verify',
  'Deux départs de l’équipe plateforme en six mois.':
    'Two platform team departures in six months.',
  'Aucune information publique sur les niveaux de rémunération.':
    'No public information on compensation levels.',
  'Presse spécialisée': 'Trade press',
  'levée de fonds · juin 2026': 'funding round · June 2026',
  '2 dépôts publics': '2 public repositories',
  'Interview du CTO': 'CTO interview',
  'Sources retenues': 'Selected sources',
  '3 articles · août 2026': '3 articles · August 2026',
  'transcription · 48 min': 'transcript · 48 min',
  'Sources publiques seules': 'Public sources only',
  'Écartées · 8': 'Excluded · 8',
  'Agrégateurs d’offres · contenu recopié': 'Job aggregators · copied content',
  'Fiche société de 2023 · périmée': '2023 company profile · outdated',
  'Avis salariés anonymes · non vérifiables':
    'Anonymous employee reviews · unverifiable',
  'Aucun scraping de profils privés, aucun contact non consenti. Le dossier ne contient que ce qu’un candidat pourrait lire lui-même.':
    'No private-profile scraping and no contact without consent. This brief only contains information a candidate could read themselves.',
} as const satisfies MessageDictionary;
