# Career OS — kit logo (direction A · Noyau)

Symbole retenu : quatre modules identiques en rotation d'un quart de tour autour d'un noyau carré.
Grille de 64, rayon 2 sur chaque pièce, marge de 8 unités. Aucun dégradé, aucun effet raster.

## Contenu

    brand/
      symbol/   careeros-symbol.svg            currentColor (à privilégier en app)
                careeros-symbol-ink.svg        #16181C
                careeros-symbol-inverse.svg    #F7F6F3
                careeros-symbol-accent.svg     encre + noyau violet (fond clair)
                careeros-symbol-accent-dark.svg encre claire + noyau violet clair (fond sombre)
      lockup/   careeros-lockup-light.svg      symbole + wordmark, fond clair
                careeros-lockup-dark.svg       symbole + wordmark, fond sombre
                careeros-lockup-mono.svg       currentColor
      favicon/  favicon.svg                    tuile encre r14 + signe clair
                favicon-16.svg                 géométrie épaissie pour 16 px
                apple-touch-icon.svg           180×180, padding 34

## Couleurs

| Rôle | Source de vérité | Fallback hex |
|---|---|---|
| Encre | `#16181C` | `#16181C` |
| Papier | `#F7F6F3` | `#F7F6F3` |
| Accent noyau (clair) | `oklch(0.55 0.17 293)` | `#6E3CD8` |
| Accent noyau (sombre) | `oklch(0.68 0.15 293)` | `#9C74EE` |

Les hex sont des approximations : l'oklch est la référence. Seul le noyau peut porter l'accent.

## Règles d'usage

- Zone de respect : 0,5 × la hauteur du signe sur les quatre côtés.
- Taille minimale du symbole : 24 px (utiliser `favicon-16.svg` en dessous).
- Largeur minimale du lockup : 132 px.
- Un seul accent coloré actif à l'écran ; sur fond violet, le signe passe en papier plein.
- Interdits : dégradé, ombre, contour, rotation, changement de proportion entre modules et noyau.

## Intégration

```html
<link rel="icon" href="/brand/favicon/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/brand/favicon/apple-touch-icon.svg">
```

Le symbole `currentColor` suit la couleur de texte du parent — préférable à deux fichiers en thème clair/sombre :

```jsx
export function CareerOsMark({ size = 24, core }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} fill="currentColor" role="img" aria-label="Career OS">
      <rect x="10" y="8" width="26" height="10" rx="2" />
      <rect x="46" y="10" width="10" height="26" rx="2" />
      <rect x="28" y="46" width="26" height="10" rx="2" />
      <rect x="8" y="28" width="10" height="26" rx="2" />
      <rect x="26" y="26" width="12" height="12" rx="2" fill={core ?? "currentColor"} />
    </svg>
  );
}
```

## Wordmark

`Career OS` — Space Grotesk Medium (500), interlettrage -0,045 em, casse conservée. Onze SVG au total dans `brand/`.
Les fichiers de lockup contiennent un `<text>` vivant. Un SVG chargé via `<img>`, en CSS `background`,
en e-mail ou à l'impression **n'a pas accès aux webfonts de la page** : le wordmark tombe alors sur la
police système et l'interlettrage `-1.9` (calibré pour Space Grotesk) devient faux.

- Web : inliner le SVG dans le document (ou utiliser `careeros-lockup-mono.svg` inliné), avec Space Grotesk chargée ;
  ou composer le lockup en HTML — symbole SVG + `<span>` texte — ce qui reste la voie la plus sûre.
- Tout le reste (`<img>`, e-mail, print, OG image) : vectoriser le texte (Convert to outlines) et remplacer
  les trois fichiers de `lockup/`.

```html
<span style="display:inline-flex;align-items:center;gap:14px;font-family:'Space Grotesk',sans-serif;
             font-weight:500;font-size:24px;letter-spacing:-0.045em;color:#16181C">
  <img src="/brand/symbol/careeros-symbol-ink.svg" alt="" width="26" height="26">Career OS
</span>
```

## Reste à produire hors navigateur

- `favicon.ico` multi-résolutions (16/32/48) et PNG 192/512 pour le manifest : rasterisation depuis `favicon.svg` / `favicon-16.svg`.
- Recherche d'antériorité (INPI / EUIPO, classes 9 et 42) avant dépôt.
