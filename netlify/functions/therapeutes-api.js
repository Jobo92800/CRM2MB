/* ============================================================================
 * API de l'espace thérapeutes.
 *
 * Principe : le token Airtable ne quitte jamais le serveur. La thérapeute
 * saisit le code de son centre, et c'est ce code — et lui seul — qui décide
 * des prospects qu'elle peut lire et modifier. Le centre n'est jamais envoyé
 * par le navigateur : il est déduit du code, ici.
 *
 * Variables d'environnement Netlify :
 *   AIRTABLE_PAT        le token Airtable (déjà configuré sur le site)
 *   CODES_THERAPEUTES   JSON { "code-du-centre": "Nom du centre", ... }
 * ========================================================================== */

const BASE_ID = 'appNML7rJEKiWkuVg';
const TABLE = 'Prospects Master';
const API = 'https://api.airtable.com/v0';

// Les statuts d'un prospect qui reste à appeler. Tout le reste est invisible
// depuis l'espace thérapeutes : converti, perdu, bilan déjà placé, Calendly…
//   Réinscrit     le livret demande de refaire la procédure comme pour un nouveau
//   Bilan annulé  la thérapeute rappelle pour comprendre pourquoi, et reprogrammer
//   À rappeler   elle a répondu et demande qu'on la rappelle, sans heure convenue.
//                Remis aux centres le 6 nov. 2026 : c'est la seule case qui garde
//                la fiche dans la pile sans date.
// « Potentiel » a fait l'aller-retour : sorti le 6 nov. 2026 parce que rien n'en
// sortait, remis le 16 nov. au matin, ressorti le 16 nov. au soir — le bureau a
// tranché, ces 248 fiches ne sont pas le travail des centres. Ne pas le remettre
// sans le lui demander.
// La même liste existe côté CRM sous le nom GESTION_STATUTS : les deux doivent
// rester jumelles, sinon le bureau et les centres ne voient pas les mêmes fiches.
const STATUTS_A_APPELER = ['Nouveau', 'Réinscrit', 'À rappeler', 'R2', 'R3', 'Bilan annulé'];

// Deux soins que le bureau garde pour lui (16 nov. 2026) : les centres ne les
// appellent pas, quel que soit le statut de la fiche. « Calendly » n'est pas un
// soin au sens strict — c'est la marque d'un rendez-vous pris en ligne, que le
// bureau traite lui-même. Jumelle de GESTION_SOINS_EXCLUS dans index.html.
const SOINS_HORS_CENTRES = ['Anti-âge', 'Calendly'];

// Le 16 nov. 2026, la mise à disposition s'est inversée. Avant, le bureau
// ouvrait les fiches une par une chaque matin depuis l'onglet « Gestion centre »
// et les centres ne voyaient rien d'autre ; en pratique les thérapeutes
// rappelaient déjà presque tout le monde, et la corvée ne servait plus à rien.
// Maintenant un centre voit tout ce qui reste à appeler chez lui, sauf ce que le
// bureau a explicitement retiré. Ce champ est la seule exception : vide partout
// au départ, donc tout est visible sans rien migrer. L'ancien « Dispo
// thérapeutes » reste dans la table pour l'historique, et plus personne ne le lit.
const CHAMP_RETIREE = 'Retirée des centres';

