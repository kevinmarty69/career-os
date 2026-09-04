# Career OS - Référentiel produit

Statut : vision cible et périmètre de livraison

Ce document est la référence produit de Career OS. Il décrit ce que le produit doit devenir, pour qui il existe, les principes qui guident les décisions et le périmètre du MVP avancé.

Il décrit une cible, pas l'état actuel du code. Une fonctionnalité n'est considérée comme livrée que lorsque ses critères d'acceptation sont vérifiés.

## 1. Résumé

Career OS est un copilote agentique de recherche d'emploi qui transforme l'histoire professionnelle vérifiable d'une personne en opportunités pertinentes et en candidatures personnalisées, crédibles et prêtes à être envoyées.

Le produit :

1. construit une mémoire professionnelle durable à partir du CV, de LinkedIn, de projets, de documents et d'informations déclarées ;
2. recherche des offres sur internet selon les compétences, les objectifs et les contraintes réelles du candidat ;
3. explique pourquoi chaque offre correspond ou non au profil ;
4. recherche l'entreprise et comprend le besoin derrière le poste ;
5. sélectionne les expériences et preuves réellement pertinentes ;
6. prépare une stratégie de candidature et une page privée fortement personnalisée ;
7. fait relire le résultat par plusieurs agents spécialisés ;
8. laisse au candidat le contrôle de chaque affirmation et de la publication ;
9. suit les candidatures, les liens partagés et les retours afin d'améliorer les recommandations suivantes.

> Career OS trouve les opportunités qui correspondent réellement à votre profil, comprend ce que chaque entreprise recherche et transforme votre expérience vérifiable en une candidature personnalisée, crédible et prête à être envoyée.

Career OS n'est ni un générateur de lettres de motivation génériques, ni un ATS personnel rempli à la main. La mémoire, les preuves, la personnalisation et l'orchestration agentique constituent le produit.

## 2. Problème utilisateur

Chercher un emploi qualifié demande aujourd'hui de répéter les mêmes tâches :

- parcourir des dizaines de sources différentes ;
- éliminer des offres manifestement incompatibles ;
- comprendre une entreprise et son besoin réel ;
- retrouver les expériences pertinentes dans plusieurs années de carrière ;
- adapter le discours sans inventer ni sur-vendre ;
- produire des supports différenciants ;
- suivre les candidatures et apprendre des réponses obtenues.

Les outils existants traitent généralement une seule partie du problème. Ils connaissent mal le candidat, génèrent des textes interchangeables et rendent rarement leurs recommandations explicables.

Career OS doit réduire ce travail répétitif sans retirer au candidat la responsabilité de son identité professionnelle.

## 3. Utilisateurs cibles

### Cible initiale

- développeurs et Product Engineers ;
- profils Senior, Staff, Principal, Founding Engineer ou Tech Lead ;
- spécialistes Applied AI, agents, SaaS et produits techniques ;
- candidats disposant de réalisations concrètes difficiles à résumer dans un CV ;
- profils non linéaires qui doivent expliquer des compétences transférables ;
- candidats qui privilégient peu de candidatures, mais fortement travaillées.

### Extension possible

Le moteur pourra ensuite servir d'autres profils qualifiés à forte densité de preuves : produit, design, data, growth, conseil ou opérations.

Le MVP ne doit toutefois pas diluer son UX pour couvrir tous les métiers dès le départ.

## 4. Résultat attendu pour l'utilisateur

Un utilisateur doit pouvoir :

1. importer son parcours une seule fois ;
2. enrichir et corriger progressivement sa mémoire professionnelle ;
3. définir précisément ce qu'il recherche et ce qu'il refuse ;
4. recevoir une sélection d'offres réellement adaptée ;
5. comprendre le raisonnement derrière chaque recommandation ;
6. lancer une candidature à partir d'une offre sélectionnée ;
7. contrôler les preuves et les formulations utilisées ;
8. publier une page privée personnalisée en quelques décisions ;
9. suivre les résultats et améliorer le système par ses retours.

Le produit est réussi lorsque l'utilisateur consacre son temps aux décisions à forte valeur plutôt qu'à la collecte, au copier-coller et à la reformulation.

## 5. Principes produit

### 5.1 La preuve avant la promesse

Chaque affirmation importante doit être reliée à une source ou clairement qualifiée :

