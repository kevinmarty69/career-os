'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocalizer } from '@/components/i18n/i18n-provider';
import { AppShell, Icon } from '@/components/kit-route-page';
import { searchProfilesMessages } from '@/lib/i18n/dictionaries/search-profiles';
import {
  createSearchProfile,
  deleteSearchProfile,
  readSearchProfiles,
  updateSearchProfile,
} from '@/lib/career-api';
import {
  emptySearchProfile,
  evaluateSearchCriterion,
  searchProfileFieldsSchema,
  searchProfileSchema,
  type PreviewCriterion,
  type SearchProfile,
  type SearchProfileFields,
} from '@/lib/search-profile';
import styles from './search-profiles.module.css';

const criterionOptions: Array<[PreviewCriterion, string]> = [
  ['role', 'Rôle'],
  ['seniority', 'Séniorité'],
  ['location', 'Localisation'],
  ['remoteMode', 'Mode de travail'],
  ['timezone', 'Fuseau horaire'],
  ['language', 'Langue'],
  ['contractType', 'Contrat'],
  ['salary', 'Salaire'],
  ['company', 'Entreprise exclue'],
  ['network', 'Réseau exclu'],
];

export function SearchProfilesPage() {
  const localize = useLocalizer([searchProfilesMessages]);
  const [profiles, setProfiles] = useState<SearchProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [draft, setDraft] = useState<SearchProfileFields>(() => freshProfile());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await readSearchProfiles(controller.signal);
        if (!response.ok) throw new Error(await response.text());
        const body: unknown = await response.json();
        const parsed = searchProfileSchema
          .array()
          .parse(
            typeof body === 'object' &&
              body !== null &&
              'searchProfiles' in body
              ? body.searchProfiles
              : [],
          );
        setProfiles(parsed);
        if (parsed[0]) selectProfile(parsed[0]);
      } catch (caught) {
        if (!controller.signal.aborted)
          setError(
            caught instanceof Error && caught.message === 'Unauthorized'
              ? 'Connectez-vous pour retrouver vos profils de recherche.'
              : 'Impossible de charger vos profils. Réessayez.',
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  function selectProfile(profile: SearchProfile) {
    setSelectedId(profile.searchProfileId);
    setDraft(fieldsFrom(profile));
    setError(undefined);
    setSaved(false);
    setConfirmDelete(false);
  }

  function startNewProfile() {
    setSelectedId(undefined);
    setDraft(freshProfile());
    setError(undefined);
    setSaved(false);
    setConfirmDelete(false);
  }

  async function save() {
    const parsed = searchProfileFieldsSchema.safeParse(draft);
    if (!parsed.success) {
      setError('Donnez un nom au profil et vérifiez les critères saisis.');
      return;
    }
    setSaving(true);
    setSaved(false);
    setError(undefined);
    try {
      const current = profiles.find(
        (profile) => profile.searchProfileId === selectedId,
      );
      const response = current
        ? await updateSearchProfile(
            current.searchProfileId,
            parsed.data,
            current.revision,
          )
        : await createSearchProfile(parsed.data);
      if (!response.ok) {
        if (response.status === 409)
          throw new Error(
            'Ce profil a changé ailleurs ou ce nom existe déjà. Rechargez la page.',
          );
        throw new Error('Impossible d’enregistrer ce profil.');
      }
      const persisted = searchProfileSchema.parse(await response.json());
      setProfiles((currentProfiles) => {
        const exists = currentProfiles.some(
          (profile) => profile.searchProfileId === persisted.searchProfileId,
        );
        return exists
          ? currentProfiles.map((profile) =>
              profile.searchProfileId === persisted.searchProfileId
                ? persisted
                : profile,
            )
          : [persisted, ...currentProfiles];
      });
      setSelectedId(persisted.searchProfileId);
      setDraft(fieldsFrom(persisted));
      setSaved(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Impossible d’enregistrer ce profil.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const current = profiles.find(
      (profile) => profile.searchProfileId === selectedId,
    );
    if (!current) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const response = await deleteSearchProfile(
        current.searchProfileId,
        current.revision,
      );
      if (!response.ok) throw new Error('Impossible de supprimer ce profil.');
      const remaining = profiles.filter(
        (profile) => profile.searchProfileId !== current.searchProfileId,
      );
      setProfiles(remaining);
      if (remaining[0]) selectProfile(remaining[0]);
      else startNewProfile();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Impossible de supprimer ce profil.',
      );
    } finally {
      setSaving(false);
    }
  }

  return localize(
    <AppShell
      path="/search-profiles"
      sidebarContext={
        <div className={styles.sidebarNote}>
          <Icon>filter_alt</Icon>
          <strong>Filtrer sans deviner</strong>
          <span>Une information absente reste à vérifier.</span>
        </div>
      }
      sidebarFooter={<></>}
    >
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <p>Recherche d’offres</p>
            <h1>Profils de recherche</h1>
            <span>
              Définissez ce qui bloque une offre et ce qui améliore seulement
              son classement.
            </span>
          </div>
          <button
            className="co-button quiet"
            onClick={startNewProfile}
            type="button"
          >
            <Icon>add</Icon>Nouveau profil
          </button>
        </header>

        {error ? (
          <div className={styles.error} role="alert">
            <Icon>error</Icon>
            <span>{error}</span>
            {loading ? null : (
              <button onClick={() => location.reload()} type="button">
                Réessayer
              </button>
            )}
          </div>
        ) : null}

        <div className={styles.layout}>
          <aside
            className={styles.profileList}
            aria-label="Profils enregistrés"
          >
            <div>
              <h2>Profils</h2>
              <span>
                {loading ? 'Chargement…' : 'Vos recherches sauvegardées'}
              </span>
            </div>
            {profiles.map((profile) => (
              <button
                aria-pressed={selectedId === profile.searchProfileId}
                className={
                  selectedId === profile.searchProfileId ? styles.selected : ''
                }
                key={profile.searchProfileId}
                onClick={() => selectProfile(profile)}
                type="button"
              >
                <span>{profile.name}</span>
                <small>{profile.active ? 'Actif' : 'En pause'}</small>
              </button>
            ))}
            {!loading && profiles.length === 0 ? (
              <p>Aucun profil enregistré. Commencez par celui-ci.</p>
            ) : null}
          </aside>

          <section className={styles.editor} aria-label="Éditeur du profil">
            <div className={styles.identity}>
              <label>
                <span>Nom du profil</span>
                <input
                  autoComplete="off"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Ex. Product Engineering · Europe"
                  value={draft.name}
                />
              </label>
              <label className={styles.alertThreshold}>
                <span>Seuil d’alerte</span>
                <input
                  aria-describedby="alert-threshold-help"
                  inputMode="numeric"
                  max={100}
                  min={0}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      alertThreshold:
                        event.target.value === ''
                          ? null
                          : Number(event.target.value),
                    }))
                  }
                  placeholder="Désactivé"
                  type="number"
                  value={draft.alertThreshold ?? ''}
                />
                <small id="alert-threshold-help">Signal humain, en %</small>
              </label>
              <label className={styles.switch}>
                <input
                  checked={draft.active}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      active: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                <span>Profil actif</span>
              </label>
            </div>

            <HardConstraints draft={draft} onChange={setDraft} />
            <SoftPreferences draft={draft} onChange={setDraft} />
            <Exclusions draft={draft} onChange={setDraft} />
            <CriterionSimulator hard={draft.hardConstraints} />

            <footer className={styles.actions}>
              <div aria-live="polite">
                {saved
                  ? 'Profil enregistré.'
                  : 'Les changements ne sont pas automatiques.'}
              </div>
              {selectedId ? (
                <button
                  className="co-button danger"
                  disabled={saving}
                  onClick={remove}
                  type="button"
                >
                  {confirmDelete ? 'Confirmer la suppression' : 'Supprimer'}
                </button>
              ) : null}
              <button
                className="co-button"
                disabled={saving}
                onClick={save}
                type="button"
              >
                {saving ? 'Enregistrement…' : 'Enregistrer le profil'}
              </button>
            </footer>
          </section>
        </div>
      </div>
    </AppShell>,
  );
}