// Une fiche dont le rendez-vous Calendly est **devant elle** sort de la pile du
// centre (20 nov. 2026) : la personne a déjà son rendez-vous, l'appeler n'a pas
// de sens. Le statut ne suffisait pas à les écarter : le routage ne passe pas
// toujours la fiche en « Calendly pris », si bien qu'on trouvait des fiches
// encore en « Nouveau » avec un rendez-vous dans trois jours.
//
// C'est la **date** qui décide, et elle seule :
//   - pas de date, ou date passée  -> la fiche reste dans la pile
//   - date du jour ou à venir       -> la fiche disparaît
//
// Ne pas élargir à « toute trace de Calendly ». Mesuré le 20 nov. 2026 : 85
// fiches portaient une trace quelconque, mais **70 avaient un rendez-vous
// passé** et aucune n'était en « Nouveau » — 49 étaient en plein cycle R2/R3 et
// 10 en « Bilan annulé », c'est-à-dire précisément les fiches qu'une thérapeute
// doit rappeler pour reprogrammer. Les écarter cassait le suivi. Décision du
// bureau : un Calendly annulé ou passé reste le travail du centre.
//
// La case « Calendly » et « Statut RDV Calendly » ne servent pas ici : la case
// n'est jamais cochée sans date, et l'état du rendez-vous dit ce qu'il est
// devenu, pas s'il est à venir.
//
// TODAY() est en UTC. Un rendez-vous entre minuit et 1 h du matin, heure de
// Paris, compterait pour la veille ; les créneaux vont de 8 h à 19 h.
//
// Jumelle de gestionCalendlyAVenir() dans index.html.
const SANS_CALENDLY_A_VENIR =
  'OR({RDV Calendly}=BLANK(),IS_BEFORE({RDV Calendly},TODAY()))';

// Trace de l'origine : le bureau doit pouvoir distinguer, dans l'historique
// d'une fiche, un appel passé depuis un centre d'un appel passé par lui-même.
// C'est le serveur qui la pose, jamais le navigateur de la thérapeute.
const CHAMP_DEPUIS_CENTRE = {
  1: 'Appel 1 depuis centre',
  2: 'Appel 2 depuis centre',
  3: 'Appel 3 depuis centre',
};

// Qui a passé l'appel. Le prénom est saisi une fois à la connexion et renvoyé
// à chaque enregistrement : c'est une signature pour le bureau, pas une
// identification — le code est partagé par tout un centre.
const CHAMP_THERAPEUTE = {
  1: 'Appel 1 thérapeute',
  2: 'Appel 2 thérapeute',
  3: 'Appel 3 thérapeute',
};

function nettoyerPrenom(v) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40);
}

// Champs du bilan posé au centre. La thérapeute donne la date du rendez-vous,
// le serveur en déduit le statut et les dates qui vont avec.
const CHAMP_BILAN_LE = 'Bilan placé le : ';   // l'espace final fait partie du nom
const CHAMP_DATE_BILAN_PLACE = 'Date Bilan Placé';

// Date du dernier changement de statut. C'est un champ calculé par Airtable
// (« last modified time » restreint au seul champ Statut) : il se met à jour
// tout seul, d'où que vienne le changement — bureau, centre, automatisation ou
// saisie directe dans la table. Personne ne l'écrit, et personne ne le peut.
const CHAMP_STATUT_CHANGE_LE = 'Statut changé le';

// Coché par la thérapeute quand elle laisse un SMS ou un message vocal après un
// premier appel sans réponse. À ne pas confondre avec le champ « SMS », que le
// CRM range dans les automatisations.
// Le message laissé à chaque étape du process. Un champ par étape : le bureau
// doit pouvoir dire lequel est parti, pas seulement qu'il y en a eu un.
const CHAMP_MESSAGE = {
  contact: 'Note vocale envoyée',
  r2: 'SMS R2 envoyé',
  r3: 'SMS R3 envoyé',
};

// Le premier contact se fait en deux appels à 5 minutes d'écart.
const CHAMP_APPEL1_BIS = '1er Appel 2e essai';

// Ce qui conditionne un bilan, vérifié à l'ouverture de l'appel.
const CHAMP_PROXIMITE = 'Habite à proximité';
const CHAMP_VENUE_HEBDO = 'Peut venir chaque semaine';
const CHAMP_ANTECEDENTS = 'Antécédents médicaux';

// Les seules suites qu'une thérapeute peut donner à un appel. Elle envoie une
// clé de cette table, jamais un statut : c'est ici, et nulle part ailleurs,
// qu'on décide ce que la clé vaut dans Airtable.
//   r2 / r3 / injoignable  l'échelle des relances, quand elle n'a pas répondu
//   arappeler              elle a répondu et veut être rappelée, sans heure dite
//   perdu                  elle ne veut pas avancer : la fiche quitte la pile
//   bilan                  elle vient au centre, à la date donnée
// `date` marque la seule suite qui réclame une date ; `videRappel` celle qui
// efface un rappel déjà noté. « potentiel » a laissé la place à « perdu » le
// 6 nov. 2026, et « arappeler » a repris la clé « rappel » supprimée la veille.
const SUITES = {
  r2: { statut: 'R2' },
  r3: { statut: 'R3' },
  arappeler: { statut: 'À rappeler', videRappel: true },
  injoignable: { statut: 'Injoignable' },
  perdu: { statut: 'Perdu' },
  bilan: { statut: 'Bilan placé', date: true },
};

