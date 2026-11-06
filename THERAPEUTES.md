# Espace thérapeutes — mode d'emploi

Sous-application d'appels pour les thérapeutes en centre, à côté du CRM du bureau.
Le CRM `index.html` n'est pas modifié : ce sont des fichiers séparés.

- Écran : `therapeutes.html` → https://crmnews.netlify.app/therapeutes.html
- API : `netlify/functions/therapeutes-api.js`
- Habillage : `assets/da-tokens.css` et `assets/mabeautyplus-logo.svg` (DA MAbeautyplus officielle)

**État : en production depuis le 2 novembre 2026.** La variable `CODES_THERAPEUTES` est posée
sur le projet `crmnews` et les cinq centres ont été vérifiés contre le vrai Airtable.
Les codes eux-mêmes ne sont pas dans ce dépôt — ils ont été transmis à part.

## Le principe

À la connexion, la thérapeute donne **son prénom** et **le code de son centre**. Ce code ne sert pas seulement à entrer :
c'est lui qui détermine, côté serveur, les prospects qu'elle a le droit de voir et de modifier.
Le centre n'est jamais envoyé par le navigateur, il est déduit du code dans la fonction Netlify.

Différence majeure avec le CRM du bureau : **le token Airtable ne quitte jamais le serveur.**
Le navigateur de la thérapeute ne le voit jamais.

## Ce qu'elle voit

Uniquement les prospects **que le bureau lui a ouverts**, dans son centre, et dont le statut est
`Nouveau`, `Réinscrit`, `À rappeler`, `R2`, `R3` ou `Bilan annulé`.

`Réinscrit` et `Bilan annulé` ont été ouverts aux centres le 5 nov. 2026 : le livret demande de
refaire la procédure comme pour un nouveau dans le premier cas, et de rappeler pour comprendre
l'annulation dans le second.

`À rappeler` est revenu le 6 nov. 2026, à la place de `Potentiel`. C'est la case du prospect qui a
répondu et demande qu'on le rappelle **sans heure convenue** : la seule suite qui garde la fiche
dans la pile sans ouvrir de champ de date. Le livret le décrit comme un « suivi individualisé selon
la réponse du prospect ». Il a fallu le remettre aussi dans le pipeline du bureau : `STATUTS_MASQUES`
le cachait depuis le 5 nov., ce qui aurait rendu introuvables au bureau les fiches posées par les
centres. La constante existe toujours, vide.

`Potentiel` a été retiré le 6 nov. 2026. Rien n'en sortait : 170 fiches y dormaient, ouvertes aux
centres, et la pile ne faisait que grossir. Le bouton qui posait ce statut est devenu `Perdu`, qui
sort la fiche de la pile. Les fiches déjà en `Potentiel` restent cochées « Dispo thérapeutes » dans
Airtable — inoffensif, plus rien ne lit cette case pour elles — mais elles ne s'affichent plus,
ni dans l'espace thérapeutes, ni dans l'onglet Gestion centre du bureau.

Cette liste existe en deux endroits qui **doivent rester jumeaux** : `STATUTS_A_APPELER` dans la
fonction, et `GESTION_STATUTS` dans `index.html`. Si le bureau peut ouvrir une fiche que l'espace
thérapeutes ne sait pas montrer, elle disparaît sans un mot. Attention aussi au doublon
`'Bilan annulé '` (avec une espace finale) qui traîne dans les options Airtable : aucune fiche ne
le porte, mais la formule ne le capterait pas.

La mise à disposition se décide dans l'onglet **Gestion centre** du CRM du bureau : une case
`Dispo thérapeutes` par prospect, posée centre par centre selon les besoins de la journée.
Sans cette case, le prospect reste invisible — y compris si quelqu'un forge la requête à la main,
puisque le filtre est appliqué côté serveur.

Un prospect sort tout seul de la mise à disposition dès qu'il quitte la pile d'appels — bilan
posé ou Calendly pris : la case se décoche et la date se vide.