function HardConstraints({
  draft,
  onChange,
}: {
  draft: SearchProfileFields;
  onChange: (next: SearchProfileFields) => void;
}) {
  const localize = useLocalizer([searchProfilesMessages]);
  const setHard = <Key extends keyof SearchProfileFields['hardConstraints']>(
    key: Key,
    value: SearchProfileFields['hardConstraints'][Key],
  ) =>
    onChange({
      ...draft,
      hardConstraints: { ...draft.hardConstraints, [key]: value },
    });
  return localize(
    <section className={`${styles.criteria} ${styles.hard}`}>
      <SectionHeading
        icon="block"
        label="Contraintes obligatoires"
        copy="Un écart confirmé bloque la recommandation prioritaire. Une information absente ne bloque jamais."
        badge="Bloquant"
      />
      <div className={styles.fieldGrid}>
        <ListField
          label="Rôles"
          value={draft.hardConstraints.roles}
          onChange={(value) => setHard('roles', value)}
          placeholder="Product Engineer, Software Engineer"
        />
        <ListField
          label="Séniorités"
          value={draft.hardConstraints.seniorities}
          onChange={(value) => setHard('seniorities', value)}
          placeholder="Senior, Staff"
        />
        <ListField
          label="Localisations"
          value={draft.hardConstraints.locations}
          onChange={(value) => setHard('locations', value)}
          placeholder="France, Paris, Europe"
        />
        <ListField
          label="Fuseaux horaires"
          value={draft.hardConstraints.timezones}
          onChange={(value) => setHard('timezones', value)}
          placeholder="Europe/Paris, UTC+1"
        />
        <ListField
          label="Langues de travail"
          value={draft.hardConstraints.languages}
          onChange={(value) => setHard('languages', value)}
          placeholder="Français, Anglais"
        />
        <CheckGroup
          label="Mode de travail"
          options={[
            ['remote', 'Télétravail'],
            ['hybrid', 'Hybride'],
            ['onsite', 'Sur site'],
          ]}
          value={draft.hardConstraints.remoteModes}
          onChange={(value) =>
            setHard(
              'remoteModes',
              value as SearchProfileFields['hardConstraints']['remoteModes'],
            )
          }
        />
        <CheckGroup
          label="Contrats"
          options={[
            ['permanent', 'CDI'],
            ['fixed-term', 'CDD'],
            ['freelance', 'Freelance'],
            ['internship', 'Stage'],
          ]}
          value={draft.hardConstraints.contractTypes}
          onChange={(value) =>
            setHard(
              'contractTypes',
              value as SearchProfileFields['hardConstraints']['contractTypes'],
            )
          }
        />
        <div className={styles.salary}>
          <span>Salaire annuel minimum</span>
          <div>
            <input
              aria-label="Salaire minimum"
              inputMode="numeric"
              min="1"
              onChange={(event) => {
                const amount = Number(event.target.value);
                setHard(
                  'minimumSalary',
                  event.target.value && Number.isFinite(amount) && amount > 0
                    ? {
                        amount,
                        currency:
                          draft.hardConstraints.minimumSalary?.currency ??
                          'EUR',
                      }
                    : undefined,
                );
              }}
              placeholder="80000"
              type="number"
              value={draft.hardConstraints.minimumSalary?.amount ?? ''}
            />
            <select
              aria-label="Devise du salaire minimum"
              onChange={(event) => {
                const current = draft.hardConstraints.minimumSalary;
                if (current)
                  setHard('minimumSalary', {
                    ...current,
                    currency: event.target.value as 'EUR' | 'USD' | 'GBP',
                  });
              }}
              value={draft.hardConstraints.minimumSalary?.currency ?? 'EUR'}
            >
              <option>EUR</option>
              <option>USD</option>
              <option>GBP</option>
            </select>
          </div>
        </div>
      </div>
    </section>,
  );
}

