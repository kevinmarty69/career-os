import type { MessageDictionary } from '../messages';

export const activeRoutesMessages = {
  'Journal d’accès': 'Access log',
  'Page ouverte · 3 min': 'Page opened · 3 min',
  'aujourd’hui 09:12': 'today at 09:12',
  'Preuve inspectée · build p50': 'Evidence inspected · build p50',
  'aujourd’hui 09:14': 'today at 09:14',
  'CV téléchargé': 'Resume downloaded',
  'aujourd’hui 09:15': 'today at 09:15',
  'Lien ouvert depuis une 2ᵉ IP': 'Link opened from a second IP address',
  'hier 17:40': 'yesterday at 17:40',
  'Lien créé': 'Link created',
  '2 sept. 14:20': 'Sep 2 at 14:20',
  'Réglages du lien': 'Link settings',
  'Inspection des preuves': 'Evidence inspection',
  'Téléchargement du CV': 'Resume download',
  'Mot de passe à l’ouverture': 'Password required to open',
  'Copier le lien': 'Copy link',
  'Révoquer ce lien': 'Revoke this link',
  'Un lien par entreprise, révocable, avec journal d’accès. Aucune page n’est indexable.':
    'One revocable link per company, with an access log. No page can be indexed.',
  'Nouveau lien': 'New link',
  'Liens actifs': 'Active links',
  'Ouvertures totales': 'Total opens',
  'Preuves inspectées': 'Evidence inspected',
  'Jamais ouverts': 'Never opened',
  Destinataire: 'Recipient',
  Ouvertures: 'Opens',
  Preuves: 'Evidence',
  Expiration: 'Expiration',
  '12 oct.': 'Oct 12',
  '28 sept.': 'Sep 28',
  'dans 2 j': 'in 2 days',
  'sans limite': 'no expiry',
  Révoquer: 'Revoke',
  Prolonger: 'Extend',
  'Révoquer coupe l’accès immédiatement, y compris pour un onglet déjà ouvert. Les captures déjà faites échappent au système.':
    'Revoking cuts off access immediately, including in an already open tab. Existing screenshots remain outside the system.',

  '14 candidatures sur 90 jours. Ce qui marche, ce qui bloque, ce qui manque en preuves.':
    '14 applications over 90 days. What works, what gets in the way, and what evidence is missing.',
  Exporter: 'Export',
  'Taux de réponse · +12 pts': 'Response rate · +12 pts',
  '6 jours': '6 days',
  'Délai médian de réponse': 'Median response time',
  'Temps par candidature': 'Time per application',
  'Corrections acceptées': 'Accepted corrections',
  Entonnoir: 'Funnel',
  Envoyées: 'Sent',
  'Page ouverte': 'Page opened',
  'Preuve inspectée': 'Evidence inspected',
  'Réponse humaine': 'Human response',
  'Quand une preuve est inspectée, la réponse arrive dans 71 % des cas.':
    'When evidence is inspected, a response follows in 71% of cases.',
  'Couverture des preuves': 'Evidence coverage',
  '0 preuve': 'No evidence',
  'Management d’équipe': 'Team management',
  '1 preuve': '1 evidence item',
  'Impact business chiffré': 'Quantified business impact',
  '11 preuves': '11 evidence items',
  'Fiabilité / infra': 'Reliability / infrastructure',
  'Affirmations les plus inspectées': 'Most inspected claims',
  Affirmation: 'Claim',
  Inspections: 'Inspections',
  'Réponse ensuite': 'Response afterwards',
  Niveau: 'Level',
  'Temps de build 11 → 7 min sur 340 services':
    'Build time from 11 → 7 min across 340 services',
  'Pont ROS2 en production chez 4 entreprises':
    'ROS2 bridge used in production by 4 companies',
  'Formation de l’équipe SRE à l’outillage':
    'Training the SRE team on the tooling',

  'Entretien guidé': 'Guided interview',
  Progression: 'Progress',
  '≈ 4 min restantes · vous pouvez sortir à tout moment':
    'About 4 min remaining · you can leave at any time',
  "Progression de l'entretien": 'Interview progress',
  'Périmètre du rôle': 'Role scope',
  'Ce que vous avez décidé': 'What you decided',
  'Résultats mesurés': 'Measured results',
  'Ce qui a échoué': 'What failed',
  "Travail d'équipe": 'Teamwork',
  'Choix techniques': 'Technical choices',
  'Preuves à retrouver': 'Evidence to find',
  'Vos mots, pas les siens': 'Your words, not theirs',
  'L’agent reformule pour la clarté, jamais pour embellir. Vous validez chaque phrase avant qu’elle n’entre dans la mémoire.':
    'The agent rewrites for clarity, never to embellish. You approve every sentence before it enters career memory.',
  'Question 4 sur 7': 'Question 4 of 7',
  'Sur la migration du monorepo, qu’est-ce qui n’a pas marché comme prévu ?':
    'On the monorepo migration, what did not go as planned?',
  'Les recruteurs techniques lisent les échecs comme un signe de maturité. Un exemple concret suffit, sans conclusion morale.':
    'Technical recruiters see failures as a sign of maturity. One concrete example is enough, without a moral.',
  'Le premier découpage était trop fin : on a créé 40 services qu’il a fallu refusionner six mois plus tard. J’avais suivi la structure de l’organisation plutôt que les frontières de données. On a perdu à peu près un trimestre.':
    'The first split was too granular: we created 40 services that had to be merged again six months later. I had followed the organization structure instead of the data boundaries. We lost about a quarter.',
  'Deux affirmations extraites. Relisez-les avant qu’elles rejoignent la mémoire :':
    'Two claims extracted. Review them before they enter career memory:',
  'aucune preuve rattachée': 'no evidence attached',
  'Premier découpage trop fin : 40 services refusionnés après six mois, faute d’avoir suivi les frontières de données.':
    'Initial split too granular: 40 services merged again after six months because data boundaries were not followed.',
  Reformuler: 'Rewrite',
  Jeter: 'Discard',
  'À sourcer': 'Needs evidence',
  'un chiffre à confirmer': 'a figure to confirm',
  'Retard estimé à un trimestre sur le programme de migration.':
    'Migration program delayed by an estimated quarter.',
  'Un document daté mentionne-t-il ce retard ?':
    'Does a dated document mention this delay?',
  Chercher: 'Search',
  'Répondre en quelques phrases…': 'Answer in a few sentences…',
  Passer: 'Skip',
  'Question suivante': 'Next question',
  'Récolté dans cette session': 'Collected in this session',
  'Équipe de 3 sur la plateforme, 9 utilisateurs internes.':
    'Team of 3 on the platform, 9 internal users.',
  'Décision de garder Bazel malgré la pression pour Nx.':
    'Decision to keep Bazel despite pressure to move to Nx.',
  '40 services refusionnés après six mois.':
    '40 services merged again after six months.',
  'Retard d’un trimestre sur la migration.':
    'One-quarter delay on the migration.',
  'Trois affirmations attendent un document. L’agent proposera une liste de fichiers à chercher à la fin.':
    'Three claims are waiting for a document. The agent will suggest files to look for at the end.',
  'Enregistrer et sortir': 'Save and exit',
  'Rien n’est ajouté à la mémoire sans votre « Garder ».':
    'Nothing is added to career memory without your “Keep”.',

  'Entretien technique · Vantage Labs': 'Technical interview · Vantage Labs',
  'dans 5 jours': 'in 5 days',
  '8 sept. · 14:00 - 15:00 · Visio · Research Engineer':
    'Sep 8 · 14:00 - 15:00 · Video call · Research Engineer',
  'Ouvrir le dossier': 'Open application',
  'Fiche d’entretien': 'Interview brief',
  "Sections de l'entretien": 'Interview sections',
  Préparation: 'Preparation',
  Interlocuteurs: 'Interviewers',
  'Ma page privée': 'My private page',
  Débrief: 'Debrief',
  'Questions probables': 'Likely questions',
  'déduites de l’offre et du profil des interlocuteurs':
    'inferred from the job and interviewer profiles',
  'Très probable': 'Very likely',
  '3 preuves disponibles': '3 evidence items available',
  '« Comment décidez-vous du découpage d’un système en services ? »':
    '“How do you decide how to split a system into services?”',
  'Appuis dans votre mémoire': 'Support from your career memory',
  'Frontières de données > structure de l’organisation, appris à la dure sur Corvid':
    'Data boundaries > organization structure, learned the hard way at Corvid',
  '40 services refusionnés après six mois':
    '40 services merged again after six months',
  'chiffre à citer exactement': 'figure to quote exactly',
  '« Parlez-moi d’un gain de performance que vous avez mesuré. »':
    '“Tell me about a performance gain you measured.”',
  'Build p50 : 11 → 7 min. Dites les minutes, pas le pourcentage.':
    'Build p50: 11 → 7 min. State the minutes, not the percentage.',
  Voir: 'View',
  'Point faible': 'Weak point',
  'aucune preuve à opposer': 'no evidence to support it',
  '« Combien de personnes avez-vous managées ? »':
    '“How many people have you managed?”',
  'Réponse préparée : tech lead de 3 personnes sans lien hiérarchique, revue de code et astreinte partagées. Ne pas gonfler, c’est vérifiable auprès de vos anciens collègues.':
    'Prepared answer: tech lead for 3 people without line management, shared code review and on-call duties. Do not inflate it; former colleagues can verify it.',
  'Vos questions à eux': 'Your questions for them',
  Ajouter: 'Add',
  'Qui décide aujourd’hui d’un rollback en production, et en combien de temps ?':
    'Who decides on a production rollback today, and how quickly?',
  'L’équipe Research publie-t-elle, ou tout reste-t-il interne ?':
    'Does the Research team publish, or does everything remain internal?',
  'Research Lead · 4 ans': 'Research Lead · 4 years',
  'A publié sur l’apprentissage par renforcement appliqué à la logistique. Aime les questions de méthode.':
    'Published work on reinforcement learning applied to logistics. Values questions about methodology.',
  'Mainteneur d’un projet OSS proche du vôtre. Terrain commun sur ROS2.':
    'Maintains an OSS project close to yours. Shared ground on ROS2.',
  Simulation: 'Simulation',
  'Vingt minutes de questions posées par un agent, avec vos preuves en arbitre. Le compte-rendu reste privé.':
    'Twenty minutes of questions from an agent, with your evidence as the arbiter. The report stays private.',
  'Lancer une simulation': 'Start a simulation',
  'Après l’entretien': 'After the interview',
  'Le débrief alimente votre mémoire : ce qu’on vous a demandé, ce que vous n’avez pas su prouver.':
    'The debrief adds to your career memory: what you were asked and what you could not prove.',
  'Préparer le débrief': 'Prepare the debrief',
  'À venir': 'Upcoming',
  sept: 'Sep',
  'technique · 14:00': 'technical · 14:00',
  'manager · à confirmer': 'manager · to be confirmed',
  Passés: 'Past',
  'Helix · débrief à écrire': 'Helix · debrief to write',
  'Orbital · débriefé': 'Orbital · debriefed',

  Types: 'Types',
  'Gabarits de page': 'Page templates',
  'Blocs de texte': 'Text blocks',
  'Emails types': 'Email templates',
  'Règle d’or': 'Golden rule',
  'Un asset ne contient jamais d’affirmation non sourcée. Les gabarits refusent de se générer sinon.':
    'An asset never contains an unsupported claim. Templates refuse to generate otherwise.',
  'Ce qui se réutilise. Chaque asset garde le lien vers les preuves qu’il cite.':
    'Reusable material. Each asset keeps links to the evidence it cites.',
  Importer: 'Import',
  'Nouvel asset': 'New asset',
  Gabarits: 'Templates',
  Blocs: 'Blocks',
  Emails: 'Emails',
  'Trié par utilisation': 'Sorted by usage',
  'CV — infra / plateforme': 'Resume — infrastructure / platform',
  'v7 · utilisé 9 fois · 14 affirmations sourcées':
    'v7 · used 9 times · 14 evidence-backed claims',
  'CV — recherche': 'Resume — research',
  'v3 · utilisé 2 fois · publications en tête':
    'v3 · used 2 times · publications first',
  'Cite une affirmation en attente d’arbitrage.':
    'Cites a claim awaiting review.',
  Ouvrir: 'Open',
  Dupliquer: 'Duplicate',
  'Blocs de texte les plus réutilisés': 'Most reused text blocks',
  'Tout voir': 'View all',
  'Migration monorepo · version courte': 'Monorepo migration · short version',
  '« Build ramené de 11 à 7 minutes sur 340 services, déploiement 4×/jour. »':
    '“Build time reduced from 11 to 7 minutes across 340 services, deploying 4×/day.”',
  '7 usages': '7 uses',
  '« Mainteneur d’un pont utilisé en production par quatre entreprises. »':
    '“Maintainer of a bridge used in production by four companies.”',
  '5 usages': '5 uses',
  'Gap management · formulation assumée': 'Management gap · candid wording',
  '« Tech lead de trois personnes, sans lien hiérarchique. »':
    '“Tech lead for three people, without line management.”',
  '4 usages': '4 uses',
  Versions: 'Versions',
  'v7 · actuelle': 'v7 · current',
  'Chiffre de build corrigé en minutes · aujourd’hui':
    'Build figure corrected to minutes · today',
  'Ajout du pont ROS2 · 28 août': 'Added ROS2 bridge · Aug 28',
  'Retrait d’une affirmation sans preuve · 12 août':
    'Removed an unsupported claim · Aug 12',
  'Comparer deux versions': 'Compare two versions',
  'Preuves citées · 14': 'Evidence cited · 14',
  'Exporter en PDF': 'Export as PDF',
  'Définir comme CV de base': 'Set as base resume',

  'Retour à l’app': 'Back to the app',
  Profil: 'Profile',
  'Modèles & agents': 'Models & agents',
  Confidentialité: 'Privacy',
  Intégrations: 'Integrations',
  Abonnement: 'Subscription',
  'Export & suppression': 'Export & deletion',
  'Choisissez où chaque tâche s’exécute. Le contenu envoyé à un modèle est toujours visible avant activation.':
    'Choose where each task runs. Content sent to a model is always visible before activation.',
  'Routage actuel': 'Current routing',
  'Lecture et extraction': 'Reading and extraction',
  Local: 'Local',
  Cloud: 'Cloud',
  'Recherche entreprise': 'Company research',
  Stratégie: 'Strategy',
  'Revue factuelle': 'Factual review',
  'règles déterministes': 'deterministic rules',
  Configurer: 'Configure',
  Instance: 'Instance',
  'Base de données': 'Database',
  Opérationnelle: 'Operational',
  '3 / 3 actifs': '3 / 3 active',
  Sauvegarde: 'Backup',
  'aujourd’hui 03:00': 'today at 03:00',
  'Limites de dépense': 'Spending limits',
  'Basculer en local au plafond': 'Switch to local at the limit',
  'Plafond mensuel': 'Monthly limit',

  'Conflits entre sources': 'Source conflicts',
  'Deux informations incompatibles ne sont jamais fusionnées automatiquement.':
    'Two conflicting pieces of information are never merged automatically.',
  'Conflit #1': 'Conflict #1',
  'Taille de l’équipe encadrée : 6 ou 9 personnes ?':
    'Team size: 6 or 9 people?',
  'CV · 12 mars 2024': 'Resume · Mar 12, 2024',
  'Tech lead d’une équipe de 6 ingénieurs.':
    'Tech lead for a team of 6 engineers.',
  'Source datée': 'Dated source',
  'LinkedIn · synchronisé hier': 'LinkedIn · synced yesterday',
  'Profil public': 'Public profile',
  'Choisissez la formulation qui décrit exactement votre responsabilité. La source écartée reste conservée.':
    'Choose the wording that describes your responsibility exactly. The rejected source is retained.',
  'Retenir 6': 'Keep 6',
  'Retenir 9': 'Keep 9',
  'Écrire une autre formulation': 'Write different wording',
  'Conflit #2': 'Conflict #2',
  'Durée du projet de migration': 'Migration project duration',
  '7 mois': '7 months',
  '9 mois': '9 months',
  'Ouvrir les deux sources': 'Open both sources',

  'Confidentialité des preuves': 'Evidence privacy',
  'Définissez ce que les agents peuvent lire et ce qu’un recruteur peut inspecter.':
    'Define what agents can read and what a recruiter can inspect.',
  'Règles par défaut': 'Default rules',
  Privé: 'Private',
  'Utilisable pour vous conseiller, jamais exposé dans un livrable.':
    'Can be used to advise you, never exposed in a deliverable.',
  Inspectable: 'Inspectable',
  'Un extrait daté peut être ouvert depuis une page privée.':
    'A dated excerpt can be opened from a private page.',
  'Peut être lié intégralement, comme un dépôt open source.':
    'Can be linked in full, like an open-source repository.',
  'Preuves sensibles': 'Sensitive evidence',
  Preuve: 'Evidence',
  Sensibilité: 'Sensitivity',
  'Usages autorisés': 'Allowed uses',
  'document interne': 'internal document',
  Interne: 'Internal',
  'Conseil · appariement': 'Advice · matching',
  Modifier: 'Edit',
  'contient des noms clients': 'contains client names',
  Confidentiel: 'Confidential',
  'Conseil uniquement': 'Advice only',
  'Pont ROS2': 'ROS2 bridge',
  'dépôt GitHub public': 'public GitHub repository',
  Tous: 'All',
  'Un changement de permission n’altère jamais rétroactivement un livrable publié : Career OS demande une nouvelle validation.':
    'Changing a permission never alters a published deliverable retroactively: Career OS requires a new approval.',

  'Vantage Labs · entretien terminé hier':
    'Vantage Labs · interview completed yesterday',
  'Débrief d’entretien': 'Interview debrief',
  'Transformez ce qui s’est passé en mémoire utile, sans réécrire l’histoire.':
    'Turn what happened into useful career memory without rewriting history.',
  'Enregistrer le débrief': 'Save debrief',
  'Ce qui s’est passé': 'What happened',
  'Question la plus difficile': 'Hardest question',
  'Comment mesurer la valeur d’un eval offline ?':
    'How do you measure the value of an offline eval?',
  'Signal positif': 'Positive signal',
  'Discussion détaillée sur le compromis vitesse / rigueur.':
    'Detailed discussion of the speed / rigor tradeoff.',
  'À améliorer': 'Needs improvement',
  'Réponse trop longue sur l’architecture du MCP.':
    'Answer about the MCP architecture was too long.',
  'Prochaine étape': 'Next step',
  'Tour système avec deux Staff Engineers.':
    'Systems round with two Staff Engineers.',
  'Questions posées': 'Questions asked',
  'À creuser': 'Explore further',
  'Comment suivez-vous les coûts de modèles par fonctionnalité ?':
    'How do you track model costs by feature?',
  'Bien répondu': 'Answered well',
  'Quand un agent ne doit-il pas agir seul ?':
    'When should an agent not act alone?',
  'Nouvelles affirmations · 2': 'New claims · 2',
  'Participation aux entretiens techniques de recrutement.':
    'Participated in technical hiring interviews.',
  'Astreinte 1 semaine sur 4 sur la plateforme.':
    'On call 1 week out of 4 for the platform.',
  'Trou identifié': 'Gap identified',
  'Impact coût cloud — demandé dans 3 entretiens sur 4, jamais chiffré.':
    'Cloud cost impact — asked in 3 interviews out of 4, never quantified.',
  'Voir les occurrences': 'View occurrences',
  'Email de remerciement': 'Thank-you email',
  'Brouillon prêt une fois le chiffre exact retrouvé.':
    'Draft ready once the exact figure is found.',
  'Relire le brouillon': 'Review draft',

  'Runs d’agents': 'Agent runs',
  '3 incidents à traiter. Aucun n’a modifié votre mémoire.':
    '3 incidents need attention. None changed your career memory.',
  'Tout reprendre': 'Resume all',
  'Run interrompu': 'Run interrupted',
  'Le modèle distant ne répond pas': 'The remote model is not responding',
  'Fathom · étape rédaction · 14:47': 'Fathom · drafting step · 14:47',
  'L’API distante a renvoyé une erreur de quota. Les trois premières étapes sont enregistrées et intactes.':
    'The remote API returned a quota error. The first three steps are saved and intact.',
  'Basculer la rédaction sur votre modèle local — plus lent, gratuit, sans sortie de données.':
    'Switch drafting to your local model — slower, free, with no data leaving your system.',
  'Reprendre en local': 'Resume locally',
  'Réessayer l’API': 'Retry the API',
  'Import bloqué': 'Import blocked',
  'Offre inaccessible derrière une authentification':
    'Job inaccessible behind authentication',
  'Collez le texte de l’annonce à la place.': 'Paste the job text instead.',
  'Coller le texte': 'Paste text',
  'Importer un PDF': 'Import a PDF',
  'Document illisible': 'Unreadable document',
  'CV scanné : texte non extractible':
    'Scanned resume: text cannot be extracted',
  'L’OCR local peut le traiter, mais les dates devront être confirmées.':
    'Local OCR can process it, but the dates will need confirmation.',
  'Lancer l’OCR': 'Run OCR',
  'Saisir manuellement': 'Enter manually',
  'Runs récents': 'Recent runs',
  État: 'Status',
  Durée: 'Duration',
  Coût: 'Cost',
  Échec: 'Failed',
  Reprendre: 'Resume',
  Terminé: 'Completed',

  '4 brouillons · 2 relances dues': '4 drafts · 2 follow-ups due',
  'À envoyer': 'To send',
  Envoyés: 'Sent',
  'Candidature · Staff Product Engineer':
    'Application · Staff Product Engineer',
  prêt: 'ready',
  'Relance après candidature': 'Application follow-up',
  'Remerciement après entretien': 'Post-interview thank-you',
  attente: 'waiting',
  'Relance · jamais ouvert': 'Follow-up · never opened',
  'Aucun envoi automatique. Vous copiez, vous envoyez.':
    'No automatic sending. You copy it, you send it.',
  'Candidature — Staff Product Engineer':
    'Application — Staff Product Engineer',
  'Email · à Camille Lefort': 'Email · to Camille Lefort',
  À: 'To',
  Objet: 'Subject',
  'Bonjour Camille,': 'Hello Camille,',
  'Votre annonce parle d’une flotte qui grandit vite et d’une équipe qui doit rester petite. C’est exactement le problème que j’ai traité chez Corvid : temps de build ramené de':
    'Your job post describes a fast-growing fleet and a team that must stay small. That is exactly the problem I worked on at Corvid: build time reduced from',
  '11 à 7 minutes sur 340 services': '11 to 7 minutes across 340 services',
  ', puis passation complète de l’outillage à l’équipe SRE.':
    ', followed by a complete handoff of the tooling to the SRE team.',
  'J’ai préparé une page qui détaille les trois points de votre annonce que je peux documenter, avec les sources à l’appui :':
    'I prepared a page detailing the three parts of your job post I can document, with supporting sources:',
  'career-os.app/p/8f2c-nimbus · lien privé':
    'career-os.app/p/8f2c-nimbus · private link',
  'Je ne prétends pas au volet management hiérarchique : j’ai été tech lead de trois personnes, sans autorité formelle. Le reste, je peux le prouver.':
    'I do not claim line-management experience: I was tech lead for three people without formal authority. I can prove the rest.',
  'Bien à vous,': 'Best,',
  'Plus court': 'Shorter',
  'Plus sobre': 'More concise',
  '148 mots · 1 lien · 1 chiffre sourcé':
    '148 words · 1 link · 1 evidence-backed figure',
  'Copier le texte': 'Copy text',
  'Ouvrir dans mon client mail': 'Open in my email client',
  Contrôle: 'Checks',
  'Tous les faits sont sourcés': 'All facts are evidence-backed',
  '« 11 à 7 minutes »': '“11 to 7 minutes”',
  '« 340 services »': '“340 services”',
  '« tech lead de trois personnes »': '“tech lead for three people”',
  'Relance suggérée': 'Suggested follow-up',
  'Dans 8 jours si aucune réponse. Rien ne partira sans vous.':
    'In 8 days if there is no response. Nothing will be sent without you.',
  'Me le rappeler': 'Remind me',
  'Candidature spontanée': 'Spontaneous application',
  'Remerciement post-entretien': 'Post-interview thank-you',
  'Relance polie': 'Polite follow-up',
  'Négociation d’offre': 'Offer negotiation',
  'Une fois envoyé, marquez-le : l’app compte les jours pour la relance.':
    'Once sent, mark it: the app counts the days until follow-up.',

  Compétences: 'Skills',
  'Chaque compétence est un paquet de preuves. Sans preuve, elle n’apparaît pas dans vos candidatures.':
    'Each skill is a bundle of evidence. Without evidence, it does not appear in your applications.',
  'Combler un trou': 'Fill a gap',
  'Compétences prouvées': 'Proven skills',
  'Déclarées sans preuve': 'Declared without evidence',
  'Demandées, absentes': 'Required, missing',
  'Preuves inutilisées': 'Unused evidence',
  'Vos points forts documentés': 'Your documented strengths',
  'preuves vérifiées · déclarées · demande du marché':
    'verified evidence · declared · market demand',
  'Fiabilité de déploiement': 'Deployment reliability',
  '8 preuves': '8 evidence items',
  'Outillage développeur': 'Developer tooling',
  '6 preuves · 1 périmée': '6 evidence items · 1 outdated',
  'À jour ?': 'Current?',
  '4 preuves': '4 evidence items',
  Rare: 'Rare',
  Trou: 'Gap',
  'Management hiérarchique': 'Line management',
  'aucune preuve': 'no evidence',
  Fort: 'Strong',
  'Trou le plus coûteux': 'Most costly gap',
  'Impact business chiffré est demandé dans 11 des 14 offres visées, et vous n’avez qu’une preuve.':
    'Quantified business impact is required in 11 of the 14 targeted jobs, and you have only one evidence item.',
  'Chercher le document': 'Find the document',
  'Atout sous-exploité': 'Underused strength',
  'Votre travail open source ROS2 n’apparaît que dans 2 candidatures sur 14.':
    'Your open-source ROS2 work appears in only 2 applications out of 14.',
  'Voir où l’ajouter': 'See where to add it',

  'Où vos preuves doivent-elles vivre ?': 'Where should your evidence live?',
  'Choisissez votre mode d’hébergement': 'Choose your hosting mode',
  'Vous pouvez changer d’avis plus tard : l’export est complet dans les deux cas.':
    'You can change your mind later: both options provide a complete export.',
  Recommandé: 'Recommended',
  'SaaS hébergé': 'Hosted SaaS',
  'Prêt en deux minutes · 12 €/mois': 'Ready in two minutes · €12/month',
  'Rien à installer, mises à jour incluses':
    'Nothing to install, updates included',
  'Modèles inclus, pas de clé API': 'Models included, no API key',
  'Données hébergées en UE': 'Data hosted in the EU',
  'Vos extraits de preuves transitent par nos serveurs pour être traités.':
    'Your evidence excerpts pass through our servers for processing.',
  'Commencer avec le SaaS': 'Start with SaaS',
  'Auto-hébergé': 'Self-hosted',
  'Docker compose · gratuit': 'Docker Compose · free',
  'Vos documents restent sur votre machine':
    'Your documents stay on your machine',
  'Modèles locaux possibles': 'Local models supported',
  'Code auditable, agents modifiables': 'Auditable code, customizable agents',
  'Guide d’installation': 'Installation guide',
  'Le format d’export est identique : Markdown et JSON, lisibles sans Career OS. Migrer prend une commande.':
    'The export format is the same: Markdown and JSON, readable without Career OS. Migration takes one command.',

  'Moyen de paiement': 'Payment method',
  'expire 04/29': 'expires 04/29',
  Changer: 'Change',
  'Plafond d’usage': 'Usage limit',
  'Au-delà de 15 €, les runs basculent automatiquement sur les modèles locaux au lieu d’être facturés.':
    'Above €15, runs automatically switch to local models instead of being billed.',
  'Ne jamais dépasser': 'Never exceed',
  Facturation: 'Billing',
  'Nom et adresse': 'Name and address',
  Éditer: 'Edit',
  'TVA intracommunautaire': 'EU VAT number',
  'Toujours gratuit en self-host': 'Always free when self-hosted',
  'L’abonnement paie l’hébergement et l’accès aux modèles, pas les fonctionnalités : aucune n’est réservée au SaaS.':
    'The subscription pays for hosting and model access, not features: none are exclusive to SaaS.',
  'Facturation à l’usage des modèles, plafonnée. Vous ne payez pas ce que vous n’utilisez pas.':
    'Capped usage-based model billing. You do not pay for what you do not use.',
  'Formule actuelle': 'Current plan',
  'Pro · 12 €/mois': 'Pro · €12/month',
  'Candidatures illimitées · modèles inclus jusqu’à 15 € d’usage · renouvellement le 1ᵉʳ oct.':
    'Unlimited applications · models included up to €15 of usage · renews Oct 1.',
  'Changer de formule': 'Change plan',
  Résilier: 'Cancel subscription',
  'Usage de modèles ce mois': 'Model usage this month',
  'Candidatures traitées': 'Applications processed',
  'Part traitée en local': 'Share processed locally',
  'Historique de facturation': 'Billing history',
  Période: 'Period',
  Détail: 'Details',
  Montant: 'Amount',
  'Août 2026': 'August 2026',
  'Pro + 3,10 € d’usage': 'Pro + €3.10 usage',
  Payé: 'Paid',
  Facture: 'Invoice',
  'Juillet 2026': 'July 2026',
  'Pro + 1,80 € d’usage': 'Pro + €1.80 usage',
  'Juin 2026': 'June 2026',
  'Pro, aucun usage': 'Pro, no usage',

  'Le corps ne contient que des identifiants, jamais le texte d’une preuve.':
    'The payload contains identifiers only, never evidence text.',
  'Portées disponibles': 'Available scopes',
  'lecture des preuves': 'read evidence',
  'import de documents': 'import documents',
  'créer, lire, lister': 'create, read, list',
  'état et journaux': 'status and logs',
  'Aucune portée ne permet de publier un lien privé : la publication reste une action humaine.':
    'No scope can publish a private link: publication remains a human action.',
  'Journal d’accès API': 'API access log',
  '248 appels ce mois · dernier il y a 3 min. Chaque appel enregistre le jeton, la portée et l’IP.':
    '248 calls this month · last one 3 min ago. Each call records the token, scope, and IP.',
  'Ouvrir le journal': 'Open log',
  'Intégrations & API': 'Integrations & API',
  'Connecteurs de sources, jetons d’accès et webhooks. Tout ce qui sort est journalisé.':
    'Source connectors, access tokens, and webhooks. Everything leaving the system is logged.',
  'Sources connectées': 'Connected sources',
  'Ajouter une source': 'Add source',
  'sync quotidien · 18 preuves': 'daily sync · 18 evidence items',
  Actif: 'Active',
  '2 dépôts · 8 preuves': '2 repositories · 8 evidence items',
  'jeton expiré · 4 preuves figées': 'expired token · 4 evidence items frozen',
  Reconnecter: 'Reconnect',
  'Notion, Drive, flux RSS…': 'Notion, Drive, RSS feeds…',
  'lecture seule uniquement': 'read-only only',
  'Jetons d’API': 'API tokens',
  'Créer un jeton': 'Create token',
  Nom: 'Name',
  Portée: 'Scope',
  'Dernier usage': 'Last used',
  Expire: 'Expires',
  'Script d’import CV': 'Resume import script',
  'il y a 2 j': '2 days ago',
  jamais: 'never',
  'Dashboard perso': 'Personal dashboard',
  'aujourd’hui': 'today',
  '31 déc.': 'Dec 31',
  'Exemple · créer une candidature': 'Example · create an application',

  'Vos données vous appartiennent, dans un format lisible sans Career OS.':
    'Your data belongs to you, in a format readable without Career OS.',
  'Exporter tout': 'Export everything',
  'Mémoire · 128 affirmations': 'Career memory · 128 claims',
  'Documents sources · 24': 'Source documents · 24',
  'Candidatures · 14': 'Applications · 14',
  'Runs et journaux d’agents': 'Agent runs and logs',
  'JSON seul': 'JSON only',
  'Générer l’archive': 'Generate archive',
  'Chaque affirmation exportée conserve ses liens vers ses preuves et sa date d’origine. L’archive se réimporte telle quelle dans une autre instance.':
    'Every exported claim keeps its links to evidence and its original date. The archive can be imported unchanged into another instance.',
  'Supprimer mon compte': 'Delete my account',
  'Efface la mémoire, les candidatures, les runs et les liens privés. Les liens deviennent inaccessibles immédiatement, y compris pour un onglet déjà ouvert.':
    'Deletes career memory, applications, runs, and private links. Links become inaccessible immediately, including in an already open tab.',
  'Ce qui sera supprimé': 'What will be deleted',
  '128 affirmations, 24 documents': '128 claims, 24 documents',
  '14 candidatures et leurs versions': '14 applications and their versions',
  '4 liens privés actifs': '4 active private links',
  '2 jetons d’API': '2 API tokens',
  'Tapez SUPPRIMER pour confirmer': 'Type DELETE to confirm',
  'tapez SUPPRIMER pour confirmer': 'type DELETE to confirm',
  'Supprimer définitivement': 'Delete permanently',
  'Aucun délai de grâce, aucune corbeille : la suppression est immédiate. Exportez d’abord si vous voulez garder une copie.':
    'There is no grace period or trash: deletion is immediate. Export first if you want to keep a copy.',
  Rétention: 'Retention',
  'Documents et preuves': 'Documents and evidence',
  'jusqu’à suppression': 'until deletion',
  'Journaux d’accès aux liens': 'Link access logs',
  '90 jours': '90 days',
  'Sauvegardes chiffrées': 'Encrypted backups',
  '7 jours': '7 days',
  'Factures (obligation légale)': 'Invoices (legal requirement)',
  '10 ans': '10 years',
} as const satisfies MessageDictionary;
