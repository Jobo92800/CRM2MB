# CRM2MB — analyse de reprise

Analyse du 2 novembre 2026. Dépôt cloné depuis https://github.com/Jobo92800/CRM2MB (HEAD `f6a2f84`,
2 nov. 2026 10:08). Rien n'a été modifié ni poussé.

---

## 1. Ce qu'est le projet

Un CRM commercial complet, en production, utilisé par l'équipe. 3 fichiers seulement :

| Fichier | Taille | Rôle |
|---|---|---|
| `index.html` | 340 Ko / 5 651 lignes | **Toute l'application** |
| `netlify/functions/airtable-proxy.js` | 2,2 Ko | Proxy Airtable — **jamais appelé** |
| `netlify.toml` | 267 o | Config Netlify |

Stack : HTML + Tailwind CDN + JavaScript vanilla. Pas de build, pas de `package.json`, pas de tests,
pas de `.gitignore`. Données : 2 bases Airtable attaquées **directement depuis le navigateur**.

En ligne sur https://crmnews.netlify.app (projet Netlify `crmnews`), redéployé à chaque push sur `main`.

Fonctionnellement, c'est loin d'être un prototype : Kanban 17 statuts, fiche prospect éditable,
agenda jour par commerciale, dashboard multi-axes avec presets de période, vue Direction
(tunnel de conversion, CA réel rapproché par téléphone, alertes), notifications Calendly sonores,
cache local, rapport hebdo généré, dark mode, animation de célébration sur « Bilan placé ».

---

## 2. Les 3 problèmes à régler en priorité

### 2.1 🔴 La fonction Netlify est une porte ouverte sur les données clients

`netlify/functions/airtable-proxy.js` accepte `list`, `update` et `create` sur la table
`Prospects Master`, avec `Access-Control-Allow-Origin: *` et **aucune authentification**. Elle utilise
la variable d'environnement `AIRTABLE_PAT` du site.

J'ai vérifié sur le site en ligne (requête `{"action":"ping"}`) : la réponse est `400 Unknown action`
et non `500 AIRTABLE_PAT missing` — **la variable est bien configurée**, donc l'endpoint est actif.

Conséquence : n'importe qui connaissant l'URL peut lire, modifier et créer des fiches prospects
(noms, téléphones, emails, objectifs de perte de poids, montants de cure). Le dépôt étant public,
le chemin de la fonction est connu. C'est une exposition de données personnelles de santé au sens RGPD.

Le plus simple : **la fonction n'est pas utilisée par l'application** (`proxyCall()` est défini ligne 881
et jamais appelé). La supprimer et retirer la variable `AIRTABLE_PAT` du site ferme la faille sans
rien casser.

### 2.2 🔴 Un PAT Airtable complet dans le navigateur de chaque commerciale

Tout passe par `directCall` / `directCallBase` : l'appel part du navigateur avec le token collé par
l'utilisatrice, conservé en clair dans `localStorage` (`mabeautyplus_airtable_pat`).

Problèmes : le token donne les droits du PAT sur les deux bases (lecture **et** écriture, hors du CRM
aussi), il survit indéfiniment, il n'est pas révocable par utilisatrice si tout le monde partage le même,
et il reste lisible par n'importe quelle extension de navigateur ou script tiers chargé sur la page
(Tailwind CDN, Google Fonts).

La correction propre est l'inverse de 2.1 : **remettre tout le trafic derrière la fonction Netlify**, et
protéger cette fonction (mot de passe partagé, Netlify Identity, ou simple en-tête secret). Le code du
proxy existe déjà, il lui manque l'authentification et la gestion de la 2ᵉ base + de la table d'archive.

### 2.3 🟠 Le dépôt est public

