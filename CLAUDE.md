# CRM2MB — CRM commercial MAbeautyplus

CRM visuel utilisé par l'équipe commerciale (Alex, Marie, Leslie, Elisa, Flora, Nico).
Front monopage branché en direct sur Airtable.

- **Dépôt** : https://github.com/Jobo92800/CRM2MB (branche `main`, **public** à ce jour)
- **Site en ligne** : https://crmnews.netlify.app (projet Netlify `crmnews`, équipe MABEAUTYPLUS D)
- **Déploiement** : automatique à chaque push sur `main`

## Règle de publication

**Aucun `git push` et aucun déploiement Netlify sans accord explicite de Jonathan.**
Un push sur `main` déclenche immédiatement la mise en production utilisée par les commerciales.
Travailler en local, montrer le résultat, attendre le feu vert.

**L'application tourne en continu pendant les heures de bureau.** Aucune suppression de fichier,
de variable d'environnement ou de donnée Airtable ne se fait sans accord explicite et sans fenêtre
convenue. Les correctifs se préparent en local et se déploient quand Jonathan le dit.

## Deux applications dans un même dépôt

| | CRM bureau | Espace thérapeutes |
|---|---|---|
| Écran | `index.html` | `therapeutes.html` |
| Qui | les commerciales | les thérapeutes en centre |
| Accès | token Airtable collé par l'utilisatrice | code par centre, token côté serveur |
| Données | tout, tous centres | les prospects de **son** centre que le bureau lui a ouverts |
| Habillage | DA propre au CRM (rose/aqua, Figtree) | DA officielle MAbeautyplus (Poppins) |

Les deux ne partagent aucun code. Toucher à l'un ne touche pas à l'autre.
Mode d'emploi de l'espace thérapeutes : `THERAPEUTES.md`.

## Stack

Pas de build, pas de `package.json`, pas de tests automatisés.

- `index.html` — **tout le CRM bureau** (~5 650 lignes) : HTML, Tailwind via CDN, JS vanilla
- `therapeutes.html` — l'espace thérapeutes, autonome, jetons DA dans `assets/da-tokens.css`
- `netlify/functions/airtable-proxy.js` — proxy du CRM bureau (**code mort**, voir plus bas)
- `netlify/functions/therapeutes-api.js` — API de l'espace thérapeutes, seule à porter le token
- `assets/` — jetons de la DA et logo officiel, utilisés par l'espace thérapeutes uniquement
- `netlify.toml` — `publish = "."`, functions bundlées en esbuild, en-têtes de sécurité

Variables d'environnement Netlify : `AIRTABLE_PAT` et `CODES_THERAPEUTES`, toutes deux posées.

Polices : Figtree (sans) + Fraunces (display). Palette rose/aqua définie dans `tailwind.config` inline.
Attention : cette DA est **propre au CRM** et ne suit pas la skill `mabeautyplus-da`.

## Architecture de `index.html`

Tout est dans un seul `<script>` qui démarre ligne ~502 et se termine par `init()`.

1. **Constantes métier** (l. 507-650) : `FN` (mapping nom de champ Airtable), `CENTRES`, `SOINS`, `SOURCES`, `PIPELINE` (17 statuts), `COMMERCIAUX`
2. **`state`** (l. 622) : objet global unique — prospects, filtres, vue courante, période du dashboard, etc.
3. **Couche réseau** (l. 877-1090) : `directCall` / `directCallBase` → `api.airtable.com` **depuis le navigateur**
4. **Rendu** : fonctions `renderXxx()` qui écrivent des chaînes dans `innerHTML`, puis rebranchent les handlers. Pas de framework, pas de `onclick` inline. `escapeHtml()` est utilisé systématiquement (109 appels).
5. **`render()` / `switchView()`** : aiguillage entre les 4 vues

### Les 4 vues (`data-view`)

| Vue | Fonction | Rôle |
|---|---|---|
| `pipeline` | `renderPipeline` / `renderKanban` | Kanban par statut + fiche prospect (`renderModal`, 750 lignes) |
| `agenda` | `renderAgenda` | Vue jour style Google Agenda par commerciale + vue liste |
| `dashboard` | `renderDashboard` | Stats par commerciale / centre / soin / thérapeute, presets de période |
| `direction` | `renderDirection` | Tunnel, CA réel, centres, équipe, acquisition, alertes |
| `gestion` | `renderGestion` | Choix des prospects ouverts aux thérapeutes, centre par centre |

## Données

