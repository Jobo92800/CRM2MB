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
5. **`render()` / `switchView()`** : aiguillage entre les 6 vues

### Les 6 vues (`data-view`)

| Vue | Fonction | Rôle |
|---|---|---|
| `pipeline` | `renderPipeline` / `renderKanban` | Kanban par statut + fiche prospect (`renderModal`, 750 lignes) |
| `agenda` | `renderAgenda` | Vue jour style Google Agenda par commerciale + vue liste |
| `dashboard` | `renderDashboard` | Stats par commerciale / centre / soin / thérapeute, presets de période |
| `therapeutes` | `renderTherapeutes` | Les appels passés **depuis les centres** et ce qu'ils rapportent : centre par centre, thérapeute par thérapeute |
| `direction` | `renderDirection` | Tunnel, CA réel, centres, équipe commerciale, **thérapeutes en centre**, acquisition, alertes |
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

- **`AIRTABLE_PAT` sert maintenant uniquement à `therapeutes-api`** : ne pas la retirer du site.
  L'ancienne fonction `airtable-proxy.js`, ouverte en lecture/écriture sans authentification, a été
  supprimée le 3 nov. 2026 avec son code mort (`proxyCall`, `isDeployed`). Les journaux Netlify
  montraient un seul appel en sept jours, celui du test de diagnostic. Le CRM du bureau n'a jamais
  utilisé cette fonction : il attaque Airtable en direct avec le token collé par l'utilisatrice.