- `verified` : soutenue par une preuve vérifiée ;
- `declared` : déclarée par le candidat, sans preuve indépendante ;
- `inferred` : déduite par le système et jamais publiable sans confirmation ;
- `unsupported` : insuffisamment soutenue et bloquée pour publication.

Le système ne transforme jamais une approximation en fait.

### 5.2 L'humain décide de ce qui engage sa réputation

Les agents recherchent, analysent, proposent et critiquent. Le candidat valide :

- les informations conservées dans sa mémoire ;
- les critères de recherche ;
- la stratégie de candidature ;
- les formulations sensibles ;
- la publication et le partage.

### 5.3 Une complexité agentique invisible

Le moteur peut être sophistiqué. L'interface doit rester immédiatement compréhensible :

- une prochaine action claire ;
- une hiérarchie visuelle nette ;
- des états lisibles ;
- une explication accessible pour chaque recommandation ;
- des détails techniques en divulgation progressive.

### 5.4 Personnaliser sans imiter frauduleusement

Une page de candidature reprend les codes visuels pertinents de l'entreprise : logo public, couleurs, tonalité et structure adaptée au poste. Elle reste explicitement présentée comme une candidature indépendante et ne se fait jamais passer pour une page officielle de l'entreprise.

### 5.5 La confidentialité par défaut

- les données de carrière sont privées ;
- les pages ne sont pas indexées ;
- chaque entreprise reçoit un lien distinct ;
- un lien ne donne accès qu'à une publication ;
- les liens peuvent expirer et être révoqués ;
- aucune donnée sensible n'est placée dans l'URL ;
- les données d'une candidature ne peuvent pas traverser vers une autre.

### 5.6 Des agents bornés, pas une conversation libre entre bots

Chaque agent reçoit un contexte minimum, des outils autorisés et un format de sortie validé. Les décisions, sources, coûts et erreurs sont persistés. Les workflows sont interruptibles, reprenables et limités en temps, tours et budget.

### 5.7 Open source réellement utile

La version auto-hébergée fournit le cœur du produit, sans être volontairement inutilisable. La version cloud vend la simplicité opérationnelle : hébergement, modèles configurés, exécution isolée, mises à jour, sauvegardes, supervision et quotas.

## 6. Parcours principal

L'interface est en anglais par défaut. Le français est disponible depuis un
sélecteur global et le choix persiste entre les visites. Les futures captures
du journal build in public sont produites en anglais.

```text
Création de la mémoire professionnelle
                 ↓
Définition des attentes et contraintes
                 ↓
Recherche continue d'offres sur internet
                 ↓
Déduplication, qualification et classement
                 ↓
Sélection d'une opportunité par le candidat
                 ↓
Recherche approfondie sur l'entreprise
                 ↓
Sélection des expériences et preuves
                 ↓
Stratégie de candidature
                 ↓
Composition de la page privée
                 ↓
Reviews recruteur, hiring manager et factuelle
                 ↓
Arbitrages et validation humaine
                 ↓
Publication d'un lien privé révocable
                 ↓
Suivi de la candidature et apprentissage
```

## 7. Fonctionnalités cibles

### 7.1 Mémoire professionnelle

La mémoire professionnelle est la source de vérité du candidat.

Elle contient :

- CV importés et versions ;
- profil LinkedIn importé ou collé ;
- expériences, responsabilités et contexte ;
- projets professionnels et personnels ;
- compétences démontrées ;
- résultats, métriques et ordres de grandeur ;
- documents, captures, liens, dépôts et autres preuves ;
- préférences de carrière ;
- contraintes géographiques, contractuelles et salariales ;
- éléments personnels que le candidat accepte d'utiliser ;
- corrections et décisions précédentes.

Chaque information conserve :

- sa source ;
- son emplacement dans la source ;
- son statut de provenance ;
- sa sensibilité ;
- ses usages autorisés ;
- son historique de modification.

L'utilisateur peut accepter, corriger, fusionner, masquer, restreindre ou supprimer une information.

### 7.2 Profil de recherche et attentes

Le candidat définit des critères obligatoires et des préférences.

Critères possibles :