function SoftPreferences({
  draft,
  onChange,
}: {
  draft: SearchProfileFields;
  onChange: (next: SearchProfileFields) => void;
}) {
  const localize = useLocalizer([searchProfilesMessages]);
  const setSoft = <Key extends keyof SearchProfileFields['softPreferences']>(
    key: Key,
    value: string[],
  ) =>
    onChange({
      ...draft,
      softPreferences: { ...draft.softPreferences, [key]: value },
    });
  return localize(
    <section className={`${styles.criteria} ${styles.soft}`}>
      <SectionHeading
        icon="sort"
        label="Préférences"
        copy="Elles améliorent le classement, mais n’éliminent jamais une offre."
        badge="Classement"
      />
      <div className={styles.fieldGrid}>
        <ListField
          label="Stack"
          value={draft.softPreferences.stacks}
          onChange={(value) => setSoft('stacks', value)}
          placeholder="TypeScript, Python, PostgreSQL"
        />
        <ListField
          label="Secteurs"
          value={draft.softPreferences.sectors}
          onChange={(value) => setSoft('sectors', value)}
          placeholder="SaaS B2B, productivité"
        />
        <ListField
          label="Types de produit"
          value={draft.softPreferences.productTypes}
          onChange={(value) => setSoft('productTypes', value)}
          placeholder="Developer tools, Applied AI"
        />
        <ListField
          label="Taille d’entreprise"
          value={draft.softPreferences.companySizes}
          onChange={(value) => setSoft('companySizes', value)}
          placeholder="Startup, scale-up"
        />
        <ListField
          label="Culture et autonomie"
          value={draft.softPreferences.cultures}
          onChange={(value) => setSoft('cultures', value)}
          placeholder="Ownership, équipe produit"
        />
      </div>
    </section>,
  );
}