La liste est classée par urgence, et depuis le 6 nov. 2026 **les nouveaux passent devant** :
`Nouveau` et `Réinscrit` que personne n'a encore appelés, puis les rappels en retard, puis les
jamais appelées dont le statut dit le contraire, puis les rappels à venir, puis le reste — les plus
anciennes d'abord à l'intérieur de chaque rang, pour que personne ne reste au fond de la pile
(`priorite()`). Un nouveau à qui on a promis un rappel à une heure à venir attend cette heure : la
promesse passe devant la fraîcheur. Deux autres tris sont proposés : les plus anciennes d'abord, ou
par prénom.

**La pastille de la carte dit depuis quand la fiche porte son statut** (« depuis 6 jours »), parce
que c'est ça qui montre qu'on est en train de l'oublier. Elle remplace depuis le 6 nov. 2026 les
anciens libellés « À rappeler maintenant », « Jamais appelée » et « N appels passés ». Seule
exception, le rappel promis à une heure encore à venir : là c'est l'heure qui s'affiche. La date
vient de `Statut changé le`, calculé par Airtable ; ce champ reste vide tant que le statut n'a
jamais bougé, et c'est alors la création qui fait foi — une fiche née `Nouveau` porte bien ce
statut depuis sa création (`depuisStatut()`).

**La rangée de filtres montre tous les statuts de la pile**, dans l'ordre du process, même à zéro :
la pastille reste en place et ne se clique pas (`STATUTS_LISTE`). Avant, elle n'affichait que les
statuts présents et changeait de forme d'un chargement à l'autre — un centre sans réinscrit ne
savait pas que le filtre existait. Un statut inattendu, si le bureau en ajoute un, se glisse à la
fin plutôt que de passer inaperçu.

**Chaque statut a sa teinte**, prise dans la rampe « terrain » de la charte, de la fiche la plus
fraîche à la plus travaillée : Nouveau et Réinscrit (1), Bilan annulé (2), À rappeler (3), R2 (4),
R3 (5) — `À rappeler` a repris le 6 nov. 2026 le cran laissé libre par `Potentiel`. La carte
prend le fond, la pastille de statut et la pastille de filtre prennent le texte (`TEINTES_STATUT`).
Un statut absent de la table reste sur carte blanche — la rampe ne s'invente pas, elle n'a que cinq
crans. Le liseré de gauche continue, lui, de marquer l'urgence : les deux informations se lisent
d'un coup d'œil sans se confondre.

Comme le fond est pris par la teinte, le survol et la sélection se marquent au filet et à l'ombre.
**Ces règles doivent rester après les règles `.teinte-N` dans la feuille de style** : à spécificité
égale, la dernière gagne, et la teinte effacerait le liseré aqua de la carte sélectionnée.

Au-dessus de la liste, une pastille par statut présent, avec son compte ; la rangée disparaît quand
il n'y a qu'un seul statut, il n'y aurait rien à filtrer. Le filtre et le tri ne sont pas mémorisés
d'une session à l'autre : la journée commence sur la liste complète, classée par urgence.

Sur la fiche : le **statut en cours et depuis quand** (« R2 · depuis 9 jours », en tête du bloc
d'identité), l'identité, le téléphone cliquable, d'où vient le prospect, depuis quand, les réponses
au formulaire Facebook quand il y en a, la note interne du bureau, et l'historique des appels.

L'ancienneté du statut vient de `Statut changé le`, un champ **calculé par Airtable** (« last
modified time » restreint au seul champ `Statut`). Il se met à jour tout seul d'où que vienne le
changement — bureau, centre, automatisation, saisie directe dans la table — et il était déjà
rempli rétroactivement à sa création, d'après l'historique des révisions. Aucune des deux
applications ne l'écrit, et aucune ne le peut.

Jamais envoyés au navigateur : montant de cure, thérapeute, champs webinaire, Calendly, et tout
ce qui ne figure pas dans `CHAMPS_LUS`.

## Ce qu'elle peut écrire