// Le centre a déménagé de Cabestany à Pollestres : un code Pollestres doit
// voir les deux libellés, sinon tout l'historique disparaît de sa liste.
const ALIAS_CENTRE = { 'Pollestres': ['Pollestres', 'Cabestany'] };

// Les seuls champs qui sortent d'Airtable. Ce qui n'est pas ici n'est jamais
// envoyé au navigateur : ni montant de cure, ni thérapeute, ni champs webinaire.
const CHAMPS_LUS = [
  'Prénom', 'Nom', 'Téléphone', 'Email',
  'Statut', 'Centre', 'Soins', 'Source', 'Commercial', 'Création',
  '1er Appel', '2ème Appel', '3ème Appel',
  'Répondu Appel 1', 'Répondu Appel 2', 'Répondu Appel 3',
  'R1 :Notes', 'R2 :Notes', 'R3 :Notes',
  'Prochain rappel', 'Commentaire interne', 'Bilan placé le : ', 'Statut changé le',
  'Note vocale envoyée', 'SMS R2 envoyé', 'SMS R3 envoyé', '1er Appel 2e essai',
  'Habite à proximité', 'Peut venir chaque semaine', 'Antécédents médicaux',
  'Appel 1 thérapeute', 'Appel 2 thérapeute', 'Appel 3 thérapeute',
  'Quand pouvons-nous vous appelez ? ', 'Objectif principal ?',
  'Combien de kilos souhaitez-vous perdre ?', 'Quel est votre principal problème aujourd\'hui?',
];

// Les seuls champs qu'une thérapeute peut écrire.
const CHAMPS_ECRITURE = {
  appel1: '1er Appel', appel2: '2ème Appel', appel3: '3ème Appel',
  repondu1: 'Répondu Appel 1', repondu2: 'Répondu Appel 2', repondu3: 'Répondu Appel 3',
  notes1: 'R1 :Notes', notes2: 'R2 :Notes', notes3: 'R3 :Notes',
  prochainRappel: 'Prochain rappel',
  appel1Bis: CHAMP_APPEL1_BIS,
  messageContact: CHAMP_MESSAGE.contact,
  messageR2: CHAMP_MESSAGE.r2,
  messageR3: CHAMP_MESSAGE.r3,
  habiteProximite: CHAMP_PROXIMITE,
  venueHebdo: CHAMP_VENUE_HEBDO,
  antecedents: CHAMP_ANTECEDENTS,
};

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function reponse(statusCode, payload) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(payload) };
}

function libellesCentre(centre) {
  return ALIAS_CENTRE[centre] || [centre];
}