function Exclusions({
  draft,
  onChange,
}: {
  draft: SearchProfileFields;
  onChange: (next: SearchProfileFields) => void;
}) {
  const localize = useLocalizer([searchProfilesMessages]);
  const setHard = (
    key: 'excludedCompanies' | 'excludedNetworks',
    value: string[],
  ) =>
    onChange({
      ...draft,
      hardConstraints: { ...draft.hardConstraints, [key]: value },
    });
  return localize(
    <section className={`${styles.criteria} ${styles.exclusions}`}>
      <SectionHeading
        icon="visibility_off"
        label="Exclusions confidentielles"
        copy="Ces règles restent dans votre espace et empêchent une recommandation prioritaire."
        badge="Privé"
      />
      <div className={styles.fieldGrid}>
        <ListField
          label="Entreprises à éviter"
          value={draft.hardConstraints.excludedCompanies}
          onChange={(value) => setHard('excludedCompanies', value)}
          placeholder="Entreprise A, Entreprise B"
        />
        <ListField
          label="Réseaux à éviter"
          value={draft.hardConstraints.excludedNetworks}
          onChange={(value) => setHard('excludedNetworks', value)}
          placeholder="Réseau de fondateurs, ancien employeur"
        />
      </div>
    </section>,
  );
}

function CriterionSimulator({
  hard,
}: {
  hard: SearchProfileFields['hardConstraints'];
}) {
  const localize = useLocalizer([searchProfilesMessages]);
  const [criterion, setCriterion] = useState<PreviewCriterion>('role');
  const [value, setValue] = useState('');
  const result = useMemo(
    () => evaluateSearchCriterion(hard, criterion, value),
    [hard, criterion, value],
  );
  const stateCopy = {
    compatible: 'Compatible',
    blocked: 'Bloqué',
    unknown: 'Inconnu',
  }[result.state];
  return localize(
    <section className={styles.simulator}>
      <SectionHeading
        icon="rule"
        label="Tester une offre"
        copy="Vérifiez l’effet exact d’une information avant d’enregistrer le profil."
        badge="Aperçu"
      />
      <div className={styles.simulatorFields}>
        <label>
          <span>Critère</span>
          <select
            aria-label="Critère à tester"
            value={criterion}
            onChange={(event) => {
              setCriterion(event.target.value as PreviewCriterion);
              setValue('');
            }}
          >
            {criterionOptions.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Valeur trouvée dans l’offre</span>
          <input
            aria-label="Valeur de l’offre"
            onChange={(event) => setValue(event.target.value)}
            placeholder={
              criterion === 'salary'
                ? 'Ex. 85000 EUR'
                : 'Laissez vide si elle est absente'
            }
            value={value}
          />
        </label>
        <output
          className={`${styles.preview} ${styles[result.state]}`}
          aria-live="polite"
        >
          <strong>
            <Icon>
              {result.state === 'compatible'
                ? 'check_circle'
                : result.state === 'blocked'
                  ? 'block'
                  : 'help'}
            </Icon>
            {stateCopy}
          </strong>
          <span>{result.explanation}</span>
          {result.state === 'unknown' ? (
            <small>Inconnu ne signifie jamais refusé.</small>
          ) : null}
        </output>
      </div>
    </section>,
  );
}

function SectionHeading({
  icon,
  label,
  copy,
  badge,
}: {
  icon: string;
  label: string;
  copy: string;
  badge: string;
}) {
  return (
    <header className={styles.sectionHeading}>
      <span>
        <Icon>{icon}</Icon>
      </span>
      <div>
        <h2>{label}</h2>
        <p>{copy}</p>
      </div>
      <b>{badge}</b>
    </header>
  );
}

function ListField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const localize = useLocalizer([searchProfilesMessages]);
  return localize(
    <label className={styles.listField}>
      <span>{label}</span>
      <input
        aria-label={label}
        onChange={(event) => onChange(parseList(event.target.value))}
        placeholder={placeholder}
        value={value.join(', ')}
      />
      <small>Séparez les valeurs par une virgule.</small>
    </label>,
  );
}

function CheckGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<[string, string]>;
  value: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const localize = useLocalizer([searchProfilesMessages]);
  return localize(
    <fieldset className={styles.checkGroup}>
      <legend>{label}</legend>
      <div>
        {options.map(([key, copy]) => (
          <label key={key}>
            <input
              checked={value.includes(key)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...value, key]
                    : value.filter((item) => item !== key),
                )
              }
              type="checkbox"
            />
            <span>{copy}</span>
          </label>
        ))}
      </div>
    </fieldset>,
  );
}

function parseList(value: string) {
  const seen = new Set<string>();
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => {
      const key = item.toLocaleLowerCase('fr');
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function freshProfile(): SearchProfileFields {
  return structuredClone(emptySearchProfile);
}

function fieldsFrom(profile: SearchProfile): SearchProfileFields {
  return {
    name: profile.name,
    alertThreshold: profile.alertThreshold,
    active: profile.active,
    hardConstraints: structuredClone(profile.hardConstraints),
    softPreferences: structuredClone(profile.softPreferences),
  };
}