- **Le README est faux** sur deux points : il annonce un accès « sans login » (il y a un écran PAT) et
  présente `AIRTABLE_PAT` comme indispensable (le proxy n'est pas branché).
- **Migration automatique** dans `loadProspects()` : sur tout navigateur dont le flag
  `mabeautyplus_repondu_migrated_v3` est absent, l'app réécrit en masse les champs `Répondu Appel 1/2/3`
  à partir d'heuristiques regex sur les notes. Un vidage de `localStorage` relance cette écriture massive.
- **Historique Git inexploitable** : les 178 commits sont des « Add files via upload » faits depuis
  l'interface web GitHub (remplacement complet du fichier). À partir de maintenant, travailler en local
  avec de vrais messages de commit.
- **Ne jamais remettre `stopAutoRefresh()` dans `openModal`.** C'était là au départ, pour protéger
  une saisie en cours, et ça gelait la fiche ouverte : un appel enregistré par une thérapeute
  n'apparaissait jamais, et le bouton d'actualisation est caché derrière la fiche. La protection
  passe maintenant par `state.isDirty` dans `rafraichirFicheOuverte()` (l. ~4490).
- **Sept champs Airtable ont été ajoutés le 5 nov. 2026** d'après le livret de formation :
  `Note vocale envoyée` (renommage de `SMS ou vocal laissé`), `SMS R2 envoyé`, `SMS R3 envoyé`,
  `1er Appel 2e essai`, `Habite à proximité`, `Peut venir chaque semaine`, `Antécédents médicaux`.
  Tous écrits par l'espace thérapeutes, tous lus par le CRM, **tous dans `FN_HORS_ARCHIVE`**.
- **Ne jamais écrire le champ `SMS` depuis l'espace thérapeutes.** Le CRM le range dans les
  « automations actives » (avec Brevo, Email relance, Rappel Calendly) : une case cochée par une
  thérapeute y ferait croire qu'une automatisation est partie. Le SMS ou le vocal laissé après un
  1er appel sans réponse a son propre champ, `SMS ou vocal laissé` (créé le 5 nov. 2026), affiché
  en pastille à côté du 1er appel dans l'historique de la fiche — et présent, comme les autres
  champs de l'espace thérapeutes, dans `FN_HORS_ARCHIVE`.
- **Huit champs Airtable relient les deux applications**, créés le 2 nov. 2026 sur
  `Prospects Master` : `Dispo thérapeutes` (case) et `Dispo thérapeutes depuis` (date), écrits par
  l'onglet Gestion centre et lus par `therapeutes-api` ; `Appel 1/2/3 depuis centre` (cases) et
  `Appel 1/2/3 thérapeute` (texte), posés par `therapeutes-api` quand une thérapeute enregistre un
  appel, et affichés ensemble en pastille (« Sophie · centre ») dans l'historique de la fiche CRM.
  Aucun des huit **n'existe** dans la table d'archive, d'où leur présence en tête de
  `FN_HORS_ARCHIVE` : les retirer de cette liste ferait échouer tout le chargement de la vue
  Direction.
- **La vue `therapeutes` (« Dashboard thérapeutes », `renderTherapeutes`) ne compte que les centres.**
  Un appel n'y entre que si la fiche porte `Appel N depuis centre` : les appels du bureau sur les
  mêmes fiches n'y sont pas. Elle reprend mot pour mot les conventions d'attribution de la section
  « Thérapeutes en centre » de la vue Direction — l'appel compte pour qui l'a signé, le bilan placé
  et la cure pour la thérapeute du **dernier** appel de la fiche, le CA vient de CRM News quand la
  cliente y est retrouvée. Si une de ces règles change d'un côté, elle doit changer de l'autre,
  sinon les deux écrans se contredisent devant la même personne. Sa période est `state.therapPeriod`,
  distincte de celle du Dashboard manager, et `getDashboardRange(periode)` sert les deux. Le bloc
  « La pile ouverte en ce moment » ne dépend pas de la période : il réutilise `gestionProspectsCentre`
  et `gestionUrgence`, donc il dit exactement ce que l'espace d'appels affiche aux centres.
  **Depuis le 10 nov. 2026, « Performance des thérapeutes » et « Performance par centre » sont
  dessinées comme « Performance des commerciales » du Dashboard manager** : mêmes cartes, même barre
  de CA (`therapBarre`, part du meilleur de la liste), mêmes libellés — bilans placés, conversions,
  conv. bilan, conv. cure, taux réponse, délai moyen 1er appel. Deux pièges y tiennent : le **taux
  réponse des cartes se compte par fiche** (comme `calc.callStats` au bureau) et non par appel comme
  la carte « Elles ont répondu » du haut, et le **délai** part de la création de la fiche, donc il
  porte aussi le temps que le bureau a mis à l'ouvrir au centre. Les deux sont écrits dans le bloc
  « Comment ces chiffres sont comptés », qui doit suivre si l'un des deux change.

- **La section « Thérapeutes en centre » (`renderDirTherapeutesSection`) croise deux bases.** Le bloc
  « Au téléphone » vient de `Prospects Master` : un appel compte pour la thérapeute dont le nom est
  dans `Appel N thérapeute`, et un bilan placé est attribué à celle du **dernier** appel enregistré sur
  la fiche — c'est une convention, pas une vérité d'Airtable, et elle est écrite sous le tableau. Le bloc
  « En centre » vient de `state.clients` (CRM News) via le champ `Thérapeute` de la table `Clients`.
  Deux conséquences à ne pas oublier : les fiches de l'archive n'ont pas ces champs, donc leurs appels
  sont invisibles ici ; et le filtre « commerciale » du cockpit ne s'applique volontairement pas à
  cette section (une thérapeute n'est pas rattachée à une commerciale).
  **CRM News ne remplit pas toujours `Thérapeute`** (environ une fiche sur quatre, dont celles créées
  depuis un compte sans profil thérapeute). Sans filet, ces ventes n'apparaîtraient nulle part : la
  cliente est donc rattachée à la thérapeute du dernier appel de sa fiche prospect, via `dirClientFor`
  (rapprochement par téléphone), et le chiffre porte alors un °. Ce qui reste impossible à rattacher
  va dans la ligne « Non attribuée » : elle existe pour que le total du tableau égale toujours le vrai
  total CRM News — ne pas la supprimer. Les noms sont enfin regroupés **sans tenir compte de la
  casse** : une thérapeute signe parfois « caroll » dans l'espace d'appels et « Caroll » dans CRM
  News, ce qui ferait sinon deux lignes pour une seule personne.
- **`STATUTS_A_APPELER` et `GESTION_STATUTS` sont jumeaux.** Le premier est dans
  `netlify/functions/therapeutes-api.js`, le second dans `index.html` (onglet Gestion centre). Si
  les deux divergent, le bureau ouvre aux centres des fiches que l'espace thérapeutes ne montrera
  jamais — et personne ne voit l'erreur. Depuis le 6 nov. 2026 :
  `['Nouveau', 'Réinscrit', 'À rappeler', 'R2', 'R3', 'Bilan annulé']`. `therapeutes.html` en a une
  troisième copie, `STATUTS_LISTE`, qui ne sert qu'à l'ordre des pastilles de filtre : elle doit
  lister les mêmes statuts, sinon un filtre manque ou pointe dans le vide. Un statut ouvert aux
  centres doit aussi être **visible dans le pipeline du bureau** (`STATUTS_MASQUES`, vide depuis le
  6 nov. 2026), sinon les fiches que les centres posent deviennent introuvables.
- **Les documents du bureau sont servis tels quels, en PDF** : le bouton « Documents » de la barre
  ouvre un panneau à onglets qui liste `DOCUMENTS` — le livret commercial
  (`assets/livret-commercial-therapeutes.pdf`, 22 pages) et les trois fiches d'information destinées
  au médecin d'une cliente (`assets/fiche-medecin-*.pdf`, une page chacune, ajoutées le
  9 nov. 2026). Ne pas les retranscrire dans le code — cela a été fait puis défait le 6 nov. 2026 :
  deux versions divergent. Nouveau document = une entrée dans `DOCUMENTS` et un fichier dans
  `assets/` ; nouvelle version = on remplace le fichier. Leurs pages sont dessinées par pdf.js puis
  aplaties en images — pas d'`iframe` : le lecteur du navigateur impose sa barre d'outils et ses
  miniatures, `#toolbar=0` ne marche plus, et `X-Frame-Options: DENY` interdit le cadre même en même
  origine. Ne pas desserrer cet en-tête, et garder le repli vers le lien : pdf.js est la seule
  dépendance externe, elle doit rester facultative. **`chargerPdfJs` garde sa promesse**
  (`pdfJsEnRoute`) : sans cela, deux documents demandés coup sur coup posaient deux balises
  `<script>`, pdf.js s'exécutait deux fois et les documents en cours restaient suspendus.
- **Les scripts de l'appel sont recopiés mot pour mot** dans `therapeutes.html` (`MESSAGES`). Le
  livret interdit de les réécrire. Là où il ne fige pas de texte, on affiche la consigne. Là où le livret ne fige pas de texte (le SMS
  **Ne jamais inventer un script.**
- **Au premier contact, le second appel commande.** Le livret demande deux appels à cinq minutes
  d'écart avant la note vocale. Tant que `1er Appel 2e essai` manque et que personne n'a décroché
  (`premierContactIncomplet`), l'espace d'appels n'affiche ni le texte de la note vocale ni la carte
  R2, et n'en coche aucune — mais **l'enregistrement reste ouvert** : la thérapeute note son premier
  appel, la fiche reste en `Nouveau` et remonte en tête de sa liste, elle revient cocher le second
  cinq minutes plus tard. Ne pas remettre un verrou sur l'enregistrement : c'est précisément ce qui
  est demandé. Et `enregistrerAppel` ne réécrit jamais un `1er Appel` déjà en base.

- **Une note d'appel se corrige sans toucher à l'appel.** L'historique de l'espace d'appels ouvre
  chaque note passée et n'envoie que `notesN` : `modifier` ne pose la trace « depuis centre » et le
  prénom de la thérapeute que sur les cycles dont la requête porte la date d'appel, donc l'heure, la
  date et la signature d'origine restent. Le cycle en cours en est exclu — il se saisit dans le
  formulaire. L'historique se redessine seul (`#historique`, `dessinerHistorique`) : ne jamais
  remplacer cet appel par un `dessinerFiche()`, qui effacerait la saisie d'appel en cours.

- **La thérapeute ne choisit jamais un statut.** Elle envoie une clé de `SUITES`
  (`r2` / `r3` / `arappeler` / `injoignable` / `perdu` / `bilan`) ; `therapeutes-api` seule décide
  du statut correspondant, seule `bilan` réclame une date et seule `arappeler` efface un rappel
  déjà noté. Ajouter une suite = ajouter une entrée dans
  `SUITES` côté fonction **et** dans `suitesPour()` de `therapeutes.html` : jamais un statut en dur
  dans le navigateur. Les clés `rappel` et `calendlyPris` ne sont plus proposées par l'interface
  depuis le 5 nov. 2026 ; elles ne restent dans la fonction que pour les pages ouvertes pendant un
  déploiement, et sont supprimables.
- **`Statut changé le` est un champ calculé, jamais écrit.** Créé le 5 nov. 2026 sur
  `Prospects Master`, c'est un « last modified time » restreint au seul champ `Statut` : il se met à
  jour tout seul, d'où que vienne le changement, et il s'est rempli rétroactivement d'après
  l'historique des révisions. Il sert à l'ancienneté du statut affichée sur la fiche thérapeute
  (« R2 · depuis 9 jours »). Ne jamais le mettre dans `CHAMPS_ECRITURE`, et ne jamais écrire à la
  main une date de changement de statut en parallèle : il y en aurait deux, qui divergeraient.
- **L'agenda n'affichait aucun rappel simple** jusqu'au 4 nov. 2026 : `getAgendaEvents()` construisait
  bien l'événement de type `rappel`, mais ce type manquait dans `state.agendaEventTypes` par défaut
  **et** aucune pastille de filtre ne permettait de l'activer. Tout rappel posé — par une commerciale
  comme par une thérapeute — était donc silencieusement jeté. La pastille « Rappel » existe maintenant,
  active par défaut. Ne pas la retirer en croyant nettoyer une duplication avec « Calendly pris ».
- **Un rappel et un Calendly pris partagent le champ `Prochain rappel`** : c'est le `Statut` qui les
  distingue dans `getAgendaEvents()` (`calendlyPris` si le statut vaut `Calendly pris`, sinon `rappel`).
  Un Calendly pris posé depuis un centre n'écrit **ni** `RDV Calendly` **ni** la case `Calendly` :
  les KPI Calendly de la vue Direction comptent `RDV Calendly` et doivent rester le reflet des vraies
  prises de RDV par l'outil Calendly.
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