`"private": false`. Il expose les identifiants de bases Airtable, les noms de tables et de champs,
la liste des centres, les prénoms de l'équipe et toute la logique commerciale. Aucun secret au sens
strict (j'ai cherché : aucun PAT en clair dans l'historique, seul un `patXXXXXXXXXXXXXX` d'exemple).
À passer en privé.

---

## 3. Dette technique

### 3.1 Un seul fichier de 5 651 lignes

Les plus grosses fonctions :

| Lignes | Fonction |
|---|---|
| 751 | `renderModal()` |
| 589 | `renderDashboard()` |
| 166 | `renderDirection()` |
| 165 | `renderFilters()` |
| 136 | `renderCard()` |
| 136 | `getFiltered()` |

Le rendu se fait par concaténation de chaînes dans `innerHTML` (40 occurrences), avec re-branchement
manuel des handlers après chaque rendu. Ça fonctionne, mais une modification de la fiche prospect
oblige à relire 750 lignes. L'échappement HTML, lui, est sérieux : `escapeHtml()` est appelé 109 fois,
je n'ai pas trouvé d'injection exploitable.

Un découpage en plusieurs fichiers (`constants.js`, `airtable.js`, `views/*.js`) sans changer de
framework serait déjà un gros gain, et reste compatible avec Netlify sans build.

### 3.2 Historique Git inutilisable

178 commits, dont l'immense majorité sont des paires `Delete index.html` / `Add files via upload` :
le fichier a été remplacé entièrement depuis l'interface web de GitHub à chaque itération. Impossible
de savoir quand ni pourquoi une règle métier a changé.

Maintenant que le dépôt est cloné en local, on repart sur des commits normaux et descriptifs.

### 3.3 Une écriture de masse déclenchée côté client

Dans `loadProspects()`, un bloc de migration réécrit les champs `Répondu Appel 1/2/3` pour tous les
prospects dont les notes ne correspondent pas à des motifs regex de non-réponse, par lots de 10, puis
pose le flag `mabeautyplus_repondu_migrated_v3` dans `localStorage`.

Ce code a fait son travail une fois, mais il se redéclenche sur tout nouveau navigateur ou après un
vidage de `localStorage` — soit des centaines de `PATCH` Airtable involontaires. À supprimer.

### 3.4 Charge Airtable

Chaque client télécharge **toute** la table (pagination 100 par 100, plafond 10 000) toutes les 120 s,
plus l'archive et la base Clients au premier chargement. Avec plusieurs commerciales connectées en
permanence, on consomme beaucoup de quota pour peu de changements. Un filtrage serveur
(`filterByFormula` sur les statuts actifs) ou une synchro incrémentale sur `Derniere Modif`
réduirait ça fortement.

### 3.5 Divers

- Le README est faux : il annonce « sans login » (il y a un écran PAT) et présente `AIRTABLE_PAT`
  comme indispensable (le proxy n'est pas branché).
- `netlify.toml` pose `X-Frame-Options`, `X-Content-Type-Options` et `Referrer-Policy`, mais pas de CSP —
  ce qui serait utile justement parce qu'un token vit dans `localStorage`.
- Tailwind en CDN affiche un avertissement de production en console et dépend d'un tiers au runtime.
- Pas de `.gitignore` (le `.netlify/` créé par le link local doit être ignoré).
- Mélange `var` / `const` / `let` et deux styles de fonctions : cohérent par section, pas sur l'ensemble.

---

## 4. Modèle de données

### Base principale `appNML7rJEKiWkuVg`

- `Prospects Master` — lecture + écriture. ~60 champs mappés dans `FN` (l. 512) : identité, 3 cycles
  d'appel (date / notes / répondu), Calendly, bilan, conversion, montant de cure, thérapeute,
  13 champs Webinaire, réponses du formulaire Facebook.
- `Perdu / Injoignable` — archive, lue par la vue Direction. Les champs listés dans `FN_HORS_ARCHIVE`
  n'y existent pas ; les demander fait échouer **toute** la requête. Piège à retenir.

### Base CRM News `appI97jEL2mSCg3Wc`

- `Clients` — CA réel : `Montant Cure` + `Montant cure 2..9` (renouvellements), `Bilan seul`, `Avoir`,
  `Centre`, `Thérapeute`. Rapprochement avec les prospects par téléphone normalisé
  (`dirNormTel`, index `dirClientIndex`, clé ≥ 11 caractères).

### Référentiels codés en dur dans le front

6 libellés de centres (Le Crès, Avignon, Cabestany, Pollestres, Le Grau-du-Roi, Sérignan) pour
5 centres réels, 10 soins, 4 sources,
17 statuts de pipeline, 7 commerciales. Toute évolution Airtable doit être répercutée ici à la main.

### ✅ Cabestany et Pollestres sont le même centre — corrigé en local, pas déployé

Le centre a déménagé de Cabestany à Pollestres. Les deux libellés coexistent dans `CENTRES`, et rien
dans le code ne les rapproche : partout où les statistiques sont ventilées par centre, ce centre
unique compte pour **deux lignes**, avec son CA, ses bilans et son taux de conversion coupés en deux
selon la date d'entrée du prospect.

Endroits concernés :

| Lignes | Fonction | Effet |
|---|---|---|
| 1436 | `renderFilters` | Deux pastilles de filtre, dont une qui ne ramène que l'historique |
| 3287 | `generateWeeklyReport` | Deux lignes dans le rapport hebdo |
| 3436, 3621 | `renderDashboard` | Deux lignes de stats et deux blocs de détail |
| 2248 | `renderDirCentresSection` | Deux lignes dans le tableau Direction (les centres y sont déduits des données, pas de `CENTRES`) |
| 1005 | mapping clients CRM News | Le CA réel est lui aussi scindé |

**Correctif proposé, sans aucune écriture dans Airtable.** Le code a déjà le bon patron avec
`normalizeSoin` (l. 784), qui réconcilie `mesojet` / `Mésojet`. On ajoute le même pour les centres :

```js
function normalizeCentre(v) {
  if (!v) return v;
  if (v === 'Cabestany') return 'Pollestres';  // le centre a déménagé
  return v;
}
```

**Appliqué le 2 novembre 2026** (4 modifications, +10 / -3 lignes, non poussé) :

1. `normalizeCentre()` ajoutée l. 790, juste après `normalizeSoin`
2. Branchée l. 814 dans `recordToProspect` — couvre `Prospects Master` **et** l'archive
   `Perdu / Injoignable`, qui passe par le même mapper
3. Branchée l. 1012 sur les clients CRM News — le CA réel est donc recollé lui aussi
4. Ligne `Cabestany` retirée de `CENTRES` : plus aucun prospect ne porte ce libellé en mémoire,
   la pastille et les lignes de stats correspondantes auraient affiché 0 partout

Les vues Direction n'avaient besoin d'aucune retouche : leur liste de centres est déduite des données
(`new Set(state.prospects.map(p => p.centre))`, l. 2248 et 2555), donc la normalisation en lecture
suffit.

Vérifications faites : syntaxe JS validée (`node --check` sur les 5 152 lignes du bloc script),
7 assertions sur `normalizeCentre` et `CENTRES`, et test de bout en bout dans le navigateur sur
`recordToProspect` — une fiche Airtable portant `Centre: 'Cabestany'` ressort bien en `Pollestres`,
`Avignon` est inchangé, la liste d'affichage compte 5 centres. L'application démarre sans erreur
console.

Effet de bord à connaître : si une commerciale ouvre une vieille fiche Cabestany et l'enregistre,
le champ `Centre` sera réécrit en `Pollestres` dans Airtable. C'est cohérent avec la réalité, mais
c'est bien une écriture.

---

## 5. Plan de reprise proposé

**Étape 1 — sécuriser (urgent, sans toucher au fonctionnel)**
1. Passer le dépôt GitHub en privé.
2. Supprimer `netlify/functions/airtable-proxy.js` et la variable `AIRTABLE_PAT` du site `crmnews`,
   ou brancher le proxy et l'authentifier. Tant que la décision n'est pas prise, la suppression ferme
   la faille immédiatement.
3. Faire tourner le PAT Airtable utilisé par l'équipe.

**Étape 2 — assainir**
4. Ajouter `.gitignore`, corriger le README, supprimer le bloc de migration `repondu_migrated_v3`
   et le code mort (`proxyCall`, `isDeployed`).
5. Premier vrai commit local, revue de l'aperçu Netlify avant mise en production.

**Étape 3 — architecture**
6. Sortir le JS de `index.html` en modules ES, découper `renderModal` et `renderDashboard`.
7. Rebrancher les appels Airtable derrière une fonction Netlify authentifiée, pour sortir le token
   du navigateur.

**Étape 4 — performance**
8. Filtrage serveur ou synchro incrémentale plutôt que le rechargement complet toutes les 2 minutes.
