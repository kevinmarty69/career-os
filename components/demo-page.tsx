'use client';

import { LocaleSwitch, useLocalizer } from '@/components/i18n/i18n-provider';
import { demoMessages } from '@/lib/i18n/dictionaries/demo';
import styles from './demo-page.module.css';

const steps = [
  {
    title: 'Mémoire professionnelle',
    copy: 'Une affirmation datée, reliée à sa source.',
    proof: 'Temps de build p50 ramené de 11 à 7 minutes.',
    meta: 'platform_postmortem.md · §4',
  },
  {
    title: 'Appariement avec l’offre',
    copy: 'Les agents retiennent les preuves utiles et rendent les inconnues visibles.',
    proof: 'Staff Platform Engineer',
    meta: '2 forces vérifiées · 1 inconnue explicite',
  },
  {
    title: 'Revue humaine',
    copy: 'La formulation dépasse la preuve disponible.',
    proof:
      'L’agent propose « 42 % plus rapide ». La source démontre 11 → 7 minutes.',
    meta: 'Correction retenue',
    warning: true,
  },
  {
    title: 'Page privée',
    copy: 'Une synthèse personnalisée, traçable et prête à partager après validation.',
    proof:
      'Je construis des plateformes qu’une petite équipe peut exploiter sereinement.',
    meta: 'Aperçu fictif · Non publié',
  },
] as const;

const principles = [
  {
    title: 'Des preuves sourcées',
    copy: 'Les affirmations restent reliées à des documents datés.',
  },
  {
    title: 'Des agents sous contrôle',
    copy: 'Les agents proposent. La personne tranche les formulations sensibles.',
  },
  {
    title: 'Aucune action réelle',
    copy: 'Ce parcours est statique, sans import, publication ni contact externe.',
  },
] as const;

export function DemoPage() {
  const localize = useLocalizer([demoMessages]);
  return localize(
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div className={styles.brand}>
            <span aria-hidden="true" className={styles.mark} />
            Career OS
          </div>
          <LocaleSwitch compact />
        </header>

        <section className={styles.hero}>
          <p className={styles.eyebrow}>Démo fictive · Lecture seule</p>
          <h1>Voir comment les preuves deviennent une candidature.</h1>
          <p className={styles.intro}>
            Alex Morgan, Signal Forge et chaque donnée affichée ici sont
            fictifs. Cette démo ne modifie aucune donnée et ne contacte
            personne.
          </p>
        </section>

        <section aria-label="Ce que la démo montre" className={styles.flow}>
          {steps.map((step, index) => (
            <article className={styles.step} key={step.title}>
              <span className={styles.number}>{index + 1}</span>
              <h2>{step.title}</h2>
              <p>{step.copy}</p>
              <div
                className={`${styles.evidence}${'warning' in step ? ` ${styles.warning}` : ''}`}
              >
                <strong>{step.proof}</strong>
                <span>{step.meta}</span>
              </div>
            </article>
          ))}
        </section>

        <section
          aria-labelledby="demo-principles"
          className={styles.principles}
        >
          <h2 id="demo-principles" hidden>
            Ce que la démo montre
          </h2>
          {principles.map((principle) => (
            <article className={styles.principle} key={principle.title}>
              <h2>{principle.title}</h2>
              <p>{principle.copy}</p>
            </article>
          ))}
        </section>

        <footer className={styles.footer}>
          <strong>Produit open source</strong>
          <p>
            Career OS transforme une mémoire professionnelle sourcée en
            candidatures personnalisées et vérifiables.
          </p>
        </footer>
      </div>
    </main>,
  );
}