- intitulés et familles de postes ;
- niveau de séniorité ;
- compétences ou responsabilités souhaitées ;
- technologies recherchées ou refusées ;
- secteurs et types de produits ;
- taille et maturité de l'entreprise ;
- CDI, freelance ou autre statut ;
- salaire minimum et devise ;
- full remote, hybride ou présentiel ;
- pays, villes et fuseaux horaires ;
- langue de travail ;
- disponibilité et date de prise de poste ;
- culture, management et niveau d'autonomie ;
- entreprises, personnes ou réseaux à éviter pour confidentialité.

Le moteur distingue :

- les contraintes dures, qui éliminent une offre ;
- les préférences souples, qui influencent son classement ;
- les inconnues, qui doivent être vérifiées plutôt que supposées.

### 7.3 Découverte d'offres sur internet

Career OS interroge des sources configurables :

- sites carrière d'entreprises ;
- ATS publics ;
- job boards ;
- sources spécialisées ;
- flux ou recherches enregistrées ;
- URL ajoutées manuellement.

Le moteur :

- collecte les nouvelles offres dans les limites autorisées par chaque source ;
- normalise les champs utiles ;
- conserve l'URL et la date de collecte ;
- détecte les doublons entre plusieurs sources ;
- identifie les offres modifiées, fermées ou republiées ;
- évite de reproposer les offres déjà traitées ;
- signale les informations absentes au lieu de les inventer.

La fréquence et les sources sont configurables. Les alertes restent silencieuses lorsqu'aucune opportunité suffisamment pertinente n'est détectée.

### 7.4 Matching personnalisé et explicable

Chaque offre reçoit une qualification construite à partir de la mémoire professionnelle et du profil de recherche.

Le résultat comprend :

- une recommandation : `prioritaire`, `intéressante`, `exploratoire` ou `à ignorer` ;
- un score indicatif et sa décomposition ;
- les raisons précises du match ;
- les contraintes dures satisfaites ou violées ;
- les expériences les plus pertinentes ;
- les compétences transférables ;
- les preuves mobilisables ;
- les lacunes réelles ;
- les inconnues à vérifier ;
- les risques et objections probables ;
- un résumé lisible en moins d'une minute.

Le score n'est jamais une note opaque. Chaque composante renvoie à un élément de l'offre, une préférence ou une preuve.

Le candidat peut corriger la recommandation et indiquer pourquoi. Ces retours ajustent ses préférences futures sans modifier silencieusement sa mémoire factuelle.

### 7.5 Recherche entreprise et compréhension du rôle

Pour une opportunité sélectionnée, un agent de recherche produit un dossier sourcé :

- activité, produit et clients ;
- modèle économique et maturité ;
- actualité pertinente ;
- culture et principes publics ;
- équipe et organisation du recrutement lorsque ces informations sont publiques ;
- stack et pratiques techniques ;
- enjeux probables du poste ;
- vocabulaire et codes visuels ;
- signaux contradictoires ou incertains.

Le candidat confirme les signaux importants avant qu'ils influencent la candidature.

### 7.6 Stratégie de candidature

Le système propose :

- l'angle de candidature principal ;
- la proposition de valeur ;
- les expériences à mettre en avant ;
- les preuves les plus convaincantes ;
- l'ordre narratif ;
- les objections probables et leur traitement ;
- les lacunes à assumer honnêtement ;
- les questions à poser en entretien ;
- une éventuelle preuve de travail proportionnée au poste ;
- des variantes courtes pour message, email ou formulaire.

Une stratégie ne peut utiliser que des éléments éligibles de la mémoire et du dossier entreprise.

### 7.7 Équipe d'agents spécialisés

Le workflow cible utilise des rôles bornés :

| Agent                   | Mission                                               | Limite d'autorité                                     |
| ----------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| Archiviste              | Extraire et relier informations, sources et preuves   | Ne peut pas vérifier seul une déclaration ni publier  |
| Chercheur d'offres      | Collecter, normaliser et dédupliquer les opportunités | Ne peut pas modifier la mémoire professionnelle       |
| Analyste de matching    | Comparer l'offre au profil et expliquer le classement | Ne peut pas transformer une préférence en preuve      |
| Chercheur entreprise    | Construire un dossier public sourcé                   | Navigation bornée aux sources autorisées              |
| Stratège recruteur      | Construire l'angle de candidature                     | Sélectionne les faits, n'en invente pas               |
| Compositeur             | Générer une structure de page validée                 | Produit des données structurées, jamais du code libre |
| Reviewer recruteur      | Tester la clarté et l'attractivité en lecture rapide  | Peut objecter, pas réécrire silencieusement           |
| Reviewer hiring manager | Tester la crédibilité métier et technique             | Peut objecter, pas modifier les preuves               |
| Fact checker            | Vérifier chaque affirmation publiable                 | Peut bloquer la publication                           |