function echappeFormule(v) {
  return String(v).replace(/"/g, '\\"');
}

/** Rend le centre associé au code, ou null. Le code n'est jamais renvoyé. */
function centreDuCode(code) {
  if (!code || typeof code !== 'string') return null;
  let table;
  try {
    table = JSON.parse(process.env.CODES_THERAPEUTES || '{}');
  } catch (e) {
    return null;
  }
  const centre = table[code.trim()];
  return typeof centre === 'string' && centre ? centre : null;
}

/** Normalise un enregistrement Airtable pour le navigateur. */
function versProspect(r) {
  const f = r.fields || {};
  const select = (v) => (Array.isArray(v) ? (v[0] || null) : (v || null));
  let centre = select(f['Centre']);
  if (centre === 'Cabestany') centre = 'Pollestres';
  return {
    id: r.id,
    prenom: f['Prénom'] || '',
    nom: f['Nom'] || '',
    telephone: f['Téléphone'] || '',
    email: f['Email'] || '',
    statut: select(f['Statut']),
    centre: centre,
    soin: select(f['Soins']),
    source: select(f['Source']),
    commercial: select(f['Commercial']),
    creation: f['Création'] || null,
    appel1: f['1er Appel'] || null,
    appel2: f['2ème Appel'] || null,
    appel3: f['3ème Appel'] || null,
    repondu1: !!f['Répondu Appel 1'],
    repondu2: !!f['Répondu Appel 2'],
    repondu3: !!f['Répondu Appel 3'],
    notes1: f['R1 :Notes'] || '',
    notes2: f['R2 :Notes'] || '',
    notes3: f['R3 :Notes'] || '',
    therapeute1: f['Appel 1 thérapeute'] || '',
    therapeute2: f['Appel 2 thérapeute'] || '',
    therapeute3: f['Appel 3 thérapeute'] || '',
    prochainRappel: f['Prochain rappel'] || null,
    bilanLe: f[CHAMP_BILAN_LE] || null,
    statutDepuis: f[CHAMP_STATUT_CHANGE_LE] || null,
    appel1Bis: f[CHAMP_APPEL1_BIS] || null,
    messageContact: !!f[CHAMP_MESSAGE.contact],
    messageR2: !!f[CHAMP_MESSAGE.r2],
    messageR3: !!f[CHAMP_MESSAGE.r3],
    habiteProximite: !!f[CHAMP_PROXIMITE],
    venueHebdo: !!f[CHAMP_VENUE_HEBDO],
    antecedents: f[CHAMP_ANTECEDENTS] || '',
    commentaire: f['Commentaire interne'] || '',
    formulaire: {
      quand: f['Quand pouvons-nous vous appelez ? '] || '',
      objectif: f['Objectif principal ?'] || '',
      kilos: f['Combien de kilos souhaitez-vous perdre ?'] || '',
      probleme: f['Quel est votre principal problème aujourd\'hui?'] || '',
    },
  };
}

async function airtable(path, options) {
  const res = await fetch(API + '/' + BASE_ID + '/' + encodeURIComponent(TABLE) + path, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + process.env.AIRTABLE_PAT,
      ...((options && options.headers) || {}),
    },
  });
  const texte = await res.text();
  let data = null;
  try { data = JSON.parse(texte); } catch (e) { /* laissé à null */ }
  if (!res.ok) {
    const err = new Error((data && data.error && (data.error.message || data.error.type)) || 'Airtable ' + res.status);
    err.statusCode = res.status;
    throw err;
  }
  return data;
}

/** Tous les prospects à appeler du centre, sauf les retirés, paginés. */
async function listerProspects(centre) {
  const centres = libellesCentre(centre)
    .map((c) => '{Centre}="' + echappeFormule(c) + '"').join(',');
  const statuts = STATUTS_A_APPELER
    .map((s) => '{Statut}="' + echappeFormule(s) + '"').join(',');
  const soinsExclus = SOINS_HORS_CENTRES
    .map((s) => '{Soins}="' + echappeFormule(s) + '"').join(',');
  const formule = 'AND(OR(' + centres + '),OR(' + statuts + '),NOT({' +
    CHAMP_RETIREE + '}=1),NOT(OR(' + soinsExclus + ')),' +
    SANS_CALENDLY_A_VENIR + ')';

  const champs = CHAMPS_LUS
    .map((f) => 'fields%5B%5D=' + encodeURIComponent(f)).join('&');

  let tous = [];
  let offset;
  do {
    const params = 'pageSize=100&' + champs +
      '&filterByFormula=' + encodeURIComponent(formule) +
      (offset ? '&offset=' + encodeURIComponent(offset) : '');
    const data = await airtable('?' + params, { method: 'GET' });
    tous = tous.concat((data.records || []).map(versProspect));
    offset = data.offset;
    if (tous.length >= 5000) break;
  } while (offset);
  return tous;
}

