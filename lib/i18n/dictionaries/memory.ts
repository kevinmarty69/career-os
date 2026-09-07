import type { MessageDictionary } from '../messages';
export const memoryMessages = {
  'memory.this.review.expired.read.the.source.again.to.continue': {
    fr: 'Cette revue a expiré. Relancez la lecture pour continuer.',
    en: 'This review expired. Read the source again to continue.',
  },
  'memory.reading.cancelled.you.can.choose.another.source': {
    fr: 'Lecture annulée. Vous pouvez choisir une autre source.',
    en: 'Reading cancelled. You can choose another source.',
  },
  'memory.complete.your.identity.keep.at.least.one.claim.with': {
    fr: 'Complétez votre identité, gardez au moins une affirmation avec un usage, puis confirmez la validation.',
    en: 'Complete your identity, keep at least one claim with an allowed use, then confirm your review.',
  },
  'memory.some.information.is.incomplete.fix.the.highlighted.fields': {
    fr: 'Certaines informations sont incomplètes. Corrigez les champs signalés.',
    en: 'Some information is incomplete. Fix the highlighted fields.',
  },
  'memory.sign.in.to.save.this.career.memory.to.your': {
    fr: 'Connectez-vous pour enregistrer cette mémoire dans votre espace.',
    en: 'Sign in to save this career memory to your workspace.',
  },
  'memory.your.career.memory.changed.in.another.session.reload.the': {
    fr: 'Votre mémoire a changé dans une autre session. Rechargez la page puis relancez la validation.',
    en: 'Your career memory changed in another session. Reload the page, then confirm again.',
  },
  'memory.career.memory.could.not.be.saved.your.review.remains': {
    fr: 'La mémoire n’a pas pu être enregistrée. Votre revue reste disponible dans ce navigateur.',
    en: 'Career memory could not be saved. Your review remains available in this browser.',
  },
  'memory.this.file.exceeds.the.4.mb.limit': {
    fr: 'Ce fichier dépasse la limite de 4 Mo.',
    en: 'This file exceeds the 4 MB limit.',
  },
  'memory.choose.a.valid.pdf.docx.or.txt.file': {
    fr: 'Choisissez un fichier PDF, DOCX ou TXT valide.',
    en: 'Choose a valid PDF, DOCX, or TXT file.',
  },
  'memory.this.pdf.is.password.protected.export.an.unprotected.copy': {
    fr: 'Ce PDF est protégé. Exportez une copie sans mot de passe puis réessayez.',
    en: 'This PDF is password-protected. Export an unprotected copy and try again.',
  },
  'memory.this.pdf.contains.an.attachment.export.a.plain.copy': {
    fr: 'Ce PDF contient une pièce jointe. Exportez une copie simple puis réessayez.',
    en: 'This PDF contains an attachment. Export a plain copy and try again.',
  },
  'memory.this.pdf.exceeds.the.100.page.limit': {
    fr: 'Ce PDF dépasse la limite de 100 pages.',
    en: 'This PDF exceeds the 100-page limit.',
  },
  'memory.this.word.document.contains.external.or.active.content.export': {
    fr: 'Ce document Word contient des éléments externes ou actifs. Exportez-le en PDF puis réessayez.',
    en: 'This Word document contains external or active content. Export it as PDF and try again.',
  },
  'memory.local.reading.took.too.long.try.a.smaller.version': {
    fr: 'La lecture locale a pris trop de temps. Essayez une version plus légère.',
    en: 'Local reading took too long. Try a smaller version.',
  },
  'memory.no.usable.text.was.found.in.this.source': {
    fr: 'Aucun texte exploitable n’a été trouvé dans cette source.',
    en: 'No usable text was found in this source.',
  },
  'memory.reading.cancelled': {
    fr: 'Lecture annulée.',
    en: 'Reading cancelled.',
  },
  'memory.this.source.could.not.be.read.locally.try.a': {
    fr: 'Cette source n’a pas pu être lue localement. Réessayez avec un fichier plus simple.',
    en: 'This source could not be read locally. Try a simpler file.',
  },
  'memory.career.memory': {
    fr: 'Mémoire',
    en: 'Career memory',
  },
  'memory.import.a.source': {
    fr: 'Importer une source',
    en: 'Import a source',
  },
  'memory.positioning.audit': {
    fr: 'Audit de positionnement',
    en: 'Positioning audit',
  },
  'memory.your.data.your.rules': {
    fr: 'Vos données, vos règles',
    en: 'Your data, your rules',
  },
  'memory.every.claim.keeps.its.source.sensitivity.and.allowed.uses': {
    fr: 'Chaque affirmation conserve sa source, sa sensibilité et ses usages.',
    en: 'Every claim keeps its source, sensitivity, and allowed uses.',
  },
  'memory.career.memory.2': {
    fr: 'Mémoire professionnelle',
    en: 'Career memory',
  },
  'memory.review.source.and.control.the.information.available.to.your': {
    fr: 'Relisez, sourcez et contrôlez les informations utilisables dans vos candidatures.',
    en: 'Review, source, and control the information available to your applications.',
  },
  'memory.summary': {
    fr: 'Synthèse',
    en: 'Summary',
  },
  'memory.experience': {
    fr: 'Expérience',
    en: 'Experience',
  },
  'memory.project': {
    fr: 'Projet',
    en: 'Project',
  },
  'memory.skill': {
    fr: 'Compétence',
    en: 'Skill',
  },
  'memory.education': {
    fr: 'Formation',
    en: 'Education',
  },
  'memory.result': {
    fr: 'Résultat',
    en: 'Result',
  },
  'memory.preference': {
    fr: 'Préférence',
    en: 'Preference',
  },
  'memory.other': {
    fr: 'Autre',
    en: 'Other',
  },
  'memory.verified': {
    fr: 'Vérifié',
    en: 'Verified',
  },
  'memory.declared': {
    fr: 'Déclaré',
    en: 'Declared',
  },
  'memory.inferred': {
    fr: 'Inféré',
    en: 'Inferred',
  },
  'memory.unsupported': {
    fr: 'Sans preuve',
    en: 'Unsupported',
  },
  'memory.application': {
    fr: 'Candidature',
    en: 'Application',
  },
  'memory.resume': {
    fr: 'CV',
    en: 'Resume',
  },
  'memory.interview': {
    fr: 'Entretien',
    en: 'Interview',
  },
  'memory.a.claim.and.its.source.are.required': {
    fr: 'Une affirmation et sa source sont nécessaires.',
    en: 'A claim and its source are required.',
  },
  'memory.manually.added.excerpt': {
    fr: 'Extrait ajouté manuellement',
    en: 'Manually added excerpt',
  },
  'memory.item.added.to.the.draft.save.to.keep.it': {
    fr: 'Élément ajouté au brouillon. Enregistrez pour le conserver.',
    en: 'Item added to the draft. Save to keep it.',
  },
  'memory.loading.career.memory': {
    fr: 'Chargement de la mémoire…',
    en: 'Loading career memory…',
  },
  'memory.name': {
    fr: 'Nom',
    en: 'Name',
  },
  'memory.positioning': {
    fr: 'Positionnement',
    en: 'Positioning',
  },
  'memory.links.shared.on.private.pages': {
    fr: 'Liens partagés sur les pages privées',
    en: 'Links shared on private pages',
  },
  'memory.only.the.links.entered.here.will.be.visible.to': {
    fr: 'Seuls les liens renseignés ici seront visibles par les destinataires de vos candidatures.',
    en: 'Only the links entered here will be visible to your application recipients.',
  },
  'memory.explicit.sharing': {
    fr: 'Partage explicite',
    en: 'Explicit sharing',
  },
  'memory.email': {
    fr: 'Email',
    en: 'Email',
  },
  'memory.linkedin': {
    fr: 'LinkedIn',
    en: 'LinkedIn',
  },
  'memory.github': {
    fr: 'GitHub',
    en: 'GitHub',
  },
  'memory.portfolio': {
    fr: 'Portfolio',
    en: 'Portfolio',
  },
  'memory.explained.coverage': {
    fr: 'Couverture expliquée',
    en: 'Explained coverage',
  },
  'memory.experiences': {
    fr: 'Expériences',
    en: 'Experiences',
  },
  'memory.projects': {
    fr: 'Projets',
    en: 'Projects',
  },
  'memory.skills': {
    fr: 'Compétences',
    en: 'Skills',
  },
  'memory.results': {
    fr: 'Résultats',
    en: 'Results',
  },
  'memory.preferences': {
    fr: 'Préférences',
    en: 'Preferences',
  },
  'memory.documented.categories.without.an.artificial.score': {
    fr: 'catégories documentées, sans score artificiel',
    en: 'documented categories, without an artificial score',
  },
  'memory.claims': {
    fr: 'Affirmations',
    en: 'Claims',
  },
  'memory.linked.source.s': {
    fr: 'source(s) reliée(s)',
    en: 'linked source(s)',
  },
  'memory.not.publishable': {
    fr: 'Non publiables',
    en: 'Not publishable',
  },
  'memory.inferred.or.still.unsupported': {
    fr: 'inférées ou encore sans preuve',
    en: 'inferred or still unsupported',
  },
  'memory.history': {
    fr: 'Historique',
    en: 'History',
  },
  'memory.current.revision': {
    fr: 'révision actuelle :',
    en: 'current revision:',
  },
  'memory.not.saved': {
    fr: 'non enregistrée',
    en: 'not saved',
  },
  'memory.add.manually': {
    fr: 'Ajouter manuellement',
    en: 'Add manually',
  },
  'memory.merge.duplicates': {
    fr: 'Fusionner les doublons',
    en: 'Merge duplicates',
  },
  'memory.save': {
    fr: 'Enregistrer',
    en: 'Save',
  },
  'memory.new.item': {
    fr: 'Nouvel élément',
    en: 'New item',
  },
  'memory.claim': {
    fr: 'Affirmation',
    en: 'Claim',
  },
  'memory.source': {
    fr: 'Source',
    en: 'Source',
  },
  'memory.evidence.excerpt.optional': {
    fr: 'Extrait de preuve (facultatif)',
    en: 'Evidence excerpt (optional)',
  },
  'memory.add.to.draft': {
    fr: 'Ajouter au brouillon',
    en: 'Add to draft',
  },
  'memory.evidence.item.s': {
    fr: 'preuve(s)',
    en: 'evidence item(s)',
  },
  'memory.close.provenance': {
    fr: 'Fermer la provenance',
    en: 'Close provenance',
  },
  'memory.view.and.edit.provenance': {
    fr: 'Voir et corriger la provenance',
    en: 'View and edit provenance',
  },
  'memory.your.career.memory.is.empty': {
    fr: 'Votre mémoire est vide',
    en: 'Your career memory is empty',
  },
  'memory.import.your.resume.or.add.your.first.item.nothing': {
    fr: 'Importez votre CV ou ajoutez une première information. Rien ne sera publié automatiquement.',
    en: 'Import your resume or add your first item. Nothing is published automatically.',
  },
  'memory.start.with.a.source': {
    fr: 'Commencer par une source',
    en: 'Start with a source',
  },
  'memory.coverage': {
    fr: 'Couverture',
    en: 'Coverage',
  },
  'memory.latest.changes': {
    fr: 'Dernières corrections',
    en: 'Latest changes',
  },
  'memory.revision': {
    fr: 'Révision',
    en: 'Revision',
  },
  'memory.sensitivity': {
    fr: 'Sensibilité',
    en: 'Sensitivity',
  },
  'memory.public': {
    fr: 'public',
    en: 'public',
  },
  'memory.public.2': {
    fr: 'Public',
    en: 'Public',
  },
  'memory.private': {
    fr: 'Privé',
    en: 'Private',
  },
  'memory.allowed.uses': {
    fr: 'Usages autorisés',
    en: 'Allowed uses',
  },
  'memory.source.type': {
    fr: 'Type de source',
    en: 'Source type',
  },
  'memory.source.sensitivity': {
    fr: 'Sensibilité de la source',
    en: 'Source sensitivity',
  },
  'memory.locator': {
    fr: 'Repère',
    en: 'Locator',
  },
  'memory.this.claim.has.no.evidence.yet.it.cannot.be': {
    fr: 'Cette affirmation n’a pas encore de preuve. Elle ne peut pas être publiée.',
    en: 'This claim has no evidence yet. It cannot be published.',
  },
  'memory.add.evidence': {
    fr: 'Ajouter une preuve',
    en: 'Add evidence',
  },
  'memory.home': {
    fr: 'Accueil',
    en: 'Home',
  },
  'memory.applications': {
    fr: 'Candidatures',
    en: 'Applications',
  },
  'memory.private.links': {
    fr: 'Liens privés',
    en: 'Private links',
  },
  'memory.settings': {
    fr: 'Réglages',
    en: 'Settings',
  },
  'memory.career.os.home': {
    fr: 'Career OS, accueil',
    en: 'Career OS, home',
  },
  'memory.skip.to.import': {
    fr: 'Aller à l’import',
    en: 'Skip to import',
  },
  'memory.career.memory.import': {
    fr: 'Import de la mémoire',
    en: 'Career memory import',
  },
  'memory.career.os.navigation': {
    fr: 'Navigation Career OS',
    en: 'Career OS navigation',
  },
  'memory.main.navigation': {
    fr: 'Navigation principale',
    en: 'Main navigation',
  },
  'memory.setup': {
    fr: 'Mise en route',
    en: 'Setup',
  },
  'memory.choose.a.source': {
    fr: 'Choisir une source',
    en: 'Choose a source',
  },
  'memory.review.information': {
    fr: 'Relire les informations',
    en: 'Review information',
  },
  'memory.confirm.career.memory': {
    fr: 'Valider la mémoire',
    en: 'Confirm career memory',
  },
  'memory.local.processing': {
    fr: 'Lecture locale',
    en: 'Local processing',
  },
  'memory.the.file.stays.in.this.browser': {
    fr: 'Le fichier reste dans ce navigateur.',
    en: 'The file stays in this browser.',
  },
  'memory.close.import': {
    fr: 'Fermer l’import',
    en: 'Close import',
  },
  'memory.mobile.navigation': {
    fr: 'Navigation mobile',
    en: 'Mobile navigation',
  },
  'memory.import.a.source.you.will.then.decide.what.actually': {
    fr: 'Importez une source. Vous déciderez ensuite ce qui entre réellement dans votre mémoire.',
    en: 'Import a source. You will then decide what actually enters your career memory.',
  },
  'memory.career.memory.1.of.3': {
    fr: 'Mémoire professionnelle · 1 sur 3',
    en: 'Career memory · 1 of 3',
  },
  'memory.add.your.background': {
    fr: 'Ajoutez votre parcours',
    en: 'Add your background',
  },
  'memory.cancel': {
    fr: 'Annuler',
    en: 'Cancel',
  },
  'memory.drop.your.resume.here': {
    fr: 'Déposez votre CV ici',
    en: 'Drop your resume here',
  },
  'memory.pdf.docx.or.txt.4.mb.maximum': {
    fr: 'PDF, DOCX ou TXT · 4 Mo maximum',
    en: 'PDF, DOCX, or TXT · 4 MB maximum',
  },
  'memory.choose.a.file': {
    fr: 'Choisir un fichier',
    en: 'Choose a file',
  },
  'memory.or.paste.text': {
    fr: 'Ou collez du texte',
    en: 'Or paste text',
  },
  'memory.resume.linkedin.export.or.career.notes': {
    fr: 'CV, export LinkedIn ou notes de parcours.',
    en: 'Resume, LinkedIn export, or career notes.',
  },
  'memory.source.type.2': {
    fr: 'Nature de la source',
    en: 'Source type',
  },
  'memory.linkedin.profile': {
    fr: 'Profil LinkedIn',
    en: 'LinkedIn profile',
  },
  'memory.resume.as.text': {
    fr: 'CV en texte',
    en: 'Resume as text',
  },
  'memory.career.notes': {
    fr: 'Notes de parcours',
    en: 'Career notes',
  },
  'memory.content.to.analyze': {
    fr: 'Contenu à analyser',
    en: 'Content to analyze',
  },
  'memory.paste.your.profile.text.here': {
    fr: 'Collez ici le texte de votre profil…',
    en: 'Paste your profile text here…',
  },
  'memory.read.this.text': {
    fr: 'Lire ce texte',
    en: 'Read this text',
  },
  'memory.before.you.begin': {
    fr: 'Avant de commencer',
    en: 'Before you begin',
  },
  'memory.privacy.does.not.rely.on.a.vague.promise': {
    fr: 'La confidentialité ne dépend pas d’une promesse floue.',
    en: 'Privacy does not rely on a vague promise.',
  },
  'memory.extraction.in.your.browser': {
    fr: 'Extraction dans votre navigateur',
    en: 'Extraction in your browser',
  },
  'memory.the.raw.file.is.not.sent.to.the.server': {
    fr: 'Le fichier brut n’est pas envoyé au serveur.',
    en: 'The raw file is not sent to the server.',
  },
  'memory.every.claim.remains.editable.or.removable': {
    fr: 'Chaque affirmation reste modifiable ou supprimable.',
    en: 'Every claim remains editable or removable.',
  },
  'memory.review.required': {
    fr: 'Revue obligatoire',
    en: 'Review required',
  },
  'memory.explicit.save': {
    fr: 'Enregistrement explicite',
    en: 'Explicit save',
  },
  'memory.only.your.selection.is.saved.after.confirmation': {
    fr: 'Seule votre sélection est sauvegardée après validation.',
    en: 'Only your selection is saved after confirmation.',
  },
  'memory.extraction.runs.locally.duration.depends.on.the.document.and': {
    fr: 'L’extraction s’exécute localement. La durée dépend du document et de votre appareil.',
    en: 'Extraction runs locally. Duration depends on the document and your device.',
  },
  'memory.career.memory.local.processing': {
    fr: 'Mémoire professionnelle · Lecture locale',
    en: 'Career memory · Local processing',
  },
  'memory.reading.your.source': {
    fr: 'Lecture de votre source',
    en: 'Reading your source',
  },
  'memory.extracting.and.structuring.content': {
    fr: 'Extraction et structuration en cours…',
    en: 'Extracting and structuring content…',
  },
  'memory.cancel.reading': {
    fr: 'Annuler la lecture',
    en: 'Cancel reading',
  },
  'memory.no.percentage.or.time.remaining.is.shown.because.neither': {
    fr: 'Aucun pourcentage ni temps restant n’est affiché : ces informations ne sont pas mesurables de façon fiable pendant la lecture locale.',
    en: 'No percentage or time remaining is shown because neither can be measured reliably during local processing.',
  },
  'memory.review.the.wording.category.privacy.and.uses.before.saving': {
    fr: 'Corrigez les formulations, la catégorie, la confidentialité et les usages avant l’enregistrement.',
    en: 'Review the wording, category, privacy, and uses before saving.',
  },
  'memory.career.memory.2.of.3': {
    fr: 'Mémoire professionnelle · 2 sur 3',
    en: 'Career memory · 2 of 3',
  },
  'memory.review.what.was.extracted': {
    fr: 'Relisez ce qui a été extrait',
    en: 'Review what was extracted',
  },
  'memory.professional.identity': {
    fr: 'Identité professionnelle',
    en: 'Professional identity',
  },
  'memory.pre.filled.from.the.source.never.approved.on.your': {
    fr: 'Préremplie depuis la source, jamais validée à votre place.',
    en: 'Pre-filled from the source, never approved on your behalf.',
  },
  'memory.suggested.claims': {
    fr: 'Affirmations proposées',
    en: 'Suggested claims',
  },
  'memory.of': {
    fr: 'sur',
    en: 'of',
  },
  'memory.selected': {
    fr: 'sélectionnée',
    en: 'selected',
  },
  'memory.select.all': {
    fr: 'Tout sélectionner',
    en: 'Select all',
  },
  'memory.no.usable.claim': {
    fr: 'Aucune affirmation exploitable',
    en: 'No usable claim',
  },
  'memory.this.source.does.not.contain.enough.structured.text.try': {
    fr: 'Cette source ne contient pas assez de texte structuré. Essayez un autre fichier ou collez le contenu directement.',
    en: 'This source does not contain enough structured text. Try another file or paste the content directly.',
  },
  'memory.local.source': {
    fr: 'Source locale',
    en: 'Local source',
  },
  'memory.step.3': {
    fr: 'Étape 3',
    en: 'Step 3',
  },
  'memory.your.confirmation': {
    fr: 'Votre validation',
    en: 'Your confirmation',
  },
  'memory.only.the': {
    fr: 'Seules les',
    en: 'Only the',
  },
  'memory.selected.claims.will.be.saved.each.keeps.the.chosen': {
    fr: 'affirmations sélectionnées seront enregistrées. Chacune conserve le statut choisi ; les statuts non publiables restent bloqués.',
    en: 'selected claims will be saved. Each keeps the chosen status; non-publishable statuses remain blocked.',
  },
  'memory.i.reviewed.this.selection.and.authorize.the.listed.uses': {
    fr: 'J’ai relu cette sélection et j’autorise les usages indiqués.',
    en: 'I reviewed this selection and authorize the listed uses.',
  },
  'memory.confirm.and.save': {
    fr: 'Valider et enregistrer',
    en: 'Confirm and save',
  },
  'memory.only.when.you.click.here.does.the.selection.leave': {
    fr: 'C’est à ce clic, et seulement à ce clic, que la sélection quitte votre navigateur.',
    en: 'Only when you click here does the selection leave your browser.',
  },
  'memory.select.claim': {
    fr: 'Sélectionner l’affirmation',
    en: 'Select claim',
  },
  'memory.choose.at.least.one.use.or.remove.this.claim': {
    fr: 'Choisissez au moins un usage ou retirez cette affirmation.',
    en: 'Choose at least one use or remove this claim.',
  },
  'memory.view.source.excerpt': {
    fr: 'Voir l’extrait source',
    en: 'View source excerpt',
  },
  'memory.career.memory.complete': {
    fr: 'Mémoire professionnelle · terminée',
    en: 'Career memory · complete',
  },
  'memory.your.selection.is.saved': {
    fr: 'Votre sélection est enregistrée.',
    en: 'Your selection is saved.',
  },
  'memory.the.selected.information.is.now.available.in.your.career': {
    fr: 'Les informations retenues sont maintenant disponibles dans votre mémoire, avec leur source, leur sensibilité et leurs usages.',
    en: 'The selected information is now available in your career memory with its source, sensitivity, and uses.',
  },
  'memory.open.my.career.memory': {
    fr: 'Ouvrir ma mémoire',
    en: 'Open my career memory',
  },
  'memory.add.another.source': {
    fr: 'Ajouter une autre source',
    en: 'Add another source',
  },
  'memory.profile.and.summary': {
    fr: 'Profil et synthèse',
    en: 'Profile and summary',
  },
  'memory.other.information': {
    fr: 'Autre information',
    en: 'Other information',
  },
  'memory.restricted': {
    fr: 'Restreint',
    en: 'Restricted',
  },
  'memory.declared.by.you': {
    fr: 'Déclaré par vous',
    en: 'Declared by you',
  },
  'memory.inferred.needs.confirmation': {
    fr: 'Inféré, à confirmer',
    en: 'Inferred, needs confirmation',
  },
  'memory.unsupported.2': {
    fr: 'Non soutenu',
    en: 'Unsupported',
  },
  'memory.manual.entry': { fr: 'Saisie manuelle', en: 'Manual entry' },
} as const satisfies MessageDictionary;