Les agents ne se corrigent pas indéfiniment. Le nombre de passes est borné. Les désaccords persistants sont remontés à l'utilisateur.

### 7.8 Review et arbitrage humain

Avant publication, l'utilisateur voit :

- les affirmations vérifiées ;
- les déclarations non prouvées ;
- les inférences proposées ;
- les formulations contestées ;
- les objections des reviewers ;
- la source exacte de chaque preuve ;
- l'impact d'une correction sur la page.

Pour chaque point, il peut :

- corriger ;
- rattacher une preuve ;
- conserver sa formulation lorsque cela est autorisé ;
- supprimer ;
- ajouter une information à sa mémoire ;
- relancer uniquement la section concernée.

Une objection factuelle non résolue bloque la publication.

### 7.9 Page privée personnalisée

La page envoyée à l'entreprise doit être lisible en deux niveaux :

1. un scan rapide qui explique qui est le candidat, pourquoi cette entreprise et quelles preuves méritent l'attention ;
2. des sections détaillées consultables à la demande.

Contenu possible :

- nom de l'entreprise, logo et poste ;
- proposition de valeur spécifique ;
- compréhension du besoin ;
- expériences et réalisations retenues ;
- preuves détaillées et provenance ;
- projet ou étude de cas éventuelle ;
- limites et sujets à discuter ;
- CV adapté ;
- LinkedIn, GitHub, portfolio et contact.

Personnalisation :

- couleurs accessibles inspirées de l'entreprise ;
- logo public ;
- ton et hiérarchie adaptés au rôle ;
- composants choisis selon le contenu ;
- mention claire qu'il s'agit d'une candidature indépendante.

Partage :

- lien non indexable et difficile à deviner ;
- session privée après ouverture ;
- date d'expiration configurable ;
- révocation immédiate ;
- aperçu avant publication ;
- nouvelle version sans casser l'historique ;
- téléchargement du CV autorisé ou non par le candidat.

### 7.10 Suivi des candidatures

Le tableau de bord présente :

- opportunités découvertes ;
- offres enregistrées, ignorées ou archivées ;
- candidatures en préparation ;
- étapes du workflow agentique ;
- décisions humaines en attente ;
- pages publiées et liens actifs ;
- candidatures envoyées ;
- entretiens, réponses et résultats ;
- tâches et relances ;
- historique des versions.

Les vues peuvent être filtrées par statut, priorité, entreprise, rôle, date ou source.

### 7.11 Analytics utiles et respectueux

Pour une page privée, l'utilisateur peut voir :

- première et dernière ouverture ;
- nombre d'ouvertures ;
- sections consultées ;
- clics sur les actions principales ;
- téléchargement du CV.

Le produit évite le fingerprinting intrusif. Il affiche clairement les limites de ces données : une ouverture ne prouve ni l'identité du lecteur ni son intérêt.

Les résultats de candidature alimentent des tendances personnelles : sources efficaces, types de rôles répondant le mieux et performances par angle de candidature. Ils ne servent pas à inventer une causalité.

### 7.12 Coaching CV, LinkedIn et positionnement

À partir de la même mémoire, Career OS peut :

- auditer un CV ou un profil LinkedIn ;
- détecter les formulations vagues, redondantes ou non soutenues ;
- proposer un positionnement cohérent avec les rôles recherchés ;
- suggérer les preuves manquantes les plus utiles ;
- générer des variantes soumises à validation ;
- mesurer la cohérence entre CV, LinkedIn, pages privées et candidatures.

Le produit conseille et prépare les changements. Il ne modifie pas automatiquement un profil public dans le MVP.

### 7.13 Notifications et recherche continue

L'utilisateur choisit :

- la fréquence des recherches ;
- le seuil d'alerte ;
- les canaux activés ;
- un résumé quotidien ou hebdomadaire ;
- les événements importants à signaler.

Les notifications utiles comprennent :

- nouvelle offre prioritaire ;
- offre enregistrée bientôt fermée ;
- décision humaine requise ;
- workflow en échec ;
- lien privé ouvert pour la première fois ;
- relance arrivée à échéance.

