import { workflowErrorLabel } from '../../components/applications/workflow-labels';
import { dossierMessages } from '../../lib/i18n/dictionaries/dossier';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  I18nProvider,
  useTranslations,
} from '../../components/i18n/i18n-provider';
import { createTranslator } from '../../lib/i18n/messages';

const messages = {
  'navigation.home': { fr: 'Accueil', en: 'Home' },
  'greeting.company': { fr: 'Bonjour {company}', en: 'Hello {company}' },
} as const;

test('translates stable keys and preserves parameter values verbatim', () => {
  const t = createTranslator('en', [messages]);
  assert.equal(t('navigation.home'), 'Home');
  assert.equal(
    t('greeting.company', { company: 'Accueil {company} $&' }),
    'Hello Accueil {company} $&',
  );
  assert.equal(
    createTranslator('fr', [messages])('navigation.home'),
    'Accueil',
  );
  assert.throws(
    () => t('toString' as 'navigation.home'),
    /Unknown translation key/,
  );
});

test('locale changes translate UI without changing user text or form values', () => {
  function Form() {
    const t = useTranslations([messages]);
    return createElement(
      'form',
      null,
      createElement('label', null, t('navigation.home')),
      createElement('input', {
        readOnly: true,
        value: 'Accueil',
        title: 'Accueil',
      }),
      createElement('span', null, 'Accueil'),
    );
  }
  for (const initialLocale of ['fr', 'en'] as const) {
    const html = renderToStaticMarkup(
      createElement(I18nProvider, { initialLocale }, createElement(Form)),
    );
    assert.match(html, /value="Accueil"/);
    assert.match(html, /title="Accueil"/);
    assert.match(html, /<span>Accueil<\/span>/);
    assert.ok(
      html.includes(
        `<label>${initialLocale === 'en' ? 'Home' : 'Accueil'}</label>`,
      ),
    );
  }
});

test('workflow errors use explicit UI translations for every state and fallback', () => {
  const english = createTranslator('en', [dossierMessages]);
  const french = createTranslator('fr', [dossierMessages]);
  for (const error of [
    'auth',
    'profile-missing',
    'conflict',
    'rate-limited',
    'worker-unavailable',
    'unavailable',
  ]) {
    assert.notEqual(
      workflowErrorLabel(english, error),
      workflowErrorLabel(french, error),
    );
  }
  assert.equal(
    workflowErrorLabel(english, 'worker-unavailable'),
    'The research worker is unavailable. Check your instance.',
  );
  assert.equal(
    workflowErrorLabel(english, 'unexpected'),
    'The workflow is temporarily unavailable.',
  );
});