Date d'appel, « a répondu » ou non, notes du cycle en cours, la case SMS / vocal, et la suite
qu'elle donne à l'appel.
**Elle ne choisit aucun statut** : ce champ n'est pas dans `CHAMPS_ECRITURE`, et un statut glissé
dans la requête est ignoré.

### Le livret de formation dans l'application

Les textes du livret de formation commerciale (novembre 2026) sont recopiés **mot pour mot** dans
`therapeutes.html` : le livret dit « les scripts sont communs à tous les centres : on ne les
réécrit pas ». Les crochets (`[Prénom]`, `[Votre prénom]`, `[Nom du centre]`, `[Ville]`,
`[Nom de famille]`) sont remplis à l'affichage par `remplir()` ; ce qui reste inconnu s'affiche en
clair, pour qu'elle voie le trou à combler.

Deux ensembles :

- **`LIVRET`** — le livret en entier, ses deux parties et ses dix-huit sections, du process
  quotidien à la fiche réflexe. Il ne vit plus dans la fiche du prospect : depuis le 6 nov. 2026
  il s'ouvre par-dessus l'espace, par le bouton **Process commercial** de la barre.
- **`MESSAGES`** — le message à laisser quand personne ne décroche, choisi par
  `ETAPE_DU_STATUT` d'après le statut du prospect : note vocale (Nouveau, Réinscrit), SMS R2,
  SMS R3, SMS de reprise (Bilan annulé). Un statut absent de `ETAPE_DU_STATUT` n'a pas de message
  figé. Le SMS de reprise n'a pas de texte figé dans le livret : on affiche la consigne,
  **on n'invente pas de script**.

Le livret **ne recopie pas** les textes des SMS et de la note vocale : ses sections 4, 5, 6 et 8
pointent sur `MESSAGES` (bloc `{ message: 'r2' }`), celui-là même que la fiche propose à l'appel.
Une seule version, donc, et pas deux qui finiraient par diverger.

Pas de bouton « copier » : le téléphone des thérapeutes n'est pas relié à leur ordinateur.

**Le panneau se referme d'un clic à côté de la carte** (`#livret`, classe `.voile`), ou par Échap,
ou par le bouton Fermer : c'est le geste le plus court pour revenir aux informations du client. Un
clic *dans* la carte ne ferme rien — le test porte sur `e.target === this`. Le panneau se redessine
à chaque ouverture, pour que les crochets portent le prénom du prospect ouvert à cet instant-là.

**Le discours a quitté la fiche le 6 nov. 2026.** Il y vivait dans un pliant qui, déplié, ajoutait
près de 800 pixels entre l'identité de la personne et le formulaire d'appel. La carte des
vérifications reste, elle, repliée (`details.pliant`) et doit le rester ; sa barre annonce son état
(« Rien de validé », « Un point sur deux », « Les deux points sont validés ») pour qu'on sache sans
ouvrir.

**Le SMS de dernière relance (étape 5) n'est pas proposé pendant l'appel.** Une fiche passée en
« Injoignable » quitte la liste du centre, et à R3 le message à envoyer est celui de R3 — en montrer
deux dans le même appel reviendrait à multiplier les relances, ce que le livret interdit. Le texte
se lit dans le livret (section 8), mais aucun bouton ne le coche : il attend qu'on décide qui
l'envoie, le bureau ou le centre si on lui ouvre le statut.

### Ce qu'il faut vérifier

Trois points que le livret fait valider avant de placer un bilan, dans leur propre carte :
`Habite à proximité`, `Peut venir chaque semaine` (cases) et `Antécédents médicaux` (texte libre).
Le point de vigilance du livret est affiché en permanence : cancer de moins de 5 ans → avis médical
avant le rendez-vous, et un appel 15 jours après. Le CRM les affiche sous « Vérifié au téléphone ».

### Le premier contact se fait en deux appels

Le livret demande deux appels à cinq minutes d'écart avant la note vocale. Au cycle 1, deux boutons
horodatent chaque essai : le premier alimente `1er Appel`, le second `1er Appel 2e essai`. Si elle
ne s'en sert pas, `1er Appel` prend l'heure de l'enregistrement, comme avant. Le CRM affiche le
second essai en pastille à côté du premier appel.