### 7.14 Portabilité et contrôle des données

L'utilisateur peut :

- exporter sa mémoire, ses sources, ses candidatures et ses décisions ;
- supprimer une source et les données qui en dépendent ;
- supprimer son espace ;
- interrompre un workflow ;
- révoquer toutes ses publications ;
- choisir un fournisseur de modèle compatible ;
- utiliser une instance auto-hébergée.

## 8. Modèle open source et cloud

### 8.1 Édition auto-hébergée

L'édition open source comprend le cœur fonctionnel :

- mémoire professionnelle ;
- import et provenance ;
- découverte via sources configurées ;
- matching ;
- workflow de candidature ;
- agents bornés ;
- pages privées ;
- suivi local ;
- export et suppression ;
- modèles locaux ou clés utilisateur.

L'opérateur fournit l'infrastructure, les modèles, les accès aux sources et la supervision.

### 8.2 Service cloud managé

Le SaaS fournit la même expérience sans exploitation technique :

- hébergement et mises à jour ;
- exécution isolée des agents ;
- connecteurs et collecte planifiée ;
- modèles préconfigurés ;
- quotas et rate limits ;
- stockage, sauvegardes et supervision ;
- email et notifications ;
- publication publique sécurisée ;
- support et récupération opérationnelle.

Le paiement porte sur l'hébergement, l'exécution et le service, pas sur une dégradation artificielle du produit open source.

## 9. MVP avancé

Le MVP avancé est une première version commercialisable. Il couvre le parcours complet, de la mémoire au suivi d'une candidature. Il ne cherche pas à multiplier les intégrations avant de prouver la qualité du résultat.

### Définition de terminé

Le MVP est atteint lorsqu'un nouvel utilisateur peut, sans intervention de l'équipe :

1. créer un espace sécurisé ;
2. importer et valider son CV ;
3. compléter sa mémoire et ses attentes ;
4. recevoir des offres collectées depuis plusieurs sources ;
5. comprendre et corriger leur classement ;
6. sélectionner une offre ;
7. obtenir un dossier entreprise sourcé ;
8. valider une stratégie de candidature ;
9. résoudre les objections des reviewers ;
10. publier et révoquer une page privée personnalisée ;
11. suivre l'envoi et le résultat de sa candidature ;
12. exporter ou supprimer ses données.

### Lot 0 - Fondation de confiance

- [x] Authentification et sessions révocables.
- [x] Espaces isolés et autorisations côté serveur.
- [x] Schéma durable pour sources, affirmations, preuves, préférences, offres, candidatures et publications.
- [x] Provenance et usages autorisés obligatoires pour chaque affirmation.
- [x] Journal d'audit des décisions humaines et agentiques.
- [x] Budgets par workflow : temps, tours, tokens, coût et concurrence.
- [x] États d'erreur explicites, reprise et interruption.
- [x] Export et suppression complète d'un espace.
- [x] Tests d'isolation, de révocation et de non-publication des affirmations inéligibles.

Critères d'acceptation :

- aucune requête authentifiée ne peut accéder à un autre espace ;
- une suppression ou révocation prend effet immédiatement ;
- un workflow interrompu ne duplique ni artefact ni dépense ;
- toute affirmation affichée peut être reliée à sa provenance.

### Lot 1 - Onboarding et mémoire professionnelle

- [x] Import local de PDF, DOCX, TXT et texte collé.
- [x] Extraction structurée des expériences, projets, compétences et résultats.
- [x] Écran de validation avant persistance.
- [x] Ajout manuel d'une expérience, d'un projet, d'une preuve ou d'une préférence.
- [x] Gestion des statuts `verified`, `declared`, `inferred` et `unsupported`.
- [x] Sensibilité et usages autorisés par élément.
- [x] Fusion des doublons et historique des corrections.
- [x] Import guidé du contenu LinkedIn par copie ou export de données.
- [x] Indicateur de couverture de la mémoire, expliqué sans score trompeur.

Critères d'acceptation :

- les fichiers bruts ne quittent pas le navigateur avant validation explicite ;
- l'utilisateur peut retrouver et corriger la source de chaque élément ;
- aucune inférence n'est transformée automatiquement en fait publiable.

### Lot 2 - Profil de recherche

