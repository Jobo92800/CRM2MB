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
`Nouveau`, `À rappeler`, `Potentiel`, `R2` ou `R3`.

La mise à disposition se décide dans l'onglet **Gestion centre** du CRM du bureau : une case
`Dispo thérapeutes` par prospect, posée centre par centre selon les besoins de la journée.
Sans cette case, le prospect reste invisible — y compris si quelqu'un forge la requête à la main,
puisque le filtre est appliqué côté serveur.

Un prospect sort tout seul de la mise à disposition dès qu'il quitte la pile d'appels — bilan
posé ou Calendly pris : la case se décoche et la date se vide.

La liste est classée par urgence : rappels en retard, puis jamais appelées (les plus anciennes
d'abord), puis rappels à venir, puis le reste.

Sur la fiche : identité, téléphone cliquable, d'où vient le prospect, depuis quand, les réponses
au formulaire Facebook quand il y en a, la note interne du bureau, et l'historique des appels.

Jamais envoyés au navigateur : montant de cure, thérapeute, champs webinaire, Calendly, et tout
ce qui ne figure pas dans `CHAMPS_LUS`.

## Ce qu'elle peut écrire

Date d'appel, « a répondu » ou non, notes du cycle en cours, et la suite qu'elle donne à l'appel.
**Elle ne choisit aucun statut** : ce champ n'est pas dans `CHAMPS_ECRITURE`, et un statut glissé
dans la requête est ignoré.

### La suite de l'appel

Sous « Et maintenant ? », trois cartes d'option — aucune n'est obligatoire. Elle envoie une clé
(`modifs.suite`) et une date (`modifs.suiteDate`) ; c'est `SUITES`, dans la fonction, qui décide
du statut. Le navigateur n'en décide jamais, et une clé inconnue est refusée en 400.

| Carte | Clé | Statut posé | Ce que le serveur écrit |
| --- | --- | --- | --- |
| À rappeler | `rappel` | `À rappeler` | `Prochain rappel` à la date donnée. La fiche **reste** dans sa liste. |
| Calendly pris | `calendlyPris` | `Calendly pris` | `Prochain rappel` à la date donnée. La fiche sort de sa liste. |
| Bilan placé | `bilan` | `Bilan placé` | `Bilan placé le : ` à la date, `Date Bilan Placé` à maintenant, `Prochain rappel` effacé. La fiche sort de sa liste. |

« Calendly pris » sert quand la personne a décroché mais ne peut pas parler maintenant : la
thérapeute convient d'un horaire, et le bureau retrouve le rendez-vous **dans son agenda**. Rappel
et Calendly pris passent tous deux par `Prochain rappel` : c'est le statut qui les distingue à
l'affichage (`getAgendaEvents`, pastille ambre pour un rappel, cyan pour un Calendly pris). Rien
n'est écrit dans `RDV Calendly` ni dans la case `Calendly` : un rendez-vous convenu au téléphone
n'est pas une prise de RDV par l'outil Calendly, et les KPI Calendly du dashboard direction, qui
comptent `RDV Calendly`, restent justes.

Sans date, rien n'est envoyé : un statut sans son rendez-vous ne veut rien dire. Sans choix de
suite, l'appel est enregistré et la fiche reste telle quelle.

Compatibilité : une page restée ouverte pendant un déploiement n'envoie que `bilanPlaceLe` ;
la fonction le comprend encore et le traite comme `suite: 'bilan'`.

Chaque appel enregistré ici est marqué `Appel N depuis centre` et signé du prénom dans
`Appel N thérapeute`. Le bureau voit la pastille « Sophie · centre » à côté de la date, dans
l'historique de la fiche. C'est le serveur qui pose la marque et la signature : le navigateur de
la thérapeute ne peut pas les retirer.

Le prénom est saisi une fois, gardé dans le navigateur (`mabeautyplus_therapeutes_prenom`) et
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
- Un « Calendly pris » posé depuis un centre n'apparaît pas dans les compteurs Calendly du
  dashboard direction, qui comptent le champ `RDV Calendly`. À revoir si le volume devient
  significatif.
