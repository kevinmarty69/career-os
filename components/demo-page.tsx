'use client';

import { LocaleSwitch, useTranslations } from '@/components/i18n/i18n-provider';
import { demoMessages } from '@/lib/i18n/dictionaries/demo';
import styles from './demo-page.module.css';

export function DemoPage() {
  const t = useTranslations([demoMessages]);

  const steps = [
    {
      title: t('demo.career.memory'),
      copy: t('demo.a.dated.claim.connected.to.its.source'),
      proof: t('demo.reduced.build.p50.from.11.to.7.minutes'),
      meta: 'platform_postmortem.md · §4',
    },
    {
      title: t('demo.opportunity.match'),
      copy: t('demo.agents.select.relevant.evidence.and.keep.unknowns.visible'),
      proof: t('demo.staff.platform.engineer'),
      meta: t('demo.2.verified.strengths.1.explicit.unknown'),
    },
    {
      title: t('demo.human.review'),
      copy: t('demo.the.wording.exceeds.the.available.evidence'),
      proof: t('demo.the.agent.proposes.42.faster.the.source.supports.11'),
      meta: t('demo.accepted.correction'),
      warning: true,
    },
    {
      title: t('demo.private.page'),
      copy: t(
        'demo.a.tailored.traceable.summary.ready.to.share.after.approval',
      ),
      proof: t('demo.i.build.platforms.a.small.team.can.operate.with'),
      meta: t('demo.synthetic.preview.not.published'),
    },
  ] as const;
  const principles = [
    {
      title: t('demo.sourced.evidence'),
      copy: t('demo.claims.stay.connected.to.dated.documents'),
    },
    {
      title: t('demo.agents.under.control'),
      copy: t('demo.agents.propose.the.person.decides.sensitive.wording'),
    },
    {
      title: t('demo.no.real.world.action'),
      copy: t('demo.this.journey.is.static.with.no.import.publication.or'),
    },
  ] as const;
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div className={styles.brand}>
            <span aria-hidden="true" className={styles.mark} />
            careeros
          </div>
          <LocaleSwitch compact />
        </header>

        <section className={styles.hero}>
          <p className={styles.eyebrow}>{t('demo.synthetic.demo.read.only')}</p>
          <h1>{t('demo.see.how.evidence.becomes.an.application')}</h1>
          <p className={styles.intro}>
            {t('demo.alex.morgan.signal.forge.and.every.data.point.shown')}{' '}
          </p>
        </section>

        <section
          aria-label={t('demo.what.this.demo.shows')}
          className={styles.flow}
        >
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
            {t('demo.what.this.demo.shows')}{' '}
          </h2>
          {principles.map((principle) => (
            <article className={styles.principle} key={principle.title}>
              <h2>{principle.title}</h2>
              <p>{principle.copy}</p>
            </article>
          ))}
        </section>

        <footer className={styles.footer}>
          <strong>{t('demo.open.source.product')}</strong>
          <p>
            {t(
              'demo.career.os.turns.a.sourced.career.memory.into.tailored',
            )}{' '}
          </p>
        </footer>
      </div>
    </main>
  );
}