- [x] Définition des rôles et séniorités ciblés.
- [x] Contraintes de lieu, remote, fuseau, langue, contrat et salaire.
- [x] Préférences de stack, secteur, produit, taille et culture.
- [x] Listes d'entreprises et réseaux exclus.
- [x] Séparation visuelle entre contraintes dures et préférences.
- [x] Plusieurs recherches enregistrées pour des objectifs distincts.
- [x] Aperçu de l'effet de chaque critère sur les résultats.

Critères d'acceptation :

- une contrainte dure violée empêche une recommandation prioritaire ;
- une donnée inconnue reste inconnue et n'est pas traitée comme un refus ;
- l'utilisateur comprend pourquoi une offre a été filtrée.

### Lot 3 - Découverte et qualification des offres

- [x] Import direct d'une URL d'annonce.
- [x] Connecteurs initiaux pour plusieurs ATS publics et sites carrière.
- [ ] Recherche planifiée selon les profils enregistrés.
- [x] Normalisation des postes, lieux, contrats, salaires et dates.
- [x] Déduplication multi-source.
- [x] Détection des modifications et fermetures.
- [x] Matching déterministe pour les contraintes dures.
- [x] Analyse sémantique pour les compétences, responsabilités et transferts.
- [x] Recommandation expliquée avec preuves, gaps, risques et inconnues.
- [x] Inbox d'opportunités avec enregistrer, ignorer, archiver et corriger.
- [ ] Feedback utilisateur réutilisé pour le classement futur.
- [ ] Alertes configurables uniquement au-dessus du seuil choisi.

Critères d'acceptation :

- une même offre publiée sur plusieurs sources apparaît une seule fois ;
- chaque recommandation cite les critères et éléments de mémoire utilisés ;
- le candidat peut corriger une mauvaise recommandation ;
- les offres fermées ou déjà refusées ne polluent pas les nouveaux résultats.

### Lot 4 - Dossier entreprise et stratégie

- [ ] Recherche entreprise bornée et sourcée.
- [ ] Extraction du besoin, des responsabilités et des signaux culturels.
- [ ] Validation humaine des signaux structurants.
- [ ] Sélection des expériences et preuves éligibles.
- [ ] Proposition d'un angle de candidature.
- [ ] Identification honnête des écarts et objections.
- [ ] Questions d'entretien recommandées.
- [ ] Messages courts pour prise de contact et candidature.
- [ ] Suggestion facultative d'une preuve de travail proportionnée.
- [ ] Versionnement de la stratégie validée.

Critères d'acceptation :

- chaque fait sur l'entreprise renvoie à une source datée ;
- aucune donnée non confirmée ne devient silencieusement un argument central ;
- la stratégie n'utilise que des affirmations autorisées.

### Lot 5 - Orchestration et review agentiques

- [x] Workers séparés pour recherche, matching, stratégie, composition et review.
- [x] Entrées et sorties strictement validées par schéma.
- [x] Contexte et outils minimaux par rôle.
- [x] Exécution durable avec leases, idempotence et reprise.
- [ ] Journal lisible des étapes, décisions, sources, coûts et erreurs.
- [x] Reviews recruteur, hiring manager et factuelle.
- [x] Nombre de corrections automatiques borné.
- [x] Relance ciblée d'une section sans régénérer toute la candidature.
- [ ] File de décisions humaines avec conserver, corriger, sourcer ou supprimer.
- [x] Blocage de publication tant qu'une objection factuelle subsiste.

Critères d'acceptation :

- une instruction contenue dans une offre ou une page web ne peut pas élargir les outils d'un agent ;
- un crash ou rechargement ne perd pas l'état du workflow ;
- les agents ne peuvent ni publier ni vérifier leurs propres affirmations ;
- l'utilisateur comprend ce qui s'est passé sans lire une trace technique brute.

### Lot 6 - Page privée personnalisée

- [ ] Composition à partir de blocs approuvés et de données structurées.
- [ ] Hero spécifique au rôle et à l'entreprise.
- [ ] Lecture rapide suivie de preuves en divulgation progressive.
- [ ] Personnalisation accessible avec logo, couleurs et tonalité.
- [ ] Indication claire de candidature indépendante.
- [ ] CV, LinkedIn, GitHub, portfolio et contact configurables.
- [ ] Aperçu desktop et mobile.
- [ ] Contrôle de contraste, responsive et navigation clavier.
- [ ] Lien privé non indexable, expirant et révocable.
- [ ] Session privée sans secret persistant dans l'URL.
- [ ] Versionnement et remplacement d'une publication.
- [ ] Analytics sobres : ouvertures, sections, actions et téléchargement.