### La case du message

Quand elle coche « Pas de réponse », le message de l'étape s'affiche avec sa case. Un champ
Airtable par étape — `Note vocale envoyée`, `SMS R2 envoyé`, `SMS R3 envoyé` — parce que le bureau
doit pouvoir dire **lequel** est parti, pas seulement qu'il y en a eu un. Tant que la case n'est pas
cochée, le texte à côté du bouton d'enregistrement le rappelle. C'est un rappel, pas un verrou :
l'appel s'enregistre dans tous les cas.

**À ne pas confondre avec le champ `SMS`**, que le CRM range dans les « automations actives » : y
écrire depuis un centre ferait croire au bureau qu'une automatisation est partie.

### La suite de l'appel

Sous « Et maintenant ? », quatre cartes d'option — aucune n'est obligatoire. Elle envoie une clé
(`modifs.suite`), et une date (`modifs.suiteDate`) pour les seules suites datées ; c'est `SUITES`,
dans la fonction, qui décide du statut. Le navigateur n'en décide jamais, et une clé inconnue est
refusée en 400.

| Carte | Clé | Statut posé | Date | Reste dans sa liste |
| --- | --- | --- | --- | --- |
| R2 | `r2` | `R2` | non | oui |
| R3 | `r3` | `R3` | non | oui |
| Injoignable | `injoignable` | `Injoignable` | non | non |
| À rappeler | `arappeler` | `À rappeler` | non | oui |
| Perdu | `perdu` | `Perdu` | non | non |
| Bilan placé | `bilan` | `Bilan placé` | oui | non |

`À rappeler` (6 nov. 2026) est la seule suite qui **efface** un rappel déjà noté (`videRappel` dans
`SUITES`) : elle veut dire « dès que possible, sans heure convenue », et une date laissée en place
ferait dormir la fiche jusqu'à ce jour-là. Dans la liste, la fiche remonte au rang des rappels à
honorer, départagée par l'ancienneté du statut : celle qui attend depuis le plus longtemps passe
devant (`priorite()`). Le liseré est rose comme un retard, mais le rang s'appelle `rappeler` et non
`retard`, pour que le compteur « en retard » ne compte que de vrais retards.

`Perdu` a remplacé `Potentiel` le 6 nov. 2026. C'est la seule carte destructrice de l'espace : elle
archive le prospect côté bureau (le pipeline masque `Perdu` et `Injoignable`). Elle reste à sa
place, en deuxième, parce que rien ne part sans le second clic sur « Enregistrer l'appel » et que
le résumé de la carte annonce la sortie de la liste.

**La première carte suit l'échelle des relances** et dépend du statut du prospect : `R2` par
défaut, `R3` quand il est déjà en R2, `Injoignable` quand il est en R3 (`suitesPour()` dans
`therapeutes.html`). Le bouton se transforme donc tout seul d'un appel au suivant : la thérapeute
n'a jamais à savoir où elle en est. Le serveur, lui, honore la clé qu'on lui donne sans vérifier
la progression — les six statuts sont tous légitimes.

**« Pas de réponse » coche cette carte d'elle-même** (`etat.suiteAuto`) : le cas courant ne demande
alors qu'un geste. Repasser sur « Elle a répondu » la décoche, mais seulement si c'est l'appli qui
l'avait cochée — un choix fait à la main n'est jamais défait.

`Bilan placé` écrit en plus `Bilan placé le : ` à la date donnée, `Date Bilan Placé` à maintenant,
et efface `Prochain rappel` : le rendez-vous au centre remplace le rappel. Sans date, rien n'est
envoyé — un rendez-vous sans heure ne veut rien dire. Sans choix de suite, l'appel est enregistré
et la fiche reste telle quelle.

Les clés `rappel`, `calendlyPris` et l'ancien `bilanPlaceLe` ont été **supprimées** le 5 nov. 2026
et ne sont pas revenues : `arappeler` est une clé neuve, qui ne pose aucune date. Les anciennes
renvoient une erreur 400, qu'un rechargement de page règle.