/** Vérifie que l'enregistrement appartient bien au centre du code. */
async function chargerSiAutorise(recordId, centre) {
  if (!recordId || typeof recordId !== 'string' || !/^rec[A-Za-z0-9]{10,}$/.test(recordId)) {
    const err = new Error('Identifiant invalide');
    err.statusCode = 400;
    throw err;
  }
  const data = await airtable('/' + recordId, { method: 'GET' });
  const prospect = versProspect(data);
  if (libellesCentre(centre).indexOf(prospect.centre) < 0 && prospect.centre !== centre) {
    const err = new Error('Ce prospect n\'appartient pas à votre centre');
    err.statusCode = 403;
    throw err;
  }
  return prospect;
}

async function modifier(recordId, centre, modifs, therapeute) {
  const avant = await chargerSiAutorise(recordId, centre);

  const fields = {};
  Object.keys(modifs || {}).forEach((cle) => {
    const champ = CHAMPS_ECRITURE[cle];
    if (!champ) return;                       // tout le reste est ignoré
    fields[champ] = modifs[cle];
  });

  // La suite donnée à l'appel est la seule chose qui change le statut d'un
  // prospect depuis un centre. La thérapeute donne une clé et une date : le
  // statut et les dates de suivi sont décidés ici.
  const suite = modifs && modifs.suite;
  const suiteDate = modifs && modifs.suiteDate;
  if (suite) {
    const regle = SUITES[suite];
    if (!regle) {
      const err = new Error('Suite d\'appel inconnue');
      err.statusCode = 400;
      throw err;
    }
    fields['Statut'] = regle.statut;

    // « À rappeler » veut dire « dès que possible », sans heure convenue : un
    // rappel déjà noté ferait dormir la fiche jusqu'à ce jour-là, alors que la
    // thérapeute vient justement de dire qu'il n'y a plus d'heure à attendre.
    if (regle.videRappel) fields['Prochain rappel'] = null;

    if (regle.date) {
      const quand = new Date(suiteDate);
      if (isNaN(quand.getTime())) {
        const err = new Error('Date illisible');
        err.statusCode = 400;
        throw err;
      }
      fields[CHAMP_BILAN_LE] = quand.toISOString();
      fields[CHAMP_DATE_BILAN_PLACE] = new Date().toISOString();
      fields['Prochain rappel'] = null;       // le rendez-vous au centre remplace le rappel
    }
  }

  if (Object.keys(fields).length === 0) {
    const err = new Error('Aucune modification autorisée dans cette demande');
    err.statusCode = 400;
    throw err;
  }

  // Un appel enregistré ici vient forcément d'un centre : on le marque, et on
  // signe du prénom donné à la connexion.
  [1, 2, 3].forEach(function (n) {
    if (!modifs || !modifs['appel' + n]) return;
    fields[CHAMP_DEPUIS_CENTRE[n]] = true;
    fields[CHAMP_THERAPEUTE[n]] = nettoyerPrenom(therapeute);
  });

  const data = await airtable('/' + recordId, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields, typecast: true }),
  });
  return versProspect(data);
}

exports.handler = async (event) => {
  // Pas d'en-tête CORS : l'API n'est appelable que depuis les pages du site.
  if (event.httpMethod !== 'POST') {
    return reponse(405, { error: 'Méthode non autorisée' });
  }
  if (!process.env.AIRTABLE_PAT) {
    return reponse(500, { error: 'Configuration incomplète : AIRTABLE_PAT manquant' });
  }
  if (!process.env.CODES_THERAPEUTES) {
    return reponse(500, { error: 'Configuration incomplète : CODES_THERAPEUTES manquant' });
  }

  let req;
  try {
    req = JSON.parse(event.body || '{}');
  } catch (e) {
    return reponse(400, { error: 'Requête illisible' });
  }

  const centre = centreDuCode(req.code);
  if (!centre) {
    return reponse(401, { error: 'Code inconnu' });
  }

  try {
    if (req.action === 'connexion') {
      return reponse(200, { centre });
    }
    if (req.action === 'liste') {
      return reponse(200, { centre, prospects: await listerProspects(centre) });
    }
    if (req.action === 'modifier') {
      return reponse(200, { prospect: await modifier(req.recordId, centre, req.modifs, req.therapeute) });
    }
    return reponse(400, { error: 'Action inconnue' });
  } catch (e) {
    const code = e.statusCode && e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 502;
    return reponse(code, { error: e.message || 'Erreur inattendue' });
  }
};