Critères d'acceptation :

- le lecteur comprend en moins de 30 secondes pourquoi la page lui a été envoyée ;
- les informations essentielles restent accessibles sans animation ni JavaScript avancé ;
- un lien d'entreprise A ne permet jamais d'accéder à la page de l'entreprise B ;
- une page révoquée reste inaccessible dans un nouveau navigateur.

### Lot 7 - Dashboard et suivi de candidature

- [ ] Vue d'accueil avec prochaine action prioritaire.
- [ ] Pipeline des opportunités et candidatures.
- [ ] État en temps réel des workflows.
- [ ] File des arbitrages humains.
- [ ] Gestion des liens privés actifs.
- [ ] Ajout des contacts, entretiens, réponses et résultats.
- [ ] Tâches et relances datées.
- [ ] Recherche et filtres globaux.
- [ ] Historique des versions et décisions.
- [ ] Tendances personnelles sur les réponses, sans fausse causalité.

Critères d'acceptation :

- aucune étape importante ne dépend d'une note externe ;
- l'utilisateur sait immédiatement ce qui exige son attention ;
- une candidature et ses preuves restent retrouvables en quelques secondes.

### Lot 8 - Coaching de positionnement

- [ ] Audit du CV contre les objectifs enregistrés.
- [ ] Audit du contenu LinkedIn importé.
- [ ] Détection des affirmations vagues, redondantes ou non soutenues.
- [ ] Recommandations de positionnement reliées à la mémoire.
- [ ] Suggestions de formulations avec validation humaine.
- [ ] Analyse de cohérence entre CV, LinkedIn et candidatures.
- [ ] Liste priorisée des preuves manquantes à documenter.

Critères d'acceptation :

- chaque recommandation explique le problème qu'elle résout ;
- aucune modification n'est appliquée automatiquement à un profil public ;
- l'utilisateur peut rejeter une recommandation sans altérer ses données factuelles.

### Lot 9 - Distribution open source

- [ ] Installation documentée sur une machine propre.
- [ ] Configuration PostgreSQL et stockage.
- [ ] Support d'un endpoint OpenAI-compatible local ou distant.
- [ ] BYOK sans exposition des clés au navigateur.
- [ ] Workers supervisables et health checks.
- [ ] Sauvegarde et restauration documentées.
- [ ] Configuration des sources de recherche.
- [ ] Jeu de données fictives pour découvrir le produit.
- [ ] Migrations reproductibles et procédure de mise à jour.
- [ ] Documentation claire des limites et responsabilités de l'opérateur.

Critères d'acceptation :

- une personne technique peut exécuter le parcours complet avec la documentation ;
- aucune dépendance propriétaire n'est requise pour le cœur du produit ;
- les secrets et données ne sont jamais inclus dans un export public ou un log par défaut.

### Lot 10 - SaaS cloud commercialisable

- [ ] Inscription et onboarding sans intervention manuelle.
- [ ] Exécution isolée entre clients.
- [ ] Stockage et sauvegardes managés.
- [ ] Modèles et quotas configurés côté serveur.
- [ ] Limites d'usage visibles avant lancement d'un workflow.
- [ ] Facturation et gestion d'abonnement.
- [ ] Emails transactionnels et notifications.
- [ ] Publication sécurisée sur le domaine du service.
- [ ] Supervision, alertes et support opérateur.
- [ ] Export, fermeture de compte et suppression vérifiable.
- [ ] Protection contre les abus et limitation des collectes.
- [ ] Page de statut et procédures d'incident essentielles.

Critères d'acceptation :

- un utilisateur peut payer, utiliser et quitter le service sans opération manuelle ;
- les quotas sont appliqués côté serveur, pas uniquement dans l'interface ;
- une panne d'un fournisseur ne provoque ni dépense dupliquée ni publication partielle ;
- l'équipe peut diagnostiquer un workflow sans lire le contenu privé du candidat par défaut.

### Lot 11 - Qualité de lancement