Chaque appel enregistré ici est marqué `Appel N depuis centre` et signé du prénom dans
`Appel N thérapeute`. Le bureau voit la pastille « Sophie · centre » à côté de la date, dans
l'historique de la fiche. C'est le serveur qui pose la marque et la signature : le navigateur de
la thérapeute ne peut pas les retirer.

Le prénom se **choisit dans une liste**, il ne se tape plus : la constante `THERAPEUTES` en haut
du script donne l'équipe de chaque centre. La saisie libre produisait « caroll » et « Caroll »,
soit deux personnes différentes dans le suivi du bureau — pour une seule. L'écran de connexion
montre tous les centres (le centre n'est connu qu'après le code) ; une fois connectée, la barre du
haut ne propose plus que son équipe. `RENFORT` tient à part les prénoms du bureau qui viennent
tenir un centre quand une thérapeute est malade : ils apparaissent sous « Renfort du bureau »,
dans tous les centres, sans appartenir à aucun. **Quand une thérapeute arrive ou s'en va, c'est cette
constante qu'il faut modifier.** Une option « Autre… » rend le champ libre, pour qu'une nouvelle
venue puisse travailler le jour même sans attendre une mise à jour — c'est la seule porte par
laquelle une orthographe inattendue peut encore entrer.

Le prénom est gardé dans le navigateur (`mabeautyplus_therapeutes_prenom`) et
modifiable à tout moment depuis la barre du haut. Tant qu'il est vide, le champ s'ouvre en
évidence et prend le curseur — c'est le cas des thérapeutes déjà connectées avant que la
signature existe, qui ne repassent pas par l'écran de connexion. « Quitter » l'efface, puisque le poste du centre
est partagé. **Ce n'est pas une identification** : le code appartient à tout le centre, donc le
prénom est une signature de bonne foi, pas une preuve.

## Mise en service

1. Choisir un code par centre, long et non devinable (pas « pollestres2026 ») :

```bash
node -e "console.log(require('crypto').randomBytes(9).toString('base64url'))"
```

2. Poser la variable sur Netlify — **Site configuration → Environment variables**, ou en ligne
   de commande depuis ce dossier (déjà lié au projet `crmnews`) :

```bash
netlify env:set CODES_THERAPEUTES '{"CODE-POLLESTRES":"Pollestres","CODE-SERIGNAN":"Sérignan","CODE-LE-CRES":"Le Crès","CODE-AVIGNON":"Avignon","CODE-GRAU":"Le Grau-du-Roi"}'
```

Les libellés de centre à droite doivent être **exactement** ceux d'Airtable. `Pollestres` ouvre
aussi l'historique `Cabestany` (alias `ALIAS_CENTRE`).

3. Déployer, puis transmettre à chaque centre son code et le lien.

4. **Ouvrir des prospects.** Tant que personne n'a coché de fiche dans « Gestion centre », les
   thérapeutes voient une liste vide. C'est volontaire : le bureau garde la main.

Pour changer un code (départ d'une thérapeute, code qui circule), il suffit de refaire l'étape 2 :
l'ancien code cesse de fonctionner au redéploiement, sans toucher à Airtable.

## Ce qui reste ouvert

- **Pas de création de prospect** : écarté volontairement. À rouvrir si les centres reçoivent
  des appels entrants.
- La thérapeute ne peut pas poser de date de RDV au centre : elle place le bilan, le bureau
  fixe l'horaire.
- **Elle ne peut toujours pas programmer de rappel daté.** La carte « À rappeler » revenue le
  6 nov. 2026 pose le statut sans heure : rien ne part dans l'agenda des commerciales depuis un
  centre, et la carte « Calendly pris » reste retirée. À rouvrir si le besoin revient : la
  mécanique de la date est intacte côté serveur (`SUITES`, champ `date`).
- Le statut n'est pas affiché sur les cartes de la liste, seulement sur la fiche ouverte.