Deux bases Airtable, lues directement depuis le navigateur :

- **`appNML7rJEKiWkuVg`** — base principale
  - table `Prospects Master` : les prospects (lecture + écriture)
  - table `Perdu / Injoignable` : archive, lue par la vue Direction. Certains champs n'y existent pas → liste `FN_HORS_ARCHIVE`, sinon Airtable rejette toute la requête.
- **`appI97jEL2mSCg3Wc`** — base CRM News, table `Clients` : CA réel, rapproché aux prospects par téléphone normalisé (`dirNormTel` + `dirClientIndex`)

`Prospects Master` est la même base que celle utilisée par la skill `mabeautyplus-reconciliation`.

### Authentification

Écran de setup : chaque utilisatrice colle un **Personal Access Token Airtable**, stocké en clair dans
`localStorage` sous `mabeautyplus_airtable_pat`. Il n'y a pas d'autre authentification.

Autres clés `localStorage` : `mabeautyplus_darkmode`, `mabeautyplus_dismissed_notifs`,
`mabeautyplus_prospects_cache_v1`, `mabeautyplus_repondu_migrated_v3`.

### Cycle de chargement

`loadProspects()` affiche d'abord le cache local, puis pagine toute la table (100 par 100, plafond
10 000), et rafraîchit en tâche de fond toutes les **120 s**. Les notifications Calendly sont vérifiées
toutes les 30 s.

## Points à connaître avant de toucher au code

- **La fonction Netlify n'est pas utilisée.** `proxyCall()` et `isDeployed()` sont définis et jamais
  appelés ; tout passe par `directCall`. La variable `AIRTABLE_PAT` est pourtant bien configurée sur
  le site, ce qui laisse `/.netlify/functions/airtable-proxy` ouvert en lecture/écriture sans aucune
  authentification (CORS `*`). Jonathan juge le risque limité (seule l'équipe du bureau utilise
  l'outil), mais la fonction reste du code mort à retirer dès qu'une fenêtre est possible.
- **Le README est faux** sur deux points : il annonce un accès « sans login » (il y a un écran PAT) et
  présente `AIRTABLE_PAT` comme indispensable (le proxy n'est pas branché).
- **Migration automatique** dans `loadProspects()` : sur tout navigateur dont le flag
  `mabeautyplus_repondu_migrated_v3` est absent, l'app réécrit en masse les champs `Répondu Appel 1/2/3`
  à partir d'heuristiques regex sur les notes. Un vidage de `localStorage` relance cette écriture massive.
- **Historique Git inexploitable** : les 178 commits sont des « Add files via upload » faits depuis
  l'interface web GitHub (remplacement complet du fichier). À partir de maintenant, travailler en local
  avec de vrais messages de commit.
- **Deux champs Airtable pilotent l'espace thérapeutes** : `Dispo thérapeutes` (case) et
  `Dispo thérapeutes depuis` (date), créés le 2 nov. 2026 sur `Prospects Master`. Ils sont écrits
  par l'onglet Gestion centre et lus par la fonction `therapeutes-api`. Ils **n'existent pas** dans
  la table d'archive, d'où leur présence en tête de `FN_HORS_ARCHIVE` : les retirer de cette liste
  ferait échouer tout le chargement de la vue Direction.
- Les noms de champs Airtable contiennent des espaces et des accents significatifs, parfois une espace
  finale (`'RDV - Centre '`, `'Bilan placé le : '`). Ne jamais « corriger » une clé de `FN` sans vérifier
  dans Airtable.
- **`Cabestany` et `Pollestres` sont le même centre** : il a déménagé. `normalizeCentre()` (l. 790)
  ramène l'historique sous `Pollestres` à la lecture, et `Cabestany` ne figure plus dans `CENTRES`.
  Rien n'est réécrit dans Airtable : les deux libellés y coexistent toujours. Corollaire : si une
  vieille fiche Cabestany est enregistrée depuis le CRM, son champ `Centre` passe à `Pollestres`.
  En production depuis le 2 nov. 2026.
- `STATUTS_MASQUES = ['À rappeler']` masque une colonne du Kanban ; `state.hiddenStatuts` masque Perdu
  et Injoignable par défaut.

## Travailler sur le projet

```
# servir en local
cd "CRM2MB" && python3 -m http.server 8080
```

Le dossier est lié au projet Netlify `crmnews` (`netlify link` déjà fait).
Pour un aperçu avant production : `netlify deploy` (draft) — et seulement sur demande.