- [ ] Tests du parcours critique sur desktop et mobile.
- [ ] Tests d'accessibilité clavier, contraste et lecteurs d'écran.
- [ ] Tests de charge sur collecte, matching et exécution des agents.
- [ ] Audit des frontières SSRF, uploads, sessions, RLS et liens privés.
- [ ] Mesure des coûts par workflow et limites de sécurité.
- [ ] Gestion des erreurs compréhensible par un utilisateur non technique.
- [ ] Observabilité sans capture du contenu sensible par défaut.
- [ ] Démonstration publique avec données entièrement fictives.
- [ ] Documentation produit, sécurité et auto-hébergement alignée.

## 10. Priorités du MVP

### P0 - Indispensable pour lancer

- mémoire professionnelle sourcée ;
- attentes et contraintes ;
- import d'URL et découverte multi-source limitée ;
- matching explicable ;
- recherche entreprise ;
- stratégie et reviews agentiques ;
- validation humaine ;
- page privée personnalisée et révocable ;
- dashboard de suivi ;
- isolation, export et suppression ;
- parcours auto-hébergé et cloud utilisables.

### P1 - Premium présent dès le MVP avancé

- recherche planifiée ;
- alertes personnalisées ;
- plusieurs profils de recherche ;
- analytics des pages privées ;
- audit CV et LinkedIn ;
- feedback améliorant le classement ;
- variantes de messages ;
- historique et versions ;
- quotas, facturation et supervision cloud.

### Après le MVP

- extension de navigateur ;
- intégrations natives avec davantage de job boards et ATS ;
- synchronisation LinkedIn automatisée si une voie officielle et conforme existe ;
- envoi automatique de candidatures ;
- orchestration de preuves de travail complexes ;
- collaboration avec coachs ou mentors ;
- espaces d'équipe et gestion de plusieurs candidats ;
- application mobile native ;
- marketplace de connecteurs, agents et modèles de pages.

Ces éléments ne doivent pas retarder la preuve du parcours principal.

## 11. Mesures de succès

### Activation

- pourcentage d'utilisateurs ayant validé une première mémoire ;
- délai avant la première offre pertinente ;
- délai avant la première page privée publiable.

### Qualité des recommandations

- proportion d'offres enregistrées parmi les offres recommandées ;
- raisons de rejet des recommandations ;
- taux de contraintes ou informations incorrectement interprétées ;
- proportion de recommandations entièrement explicables.

### Qualité des candidatures

- nombre d'objections factuelles avant publication ;
- proportion d'affirmations reliées à une preuve ;
- corrections humaines nécessaires par candidature ;
- taux de candidatures atteignant un échange ou un entretien.

### Valeur utilisateur

- temps actif nécessaire par candidature ;
- nombre de candidatures pertinentes envoyées ;
- réutilisation de la mémoire et des preuves ;
- rétention hebdomadaire pendant une recherche active.

### Fiabilité et confiance

- workflows terminés sans intervention opérateur ;
- dépenses ou effets externes dupliqués ;
- incidents de confidentialité ;
- succès des exports, révocations et suppressions ;
- coût médian et p95 d'une candidature complète.

Les métriques servent à améliorer le produit. Elles ne doivent pas encourager le volume de candidatures au détriment de leur pertinence.

## 12. Garde-fous et non-objectifs

Career OS ne doit pas :

- inventer une expérience, une métrique ou une compétence ;
- postuler automatiquement sans accord explicite ;
- contacter une entreprise, une référence ou un employeur sans autorisation ;
- contourner les règles d'accès ou les conditions d'une source ;
- promettre qu'un score prédit une embauche ;
- révéler une candidature à une autre entreprise ;
- modifier silencieusement le CV, LinkedIn ou une page publiée ;
- produire des pages se faisant passer pour des propriétés officielles des entreprises ;
- devenir un réseau social, un job board généraliste ou un ATS d'entreprise dans le MVP ;
- laisser un agent augmenter seul son périmètre, ses outils ou son budget.

## 13. Principes de décision pour la suite

Lorsqu'une nouvelle fonctionnalité est proposée, elle doit répondre à au moins une question :

1. améliore-t-elle la qualité des opportunités trouvées ?
2. renforce-t-elle la qualité ou la traçabilité des preuves ?
3. réduit-elle une tâche répétitive sans retirer une décision importante à l'utilisateur ?
4. rend-elle la candidature plus claire ou plus pertinente pour son destinataire ?
5. améliore-t-elle réellement la sécurité, la confidentialité ou la fiabilité ?

Si la réponse est non, elle ne fait pas partie du produit prioritaire.
